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

function pickOption(value, options, fallback) {
  const text = normalizeText(value, 80);
  return options.includes(text) ? text : fallback;
}

export function normalizeIdpProfile(value = {}) {
  return {
    id: normalizeText(value.id, 120),
    playerId: normalizeText(value.playerId || value.player_id, 160),
    playerName: normalizeText(value.playerName || value.player_name || value.name, 180),
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
    playerId: normalizeText(value.playerId || value.player_id, 160),
    clipInstanceId: normalizeText(value.clipInstanceId || value.clip_instance_id || value.clipId, 160),
    linkedFocusId: normalizeText(value.linkedFocusId || value.linked_focus_id, 160),
    status: pickOption(value.status, idpClipBankStatuses, "New"),
    sourceModule: normalizeText(value.sourceModule || value.source_module || "video-analysis", 80),
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
  };
}
