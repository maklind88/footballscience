import {
  idpClipBankStatuses,
  idpDevelopmentCategories,
  idpEvidenceTypes,
  idpFocusStatuses,
  idpNextActionTypes,
} from "../constants/idp-options.mjs";

export function normalizeText(value = "", maxLength = 240) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function normalizeDate(value = "") {
  const text = normalizeText(value, 24);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function normalizeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : fallback;
}

function normalizeDecimal(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(100, Math.max(0, Math.round(number * 10) / 10)) : fallback;
}

function normalizeLabelList(values = []) {
  return Array.isArray(values)
    ? values.map((entry) => ({
      type: normalizeText(entry.type || entry.label_type || "mini_game_principle", 80),
      value: normalizeText(entry.value || entry.label_value, 160),
      label: normalizeText(entry.label || entry.label_text || entry.value || entry.label_value, 180),
    })).filter((entry) => entry.value || entry.label)
    : [];
}

function pickOption(value, options, fallback) {
  const text = normalizeText(value, 80);
  return options.includes(text) ? text : fallback;
}

function normalizeBoardState(value = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    schema: normalizeText(source.schema || "idp-player-board-v1", 80),
    player: {
      x: normalizeDecimal(source.player?.x, 50),
      y: normalizeDecimal(source.player?.y, 70),
    },
    referencePlayers: Array.isArray(source.referencePlayers) ? source.referencePlayers.slice(0, 6).map((item = {}, index) => ({
      id: normalizeText(item.id || `ref-${index + 1}`, 80),
      label: normalizeText(item.label || "REF", 24),
      x: normalizeDecimal(item.x, 50),
      y: normalizeDecimal(item.y, 45),
    })) : [],
    cones: Array.isArray(source.cones) ? source.cones.slice(0, 12).map((item = {}, index) => ({
      id: normalizeText(item.id || `cone-${index + 1}`, 80),
      x: normalizeDecimal(item.x, 50),
      y: normalizeDecimal(item.y, 50),
    })) : [],
    zones: Array.isArray(source.zones) ? source.zones.slice(0, 6).map((item = {}, index) => ({
      id: normalizeText(item.id || `zone-${index + 1}`, 80),
      label: normalizeText(item.label || "Development zone", 80),
      x: normalizeDecimal(item.x, 36),
      y: normalizeDecimal(item.y, 34),
      width: normalizeDecimal(item.width, 28),
      height: normalizeDecimal(item.height, 22),
    })) : [],
    arrows: Array.isArray(source.arrows) ? source.arrows.slice(0, 8).map((item = {}, index) => ({
      id: normalizeText(item.id || `arrow-${index + 1}`, 80),
      label: normalizeText(item.label || "Movement", 80),
      from: { x: normalizeDecimal(item.from?.x, 45), y: normalizeDecimal(item.from?.y, 70) },
      to: { x: normalizeDecimal(item.to?.x, 60), y: normalizeDecimal(item.to?.y, 44) },
    })) : [],
    notes: Array.isArray(source.notes) ? source.notes.slice(0, 6).map((item = {}, index) => ({
      id: normalizeText(item.id || `note-${index + 1}`, 80),
      text: normalizeText(item.text, 220),
      x: normalizeDecimal(item.x, 12),
      y: normalizeDecimal(item.y, 14),
    })).filter((item) => item.text) : [],
    frames: Array.isArray(source.frames) ? source.frames.slice(0, 8).map((item = {}, index) => ({
      id: normalizeText(item.id || `frame-${index + 1}`, 80),
      label: normalizeText(item.label || `Frame ${index + 1}`, 80),
    })) : [],
    linkedClipIds: Array.isArray(source.linkedClipIds) ? source.linkedClipIds.slice(0, 12).map((item) => normalizeText(item, 160)).filter(Boolean) : [],
  };
}

export function normalizeIdpProfile(value = {}) {
  return {
    id: normalizeText(value.id, 120),
    playerId: normalizeText(value.playerId || value.player_id, 160),
    playerName: normalizeText(value.playerName || value.player_name || value.name, 180),
    squadNumber: normalizeText(value.squadNumber || value.squad_number || value.number || value.shirtNumber || value.shirt_number, 20),
    position: normalizeText(value.position || value.positionLabel || value.position_label, 80),
    role: normalizeText(value.role || value.roleLabel || value.role_label || value.primaryRole, 120),
    ownerId: normalizeText(value.ownerId || value.owner_id || value.primaryOwnerId || value.primary_owner_id, 160),
    status: normalizeText(value.status || "active", 40),
    lastReviewOn: normalizeDate(value.lastReviewOn || value.last_review_on),
    nextReviewOn: normalizeDate(value.nextReviewOn || value.next_review_on || value.reviewDate),
    strengths: Array.isArray(value.strengths) ? value.strengths.map((item) => normalizeText(item, 120)).filter(Boolean) : [],
    leadershipProfile: normalizeText(value.leadershipProfile || value.leadership_profile, 600),
  };
}

export function normalizeIdpFocus(value = {}) {
  return {
    id: normalizeText(value.id, 120),
    playerId: normalizeText(value.playerId || value.player_id, 160),
    title: normalizeText(value.title || value.primaryFocus, 180),
    description: normalizeText(value.description || value.focusAreas, 800),
    category: pickOption(value.category, idpDevelopmentCategories, "Tactical"),
    focusLevel: normalizeText(value.focusLevel || value.focus_level || "main", 40),
    linkedPhase: normalizeText(value.linkedPhase || value.linked_phase, 80),
    linkedSubPhase: normalizeText(value.linkedSubPhase || value.linked_sub_phase, 80),
    teamPrincipleId: normalizeText(value.teamPrincipleId || value.team_principle_id, 120),
    miniGamePrincipleId: normalizeText(value.miniGamePrincipleId || value.mini_game_principle_id, 120),
    ownerId: normalizeText(value.ownerId || value.owner_id, 160),
    status: pickOption(value.status, idpFocusStatuses, "Active"),
    evidenceStatus: normalizeText(value.evidenceStatus || value.evidence_status || "Needs Evidence", 80),
    reviewDate: normalizeDate(value.reviewDate || value.review_date),
  };
}

export function normalizeIdpClipBankItem(value = {}) {
  return {
    id: normalizeText(value.id, 120),
    organizationId: normalizeText(value.organizationId || value.organization_id, 160),
    teamId: normalizeText(value.teamId || value.team_id, 160),
    playerId: normalizeText(value.playerId || value.player_id, 160),
    clipInstanceId: normalizeText(value.clipInstanceId || value.clip_instance_id || value.clipId, 160),
    linkedFocusId: normalizeText(value.linkedFocusId || value.linked_focus_id, 160),
    status: pickOption(value.status, idpClipBankStatuses, "New"),
    sourceModule: normalizeText(value.sourceModule || value.source_module || "video-analysis", 80),
    matchId: normalizeText(value.matchId || value.match_id, 160),
    videoId: normalizeText(value.videoId || value.video_id, 160),
    matchTitle: normalizeText(value.matchTitle || value.match_title || value.title, 180),
    matchDate: normalizeDate(value.matchDate || value.match_date || value.date) || normalizeText(value.matchDate || value.match_date, 40),
    eventType: normalizeText(value.eventType || value.event_type || "training", 40),
    opponent: normalizeText(value.opponent, 180),
    videoTitle: normalizeText(value.videoTitle || value.video_title, 180),
    localVideoIdentifier: normalizeText(value.localVideoIdentifier || value.local_video_identifier, 240),
    startMs: normalizeNumber(value.startMs || value.start_ms, 0),
    endMs: normalizeNumber(value.endMs || value.end_ms, 0),
    phase: normalizeText(value.phase, 80),
    subPhase: normalizeText(value.subPhase || value.sub_phase, 80),
    outcome: normalizeText(value.outcome, 40),
    miniGamePrincipleId: normalizeText(value.miniGamePrincipleId || value.mini_game_principle_id, 120),
    miniGamePrinciples: normalizeLabelList(value.miniGamePrinciples || value.mini_game_principles || value.labels),
    durationMs: normalizeNumber(value.durationMs || value.duration_ms, 0),
    createdAt: normalizeText(value.createdAt || value.created_at, 80),
    reviewedAt: normalizeText(value.reviewedAt || value.reviewed_at, 80),
  };
}

export function normalizeIdpEvidence(value = {}) {
  return {
    id: normalizeText(value.id, 120),
    playerId: normalizeText(value.playerId || value.player_id, 160),
    focusId: normalizeText(value.focusId || value.focus_id, 160),
    evidenceType: pickOption(value.evidenceType || value.evidence_type, idpEvidenceTypes, "Coach Note"),
    sourceModule: normalizeText(value.sourceModule || value.source_module || "idp", 80),
    sourceId: normalizeText(value.sourceId || value.source_id, 160),
    note: normalizeText(value.note, 800),
    createdAt: normalizeText(value.createdAt || value.created_at, 80),
  };
}

export function normalizeIdpReview(value = {}) {
  return {
    id: normalizeText(value.id, 120),
    playerId: normalizeText(value.playerId || value.player_id, 160),
    focusId: normalizeText(value.focusId || value.focus_id, 160),
    progressSummary: normalizeText(value.progressSummary || value.progress_summary, 800),
    evidenceSummary: normalizeText(value.evidenceSummary || value.evidence_summary, 800),
    coachNote: normalizeText(value.coachNote || value.coach_note, 800),
    nextAction: normalizeText(value.nextAction || value.next_action, 400),
    createdAt: normalizeText(value.createdAt || value.created_at, 80),
  };
}

export function normalizeIdpNextAction(value = {}) {
  return {
    id: normalizeText(value.id, 120),
    playerId: normalizeText(value.playerId || value.player_id, 160),
    focusId: normalizeText(value.focusId || value.focus_id, 160),
    actionType: pickOption(value.actionType || value.action_type, idpNextActionTypes, "Add Evidence"),
    title: normalizeText(value.title || value.nextAction, 180),
    ownerId: normalizeText(value.ownerId || value.owner_id, 160),
    dueOn: normalizeDate(value.dueOn || value.due_on),
    status: normalizeText(value.status || "open", 40),
  };
}

export function normalizeIdpMilestone(value = {}) {
  return {
    id: normalizeText(value.id, 120),
    playerId: normalizeText(value.playerId || value.player_id, 160),
    focusId: normalizeText(value.focusId || value.focus_id, 160),
    milestoneType: normalizeText(value.milestoneType || value.milestone_type || value.title, 160),
    title: normalizeText(value.title || value.milestoneType || value.milestone_type, 180),
    occurredOn: normalizeDate(value.occurredOn || value.occurred_on) || normalizeDate(value.createdAt || value.created_at),
    sourceModule: normalizeText(value.sourceModule || value.source_module || "idp", 80),
    sourceId: normalizeText(value.sourceId || value.source_id, 160),
    createdBy: normalizeText(value.createdBy || value.created_by, 160),
    createdAt: normalizeText(value.createdAt || value.created_at, 80),
  };
}

export function normalizeIdpDevelopmentIntervention(value = {}) {
  return {
    id: normalizeText(value.id, 120),
    playerId: normalizeText(value.playerId || value.player_id, 160),
    focusId: normalizeText(value.focusId || value.focus_id, 160),
    title: normalizeText(value.title || "Individual exercise", 180),
    objective: normalizeText(value.objective, 800),
    pitchMode: normalizeText(value.pitchMode || value.pitch_mode || "half", 40),
    boardState: normalizeBoardState(value.boardState || value.board_state),
    status: normalizeText(value.status || "active", 40),
    rowVersion: Number(value.rowVersion || value.row_version || 1) || 1,
    createdBy: normalizeText(value.createdBy || value.created_by, 160),
    updatedBy: normalizeText(value.updatedBy || value.updated_by, 160),
    createdAt: normalizeText(value.createdAt || value.created_at, 80),
    updatedAt: normalizeText(value.updatedAt || value.updated_at, 80),
  };
}
