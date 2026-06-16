const {
  asLimit,
  actorScope,
  buildTeamParams,
  normalizeText,
  normalizeUuid,
  patchRows,
  rejectForbiddenPayload,
  selectRows,
} = require("./video-analysis-database-core.js");

const VIDEO_ANALYSIS_SCHEMA = "footballscience-video-analysis-v2";

function rowList(result) {
  return result.ok && Array.isArray(result.payload) ? result.payload : [];
}

function normalizeVideoDate(value = "") {
  const candidate = normalizeText(value, 20).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : null;
}

function normalizeVideoEventType(value = "") {
  const type = normalizeText(value, 40).toLowerCase();
  return type === "match" ? "match" : "training";
}

function inferVideoEventType(value = "", context = {}) {
  const type = normalizeText(value, 40).toLowerCase();
  if (type === "match" || type === "training") return type;
  const title = normalizeText(context.title, 180).toLowerCase();
  if (normalizeText(context.opponent, 180) || /\bmatch\b|\svs\.?\s|\s@\s/.test(title)) return "match";
  return "training";
}

function normalizeMetadata(metadata = {}) {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};
}

function scheduleCandidateFromRow(row = {}) {
  const eventDate = normalizeVideoDate(row.event_date || row.date);
  const eventType = normalizeVideoEventType(row.type);
  if (!eventDate || !["match", "training"].includes(eventType)) return null;
  return {
    id: row.id,
    scheduleEventId: row.id,
    scheduleDayKey: eventDate,
    matchDate: eventDate,
    eventType,
    title: normalizeText(row.title, 180) || (eventType === "match" ? "Match" : "Training"),
    opponent: normalizeText(row.opponent, 180),
    location: normalizeText(row.location, 180),
    time: normalizeText(row.starts_at || "", 40),
    source: "schedule-events",
  };
}

function actorIdentifier(actor = {}) {
  return normalizeText(actor.actorId || actor.id, 160);
}

function videoMatchFromRow(row = {}, related = {}, actor = {}) {
  const metadata = normalizeMetadata(row.metadata);
  const videos = related.videosByMatch?.get(row.id) || [];
  const sourceCandidates = videos.flatMap((video) => related.sourcesByVideo?.get(video.id) || []);
  const preferredActorId = actorIdentifier(actor);
  const latestSource = sourceCandidates.find((source) => preferredActorId && source.created_by === preferredActorId)
    || sourceCandidates[0]
    || null;
  const latestVideo = latestSource
    ? videos.find((video) => video.id === latestSource.video_id) || videos[0] || null
    : videos[0] || null;
  const eventType = inferVideoEventType(row.event_type || metadata.eventType || metadata.event_type, row);
  return {
    ...row,
    event_type: eventType,
    schedule_event_id: normalizeText(metadata.scheduleEventId || metadata.schedule_event_id, 160),
    schedule_day_key: normalizeText(metadata.scheduleDayKey || metadata.schedule_day_key, 40) || normalizeVideoDate(row.match_date),
    latest_video: latestVideo,
    latest_source: latestSource,
    video_count: videos.length,
    source_count: sourceCandidates.length,
    clip_count: related.clipCounts?.get(row.id) || 0,
  };
}

function matchesLibrarySearch(item = {}, search = "") {
  if (!search) return true;
  return [
    item.title,
    item.match_date,
    item.event_type,
    item.opponent,
    item.competition,
    item.venue,
    item.schedule_day_key,
  ].some((value) => normalizeText(value, 240).toLowerCase().includes(search));
}

function matchesLibraryFilters(item = {}, query = {}) {
  const date = normalizeVideoDate(query.date || query.matchDate || query.match_date);
  const type = normalizeText(query.type || query.eventType || query.event_type, 40).toLowerCase();
  if (date && normalizeVideoDate(item.match_date) !== date) return false;
  if (type && type !== "all" && normalizeVideoEventType(item.event_type) !== type) return false;
  return true;
}

function idInFilter(ids = []) {
  return `in.(${ids.filter(Boolean).join(",")})`;
}

async function selectVideoRowsForMatches(table, scope, matchIds = [], select = "*") {
  if (!matchIds.length) return { ok: true, payload: [] };
  const params = buildTeamParams(scope);
  params.set("select", select);
  params.set("match_id", idInFilter(matchIds));
  params.set("status", "neq.archived");
  params.set("limit", "1000");
  const result = await selectRows(table, params);
  return result.ok ? result : { ok: true, payload: [] };
}

function groupBy(rows = [], key = "id") {
  const grouped = new Map();
  for (const row of rows) {
    const groupKey = row[key];
    const list = grouped.get(groupKey) || [];
    list.push(row);
    grouped.set(groupKey, list);
  }
  return grouped;
}

async function listScheduleCandidates(query = {}, scope = {}) {
  if (!normalizeUuid(scope.organizationId) || !normalizeUuid(scope.teamId)) return [];
  const params = new URLSearchParams();
  params.set("organization_id", `eq.${scope.organizationId}`);
  params.set("team_id", `eq.${scope.teamId}`);
  params.set("select", "id,event_date,starts_at,type,title,opponent,location,status");
  params.set("type", "in.(training,match)");
  params.set("deleted_at", "is.null");
  params.set("status", "neq.archived");
  params.set("order", "event_date.desc,starts_at.desc");
  params.set("limit", String(asLimit(query.scheduleLimit || query.limit, 80)));
  const result = await selectRows("schedule_events", params);
  if (!result.ok) return [];
  const search = normalizeText(query.search || query.q, 120).toLowerCase();
  const date = normalizeVideoDate(query.date || query.matchDate || query.match_date);
  const type = normalizeText(query.type || query.eventType || query.event_type, 40).toLowerCase();
  return result.payload
    .map(scheduleCandidateFromRow)
    .filter(Boolean)
    .filter((candidate) => {
      if (date && candidate.matchDate !== date) return false;
      if (type && type !== "all" && candidate.eventType !== type) return false;
      if (!search) return true;
      return [candidate.title, candidate.matchDate, candidate.eventType, candidate.opponent, candidate.location]
        .some((value) => normalizeText(value, 240).toLowerCase().includes(search));
    });
}

async function listMatches(query, actor) {
  const scope = actorScope(actor);
  const params = buildTeamParams(scope);
  params.set("select", "*");
  params.set("status", "eq.active");
  params.set("order", "match_date.desc.nullslast,created_at.desc");
  params.set("limit", String(asLimit(query.limit, 120)));
  const result = await selectRows("video_matches", params);
  if (!result.ok) return result;
  const search = normalizeText(query.search || query.q, 120).toLowerCase();
  const baseMatches = result.payload
    .map((row) => {
      const metadata = normalizeMetadata(row.metadata);
      return {
        ...row,
        event_type: inferVideoEventType(metadata.eventType || metadata.event_type, row),
        schedule_event_id: normalizeText(metadata.scheduleEventId || metadata.schedule_event_id, 160),
        schedule_day_key: normalizeText(metadata.scheduleDayKey || metadata.schedule_day_key, 40) || normalizeVideoDate(row.match_date),
      };
    })
    .filter((row) => matchesLibrarySearch(row, search) && matchesLibraryFilters(row, query));
  const matchIds = baseMatches.map((match) => match.id).filter(Boolean);
  const [videosResult, sourcesResult, clipsResult, scheduleCandidates] = await Promise.all([
    selectVideoRowsForMatches("video_videos", scope, matchIds),
    selectVideoRowsForMatches("video_sources", scope, matchIds),
    selectVideoRowsForMatches("video_clip_instances", scope, matchIds, "match_id"),
    listScheduleCandidates(query, scope),
  ]);
  const videos = rowList(videosResult).sort((first, second) => String(second.created_at || "").localeCompare(String(first.created_at || "")));
  const sources = rowList(sourcesResult).sort((first, second) => String(second.created_at || "").localeCompare(String(first.created_at || "")));
  const clipCounts = new Map();
  for (const clip of rowList(clipsResult)) {
    clipCounts.set(clip.match_id, (clipCounts.get(clip.match_id) || 0) + 1);
  }
  const related = {
    videosByMatch: groupBy(videos, "match_id"),
    sourcesByVideo: groupBy(sources, "video_id"),
    clipCounts,
  };
  return {
    ok: true,
    payload: {
      schema: VIDEO_ANALYSIS_SCHEMA,
      matches: baseMatches.map((match) => videoMatchFromRow(match, related, scope)),
      scheduleCandidates,
    },
  };
}

async function updateMatchLink(payload, actor) {
  rejectForbiddenPayload(payload);
  const scope = actorScope(actor);
  const matchId = normalizeUuid(payload.matchId || payload.match_id);
  if (!matchId) return { ok: false, status: 400, reason: "match id is required." };
  const params = buildTeamParams(scope);
  params.set("id", `eq.${matchId}`);
  const existingResult = await selectRows("video_matches", params);
  if (!existingResult.ok) return existingResult;
  const existing = existingResult.payload?.[0] || null;
  if (!existing) return { ok: false, status: 404, reason: "Video match was not found." };
  const matchDate = normalizeVideoDate(payload.matchDate || payload.match_date || payload.date) || existing.match_date || null;
  const eventType = normalizeVideoEventType(payload.eventType || payload.event_type || payload.type);
  const scheduleEventId = normalizeText(payload.scheduleEventId || payload.schedule_event_id, 160);
  const scheduleDayKey = normalizeText(payload.scheduleDayKey || payload.schedule_day_key, 40) || matchDate;
  const metadata = {
    ...normalizeMetadata(existing.metadata),
    eventType,
    scheduleEventId,
    scheduleDayKey,
    linkedFrom: "video-analysis-library",
    linkedAt: new Date().toISOString(),
    linkedBy: scope.actorId || null,
  };
  const patch = { match_date: matchDate, metadata };
  const title = normalizeText(payload.title, 180);
  const opponent = normalizeText(payload.opponent, 180);
  if (title) patch.title = title;
  if (opponent) patch.opponent = opponent;
  const result = await patchRows("video_matches", params, patch);
  return result.ok
    ? { ok: true, payload: { schema: VIDEO_ANALYSIS_SCHEMA, match: videoMatchFromRow(result.payload?.[0] || existing, {}, scope) } }
    : result;
}

module.exports = {
  listMatches,
  normalizeMetadata,
  normalizeVideoDate,
  normalizeVideoEventType,
  updateMatchLink,
  videoMatchFromRow,
};
