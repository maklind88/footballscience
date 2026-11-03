import { readMedicalRecoveryCentralState, medicalRecoveryMatchesCentral } from "./medical-recovery-central-read.mjs";

const protocol = "medical-recovery-retry-v1";
// Hydration strips only these established tab-local preferences. Every clinical
// and unknown field remains significant; this does not merge medical content.
export function sameMedicalRetryBaseline(first, second) {
  const shared = value => {
    const state = JSON.parse(value);
    if (!state || typeof state !== "object" || Array.isArray(state)) throw new Error("Invalid baseline");
    const { selectedDate, selectedPlayerId, ...content } = state;
    return JSON.stringify(content);
  };
  try { return shared(first) === shared(second); } catch { return false; }
}
// Explicit retry of one committed new copy. No cache/manifest write, merge,
// historical replay, local removal or editor acknowledgement happens here.
export async function retryMedicalRecoveryCopy({ copy, getScope, getToken, canWrite, apiRequest,
  path, readPath, isCurrent = () => true, timeoutMs = 15000 }) {
  const scope = getScope(), token = getToken();
  let active = true, timer;
  const current = () => Boolean(active && scope && token && copy?.scope === scope && scope === getScope()
    && token === getToken() && canWrite() && isCurrent());
  const unavailable = () => ({ ok: false, reason: "Central saving could not be confirmed. The local copy is retained; reconnect and retry." });
  if (!current() || copy.retryProtocol !== protocol || !/^[a-zA-Z0-9-]{1,128}$/.test(copy.id || "") ||
      !Number.isSafeInteger(copy.baseRevision) || copy.baseRevision < 1 ||
      typeof copy.value !== "string" || !copy.value || typeof copy.previousValue !== "string") return unavailable();
  try {
    const proof = await readMedicalRecoveryCentralState({ expectedScope: scope, getScope, getToken,
      canRead: current, apiRequest, path: readPath, timeoutMs });
    if (!current() || !proof.ok) return unavailable();
    // A lost earlier reply is reconciled by a fresh exact private read, never replayed.
    if (medicalRecoveryMatchesCentral(copy, proof)) return { ok: true, verifiedByRead: true, revision: proof.revision };
    if (proof.retryProtocol !== protocol) return unavailable(); // Older servers must not receive a retry.
    if (proof.revision !== copy.baseRevision || !sameMedicalRetryBaseline(proof.value, copy.previousValue)) return { ok: false, reviewRequired: true,
      reason: "Medical has changed since this copy was created. The local copy is retained for review." };
    if (!current()) return unavailable();
    const deadline = new Promise(resolve => { timer = setTimeout(() => { active = false; resolve(null); }, timeoutMs); });
    const response = await Promise.race([deadline, apiRequest(path, { method: "POST", isCurrent: current, timeoutMs,
      body: JSON.stringify({ key: "football-medical-team-v1", value: copy.value, baseRevision: copy.baseRevision,
        medicalRetry: { id: copy.id, protocol, baseRevision: copy.baseRevision } }) })]);
    if (!current()) return unavailable();
    const receipt = response?.payload;
    if (response?.status === 409) return { ok: false, reviewRequired: true,
      reason: "Medical changed during retry. The local copy is retained for review." };
    if (response?.ok !== true || receipt?.ok !== true || receipt.key !== "football-medical-team-v1" ||
        receipt.medicalRetry?.id !== copy.id || receipt.medicalRetry?.protocol !== protocol || receipt.value !== copy.value ||
        receipt.metadata?.revision !== copy.baseRevision + 1) return unavailable();
    return { ok: true, revision: receipt.metadata.revision };
  } catch { return unavailable(); }
  finally { active = false; clearTimeout(timer); }
}
