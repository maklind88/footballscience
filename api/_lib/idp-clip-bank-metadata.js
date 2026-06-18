const {
  buildTeamParams,
  normalizeText,
  normalizeUuid,
  selectRows,
} = require("./idp-database-core.js");

function rowList(result) {
  return result.ok && Array.isArray(result.payload) ? result.payload : [];
}

function idFilter(ids = []) {
  return `in.(${ids.filter(Boolean).join(",")})`;
}

function uniqueValues(values = []) {
  return [...new Set(values.map((value) => normalizeText(value, 180)).filter(Boolean))];
}

function normalizeMetadata(metadata = {}) {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};
}

function normalizeVideoEventType(value = "") {
  const type = normalizeText(value, 40).toLowerCase();
  return type === "match" ? "match" : "training";
}

function inferVideoEventType(value = "", context = {}) {
  const explicit = normalizeText(value, 40).toLowerCase();
  if (explicit === "match" || explicit === "training") return explicit;
  const title = normalizeText(context.title, 180).toLowerCase();
  if (normalizeText(context.opponent, 180) || /\bmatch\b|\svs\.?\s|\s@\s/.test(title)) return "match";
  return "training";
}

function mapRowsById(result) {
  return new Map(rowList(result).filter((row) => row?.id).map((row) => [row.id, row]));
}

function groupRowsBy(rows = [], key = "") {
  const grouped = new Map();
  for (const row of rows) {
    const value = row?.[key];
    if (!value) continue;
    const list = grouped.get(value) || [];
    list.push(row);
    grouped.set(value, list);
  }
  return grouped;
}

function msOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : null;
}

function clipBankSortStamp(item = {}) {
  return normalizeText(item.match_date || item.created_at, 80);
}

function compareClipBankItems(first = {}, second = {}) {
  const firstStamp = clipBankSortStamp(first);
  const secondStamp = clipBankSortStamp(second);
  if (firstStamp !== secondStamp) return secondStamp.localeCompare(firstStamp);
  const firstVideo = normalizeText(first.video_id || first.match_id, 160);
  const secondVideo = normalizeText(second.video_id || second.match_id, 160);
  if (firstVideo === secondVideo) return Number(first.start_ms || 0) - Number(second.start_ms || 0);
  return String(second.created_at || "").localeCompare(String(first.created_at || ""));
}

async function selectRowsByIds(table, scope, ids = [], select = "*") {
  const safeIds = uniqueValues(ids).map(normalizeUuid).filter(Boolean);
  if (!safeIds.length) return { ok: true, payload: [] };
  const params = buildTeamParams(scope);
  params.set("select", select);
  params.set("id", idFilter(safeIds));
  params.set("limit", String(Math.max(1, safeIds.length)));
  const result = await selectRows(table, params);
  return result.ok ? result : { ok: true, payload: [] };
}

async function selectSourcesByVideoIds(scope, videoIds = []) {
  const safeIds = uniqueValues(videoIds).map(normalizeUuid).filter(Boolean);
  if (!safeIds.length) return [];
  const params = buildTeamParams(scope);
  params.set("select", "id,match_id,video_id,local_video_identifier,display_name,duration_ms,created_by,created_at");
  params.set("video_id", idFilter(safeIds));
  params.set("limit", String(Math.max(1, safeIds.length * 4)));
  const result = await selectRows("video_sources", params);
  if (!result.ok) return [];
  return rowList(result).sort((first, second) => String(second.created_at || "").localeCompare(String(first.created_at || "")));
}

async function selectMiniGameLabelsByClipIds(scope, clipIds = []) {
  const safeIds = uniqueValues(clipIds).map(normalizeUuid).filter(Boolean);
  if (!safeIds.length) return new Map();
  const params = buildTeamParams(scope);
  params.set("select", "clip_instance_id,label_type,label_value,label_text");
  params.set("clip_instance_id", idFilter(safeIds));
  params.set("label_type", "eq.mini_game_principle");
  params.set("limit", String(Math.max(1, safeIds.length * 8)));
  const result = await selectRows("video_clip_labels", params);
  const labelsByClip = new Map();
  if (!result.ok) return labelsByClip;
  for (const label of rowList(result)) {
    const clipId = label.clip_instance_id;
    if (!clipId) continue;
    const list = labelsByClip.get(clipId) || [];
    list.push({
      type: "mini_game_principle",
      value: normalizeText(label.label_value, 160),
      label: normalizeText(label.label_text || label.label_value, 180),
    });
    labelsByClip.set(clipId, list);
  }
  return labelsByClip;
}

async function enrichClipBankItems(items = [], scope = {}) {
  const clipIds = uniqueValues(items.map((item) => item.clip_instance_id)).map(normalizeUuid).filter(Boolean);
  if (!clipIds.length) return items.sort(compareClipBankItems);

  const clipParams = buildTeamParams(scope);
  clipParams.set("select", "id,organization_id,team_id,match_id,video_id,start_ms,end_ms,phase,sub_phase,outcome,mini_game_principle_id,created_at");
  clipParams.set("id", idFilter(clipIds));
  clipParams.set("limit", String(Math.max(1, clipIds.length)));
  const clipsResult = await selectRows("video_clip_instances", clipParams);
  if (!clipsResult.ok) return items.sort(compareClipBankItems);

  const clips = rowList(clipsResult);
  const clipMap = new Map(clips.map((clip) => [clip.id, clip]));
  const matchIds = clips.map((clip) => clip.match_id).filter(Boolean);
  const videoIds = clips.map((clip) => clip.video_id).filter(Boolean);
  const [matchesResult, videosResult, sources, labelsByClip] = await Promise.all([
    selectRowsByIds("video_matches", scope, matchIds, "id,title,match_date,opponent,metadata,created_at"),
    selectRowsByIds("video_videos", scope, videoIds, "id,title,match_id,duration_ms,local_video_identifier,created_at"),
    selectSourcesByVideoIds(scope, videoIds),
    selectMiniGameLabelsByClipIds(scope, clipIds),
  ]);
  const matchMap = mapRowsById(matchesResult);
  const videoMap = mapRowsById(videosResult);
  const sourcesByVideo = groupRowsBy(sources, "video_id");

  return items.map((item) => {
    const clip = clipMap.get(item.clip_instance_id) || {};
    const match = matchMap.get(clip.match_id) || {};
    const video = videoMap.get(clip.video_id) || {};
    const source = sourcesByVideo.get(clip.video_id)?.[0] || {};
    const metadata = normalizeMetadata(match.metadata);
    const title = normalizeText(match.title || metadata.title || video.title || source.display_name, 180);
    const eventType = inferVideoEventType(metadata.eventType || metadata.event_type || match.event_type, {
      title,
      opponent: match.opponent || metadata.opponent,
    });
    return {
      ...item,
      organization_id: item.organization_id || clip.organization_id || scope.organizationId,
      team_id: item.team_id || clip.team_id || scope.teamId,
      match_id: clip.match_id || item.match_id || null,
      video_id: clip.video_id || item.video_id || null,
      start_ms: msOrNull(clip.start_ms),
      end_ms: msOrNull(clip.end_ms),
      phase: normalizeText(clip.phase, 80),
      sub_phase: normalizeText(clip.sub_phase, 80),
      outcome: normalizeText(clip.outcome, 40),
      mini_game_principle_id: normalizeText(clip.mini_game_principle_id, 120),
      mini_game_principles: labelsByClip.get(item.clip_instance_id) || [],
      match_title: title || (eventType === "match" ? "Match video" : "Training video"),
      match_date: normalizeText(match.match_date || metadata.matchDate || metadata.match_date || clip.created_at || item.created_at, 40),
      event_type: normalizeVideoEventType(eventType),
      opponent: normalizeText(match.opponent || metadata.opponent, 180),
      video_title: normalizeText(video.title || source.display_name, 180),
      duration_ms: msOrNull(video.duration_ms || source.duration_ms),
      local_video_identifier: normalizeText(video.local_video_identifier || source.local_video_identifier, 240),
    };
  }).sort(compareClipBankItems);
}

module.exports = {
  enrichClipBankItems,
};
