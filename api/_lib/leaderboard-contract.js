const crypto = require("node:crypto");

const LEADERBOARD_SCHEMA = "footballscience-leaderboard-v1";
const LEADERBOARD_TIMEZONE = "UTC";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/;
const MAX_AWARDS = 100;

function normalizeText(value, maxLength = 180) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function invalid(reason, status = 400) {
  return { ok: false, status, reason };
}

function isUuid(value) {
  return UUID_PATTERN.test(String(value || "").trim());
}

function normalizeIsoDate(value) {
  const date = normalizeText(value, 11);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
    ? date
    : "";
}

function normalizeMonth(value) {
  const month = normalizeText(value, 8);
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return "";
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  return year >= 2000 && year <= 2100 && monthNumber >= 1 && monthNumber <= 12 ? month : "";
}

function monthFromDate(date) {
  return normalizeIsoDate(date).slice(0, 7);
}

function monthStart(month) {
  const normalized = normalizeMonth(month);
  return normalized ? `${normalized}-01` : "";
}

function normalizeIdempotencyKey(value) {
  const key = normalizeText(value, 161);
  return IDEMPOTENCY_PATTERN.test(key) ? key : "";
}

function normalizeLeaderboardTeamId(value) {
  const teamId = normalizeText(value, 81).toLowerCase();
  return isUuid(teamId) ? teamId : "";
}

function commandTeamId(body = {}) {
  const rawTeamId = normalizeText(body.teamId || body.team_id, 81);
  const teamId = normalizeLeaderboardTeamId(rawTeamId);
  return rawTeamId && !teamId ? invalid("teamId must be a valid Platform team UUID.") : { ok: true, teamId };
}

function normalizeAward(item = {}, index = 0) {
  const playerId = normalizeText(item.playerId || item.player_id, 181);
  const points = Number(item.points);
  const placementValue = item.placement === null || item.placement === undefined || item.placement === ""
    ? null
    : Number(item.placement);
  if (!playerId || playerId.length > 180) return invalid(`awards[${index}].playerId must contain 1-180 characters.`);
  if (!Number.isInteger(points) || points < 1 || points > 1000) {
    return invalid(`awards[${index}].points must be an integer between 1 and 1000.`);
  }
  if (placementValue !== null && (!Number.isInteger(placementValue) || placementValue < 1 || placementValue > 1000)) {
    return invalid(`awards[${index}].placement must be an integer between 1 and 1000.`);
  }
  return { ok: true, value: { playerId, points, placement: placementValue } };
}

function normalizeAwardCommand(body = {}) {
  const targetTeam = commandTeamId(body);
  if (!targetTeam.ok) return targetTeam;
  const occurredOn = normalizeIsoDate(body.occurredOn || body.occurred_on);
  const title = normalizeText(body.title, 161);
  const note = normalizeText(body.note, 1201);
  const idempotencyKey = normalizeIdempotencyKey(body.idempotencyKey || body.idempotency_key);
  if (!occurredOn) return invalid("occurredOn must be a valid YYYY-MM-DD date.");
  if (!title || title.length > 160) return invalid("title must contain 1-160 characters.");
  if (note.length > 1200) return invalid("note must not exceed 1200 characters.");
  if (!idempotencyKey) return invalid("idempotencyKey must be 8-160 URL-safe characters.");
  if (!Array.isArray(body.awards) || body.awards.length < 1 || body.awards.length > MAX_AWARDS) {
    return invalid(`awards must contain between 1 and ${MAX_AWARDS} players.`);
  }

  const awards = [];
  const playerIds = new Set();
  for (let index = 0; index < body.awards.length; index += 1) {
    const result = normalizeAward(body.awards[index], index);
    if (!result.ok) return result;
    if (playerIds.has(result.value.playerId)) {
      return invalid(`Player ${result.value.playerId} appears more than once in this award batch.`);
    }
    playerIds.add(result.value.playerId);
    awards.push(result.value);
  }
  return {
    ok: true,
    command: {
      action: "award",
      teamId: targetTeam.teamId,
      occurredOn,
      month: monthFromDate(occurredOn),
      title,
      note,
      idempotencyKey,
      awards,
    },
  };
}

function normalizeReverseCommand(body = {}) {
  const targetTeam = commandTeamId(body);
  if (!targetTeam.ok) return targetTeam;
  const eventId = normalizeText(body.eventId || body.event_id, 81);
  const reason = normalizeText(body.reason, 1201);
  const idempotencyKey = normalizeIdempotencyKey(body.idempotencyKey || body.idempotency_key);
  if (!isUuid(eventId)) return invalid("eventId must be a valid UUID.");
  if (!reason || reason.length > 1200) return invalid("reason must contain 1-1200 characters when reversing an event.");
  if (!idempotencyKey) return invalid("idempotencyKey must be 8-160 URL-safe characters.");
  return { ok: true, command: { action: "reverse-event", teamId: targetTeam.teamId, eventId, reason, idempotencyKey } };
}

function normalizeLeaderboardCommand(body = {}) {
  const source = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  const action = normalizeText(source.action, 40).toLowerCase();
  if (action === "award") return normalizeAwardCommand(source);
  if (action === "reverse-event") return normalizeReverseCommand(source);
  return invalid("action must be award or reverse-event.");
}

function canonicalAwardHash(command, mappedAwards = []) {
  const canonical = {
    occurredOn: command.occurredOn,
    title: command.title,
    note: command.note,
    awards: [...mappedAwards]
      .map((award) => ({
        squadPlayerId: award.squad_player_id,
        squadRosterMembershipId: award.squad_roster_membership_id,
        playerSourceKey: award.player_source_key,
        points: award.points,
        placement: award.placement ?? null,
      }))
      .sort((left, right) => left.playerSourceKey.localeCompare(right.playerSourceKey)),
  };
  return crypto.createHash("sha256").update(JSON.stringify(canonical), "utf8").digest("hex");
}

function canonicalReverseHash(command = {}) {
  return crypto.createHash("sha256").update(JSON.stringify({
    eventId: normalizeText(command.eventId, 80).toLowerCase(),
    reason: normalizeText(command.reason, 1201),
  }), "utf8").digest("hex");
}

module.exports = {
  LEADERBOARD_SCHEMA,
  LEADERBOARD_TIMEZONE,
  canonicalAwardHash,
  canonicalReverseHash,
  isUuid,
  monthFromDate,
  monthStart,
  normalizeLeaderboardCommand,
  normalizeLeaderboardTeamId,
  normalizeMonth,
  normalizeText,
};
