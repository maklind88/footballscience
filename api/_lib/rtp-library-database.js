const { sendJson } = require("./supabase-admin.js");

const RTP_LIBRARY_SCHEMA = "footballscience-rtp-library-v1";
const RTP_LIBRARY_READ_ROLES = Object.freeze(["admin", "club-admin", "team-admin", "coach", "analyst", "performance", "medical"]);
const RTP_LIBRARY_WRITE_ROLES = Object.freeze(["admin", "medical", "performance"]);
const DEFAULT_ORGANIZATION_ID = "club-ncc";
const DEFAULT_TEAM_ID = "team-ncc-first";

function normalizeText(value, maxLength = 240) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function normalizeRole(value) {
  return normalizeText(value, 40).toLowerCase();
}

function normalizeScopeId(value, fallback) {
  return normalizeText(value, 160) || fallback;
}

function actorScope(actor = {}) {
  const organizationId = normalizeScopeId(
    actor.organizationId
      || actor.organization_id
      || actor.clubId
      || actor.club_id
      || actor.clubName
      || actor.club,
    DEFAULT_ORGANIZATION_ID
  );
  return {
    organizationId,
    clubId: normalizeScopeId(actor.clubId || actor.club_id || actor.clubName || actor.club || organizationId, organizationId),
    teamId: normalizeScopeId(actor.teamId || actor.team_id || actor.teamName || actor.team, DEFAULT_TEAM_ID),
    actorId: normalizeText(actor.id, 160),
  };
}

function canReadRtpLibrary(actor = {}) {
  return RTP_LIBRARY_READ_ROLES.includes(normalizeRole(actor.role || actor.appRole));
}

function canWriteRtpLibrary(actor = {}) {
  return RTP_LIBRARY_WRITE_ROLES.includes(normalizeRole(actor.role || actor.appRole));
}

function emptyState() {
  return {
    profiles: 0,
    sections: 0,
    protocols: 0,
    exercises: 0,
    progressions: 0,
    criteriaSets: 0,
    evidence: 0,
  };
}

function statusPayload(actor = {}) {
  const role = normalizeRole(actor.role || actor.appRole);
  return {
    ok: true,
    schema: RTP_LIBRARY_SCHEMA,
    moduleId: "rtp-library",
    mode: "library-foundation",
    phase: "foundation",
    enabled: true,
    writesEnabled: false,
    ownsInjuryContent: true,
    ownsPlayerMedicalData: false,
    ownsPlayerPlans: false,
    medicalConnection: "contract-only",
    coachSafeOnly: role === "coach" || role === "analyst",
    canRead: canReadRtpLibrary(actor),
    canWrite: canWriteRtpLibrary(actor),
    scope: actorScope(actor),
    emptyState: emptyState(),
  };
}

function collectionPayload(actor = {}, collection = "profiles") {
  return {
    ok: true,
    schema: RTP_LIBRARY_SCHEMA,
    moduleId: "rtp-library",
    collection,
    items: [],
    count: 0,
    scope: actorScope(actor),
    emptyState: emptyState(),
  };
}

function profilePayload(actor = {}) {
  return {
    ok: true,
    schema: RTP_LIBRARY_SCHEMA,
    moduleId: "rtp-library",
    profile: null,
    sections: [],
    protocols: [],
    exercises: [],
    progressions: [],
    criteriaSets: [],
    evidence: [],
    scope: actorScope(actor),
    emptyState: emptyState(),
  };
}

async function handleRtpLibraryRequest(req, res, actor) {
  const url = new URL(req.url || "/api/rtp-library", "https://footballscience.local");
  const method = String(req.method || "GET").toUpperCase();

  if (method === "GET") {
    const action = normalizeText(url.searchParams.get("action") || "status", 40);
    const payload = action === "profile"
      ? profilePayload(actor)
      : action === "status"
        ? statusPayload(actor)
        : collectionPayload(actor, action);
    return sendJson(res, 200, payload);
  }

  if (method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE") {
    return sendJson(res, 501, {
      ok: false,
      schema: RTP_LIBRARY_SCHEMA,
      moduleId: "rtp-library",
      writesEnabled: false,
      reason: "RTP Library writes are not enabled in Phase 1.",
    });
  }

  return sendJson(res, 405, { ok: false, reason: "Method not allowed." });
}

module.exports = {
  RTP_LIBRARY_READ_ROLES,
  RTP_LIBRARY_SCHEMA,
  RTP_LIBRARY_WRITE_ROLES,
  actorScope,
  canReadRtpLibrary,
  canWriteRtpLibrary,
  collectionPayload,
  emptyState,
  handleRtpLibraryRequest,
  normalizeText,
  profilePayload,
  statusPayload,
};
