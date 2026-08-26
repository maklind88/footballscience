import { createHash } from "node:crypto";

const sha256Pattern = /^[a-f0-9]{64}$/;
const commitPattern = /^[a-f0-9]{40,64}$/;
const stages = new Set(["detection", "segmentation", "association", "reidentification", "classification"]);

function invalid(message) {
  throw new Error(message);
}

function boundedString(value, label, maximum = 160) {
  const text = String(value || "").trim();
  if (!text || text.length > maximum || /[\r\n]/.test(text)) invalid(`Invalid ${label}.`);
  return text;
}

function sha256(value, label) {
  const text = boundedString(value, label, 64).toLowerCase();
  if (!sha256Pattern.test(text)) invalid(`${label} must be a SHA-256 hash.`);
  return text;
}

export function trackingProviderExecutionIdentity(value = {}) {
  const stage = boundedString(value.stage, "provider stage", 40).toLowerCase();
  if (!stages.has(stage)) invalid("Provider stage is unsupported.");
  if (!Array.isArray(value.capabilities) || !value.capabilities.length || value.capabilities.length > 20) {
    invalid("Provider execution capabilities are required.");
  }
  const capabilities = [...new Set(value.capabilities.map((capability) => (
    boundedString(capability, "provider capability", 80)
  )))].sort();
  const sourceCommit = boundedString(value.sourceCommit, "provider source commit", 64).toLowerCase();
  if (!commitPattern.test(sourceCommit)) invalid("Provider source commit must be pinned.");
  const rawModels = Array.isArray(value.modelSha256s) ? value.modelSha256s : [];
  if (rawModels.length > 20) invalid("Provider execution model count is outside the limit.");
  return {
    schemaVersion: 1,
    providerId: boundedString(value.providerId, "provider id", 100),
    providerVersion: boundedString(value.providerVersion, "provider version", 100),
    protocol: boundedString(value.protocol, "provider contract protocol", 100),
    stage,
    capabilities,
    sourceCommit,
    sourceSha256: sha256(value.sourceSha256, "provider source checksum"),
    modelSha256s: [...new Set(rawModels.map((hash) => sha256(hash, "provider model checksum")))].sort(),
    runtimeSha256: sha256(value.runtimeSha256, "provider runtime checksum"),
  };
}

export function trackingProviderExecutionFingerprintSha256(value = {}) {
  return createHash("sha256")
    .update(JSON.stringify(trackingProviderExecutionIdentity(value)))
    .digest("hex");
}
