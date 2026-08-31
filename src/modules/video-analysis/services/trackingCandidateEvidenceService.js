const CANDIDATE_STAGE_RUN_PROTOCOL = "football-science-tracking-candidate-stage-run-v1";
const MAXIMUM_EVIDENCE_BYTES = 160 * 1024 * 1024;

function boundedText(value, maximum = 160) {
  return String(value || "").replace(/[\r\n]/g, " ").trim().slice(0, maximum);
}

export function registeredTrackingCandidates(value = {}) {
  if (value.protocol !== "football-science-tracking-candidate-registry-v1"
    || !Array.isArray(value.providers)
    || value.providers.length > 20) return [];
  return value.providers.map((provider) => {
    const status = provider?.status === "candidate-ready" && provider.available === true
      ? "candidate-ready"
      : "blocked";
    const fingerprint = boundedText(provider?.executionFingerprintSha256, 64).toLowerCase();
    return {
      id: boundedText(provider?.id, 100),
      version: boundedText(provider?.version, 100),
      name: boundedText(provider?.name || provider?.id, 160),
      protocol: boundedText(provider?.protocol, 100),
      stage: boundedText(provider?.stage, 40),
      priority: Math.max(0, Math.min(1000, Math.round(Number(provider?.priority) || 0))),
      capabilities: Array.isArray(provider?.capabilities)
        ? [...new Set(provider.capabilities.map((entry) => boundedText(entry, 80)).filter(Boolean))].slice(0, 20)
        : [],
      status,
      available: status === "candidate-ready",
      executionAvailable: status === "candidate-ready" && provider?.executionAvailable === true,
      benchmarkOnly: true,
      activationStatus: boundedText(provider?.activationStatus, 40),
      activationProtocol: boundedText(provider?.activationProtocol, 100),
      activationIsolation: boundedText(provider?.activationIsolation, 100),
      executionFingerprintSha256: /^[a-f0-9]{64}$/.test(fingerprint) ? fingerprint : "",
      reasons: Array.isArray(provider?.reasons)
        ? provider.reasons.map((entry) => boundedText(entry, 80)).filter(Boolean).slice(0, 20)
        : [],
    };
  }).filter((provider) => provider.id && provider.version);
}

function invalid(message = "The local tracking candidate returned invalid benchmark evidence.") {
  throw new Error(message);
}

function exactKeys(value, allowed) {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  if (Object.keys(value).some((key) => !allowed.includes(key))) invalid();
}

function sha256(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(text)) invalid();
  return text;
}

function safeEvidenceUrl(value, baseUrl) {
  let url;
  try {
    url = new URL(value);
  } catch {
    invalid("The local tracking candidate evidence URL is invalid.");
  }
  if (url.origin !== new URL(baseUrl).origin
    || !/^\/tracking-candidate-stage\/[a-f0-9-]+\/evidence\.json$/i.test(url.pathname)) {
    invalid("The local tracking candidate evidence left its private companion boundary.");
  }
  return url.toString();
}

function hexadecimal(bytes) {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function verifiedJsonResponse(response, expectedSha256, win) {
  const declaredBytes = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredBytes) && declaredBytes > MAXIMUM_EVIDENCE_BYTES) invalid("Tracking candidate evidence is too large.");
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength < 1 || bytes.byteLength > MAXIMUM_EVIDENCE_BYTES) invalid("Tracking candidate evidence is too large.");
  const subtle = win.crypto?.subtle || globalThis.crypto?.subtle;
  if (!subtle) invalid("Secure candidate evidence hashing is unavailable.");
  const digest = hexadecimal(await subtle.digest("SHA-256", bytes));
  if (digest !== sha256(expectedSha256)) invalid("Tracking candidate evidence checksum does not match.");
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    invalid("Tracking candidate evidence is not valid UTF-8 JSON.");
  }
}

function validateEvidence(value, expected = {}) {
  exactKeys(value, [
    "schemaVersion", "protocol", "id", "benchmarkOnly", "provider", "source", "range",
    "request", "result", "execution", "createdAt",
  ]);
  exactKeys(value.provider, [
    "id", "version", "protocol", "stage", "capabilities", "manifestFingerprintSha256",
    "executionFingerprintSha256",
  ]);
  exactKeys(value.source, ["algorithm", "kind", "fingerprintSha256"]);
  exactKeys(value.request, ["fingerprintSha256", "payload"]);
  exactKeys(value.result, ["artifactSha256", "payload"]);
  exactKeys(value.execution, [
    "protocol", "isolation", "wallTimeMs", "realTimeFactor", "outputBytes", "stdoutBytes",
    "stderrBytes", "exitCode",
  ]);
  const artifact = expected.artifact || {};
  if (value.schemaVersion !== 1
    || value.protocol !== CANDIDATE_STAGE_RUN_PROTOCOL
    || value.benchmarkOnly !== true
    || value.provider.id !== expected.provider?.id
    || value.provider.version !== expected.provider?.version
    || value.source.algorithm !== "sha256"
    || value.source.kind !== "exact-local-file-bytes"
    || sha256(value.source.fingerprintSha256) !== sha256(expected.sourceSha256)
    || sha256(value.request.fingerprintSha256) !== sha256(artifact.requestFingerprint)
    || sha256(value.result.artifactSha256) !== sha256(expected.artifactSha256)
    || value.result.payload?.protocol !== "football-science-tracking-stage-result-v1"
    || value.result.payload?.provider?.id !== expected.provider?.id
    || value.result.payload?.provider?.version !== expected.provider?.version
    || value.result.payload?.requestFingerprint !== artifact.requestFingerprint
    || JSON.stringify(value.result.payload) !== JSON.stringify(artifact)
    || value.execution.exitCode !== 0
    || !(Number(value.execution.wallTimeMs) > 0)
    || !Number.isFinite(Date.parse(value.createdAt))) {
    invalid();
  }
  return Object.freeze(value);
}

export async function fetchTrackingCandidateStageEvidence(options = {}) {
  const win = options.win || window;
  const url = safeEvidenceUrl(options.evidenceUrl, options.baseUrl);
  const response = await options.fetcher(url, {
    headers: { "x-football-science-session": options.sessionToken },
    signal: options.signal,
  });
  if (!response.ok) invalid("The local tracking candidate evidence could not be opened.");
  const value = await verifiedJsonResponse(response, options.evidenceSha256, win);
  return validateEvidence(value, options);
}
