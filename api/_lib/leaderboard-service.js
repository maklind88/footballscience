const { parseJsonBody, sendJson } = require("./supabase-admin.js");
const {
  LEADERBOARD_SCHEMA,
  normalizeLeaderboardCommand,
  normalizeLeaderboardTeamId,
  normalizeMonth,
} = require("./leaderboard-contract.js");
const {
  awardPoints,
  readMonthSnapshot,
  reverseEvent,
} = require("./leaderboard-database.js");
const { hasModulePermission } = require("../../src/core/permission-matrix.cjs");

function sendFailure(res, result) {
  return sendJson(res, result.status || 500, { ok: false, reason: result.reason || "Leaderboard request failed." });
}

function accessForContext(context = {}) {
  const actor = context.actor || {};
  return {
    canView: hasModulePermission(actor, "leaderboard", "read"),
    canAward: hasModulePermission(actor, "leaderboard", "write"),
    canReverse: hasModulePermission(actor, "leaderboard", "write"),
  };
}

function sendSnapshot(res, month, snapshot, access = {}) {
  return sendJson(res, 200, {
    ok: true,
    schema: LEADERBOARD_SCHEMA,
    month,
    access: {
      canView: access.canView === true,
      canAward: access.canAward === true,
      canReverse: access.canReverse === true,
    },
    competition: snapshot.competition,
    summary: snapshot.summary,
    roster: Array.isArray(snapshot.roster) ? snapshot.roster : [],
    standings: snapshot.standings,
    events: snapshot.events,
  });
}

async function readAndSendSnapshot(res, context, month, options = {}) {
  const result = await readMonthSnapshot(context, month, options);
  return result.ok ? sendSnapshot(res, month, result.snapshot, accessForContext(context)) : sendFailure(res, result);
}

async function prepareLeaderboardRequest(req) {
  if (req.method === "GET") {
    const requestUrl = new URL(req.url || "/api/leaderboard", "https://footballscience.local");
    const month = normalizeMonth(requestUrl.searchParams.get("month"));
    if (!month) return { ok: false, status: 400, reason: "month must use YYYY-MM format." };
    const rawTeamId = String(requestUrl.searchParams.get("teamId") || "").trim();
    const teamId = normalizeLeaderboardTeamId(rawTeamId);
    if (rawTeamId && !teamId) return { ok: false, status: 400, reason: "teamId must be a valid Platform team UUID." };
    return { ok: true, request: { method: "GET", month, teamId } };
  }
  if (req.method !== "POST") return { ok: false, status: 405, reason: "Method not allowed." };
  const body = await parseJsonBody(req, { maxBytes: 64 * 1024 });
  const normalized = normalizeLeaderboardCommand(body);
  return normalized.ok
    ? { ok: true, request: { method: "POST", teamId: normalized.command.teamId, command: normalized.command } }
    : normalized;
}

async function handleLeaderboardRequest(req, res, context, options = {}) {
  const prepared = options.preparedRequest || await prepareLeaderboardRequest(req);
  if (!prepared.ok) return sendFailure(res, prepared);
  const request = prepared.request;
  if (request.method === "GET") return readAndSendSnapshot(res, context, request.month, options);

  const commandResult = request.command.action === "award"
    ? await awardPoints(context, request.command, options)
    : await reverseEvent(context, request.command, options);
  if (!commandResult.ok) return sendFailure(res, commandResult);
  const month = normalizeMonth(commandResult.receipt?.month || request.command.month);
  if (!month) return sendJson(res, 500, { ok: false, reason: "Leaderboard command returned no competition month." });
  return readAndSendSnapshot(res, context, month, options);
}

module.exports = {
  accessForContext,
  handleLeaderboardRequest,
  prepareLeaderboardRequest,
  sendSnapshot,
};
