const DEFAULT_MAX_RECORDS_PER_CHUNK = 160;
const DEFAULT_MAX_PAYLOAD_CHARACTERS = 900_000;
const DEFAULT_STAGE_CONCURRENCY = 3;

function stableJsonValue(value) {
  if (Array.isArray(value)) return value.map(stableJsonValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableJsonValue(value[key])])
  );
}

export async function buildScoutingDatasetVersionHash(database = {}, artifactChecksum = "", metadata = {}, cryptoRef = globalThis.crypto) {
  if (!cryptoRef?.subtle?.digest) return "";
  const seed = JSON.stringify(stableJsonValue({
    artifactChecksum: String(artifactChecksum || "").trim().toLowerCase(),
    fileName: String(database.fileName || "").trim(),
    sheets: Array.isArray(database.sheets) ? database.sheets : [],
    rowCount: Array.isArray(database.records) ? database.records.length : 0,
    metricCount: Array.isArray(database.metrics) ? database.metrics.length : 0,
    importSignature: String(database.importSignature || "").trim(),
    metadata,
  }));
  const digest = await cryptoRef.subtle.digest("SHA-256", new TextEncoder().encode(seed));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function buildScoutingDatasetChunks(records = [], options = {}) {
  const maxRecords = Math.max(1, Math.min(160, Math.floor(Number(options.maxRecords) || DEFAULT_MAX_RECORDS_PER_CHUNK)));
  const maxCharacters = Math.max(100_000, Math.floor(Number(options.maxCharacters) || DEFAULT_MAX_PAYLOAD_CHARACTERS));
  const chunks = [];
  let chunk = [];
  let size = 0;
  for (const record of Array.isArray(records) ? records : []) {
    const recordSize = JSON.stringify(record).length + 8;
    if (recordSize > maxCharacters) {
      return { ok: false, reason: "A scouting row is too large to stage safely. Remove unused metric columns and retry." };
    }
    if (chunk.length && (chunk.length >= maxRecords || size + recordSize > maxCharacters)) {
      chunks.push(chunk);
      chunk = [];
      size = 0;
    }
    chunk.push(record);
    size += recordSize;
  }
  if (chunk.length) chunks.push(chunk);
  return { ok: true, chunks };
}

async function runChunkPool(chunks, worker, options = {}) {
  const concurrency = Math.max(1, Math.min(4, Math.floor(Number(options.concurrency) || DEFAULT_STAGE_CONCURRENCY)));
  let nextIndex = 0;
  let completed = 0;
  let failure = null;
  async function run() {
    while (!failure) {
      if (options.signal?.aborted) throw new DOMException("Scouting dataset staging was cancelled.", "AbortError");
      const index = nextIndex;
      nextIndex += 1;
      if (index >= chunks.length) return;
      const result = await worker(chunks[index], index);
      if (!result?.ok) {
        failure = result || { ok: false, reason: "Scouting dataset staging failed." };
        return;
      }
      completed += 1;
      options.onProgress?.({ completed, total: chunks.length, index });
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, chunks.length) }, () => run()));
  return failure || { ok: true, completed, total: chunks.length };
}

function normalizeVersion(version = {}) {
  return {
    id: String(version.id || version.datasetVersionId || "").trim(),
    importBatchId: String(version.import_batch_id || version.importBatchId || "").trim(),
    status: String(version.status || "staged").trim().toLowerCase(),
    label: String(version.version_label || version.versionLabel || "").trim(),
  };
}

export function createScoutingDatasetImportClient(deps = {}) {
  async function stage({ database, file, metadata = {}, checksumSha256 = "", signal = null } = {}) {
    if (!database?.records?.length || !file) {
      return { ok: false, reason: "A source file and parsed scouting rows are required." };
    }
    const chunkPlan = buildScoutingDatasetChunks(database.records, deps.chunkOptions || {});
    if (!chunkPlan.ok) return chunkPlan;
    const artifactResult = await deps.artifactClient?.prepare(file, { metadata, checksumSha256, signal });
    if (!artifactResult?.ok) return artifactResult || { ok: false, reason: "Scouting source preparation failed." };
    const dataHash = await buildScoutingDatasetVersionHash(
      database,
      artifactResult.checksumSha256,
      metadata,
      deps.cryptoRef || globalThis.crypto
    );
    if (!dataHash) return { ok: false, reason: "A secure scouting dataset version hash could not be created." };
    deps.onProgress?.({ phase: "staging", completed: 0, total: chunkPlan.chunks.length, label: "Preparing database version" });
    const started = await deps.sendAction?.({
      action: "startDatasetImport",
      sourceArtifactId: artifactResult.artifact.id,
      dataHash,
      versionLabel: database.fileName || artifactResult.artifact.file_name || "Scouting dataset",
      sourceFileName: database.fileName || "",
      sheetName: Array.isArray(database.sheets) ? database.sheets.join(", ") : "",
      rowCount: database.records.length,
      metricCount: Array.isArray(database.metrics) ? database.metrics.length : 0,
      metadata: {
        ...metadata,
        importSignature: database.importSignature || "",
        sourceArtifactChecksum: artifactResult.checksumSha256,
      },
    }, { signal });
    if (!started?.ok) return { ok: false, reason: started?.reason || "Scouting dataset version could not be created." };
    const version = normalizeVersion(started.result?.datasetVersion || {
      id: started.result?.datasetVersionId,
      importBatchId: started.result?.importBatchId,
    });
    if (!version.id) return { ok: false, reason: "Scouting dataset version id is missing." };
    if (version.status === "active") {
      return { ok: true, status: "active", version, artifact: artifactResult.artifact, alreadyActive: true };
    }
    if (["superseded", "rolled_back"].includes(version.status)) {
      return {
        ok: false,
        status: version.status,
        reason: "This exact dataset already exists as an older version. Use version history to restore it.",
        version,
        artifact: artifactResult.artifact,
      };
    }
    if (!["staged", "blocked", "validating", "validated"].includes(version.status)) {
      return { ok: false, status: version.status, reason: "This dataset version is not available for staging.", version };
    }
    if (["staged", "blocked"].includes(version.status)) {
      const staged = await runChunkPool(
        chunkPlan.chunks,
        (records, index) => deps.sendAction?.(
          {
            action: "stageDatasetChunk",
            datasetVersionId: version.id,
            chunkIndex: index,
            chunkCount: chunkPlan.chunks.length,
            metrics: index === 0 ? database.metrics || [] : [],
            records,
          },
          { signal }
        ),
        {
          concurrency: deps.stageConcurrency,
          signal,
          onProgress: ({ completed, total }) => deps.onProgress?.({
            phase: "staging",
            completed,
            total,
            label: `Staging ${completed}/${total}`,
          }),
        }
      );
      if (!staged.ok) return { ok: false, reason: staged.reason || "Scouting dataset staging failed." };
    }
    deps.onProgress?.({ phase: "validating", label: "Running data quality gates" });
    const validated = await deps.sendAction?.(
      { action: "validateDatasetImport", datasetVersionId: version.id },
      { signal }
    );
    if (!validated?.ok) return { ok: false, reason: validated?.reason || "Scouting dataset validation failed." };
    const validation = validated.result?.validation || {};
    const checks = Array.isArray(validated.result?.checks) ? validated.result.checks : [];
    const status = String(validation.status || "blocked").toLowerCase();
    return {
      ok: status === "validated",
      status,
      reason: status === "validated" ? "" : "Scouting dataset has validation blockers.",
      version: { ...version, status },
      artifact: artifactResult.artifact,
      validation,
      checks,
    };
  }

  async function publish(datasetVersionId, options = {}) {
    const id = String(datasetVersionId || "").trim();
    if (!id) return { ok: false, reason: "Scouting dataset version id is missing." };
    deps.onProgress?.({ phase: "publishing", label: "Activating database version" });
    const result = await deps.sendAction?.(
      { action: "publishDatasetImport", datasetVersionId: id },
      { signal: options.signal }
    );
    if (!result?.ok) return { ok: false, reason: result?.reason || "Scouting dataset could not be published." };
    return { ok: true, status: "active", ...(result.result || {}) };
  }

  async function rollback({ datasetVersionId = "", importBatchId = "" } = {}) {
    const result = await deps.sendAction?.({
      action: "rollbackDatasetVersion",
      datasetVersionId,
      importBatchId,
    });
    if (!result?.ok) return { ok: false, reason: result?.reason || "Scouting dataset rollback failed." };
    return { ok: true, ...(result.result || {}) };
  }

  return { publish, rollback, stage };
}
