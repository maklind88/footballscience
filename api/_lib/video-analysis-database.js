const { parseJsonBody, sendJson } = require("./supabase-admin.js");
const {
  MAX_BODY_BYTES,
  asLimit,
  asOffset,
  asMs,
  actorScope,
  buildTeamParams,
  containsForbiddenVideoPayload,
  insertRow,
  normalizeCodingMode,
  normalizeDescriptorType,
  normalizeLabelType,
  normalizeNote,
  normalizeOutcome,
  normalizePlayerRole,
  normalizeText,
  normalizeUuid,
  paramsPath,
  patchRows,
  rejectForbiddenPayload,
  selectRows,
} = require("./video-analysis-database-core.js");
const { listMatches, normalizeMetadata, normalizeVideoEventType, updateMatchLink } = require("./video-analysis-library-database.js");
const { listCodingTemplates, saveCodingTemplate } = require("./video-analysis-coding-template-database.js");
const {
  archivePresentation,
  getPresentation,
  listPresentations,
  saveDrawingLayer,
  savePresentation,
  saveShareTargets,
  saveSmartCollection,
  saveSmartCollectionShareTargets,
} = require("./video-analysis-presentation-database.js");
const { upsertClipBankItem } = require("./idp-database.js");
const { saveReviewSession } = require("./video-analysis-review-database.js");

const VIDEO_ANALYSIS_SCHEMA = "footballscience-video-analysis-v2";

function rowList(result) {
  return result.ok && Array.isArray(result.payload) ? result.payload : [];
}

function buildClipSearchParams(query = {}, scope = actorScope()) {
  const params = buildTeamParams(scope);
  params.set("select", "*");
  params.set("status", "eq.active");
  const matchId = normalizeUuid(query.matchId || query.match_id);
  const matchIds = Array.isArray(query.matchIds || query.match_ids)
    ? (query.matchIds || query.match_ids).map(normalizeUuid).filter(Boolean)
    : [];
  if (matchId) params.set("match_id", `eq.${matchId}`);
  else if (matchIds.length) params.set("match_id", `in.(${matchIds.join(",")})`);
  if (normalizeUuid(query.videoId || query.video_id)) params.set("video_id", `eq.${normalizeUuid(query.videoId || query.video_id)}`);
  if (normalizeText(query.phase, 80)) params.set("phase", `eq.${normalizeText(query.phase, 80)}`);
  if (normalizeText(query.subPhase || query.sub_phase, 80)) params.set("sub_phase", `eq.${normalizeText(query.subPhase || query.sub_phase, 80)}`);
  if (normalizeText(query.outcome, 40)) params.set("outcome", `eq.${normalizeOutcome(query.outcome)}`);
  if (normalizeText(query.teamPrincipleId || query.team_principle_id || query.principleId, 120)) {
    params.set("team_principle_id", `eq.${normalizeText(query.teamPrincipleId || query.team_principle_id || query.principleId, 120)}`);
  }
  if (normalizeText(query.miniGamePrincipleId || query.mini_game_principle_id, 120)) {
    params.set("mini_game_principle_id", `eq.${normalizeText(query.miniGamePrincipleId || query.mini_game_principle_id, 120)}`);
  }
  params.set("order", "start_ms.asc");
  params.set("limit", String(asLimit(query.limit)));
  params.set("offset", String(asOffset(query.offset)));
  return params;
}

async function matchIdsForDate(query = {}, scope = {}) {
  const date = normalizeText(query.date || query.matchDate || query.match_date, 20);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || normalizeUuid(query.matchId || query.match_id)) return [];
  const params = buildTeamParams(scope);
  params.set("select", "id");
  params.set("match_date", `eq.${date}`);
  params.set("status", "eq.active");
  params.set("limit", "500");
  const result = await selectRows("video_matches", params);
  if (!result.ok) return result;
  return rowList(result).map((row) => row.id).filter(Boolean);
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
    eventType: normalizeVideoEventType(payload.eventType || payload.event_type || payload.type),
    scheduleEventId: normalizeText(payload.scheduleEventId || payload.schedule_event_id, 160) || null,
    scheduleDayKey: normalizeText(payload.scheduleDayKey || payload.schedule_day_key, 40) || null,
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

function normalizeDescriptors(payload = {}) {
  const source = payload.descriptors || {};
  const entries = Array.isArray(source)
    ? source
    : Object.entries(source).map(([type, value]) => ({ type, value }));
  return entries
    .map((entry = {}) => ({
      type: normalizeDescriptorType(entry.type || entry.descriptorType || entry.descriptor_type),
      value: normalizeText(entry.value || entry.descriptorValue || entry.descriptor_value, 180),
      label: normalizeText(entry.label || entry.descriptorLabel || entry.descriptor_label, 180) || null,
    }))
    .filter((entry) => entry.value)
    .slice(0, 30);
}

function normalizeLabels(payload = {}, clip = {}) {
  const base = [
    ["phase", clip.phase, clip.phase],
    ["sub_phase", clip.subPhase, clip.subPhase],
    ["team_principle", clip.teamPrincipleId, clip.teamPrincipleId],
    ["mini_game_principle", clip.miniGamePrincipleId, clip.miniGamePrincipleId],
    ["outcome", clip.outcome, clip.outcome],
  ];
  const custom = Array.isArray(payload.labels) ? payload.labels : [];
  return base
    .map(([type, value, label]) => ({ type, value, label }))
    .concat(custom.map((entry = {}) => ({
      type: entry.type || entry.labelType || entry.label_type,
      value: entry.value || entry.labelValue || entry.label_value,
      label: entry.label || entry.labelText || entry.label_text,
    })))
    .map((entry = {}) => ({
      type: normalizeLabelType(entry.type),
      value: normalizeText(entry.value, 180),
      label: normalizeText(entry.label, 180) || null,
    }))
    .filter((entry) => entry.value)
    .slice(0, 40);
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
  const clip = {
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
    codingMode: normalizeCodingMode(payload.codingMode || payload.coding_mode),
    codingTemplateId: normalizeUuid(payload.codingTemplateId || payload.coding_template_id) || null,
    codingButtonId: normalizeUuid(payload.codingButtonId || payload.coding_button_id) || null,
    preRollMs: asMs(payload.preRollMs || payload.pre_roll_ms, 0),
    postRollMs: asMs(payload.postRollMs || payload.post_roll_ms, 0),
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
  return {
    ...clip,
    descriptors: normalizeDescriptors(payload),
    labels: normalizeLabels(payload, clip),
  };
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
  const matchMetadata = { eventType: normalized.eventType, scheduleEventId: normalized.scheduleEventId, scheduleDayKey: normalized.scheduleDayKey || normalized.matchDate, linkedFrom: "video-analysis-library" };
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
      metadata: Object.fromEntries(Object.entries(matchMetadata).filter(([, value]) => value)),
    });
    if (!matchResult.ok) return matchResult;
    match = matchResult.payload?.[0] || null;
    matchId = match?.id;
  } else if (normalized.matchDate || normalized.scheduleEventId || normalized.eventType) {
    const params = buildTeamParams(scope);
    params.set("id", `eq.${matchId}`);
    const existingMatchResult = await selectRows("video_matches", params);
    const existingMatch = existingMatchResult.ok ? existingMatchResult.payload?.[0] || null : null;
    const metadata = {
      ...normalizeMetadata(existingMatch?.metadata),
      ...Object.fromEntries(Object.entries(matchMetadata).filter(([, value]) => value)),
    };
    const patch = {
      metadata,
      match_date: normalized.matchDate || existingMatch?.match_date || null,
    };
    const patched = await patchRows("video_matches", params, patch);
    if (!patched.ok) return patched;
    match = patched.payload?.[0] || existingMatch;
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
  const [players, tags, notes, labels, descriptors] = await Promise.all([
    selectRows("video_clip_players", childParams("*")),
    selectRows("video_clip_tags", childParams("*")),
    selectRows("video_clip_notes", childParams("*")),
    selectRows("video_clip_labels", childParams("*")),
    selectRows("video_clip_descriptors", childParams("*")),
  ]);
  const byClip = (rows) => {
    const map = new Map();
    for (const row of rowList(rows)) {
      const list = map.get(row.clip_instance_id) || [];
      list.push(row);
      map.set(row.clip_instance_id, list);
    }
    return map;
  };
  const playerMap = byClip(players);
  const tagMap = byClip(tags);
  const noteMap = byClip(notes);
  const labelMap = byClip(labels);
  const descriptorMap = byClip(descriptors);
  return clips.map((clip) => ({
    ...clip,
    players: playerMap.get(clip.id) || [],
    tags: (tagMap.get(clip.id) || []).map((entry) => entry.tag),
    notes: noteMap.get(clip.id) || [],
    labels: labelMap.get(clip.id) || [],
    descriptors: descriptorMap.get(clip.id) || [],
  }));
}

function clipMatchesSearch(clip = {}, search = "") {
  if (!search) return true;
  return [clip.phase, clip.sub_phase, clip.outcome, clip.team_principle_id, clip.mini_game_principle_id]
    .concat(clip.tags || [])
    .concat((clip.players || []).map((player) => player.player_label || player.player_id))
    .concat((clip.notes || []).map((note) => note.note))
    .concat((clip.labels || []).map((label) => label.label_text || label.label_value))
    .concat((clip.descriptors || []).map((descriptor) => descriptor.descriptor_label || descriptor.descriptor_value))
    .some((value) => normalizeText(value, 4000).toLowerCase().includes(search));
}

function clipMatchesFilters(clip = {}, query = {}) {
  const playerId = normalizeText(query.playerId || query.player_id, 160);
  const unit = normalizeText(query.unit, 120).toLowerCase();
  const descriptorValue = normalizeText(query.descriptorValue || query.descriptor_value, 180).toLowerCase();
  if (playerId && !(clip.players || []).some((player) => player.player_id === playerId)) return false;
  if (unit && !(clip.descriptors || []).some((entry) => entry.descriptor_type === "unit" && normalizeText(entry.descriptor_value, 180).toLowerCase() === unit)) return false;
  if (descriptorValue && !(clip.descriptors || []).some((entry) => normalizeText(entry.descriptor_value, 180).toLowerCase() === descriptorValue)) return false;
  return true;
}

async function listClips(query, actor) {
  const scope = actorScope(actor);
  const dateMatchIds = await matchIdsForDate(query, scope);
  if (dateMatchIds?.ok === false) return dateMatchIds;
  if (Array.isArray(dateMatchIds) && /^\d{4}-\d{2}-\d{2}$/.test(normalizeText(query.date || query.matchDate || query.match_date, 20)) && !dateMatchIds.length) {
    return { ok: true, payload: { schema: VIDEO_ANALYSIS_SCHEMA, clips: [] } };
  }
  const result = await selectRows("video_clip_instances", buildClipSearchParams(
    Array.isArray(dateMatchIds) && dateMatchIds.length ? { ...query, matchIds: dateMatchIds } : query,
    scope
  ));
  if (!result.ok) return result;
  const pageSize = rowList(result).length;
  let clips = await attachClipRelations(result.payload, scope);
  const search = normalizeText(query.search || query.q, 120).toLowerCase();
  clips = clips.filter((clip) => clipMatchesSearch(clip, search) && clipMatchesFilters(clip, query));
  return { ok: true, payload: { schema: VIDEO_ANALYSIS_SCHEMA, clips, pageSize } };
}

async function syncClipPlayersToIdp(clip = {}, saved = {}, actor = {}) {
  const playerIds = Array.from(new Set((clip.players || []).map((player) => player.playerId).filter(Boolean)));
  if (!playerIds.length || !saved.id) {
    return { attempted: false, synced: 0, failed: 0 };
  }
  const results = await Promise.all(
    playerIds.map((playerId) =>
      upsertClipBankItem({
        playerId,
        clipInstanceId: saved.id,
        sourceModule: "video-analysis",
      }, actor).catch((error) => ({ ok: false, reason: error?.message || "IDP clip bank sync failed." }))
    )
  );
  return {
    attempted: true,
    synced: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
  };
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
    coding_mode: clip.codingMode,
    coding_template_id: clip.codingTemplateId,
    coding_button_id: clip.codingButtonId,
    pre_roll_ms: clip.preRollMs,
    post_roll_ms: clip.postRollMs,
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
  for (const label of clip.labels) {
    childWrites.push(insertRow("video_clip_labels", {
      organization_id: clip.organizationId,
      team_id: clip.teamId,
      clip_instance_id: saved.id,
      label_type: label.type,
      label_value: label.value,
      label_text: label.label,
      created_by: clip.actorId,
    }));
  }
  for (const descriptor of clip.descriptors) {
    childWrites.push(insertRow("video_clip_descriptors", {
      organization_id: clip.organizationId,
      team_id: clip.teamId,
      clip_instance_id: saved.id,
      descriptor_type: descriptor.type,
      descriptor_value: descriptor.value,
      descriptor_label: descriptor.label,
      created_by: clip.actorId,
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
  const failed = (await Promise.all(childWrites)).find((entry) => !entry.ok && entry.status !== 409);
  if (failed) return failed;
  const idpClipBank = await syncClipPlayersToIdp(clip, saved, actor);
  const [withRelations] = await attachClipRelations([saved], { organizationId: clip.organizationId, teamId: clip.teamId });
  return { ok: true, payload: { schema: VIDEO_ANALYSIS_SCHEMA, clip: withRelations, idpClipBank } };
}

async function trimClip(payload, actor) {
  rejectForbiddenPayload(payload);
  const scope = actorScope(actor);
  const id = normalizeUuid(payload.id || payload.clipId || payload.clip_id);
  const startMs = asMs(payload.startMs ?? payload.start_ms);
  const endMs = asMs(payload.endMs ?? payload.end_ms);
  if (!id) return { ok: false, status: 400, reason: "clip id is required." };
  if (endMs <= startMs) return { ok: false, status: 400, reason: "Clip end_ms must be greater than start_ms." };

  const params = buildTeamParams(scope);
  params.set("id", `eq.${id}`);
  params.set("status", "eq.active");
  const result = await patchRows("video_clip_instances", params, { start_ms: startMs, end_ms: endMs });
  if (!result.ok) return result;
  const saved = result.payload?.[0];
  if (!saved?.id) return { ok: false, status: 404, reason: "Clip could not be found." };
  const [withRelations] = await attachClipRelations([saved], scope);
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

async function listSavedSearches(query, actor) {
  const scope = actorScope(actor);
  const params = buildTeamParams(scope);
  params.set("select", "*");
  params.set("status", "eq.active");
  params.set("order", "created_at.desc");
  params.set("limit", String(asLimit(query.limit, 40)));
  const result = await selectRows("video_saved_clip_searches", params);
  return result.ok ? { ok: true, payload: { schema: VIDEO_ANALYSIS_SCHEMA, savedSearches: result.payload } } : result;
}

async function saveSearch(payload, actor) {
  rejectForbiddenPayload(payload);
  const scope = actorScope(actor);
  const title = normalizeText(payload.title, 180);
  if (!title) return { ok: false, status: 400, reason: "Search title is required." };
  const result = await insertRow("video_saved_clip_searches", {
    organization_id: scope.organizationId,
    team_id: scope.teamId,
    title,
    search_json: payload.search || payload.searchJson || payload.search_json || {},
    is_shared: payload.isShared !== false,
    created_by: scope.actorId,
  });
  return result.ok ? { ok: true, payload: { schema: VIDEO_ANALYSIS_SCHEMA, savedSearch: result.payload?.[0] || null } } : result;
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
    workstation: ["templates", "hotkeys", "timeline-lanes", "descriptors", "matrix-find", "review-sections", "presentation-builder", "drawing-layers"],
  };
}

async function handleVideoAnalysisRequest(req, res, actor) {
  const url = new URL(req.url || "/api/video-analysis", "https://footballscience.local");
  if (req.method === "GET") {
    const action = normalizeText(url.searchParams.get("action") || "clips", 40);
    const query = Object.fromEntries(url.searchParams.entries());
    const result = action === "status"
      ? { ok: true, payload: statusPayload(actor) }
      : action === "matches"
        ? await listMatches(query, actor)
        : action === "saved-searches"
          ? await listSavedSearches(query, actor)
          : action === "presentations" || action === "list-presentations"
            ? await listPresentations(query, actor)
            : action === "presentation" || action === "get-presentation"
              ? await getPresentation(query, actor)
              : action === "presentation-clips" || action === "list-presentation-clips"
                ? await listClips(query, actor)
          : action === "coding-templates"
            ? await listCodingTemplates(query, actor)
            : await listClips(query, actor);
    return sendJson(res, result.ok ? 200 : result.status || 500, result.ok ? result.payload : { ok: false, reason: result.reason });
  }
  const body = await parseJsonBody(req, { maxBytes: MAX_BODY_BYTES });
  const action = normalizeText(body.action || url.searchParams.get("action"), 60);
  const result =
    action === "create-local-video-source"
      ? await createLocalVideoSource(body, actor)
      : action === "update-match-link"
        ? await updateMatchLink(body.match || body, actor)
        : action === "save-clip"
          ? await saveClip(body.clip || body, actor)
          : action === "trim-clip"
            ? await trimClip(body.clip || body, actor)
          : action === "archive-clip"
            ? await archiveClip(body, actor)
            : action === "save-search"
              ? await saveSearch(body.search || body, actor)
              : action === "save-presentation"
                ? await savePresentation(body.presentation || body, actor)
                : action === "archive-presentation"
                  ? await archivePresentation(body, actor)
                  : action === "save-smart-collection"
                    ? await saveSmartCollection(body.smartCollection || body.collection || body, actor)
                    : action === "save-drawing-layer"
                      ? await saveDrawingLayer(body.drawingLayer || body.layer || body, actor)
                      : action === "save-share-targets"
                        ? await saveShareTargets(body, actor)
                        : action === "save-smart-collection-share-targets"
                          ? await saveSmartCollectionShareTargets(body, actor)
                          : action === "save-review-session"
                            ? await saveReviewSession(body.reviewSession || body, actor)
                            : action === "save-coding-template"
                              ? await saveCodingTemplate(body.template || body, actor)
                              : { ok: false, status: 400, reason: "Unsupported Video Analysis action." };
  return sendJson(res, result.ok ? 200 : result.status || 500, result.ok ? result.payload : { ok: false, reason: result.reason });
}

module.exports = {
  VIDEO_ANALYSIS_SCHEMA,
  asLimit,
  buildClipSearchParams,
  containsForbiddenVideoPayload,
  handleVideoAnalysisRequest,
  listCodingTemplates,
  normalizeClipPayload,
  normalizeOutcome,
  rejectForbiddenPayload,
  savePresentation,
  saveCodingTemplate,
  syncClipPlayersToIdp,
};
