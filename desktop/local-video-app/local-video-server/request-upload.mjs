import { createWriteStream, promises as fs } from "node:fs";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

function inputTooLarge() {
  const error = new Error("The selected video exceeds the local bridge input limit.");
  error.code = "INPUT_TOO_LARGE";
  error.statusCode = 413;
  return error;
}

export async function receiveRequestFile(request, filePath, options = {}) {
  const maxBytes = Math.max(1, Number(options.maxBytes) || Number.MAX_SAFE_INTEGER);
  const declaredBytes = Number(request.headers?.["content-length"] || 0);
  if (Number.isFinite(declaredBytes) && declaredBytes > maxBytes) throw inputTooLarge();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  let receivedBytes = 0;
  const limiter = new Transform({
    transform(chunk, encoding, callback) {
      receivedBytes += chunk.length;
      if (receivedBytes > maxBytes) {
        callback(inputTooLarge());
        return;
      }
      options.onProgress?.({
        stage: "receiving",
        receivedBytes,
        totalBytes: declaredBytes || null,
        ratio: declaredBytes > 0 ? Math.min(0.2, (receivedBytes / declaredBytes) * 0.2) : 0,
      });
      callback(null, chunk);
    },
  });
  try {
    await pipeline(request, limiter, createWriteStream(filePath, { flags: "wx" }));
    return { receivedBytes };
  } catch (error) {
    await fs.rm(filePath, { force: true });
    throw error;
  }
}

