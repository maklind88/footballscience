const { parseJsonBody, readConfig, sendJson, buildSupabaseKeyHeaders } = require("./supabase-admin.js");

const VIDEO_ANALYSIS_SCHEMA = "footballscience-video-analysis-v1";
const DEFAULT_LIMIT = 80;
const MAX_LIMIT = 200;
const MAX_BODY_BYTES = 96 * 1024;
const OUTCOMES = new Set(["Positive", "Development", "Neutral"]);
const PLAYER_ROLES = new Set(["primary", "secondary", "supporting", "unit"]);
const FORBIDDEN_VIDEO_KEYS = new Set(
  "absolutepath base64 blob bytes data dataurl file filecontent filepath fullpath localpath path rawvideo sourceurl videoblob videobytes videodata videofile videopath"
    .split(" ")
);

function normalizeText(value, maxLength = 240) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function normalizeNote(value, maxLength = 4000) {
  return String(value || "").replace(/\r\n/g, "\n").trim().slice(0, maxLength);
}

function normalizeUuid(value) {
  const text = normalizeText(value, 80);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : "";
}

function asLimit(value, fallback = DEFAULT_LIMIT) {
  const limit = Math.floor(Number(value));
  if (!Number.isFinite(limit) || limit <= 0) return fallback;
  return Math.min(limit, MAX_LIMIT);
}

function asMs(value, fallback = 0) {
  const ms = Math.round(Number(value));
  return Number.isFinite(ms) && ms >= 0 ? ms : fallback;
}

function normalizeOutcome(value) {
  const outcome = normalizeText(value, 40);
  return OUTCOMES.has(outcome) ? outcome : "Neutral";
}

function normalizePlayerRole(value) {
  const role = normalizeText(value, 40).toLowerCase();
  return PLAYER_ROLES.has(role) ? role : "primary";
}

function actorScope(actor = {}) {
  return {
    organizationId: normalizeText(actor.clubId || actor.organizationId || "club-ncc", 160),
    teamId: normalizeText(actor.teamId || "team-ncc-first", 160),
    actorId: normalizeText(actor.id, 160),
  };
}

function isLikelyLocalPath(value = "") {
  const text = String(value || "").trim();
  return (
    /^file:\/\//i.test(text) ||
    /^~\//.test(text) ||
    /^\/(?:Users|home|var|Volumes|private|tmp)\//.test(text) ||
    /^[A-Za-z]:\\/.test(text) ||
    /^data:video\//i.test(text)
  );
}

function containsForbiddenVideoPayload(value, path = []) {
  if (value == null) return null;
  if (typeof value === "string") {
    return isLikelyLocalPath(value) ? { path, reason: "local_video_path_or_inline_video" } : null;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const match = containsForbiddenVideoPayload(value[index], [...path, String(index)]);
      if (match) return match;
    }
    return null;
  }
  if (typeof value !== "object") return null;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_VIDEO_KEYS.has(key.toLowerCase())) return { path: [...path, key], reason: "forbidden_video_payload_key" };
    const match = containsForbiddenVideoPayload(child, [...path, key]);
    if (match) return match;
  }
  return null;
}

function rejectForbiddenPayload(payload = {}) {
  const match = containsForbiddenVideoPayload(payload);
  if (!match) return;
  const error = new Error("Video files and local file paths must not be sent to Football Science.");
  error.status = 400;
  error.details = match;
  throw error;
}

function restBaseUrl() {
  const { url, serviceRoleKey } = readConfig();
  return url && serviceRoleKey ? { url: `${url}/rest/v1`, serviceRoleKey } : null;
}

async function parseResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

async function dbRequest(path, options = {}) {
  const base = restBaseUrl();
  if (!base) return { ok: false, status: 500, reason: "Missing Supabase database configuration." };
  const headers = {
    ...buildSupabaseKeyHeaders(base.serviceRoleKey, { contentType: "application/json" }),
    ...(options.headers || {}),
  };
  if (options.prefer) headers.Prefer = options.prefer;
  const response = await fetch(`${base.url}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = await parseResponse(response);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      reason: payload?.message || payload?.error || `Video Analysis database request failed (${response.status}).`,
      payload,
    };
  }
  return { ok: true, status: response.status, payload };
}

function paramsPath(table, params = new URLSearchParams()) {
  const query = params.toString();
  return `/${table}${query ? `?${query}` : ""}`;
}

function buildTeamParams(scope) {
  const params = new URLSearchParams();
  params.set("organization_id", `eq.${scope.organizationId}`);
  params.set("team_id", `eq.${scope.teamId}`);
  return params;
}

function buildClipSearchParams(query = {}, scope = actorScope()) {
  const params = buildTeamParams(scope);
  params.set("select", "*");
  params.set("status", "eq.active");
  if (normalizeUuid(query.matchId || query.match_id)) params.set("match_id", `eq.${normalizeUuid(query.matchId || query.match_id)}`);
  if (normalizeUuid(query.videoId || query.video_id)) params.set("video_id", `eq.${normalizeUuid(query.videoId || query.video_id)}`);
  if (normalizeText(query.phase, 80)) params.set("phase", `eq.${normalizeText(query.phase, 80)}`);
  if (normalizeText(query.subPhase || query.sub_phase, 80)) params.set("sub_phase", `eq.${normalizeText(query.subPhase || query.sub_phase, 80)}`);
  if (normalizeText(query.outcome, 40)) params.set("outcome", `eq.${normalizeOutcome(query.outcome)}`);
  if (normalizeText(query.teamPrincipleId || query.team_principle_id, 120)) {
    params.set("team_principle_id", `eq.${normalizeText(query.teamPrincipleId || query.team_principle_id, 120)}`);
  }
  if (normalizeText(query.miniGamePrincipleId || query.mini_game_principle_id, 120)) {
    params.set("mini_game_principle_id", `eq.${normalizeText(query.miniGamePrincipleId || query.mini_game_principle_id, 120)}`);
  }
  params.set("order", "start_ms.asc");
  params.set("limit", String(asLimit(query.limit)));
  return params;
}

function normalizeVideoSourcePayload(payload = {}, actor = {}) {
  rejectForbiddenPayload(payload);
  const scope = actorScope(actor);
  const displayName = normalizeText(payload.displayName || payload.title || "Local match video", 180);
  const localVideoIdentifier = normalizeText(payload.localVideoIdentifier || payload.local_video_identifier, 240);
  if (localVideoIdentifier.length < 8) {
    const error = new Error("Local video identifier is required.");
    error.status = 400;
    throw error;
  }
  return {
    ...scope,
    matchId: normalizeUuid(payload.matchId || payload.match_id),
    title: normalizeText(payload.matchTitle || payload.title || displayName, 180),
    matchDate: normalizeText(payload.matchDate || payload.match_date, 20) || null,
    opponent: normalizeText(payload.opponent, 180) || null,
    displayName,
    localVideoIdentifier,
    durationMs: asMs(payload.durationMs || payload.duration_ms, 0),
    fileSizeBytes: Number.isFinite(Number(payload.fileSizeBytes || payload.file_size_bytes))
      ? Math.max(0, Math.round(Number(payload.fileSizeBytes || payload.file_size_bytes)))
      : null,
    actorId: scope.actorId,
  };
}

function normalizeClipPayload(payload = {}, actor = {}) {
  rejectForbiddenPayload(payload);
  const scope = actorScope(actor);
  const startMs = asMs(payload.startMs ?? payload.start_ms);
  const endMs = asMs(payload.endMs ?? payload.end_ms);
  if (endMs <= startMs) {
    const error = new Error("Clip end_ms must be greater than start_ms.");
    error.status = 400;
    throw error;
  }
  const matchId = normalizeUuid(payload.matchId || payload.match_id);
  const videoId = normalizeUuid(payload.videoId || payload.video_id);
  if (!matchId || !videoId) {
    const error = new Error("match_id and video_id are required.");
    error.status = 400;
    throw error;
  }
  const players = Array.isArray(payload.players) ? payload.players : [];
  const tags = Array.isArray(payload.tags) ? payload.tags : [];
  return {
    ...scope,
    id: normalizeUuid(payload.id),
    matchId,
    videoId,
    startMs,
    endMs,
    period: normalizeText(payload.period, 40) || null,
    phase: normalizeText(payload.phase, 80) || "In Possession",
    subPhase: normalizeText(payload.subPhase || payload.sub_phase, 80) || "Build Up",
    teamPrincipleId: normalizeText(payload.teamPrincipleId || payload.team_principle_id, 120) || null,
    miniGamePrincipleId: normalizeText(payload.miniGamePrincipleId || payload.mini_game_principle_id, 120) || null,
    outcome: normalizeOutcome(payload.outcome),
    note: normalizeNote(payload.note || payload.notes, 4000),
    tags: tags.map((tag) => normalizeText(tag, 80)).filter(Boolean).slice(0, 20),
    players: players
      .map((player) => ({
        playerId: normalizeText(player.playerId || player.player_id || player.id, 160),
        playerLabel: normalizeText(player.playerLabel || player.player_label || player.label || player.name, 180) || null,
        role: normalizePlayerRole(player.role),
      }))
      .filter((player) => player.playerId)
      .slice(0, 20),
  };
}

async function selectRows(table, params) {
  const result = await dbRequest(paramsPath(table, params));
  if (!result.ok) return result;
  return { ok: true, payload: Array.isArray(result.payload) ? result.payload : [] };
}

async function insertRow(table, row) {
  return dbRequest(paramsPath(table), { method: "POST", body: row, prefer: "return=representation" });
}

async function patchRows(table, params, row) {
  return dbRequest(paramsPath(table, params), { method: "PATCH", body: row, prefer: "return=representation" });
}

async function findExistingVideo(scope, localVideoIdentifier) {
  const params = buildTeamParams(scope);
  params.set("select", "*");
  params.set("local_video_identifier", `eq.${localVideoIdentifier}`);
  params.set("status", "neq.archived");
  params.set("limit", "1");
  const result = await selectRows("video_videos", params);
  return result.ok ? result.payload[0] || null : null;
}

async function createLocalVideoSource(payload, actor) {
  const normalized = normalizeVideoSourcePayload(payload, actor);
  const scope = { organizationId: normalized.organizationId, teamId: normalized.teamId };
  let video = await findExistingVideo(scope, normalized.localVideoIdentifier);
  let matchId = video?.match_id || normalized.matchId;
  let match = null;
  if (!matchId) {
    const matchResult = await insertRow("video_matches", {
      organization_id: normalized.organizationId,
      team_id: normalized.teamId,
      title: normalized.title,
      match_date: normalized.matchDate,
      opponent: normalized.opponent,
      created_by: normalized.actorId,
    });
    if (!matchResult.ok) return matchResult;
    match = matchResult.payload?.[0] || null;
    matchId = match?.id;
  }
  if (!video) {
    const videoResult = await insertRow("video_videos", {
      organization_id: normalized.organizationId,
      team_id: normalized.teamId,
      match_id: matchId,
      title: normalized.displayName,
      duration_ms: normalized.durationMs,
      local_video_identifier: normalized.localVideoIdentifier,
      created_by: normalized.actorId,
    });
    if (!videoResult.ok) return videoResult;
    video = videoResult.payload?.[0] || null;
  }
  const sourceResult = await insertRow("video_sources", {
    organization_id: normalized.organizationId,
    team_id: normalized.teamId,
    match_id: video.match_id || matchId,
    video_id: video.id,
    local_video_identifier: normalized.localVideoIdentifier,
    display_name: normalized.displayName,
    duration_ms: normalized.durationMs,
    file_size_bytes: normalized.fileSizeBytes,
    created_by: normalized.actorId,
  });
  if (!sourceResult.ok && sourceResult.status !== 409) return sourceResult;
  return { ok: true, payload: { schema: VIDEO_ANALYSIS_SCHEMA, match, video, source: sourceResult.payload?.[0] || null } };
}

async function attachClipRelations(clips, scope) {
  const ids = clips.map((clip) => clip.id).filter(Boolean);
  if (!ids.length) return clips;
  const idFilter = `in.(${ids.join(",")})`;
  const childParams = (select) => {
    const params = buildTeamParams(scope);
    params.set("select", select);
    params.set("clip_instance_id", idFilter);
    return params;
  };
  const [players, tags, notes] = await Promise.all([
    selectRows("video_clip_players", childParams("*")),
    selectRows("video_clip_tags", childParams("*")),
    selectRows("video_clip_notes", childParams("*")),
  ]);
  const byClip = (rows) => {
    const map = new Map();
    for (const row of rows.ok ? rows.payload : []) {
      const list = map.get(row.clip_instance_id) || [];
      list.push(row);
      map.set(row.clip_instance_id, list);
    }
    return map;
  };
  const playerMap = byClip(players);
  const tagMap = byClip(tags);
  const noteMap = byClip(notes);
  return clips.map((clip) => ({
    ...clip,
    players: playerMap.get(clip.id) || [],
    tags: (tagMap.get(clip.id) || []).map((entry) => entry.tag),
    notes: noteMap.get(clip.id) || [],
  }));
}

async function listClips(query, actor) {
  const scope = actorScope(actor);
  const params = buildClipSearchParams(query, scope);
  const result = await selectRows("video_clip_instances", params);
  if (!result.ok) return result;
  let clips = await attachClipRelations(result.payload, scope);
  const search = normalizeText(query.search || query.q, 120).toLowerCase();
  if (search) {
    clips = clips.filter((clip) =>
      [clip.phase, clip.sub_phase, clip.outcome, clip.team_principle_id, clip.mini_game_principle_id]
        .concat(clip.tags || [])
        .concat((clip.players || []).map((player) => player.player_label || player.player_id))
        .concat((clip.notes || []).map((note) => note.note))
        .some((value) => normalizeText(value, 4000).toLowerCase().includes(search))
    );
  }
  return { ok: true, payload: { schema: VIDEO_ANALYSIS_SCHEMA, clips } };
}

async function listMatches(query, actor) {
  const scope = actorScope(actor);
  const params = buildTeamParams(scope);
  params.set("select", "*");
  params.set("status", "eq.active");
  params.set("order", "match_date.desc.nullslast,created_at.desc");
  params.set("limit", String(asLimit(query.limit, 40)));
  const result = await selectRows("video_matches", params);
  if (!result.ok) return result;
  return { ok: true, payload: { schema: VIDEO_ANALYSIS_SCHEMA, matches: result.payload } };
}

async function saveClip(payload, actor) {
  const clip = normalizeClipPayload(payload, actor);
  const row = {
    organization_id: clip.organizationId,
    team_id: clip.teamId,
    match_id: clip.matchId,
    video_id: clip.videoId,
    start_ms: clip.startMs,
    end_ms: clip.endMs,
    period: clip.period,
    phase: clip.phase,
    sub_phase: clip.subPhase,
    team_principle_id: clip.teamPrincipleId,
    mini_game_principle_id: clip.miniGamePrincipleId,
    outcome: clip.outcome,
    created_by: clip.actorId,
  };
  const patchParams = buildTeamParams({ organizationId: clip.organizationId, teamId: clip.teamId });
  patchParams.set("id", `eq.${clip.id}`);
  const clipResult = clip.id ? await patchRows("video_clip_instances", patchParams, row) : await insertRow("video_clip_instances", row);
  if (!clipResult.ok) return clipResult;
  const saved = clipResult.payload?.[0];
  if (!saved?.id) return { ok: false, status: 500, reason: "Clip could not be saved." };
  const childWrites = [];
  for (const player of clip.players) {
    childWrites.push(insertRow("video_clip_players", {
      organization_id: clip.organizationId,
      team_id: clip.teamId,
      clip_instance_id: saved.id,
      player_id: player.playerId,
      player_label: player.playerLabel,
      role: player.role,
    }));
  }
  for (const tag of clip.tags) {
    childWrites.push(insertRow("video_clip_tags", {
      organization_id: clip.organizationId,
      team_id: clip.teamId,
      clip_instance_id: saved.id,
      tag,
    }));
  }
  if (clip.note) {
    childWrites.push(insertRow("video_clip_notes", {
      organization_id: clip.organizationId,
      team_id: clip.teamId,
      clip_instance_id: saved.id,
      note: clip.note,
      created_by: clip.actorId,
    }));
  }
  const childResults = await Promise.all(childWrites);
  const failed = childResults.find((entry) => !entry.ok && entry.status !== 409);
  if (failed) return failed;
  const [withRelations] = await attachClipRelations([saved], { organizationId: clip.organizationId, teamId: clip.teamId });
  return { ok: true, payload: { schema: VIDEO_ANALYSIS_SCHEMA, clip: withRelations } };
}

async function archiveClip(payload, actor) {
  const scope = actorScope(actor);
  const id = normalizeUuid(payload.id || payload.clipId || payload.clip_id);
  if (!id) return { ok: false, status: 400, reason: "clip id is required." };
  const params = buildTeamParams(scope);
  params.set("id", `eq.${id}`);
  const result = await patchRows("video_clip_instances", params, { status: "archived", archived_at: new Date().toISOString() });
  return result.ok ? { ok: true, payload: { schema: VIDEO_ANALYSIS_SCHEMA, clip: result.payload?.[0] || null } } : result;
}

function statusPayload(actor) {
  return {
    ok: true,
    schema: VIDEO_ANALYSIS_SCHEMA,
    mode: "local-video-metadata",
    enabled: true,
    scope: actorScope(actor),
    storesVideoFiles: false,
    precision: "milliseconds",
    mvp: ["local-video", "clip-instance", "football-language-tags", "players", "notes", "filters", "review-list"],
  };
}

async function handleVideoAnalysisRequest(req, res, actor) {
  const url = new URL(req.url || "/api/video-analysis", "https://footballscience.local");
  if (req.method === "GET") {
    const action = normalizeText(url.searchParams.get("action") || "clips", 40);
    if (action === "status") return sendJson(res, 200, statusPayload(actor));
    const result = action === "matches"
      ? await listMatches(Object.fromEntries(url.searchParams.entries()), actor)
      : await listClips(Object.fromEntries(url.searchParams.entries()), actor);
    return sendJson(res, result.ok ? 200 : result.status || 500, result.ok ? result.payload : { ok: false, reason: result.reason });
  }
  const body = await parseJsonBody(req, { maxBytes: MAX_BODY_BYTES });
  const action = normalizeText(body.action || url.searchParams.get("action"), 60);
  const result =
    action === "create-local-video-source"
      ? await createLocalVideoSource(body, actor)
      : action === "save-clip"
        ? await saveClip(body.clip || body, actor)
        : action === "archive-clip"
          ? await archiveClip(body, actor)
          : { ok: false, status: 400, reason: "Unsupported Video Analysis action." };
  return sendJson(res, result.ok ? 200 : result.status || 500, result.ok ? result.payload : { ok: false, reason: result.reason });
}

module.exports = {
  VIDEO_ANALYSIS_SCHEMA,
  asLimit,
  buildClipSearchParams,
  containsForbiddenVideoPayload,
  handleVideoAnalysisRequest,
  normalizeClipPayload,
  normalizeOutcome,
  rejectForbiddenPayload,
};
