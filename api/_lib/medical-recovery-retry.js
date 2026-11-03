// Opt-in exact-version saving for a newly retained Medical copy. Authorization
// must run first; persistence must use the existing atomic database CAS.
function checkMedicalRecoveryRetry({ request, key, clientBaseRevision, previousEntry, databaseEnabled }) {
  if (request === undefined) return { ok: true };
  if (key !== "football-medical-team-v1" || request?.protocol !== "medical-recovery-retry-v1" ||
      typeof request.id !== "string" || !/^[a-zA-Z0-9-]{1,128}$/.test(request.id) ||
      !Number.isSafeInteger(request.baseRevision) || request.baseRevision < 1 ||
      clientBaseRevision !== request.baseRevision) {
    return { ok: false, status: 400, reason: "Invalid Medical recovery retry." };
  }
  if (!databaseEnabled) return { ok: false, status: 503, reason: "Versioned Medical saving is unavailable. The local copy is retained." };
  if (!previousEntry || previousEntry.removed || previousEntry.revision !== request.baseRevision) {
    return { ok: false, status: 409, reason: "Medical changed since this copy was created. Review the retained copy.",
      currentRevision: previousEntry?.revision || 0 };
  }
  return { ok: true, id: request.id };
}
module.exports = { checkMedicalRecoveryRetry };
