// An isolated fresh read: do not hydrate, replay or replace any local editor state.
export async function readMedicalRecoveryCentralState({ expectedScope, getScope, getToken, canRead, apiRequest, path, timeoutMs = 15000 }) {
  const scope = getScope(), token = getToken();
  let active = true, timer;
  const isCurrent = () => Boolean(active && scope && token && scope === expectedScope && scope === getScope()
    && token === getToken() && canRead());
  const unavailable = () => ({ ok: false });
  if (!isCurrent()) return unavailable();
  try {
    // Bound the entire response, including a stalled body after headers arrive.
    const deadline = new Promise(resolve => {
      timer = setTimeout(() => { active = false; resolve(null); }, timeoutMs);
    });
    const response = await Promise.race([deadline, apiRequest(path, { method: "GET", isCurrent, timeoutMs,
      headers: { "x-footballscience-fresh-state": "1" } })]);
    const payload = response?.payload, key = "football-medical-team-v1";
    const value = payload?.entries?.[key], metadata = payload?.metadata?.[key];
    if (!isCurrent() || response?.ok !== true || payload?.ok !== true || payload?.medicalRecoveryRead?.private !== true
      || typeof value !== "string" || !Number.isSafeInteger(metadata?.revision) || metadata.revision < 1 || metadata.removed) return unavailable();
    return { ok: true, private: true, scope, value, revision: metadata.revision };
  } catch { return unavailable(); }
  finally { active = false; clearTimeout(timer); }
}

export function medicalRecoveryMatchesCentral(copy, proof) {
  return Boolean(copy?.scope && proof?.ok === true && proof.private === true && copy.scope === proof.scope
    && typeof copy.value === "string" && copy.value === proof.value
    && Number.isSafeInteger(proof.revision) && proof.revision > 0
    && (copy.baseRevision === null || (Number.isSafeInteger(copy.baseRevision)
      && copy.baseRevision >= 0 && proof.revision >= copy.baseRevision)));
}
