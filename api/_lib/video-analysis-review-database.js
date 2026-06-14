const {
  actorScope,
  insertRow,
  normalizeNote,
  normalizeText,
  normalizeUuid,
  rejectForbiddenPayload,
} = require("./video-analysis-database-core.js");

function normalizeReviewPurpose(value) {
  const purpose = normalizeText(value || "team-meeting", 80).toLowerCase();
  return purpose === "player-review" || purpose === "unit-meeting" ? purpose : "team-meeting";
}

function normalizeSectionType(value) {
  const type = normalizeText(value || "team-meeting", 80).toLowerCase();
  return ["team-meeting", "unit-meeting", "player-review", "custom"].includes(type) ? type : "custom";
}

function normalizeReviewSection(section = {}, index = 0) {
  return {
    title: normalizeText(section.title || "Review section", 180),
    type: normalizeSectionType(section.type || section.sectionType),
    note: normalizeNote(section.note || section.meetingNote || section.meeting_note, 3000) || null,
    sortOrder: Math.max(0, Math.floor(Number(section.sortOrder || section.sort_order || index))),
    items: Array.isArray(section.items) ? section.items : [],
  };
}

async function saveReviewItems(section, sectionId, playlistId, scope) {
  for (const [index, item] of section.items.entries()) {
    const clipId = normalizeUuid(item.clipId || item.clip_instance_id || item.clipInstanceId);
    if (!clipId) continue;
    const itemResult = await insertRow("video_playlist_items", {
      organization_id: scope.organizationId,
      team_id: scope.teamId,
      playlist_id: playlistId,
      section_id: sectionId,
      clip_instance_id: clipId,
      sort_order: Math.max(0, Math.floor(Number(item.sortOrder || item.sort_order || index))),
      custom_note: normalizeNote(item.note || item.customNote || item.custom_note, 2000) || null,
    });
    if (!itemResult.ok && itemResult.status !== 409) return itemResult;
  }
  return { ok: true };
}

async function saveReviewSections(sections, sessionId, playlistId, scope) {
  for (const section of sections) {
    const sectionResult = await insertRow("video_playlist_sections", {
      organization_id: scope.organizationId,
      team_id: scope.teamId,
      playlist_id: playlistId,
      review_session_id: sessionId,
      title: section.title,
      section_type: section.type,
      sort_order: section.sortOrder,
      meeting_note: section.note,
      created_by: scope.actorId,
    });
    if (!sectionResult.ok) return sectionResult;
    const itemsResult = await saveReviewItems(section, sectionResult.payload?.[0]?.id, playlistId, scope);
    if (!itemsResult.ok) return itemsResult;
  }
  return { ok: true };
}

async function saveReviewSession(payload, actor) {
  rejectForbiddenPayload(payload);
  const scope = actorScope(actor);
  const title = normalizeText(payload.title || "Football Science Review", 180);
  const purpose = normalizeReviewPurpose(payload.purpose);
  const playlist = await insertRow("video_playlists", {
    organization_id: scope.organizationId,
    team_id: scope.teamId,
    title,
    purpose,
    owner_id: scope.actorId,
    created_by: scope.actorId,
  });
  if (!playlist.ok) return playlist;
  const playlistId = playlist.payload?.[0]?.id;
  const session = await insertRow("video_review_sessions", {
    organization_id: scope.organizationId,
    team_id: scope.teamId,
    playlist_id: playlistId,
    title,
    purpose,
    player_id: normalizeText(payload.playerId || payload.player_id, 160) || null,
    unit: normalizeText(payload.unit, 120) || null,
    notes: normalizeNote(payload.notes, 4000) || null,
    created_by: scope.actorId,
  });
  if (!session.ok) return session;
  const sections = (Array.isArray(payload.sections) ? payload.sections : []).map(normalizeReviewSection);
  const sectionsResult = await saveReviewSections(sections, session.payload?.[0]?.id, playlistId, scope);
  if (!sectionsResult.ok) return sectionsResult;
  return {
    ok: true,
    payload: {
      schema: "footballscience-video-analysis-v2",
      playlist: playlist.payload?.[0],
      reviewSession: session.payload?.[0],
    },
  };
}

module.exports = {
  normalizeReviewSection,
  saveReviewSession,
};
