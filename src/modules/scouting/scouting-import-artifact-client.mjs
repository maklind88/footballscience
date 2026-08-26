const MAX_SOURCE_FILE_BYTES = 50 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(["csv", "json", "pdf", "tsv", "txt", "xls", "xlsb", "xlsm", "xlsx"]);

function fileExtension(fileName = "") {
  return String(fileName || "").split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);
}

function bytesToHex(bytes) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

export async function calculateScoutingSourceChecksum(file, cryptoRef = globalThis.crypto) {
  if (!file?.arrayBuffer || !cryptoRef?.subtle?.digest) {
    throw new Error("Secure file hashing is not available in this browser.");
  }
  return calculateScoutingSourceBufferChecksum(await file.arrayBuffer(), cryptoRef);
}

export async function calculateScoutingSourceBufferChecksum(buffer, cryptoRef = globalThis.crypto) {
  if (!buffer || !cryptoRef?.subtle?.digest) {
    throw new Error("Secure file hashing is not available in this browser.");
  }
  const digest = await cryptoRef.subtle.digest("SHA-256", buffer);
  return bytesToHex(new Uint8Array(digest));
}

export function validateScoutingSourceFile(file) {
  if (!file) return { ok: false, reason: "Choose a scouting data file." };
  const extension = fileExtension(file.name);
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return { ok: false, reason: "This scouting data file type is not supported." };
  }
  if (!Number.isFinite(Number(file.size)) || file.size < 1 || file.size > MAX_SOURCE_FILE_BYTES) {
    return { ok: false, reason: "Scouting data files must be between 1 byte and 50 MB." };
  }
  return { ok: true, extension };
}

async function uploadArtifact(file, artifact = {}, upload = {}, supabase = null) {
  const bucket = String(artifact.storage_bucket || artifact.storageBucket || artifact.bucket || "").trim();
  const path = String(artifact.storage_path || artifact.storagePath || artifact.path || "").trim();
  const token = String(upload.token || "").trim();
  if (!bucket || !path || !token || !supabase?.storage?.from) {
    return { ok: false, reason: "Secure scouting source storage is not available." };
  }
  const storage = supabase.storage.from(bucket);
  if (typeof storage.uploadToSignedUrl !== "function") {
    return { ok: false, reason: "Secure scouting source upload is not supported by this session." };
  }
  const result = await storage.uploadToSignedUrl(path, token, file, {
    contentType: file.type || artifact.media_type || "application/octet-stream",
    upsert: false,
  });
  if (result?.error) {
    return { ok: false, reason: result.error.message || "Scouting source upload failed." };
  }
  return { ok: true, path };
}

export function createScoutingImportArtifactClient(deps = {}) {
  async function prepare(file, options = {}) {
    if (options.signal?.aborted) throw new DOMException("Scouting import was cancelled.", "AbortError");
    const validation = validateScoutingSourceFile(file);
    if (!validation.ok) return validation;
    deps.onProgress?.({ phase: "hashing", label: "Verifying source file" });
    const suppliedChecksum = String(options.checksumSha256 || "").toLowerCase();
    const checksumSha256 = /^[a-f0-9]{64}$/.test(suppliedChecksum)
      ? suppliedChecksum
      : await calculateScoutingSourceChecksum(file, deps.cryptoRef || globalThis.crypto);
    const intent = await deps.sendAction?.({
      action: "createSourceArtifact",
      fileName: file.name,
      mediaType: file.type || "",
      byteSize: file.size,
      checksumSha256,
      metadata: options.metadata || {},
    }, { signal: options.signal });
    if (!intent?.ok) return { ok: false, reason: intent?.reason || "Scouting source artifact could not be created." };
    const artifact = intent.result?.artifact;
    if (!artifact?.id) return { ok: false, reason: "Scouting source artifact id is missing." };
    if (intent.result?.uploadRequired !== false) {
      deps.onProgress?.({ phase: "uploading", label: "Uploading immutable source" });
      const uploaded = await uploadArtifact(file, artifact, intent.result?.upload, deps.getSupabaseClient?.());
      if (!uploaded.ok) return uploaded;
    }
    if (options.signal?.aborted) throw new DOMException("Scouting import was cancelled.", "AbortError");
    deps.onProgress?.({ phase: "verifying", label: "Checking source checksum" });
    const verified = await deps.sendAction?.(
      { action: "verifySourceArtifact", artifactId: artifact.id },
      { signal: options.signal }
    );
    if (!verified?.ok) return { ok: false, reason: verified?.reason || "Scouting source checksum verification failed." };
    return {
      ok: true,
      artifact: verified.result?.artifact || artifact,
      checksumSha256,
      reused: Boolean(intent.result?.reused),
    };
  }

  return { prepare };
}

export const SCOUTING_SOURCE_FILE_LIMIT_BYTES = MAX_SOURCE_FILE_BYTES;
