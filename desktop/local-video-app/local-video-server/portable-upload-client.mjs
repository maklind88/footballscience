import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";

const TUS_CHUNK_BYTES = 6 * 1024 * 1024;

function abortError() {
  const error = new Error("Portable review upload was cancelled.");
  error.code = "ABORT_ERR";
  error.name = "AbortError";
  return error;
}

async function resolveUploadClass(configuredUploadClass) {
  if (configuredUploadClass) return configuredUploadClass;
  try {
    const module = await import("tus-js-client");
    if (typeof module.Upload === "function") return module.Upload;
  } catch (error) {
    const wrapped = new Error(
      "Portable review upload needs the FS Player desktop dependencies. Run npm --prefix desktop/local-video-app install.",
    );
    wrapped.cause = error;
    throw wrapped;
  }
  throw new Error("The FS Player desktop upload client is unavailable.");
}

export function createPortableUploadClient(options = {}) {
  return {
    async upload(filePath, reservation = {}, runOptions = {}) {
      const UploadClass = await resolveUploadClass(options.UploadClass);
      const stat = await fs.stat(filePath);
      if (!stat.isFile() || stat.size !== reservation.expectedBytes) {
        throw new Error("The rendered review no longer matches its upload reservation.");
      }
      if (runOptions.signal?.aborted) throw abortError();
      const stream = createReadStream(filePath);
      return new Promise((resolve, reject) => {
        let settled = false;
        let abort = () => {};
        const finish = (callback, value) => {
          if (settled) return;
          settled = true;
          runOptions.signal?.removeEventListener?.("abort", abort);
          callback(value);
        };
        const upload = new UploadClass(stream, {
          endpoint: reservation.endpoint,
          headers: { "x-signature": reservation.token },
          chunkSize: TUS_CHUNK_BYTES,
          uploadSize: stat.size,
          retryDelays: [0, 3000, 5000, 10000, 20000],
          storeFingerprintForResuming: false,
          removeFingerprintOnSuccess: true,
          metadata: {
            bucketName: reservation.bucket,
            objectName: reservation.objectPath,
            contentType: "video/mp4",
            cacheControl: "3600",
            sha256: reservation.sha256,
            assetId: reservation.assetId,
          },
          onError: (error) => finish(reject, error),
          onProgress: (uploaded, total) => runOptions.onProgress?.({
            stage: "uploading portable review",
            ratio: total ? uploaded / total : 0,
            uploadedBytes: uploaded,
            totalBytes: total,
          }),
          onSuccess: () => finish(resolve, { uploadedBytes: stat.size }),
        });
        abort = () => {
          void upload.abort(true).catch(() => {}).finally(() => finish(reject, abortError()));
        };
        runOptions.signal?.addEventListener?.("abort", abort, { once: true });
        upload.start();
      }).finally(() => stream.destroy());
    },
  };
}
