const { parseJsonBody, sendJson } = require("./supabase-admin.js");
const {
  MAX_BODY_BYTES,
  asLimit,
  actorScope,
  buildTeamParams,
  insertRow,
  normalizeNote,
  normalizeText,
  normalizeUuid,
  patchRows,
  selectRows,
} = require("./idp-database-core.js");
const { enrichClipBankItems } = require("./idp-clip-bank-metadata.js");
const { clipsShareIdpMoment } = require("./idp-clip-bank-moments.js");

const IDP_SCHEMA = "footballscience-idp-v1";
const CATEGORIES = new Set(["Technical", "Tactical", "Physical", "Psychological", "Leadership"]);
const FOCUS_STATUSES = new Set(["Draft", "Active", "Needs Evidence", "Ready For Review", "Reviewed", "Completed", "Archived"]);
const CLIP_STATUSES = new Set(["New", "Reviewed", "Linked To Focus", "Marked As Evidence", "Archived", "Hidden"]);
const INTERVENTION_STATUSES = new Set(["draft", "active", "review", "completed", "archived"]);
const PITCH_MODES = new Set(["full", "half", "final-third", "box"]);
const GOAL_ROLES = new Set(["primary", "supporting", "leadership"]);
const GOAL_METRIC_TYPES = new Set(["observation", "count", "percentage", "rating", "time", "distance", "custom"]);
const GOAL_CADENCES = new Set(["daily", "weekly", "biweekly", "monthly", "review"]);
const GOAL_STATUSES = new Set(["draft", "active", "at_risk", "achieved", "paused", "archived"]);
const EVIDENCE_TYPES = new Set([
  "Video Clip",
  "Coach Note",
  "Training Observation",
  "Match Observation",
  "Performance Note",
  "Medical Note",
  "Leadership Note",
  "Player Reflection",
  "Review Meeting",
]);
const SYNC_TABLES = Object.freeze([
  { table: "idp_profiles", column: "updated_at" },
  { table: "idp_development_areas", column: "updated_at" },
  { table: "idp_focuses", column: "updated_at" },
  { table: "idp_clip_bank_items", column: "updated_at" },
  { table: "idp_evidence", column: "updated_at" },
  { table: "idp_reviews", column: "updated_at" },
  { table: "idp_next_actions", column: "updated_at" },
  { table: "idp_milestones", column: "created_at" },
  { table: "idp_staff_ownership", column: "updated_at" },
  { table: "idp_development_interventions", column: "updated_at" },
  { table: "idp_development_goals", column: "updated_at" },
  { table: "idp_goal_checkins", column: "updated_at" },
]);
const OPTIONAL_MIGRATION_TABLES = new Set(["idp_development_interventions", "idp_development_goals", "idp_goal_checkins"]);

function isMissingOptionalTable(table, result) {
  if (!OPTIONAL_MIGRATION_TABLES.has(table) || result?.ok) return false;
  const haystack = `${result?.reason || ""} ${JSON.stringify(result?.payload || {})}`.toLowerCase();
  const tableName = String(table || "").toLowerCase();
  const looksLikeMissingRelation = haystack.includes("schema cache")
    || haystack.includes("could not find the table")
    || haystack.includes("does not exist")
    || haystack.includes("42p01")
    || haystack.includes("pgrst205");
  return haystack.includes(tableName) && looksLikeMissingRelation;
}

function rowList(result) {
  return result.ok && Array.isArray(result.payload) ? result.payload : [];
}

function normalizeCategory(value) {
  const category = normalizeText(value, 40);
  return CATEGORIES.has(category) ? category : "Tactical";
}

function normalizeFocusStatus(value, fallback = "Active") {
  const status = normalizeText(value, 60);
  return FOCUS_STATUSES.has(status) ? status : fallback;
}

function normalizeClipStatus(value, fallback = "Reviewed") {
  const status = normalizeText(value, 80);
  return CLIP_STATUSES.has(status) ? status : fallback;
}

function normalizeFocusLevel(value) {
  const level = normalizeText(value, 40).toLowerCase();
  return ["main", "secondary", "personal"].includes(level) ? level : "main";
}

function normalizeEvidenceType(value, fallback = "Coach Note") {
  const type = normalizeText(value, 80);
  return EVIDENCE_TYPES.has(type) ? type : fallback;
}

function normalizeInterventionStatus(value, fallback = "active") {
  const status = normalizeText(value, 40).toLowerCase();
  return INTERVENTION_STATUSES.has(status) ? status : fallback;
}

function normalizePitchMode(value, fallback = "half") {
  const mode = normalizeText(value, 40).toLowerCase();
  return PITCH_MODES.has(mode) ? mode : fallback;
}

function normalizeGoalRole(value, fallback = "supporting") {
  const role = normalizeText(value, 40).toLowerCase();
  return GOAL_ROLES.has(role) ? role : fallback;
}

function normalizeGoalMetricType(value, fallback = "observation") {
  const metricType = normalizeText(value, 40).toLowerCase();
  return GOAL_METRIC_TYPES.has(metricType) ? metricType : fallback;
}

function normalizeGoalCadence(value, fallback = "weekly") {
  const cadence = normalizeText(value, 40).toLowerCase();
  return GOAL_CADENCES.has(cadence) ? cadence : fallback;
}

function normalizeGoalStatus(value, fallback = "active") {
  const status = normalizeText(value, 40).toLowerCase();
  return GOAL_STATUSES.has(status) ? status : fallback;
}

function normalizeRowVersion(value) {
  const version = Number(value);
  return Number.isInteger(version) && version > 0 ? version : 0;
}

function normalizeOptionalNumeric(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : null;
}

function normalizeConfidence(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.min(5, Math.max(1, Math.round(number)));
}

function normalizeTextList(value, maxItems = 6, maxLength = 160) {
  const source = Array.isArray(value) ? value : String(value || "").split(/[\n,]+/);
  return source.map((item) => normalizeText(item, maxLength)).filter(Boolean).slice(0, maxItems);
}

function clampPercent(value, fallback = 50) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(100, Math.max(0, Math.round(number * 10) / 10));
}

function normalizeBoardLabel(value, maxLength = 120) {
  return normalizeText(value, maxLength);
}

function normalizeBoardPoints(value = {}, fallback = { x: 50, y: 50 }) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    x: clampPercent(source.x, fallback.x),
    y: clampPercent(source.y, fallback.y),
  };
}

function normalizeBoardArray(value, limit, mapper) {
  return Array.isArray(value)
    ? value.slice(0, limit).map(mapper).filter(Boolean)
    : [];
}

function normalizeBoardLineWidth(value, fallback = 2.5) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(6, Math.max(.75, Math.round(number * 4) / 4)) : fallback;
}

function normalizeBoardColor(value, fallback = "#38bdf8") {
  const color = normalizeText(value, 20);
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
}

function normalizeBoardLineStyle(value, fallback = "dashed") {
  const style = normalizeBoardLabel(value, 20).toLowerCase();
  return ["solid", "dashed", "dotted"].includes(style) ? style : fallback;
}

function normalizeBoardArrowType(value, fallback = "run") {
  const type = normalizeBoardLabel(value, 20).toLowerCase();
  return ["arrow", "pass", "run", "line", "curve"].includes(type) ? type : fallback;
}

function normalizeBoardState(value = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const player = normalizeBoardPoints(source.player, { x: 50, y: 70 });
  return {
    schema: "idp-player-board-v1",
    player,
    referencePlayers: normalizeBoardArray(source.referencePlayers, 6, (item = {}, index) => ({
      id: normalizeBoardLabel(item.id || `ref-${index + 1}`, 80),
      label: normalizeBoardLabel(item.label || "REF", 24) || "REF",
      x: clampPercent(item.x, 50),
      y: clampPercent(item.y, 45),
    })),
    cones: normalizeBoardArray(source.cones, 12, (item = {}, index) => ({
      id: normalizeBoardLabel(item.id || `cone-${index + 1}`, 80),
      x: clampPercent(item.x, 50),
      y: clampPercent(item.y, 50),
    })),
    zones: normalizeBoardArray(source.zones, 6, (item = {}, index) => ({
      id: normalizeBoardLabel(item.id || `zone-${index + 1}`, 80),
      label: normalizeBoardLabel(item.label || "Development zone", 80),
      x: clampPercent(item.x, 36),
      y: clampPercent(item.y, 34),
      width: Math.min(80, Math.max(8, clampPercent(item.width, 28))),
      height: Math.min(80, Math.max(8, clampPercent(item.height, 22))),
    })),
    arrows: normalizeBoardArray(source.arrows, 8, (item = {}, index) => {
      const type = normalizeBoardArrowType(item.type, "run");
      return {
        id: normalizeBoardLabel(item.id || `arrow-${index + 1}`, 80),
        type,
        label: normalizeBoardLabel(item.label || "Movement", 80),
        color: normalizeBoardColor(item.color, type === "pass" ? "#fbbf24" : "#38bdf8"),
        lineStyle: normalizeBoardLineStyle(item.lineStyle || item.line_style, type === "pass" ? "dotted" : type === "run" ? "dashed" : "solid"),
        lineWidth: normalizeBoardLineWidth(item.lineWidth || item.line_width, 2.5),
        from: normalizeBoardPoints(item.from, { x: 45, y: 70 }),
        to: normalizeBoardPoints(item.to, { x: 60, y: 44 }),
      };
    }),
    notes: normalizeBoardArray(source.notes, 6, (item = {}, index) => ({
      id: normalizeBoardLabel(item.id || `note-${index + 1}`, 80),
      text: normalizeNote(item.text, 220),
      x: clampPercent(item.x, 12),
      y: clampPercent(item.y, 14),
    })).filter((item) => item.text),
    frames: normalizeBoardArray(source.frames, 8, (item = {}, index) => ({
      id: normalizeBoardLabel(item.id || `frame-${index + 1}`, 80),
      label: normalizeBoardLabel(item.label || `Frame ${index + 1}`, 80),
    })),
    linkedClipIds: normalizeBoardArray(source.linkedClipIds, 12, (item) => normalizeText(item, 160)).filter(Boolean),
  };
}

function boardStateSummary(boardState = {}) {
  return {
    zones: Array.isArray(boardState.zones) ? boardState.zones.length : 0,
    arrows: Array.isArray(boardState.arrows) ? boardState.arrows.length : 0,
    notes: Array.isArray(boardState.notes) ? boardState.notes.length : 0,
    frames: Array.isArray(boardState.frames) ? boardState.frames.length : 0,
    linkedClips: Array.isArray(boardState.linkedClipIds) ? boardState.linkedClipIds.length : 0,
  };
}

function interventionAuditSummary(row = {}) {
  return {
    title: normalizeText(row.title, 180),
    status: normalizeText(row.status, 40),
    pitch_mode: normalizeText(row.pitch_mode, 40),
    focus_id: normalizeText(row.focus_id, 80),
    goal_id: normalizeText(row.goal_id, 80),
    board: boardStateSummary(row.board_state || {}),
  };
}

function goalAuditSummary(row = {}) {
  return {
    title: normalizeText(row.title, 180),
    status: normalizeText(row.status, 40),
    goal_role: normalizeText(row.goal_role, 40),
    category: normalizeText(row.category, 40),
    metric_label: normalizeText(row.metric_label, 160),
    current_value: row.current_value ?? null,
    target_value: row.target_value ?? null,
    due_on: normalizeText(row.due_on, 40),
  };
}

function clipBankAuditSummary(row = {}) {
  return {
    status: normalizeText(row.status, 80),
    player_id: normalizeText(row.player_id, 160),
    clip_instance_id: normalizeText(row.clip_instance_id, 80),
    linked_focus_id: normalizeText(row.linked_focus_id, 80),
    source_module: normalizeText(row.source_module, 80),
  };
}

function focusAuditSummary(row = {}) {
  return {
    title: normalizeText(row.title, 180),
    status: normalizeText(row.status, 40),
    evidence_status: normalizeText(row.evidence_status, 80),
    category: normalizeText(row.category, 40),
    owner_id: normalizeText(row.owner_id, 160),
    review_date: normalizeText(row.review_date, 40),
  };
}

async function insertAuditEvent(scope, event = {}) {
  return insertRow("idp_audit_events", {
    organization_id: scope.organizationId,
    team_id: scope.teamId,
    player_id: normalizeText(event.playerId || event.player_id, 160) || null,
    action: normalizeText(event.action, 120),
    entity_type: normalizeText(event.entityType || event.entity_type, 80),
    entity_id: normalizeUuid(event.entityId || event.entity_id) || null,
    actor_id: scope.actorId,
    changed_fields: Array.isArray(event.changedFields) ? event.changedFields.map((item) => normalizeText(item, 80)).filter(Boolean) : [],
    before_summary: event.beforeSummary || null,
    after_summary: event.afterSummary || null,
    metadata: event.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata) ? event.metadata : {},
  });
}

function dateOrNull(value) {
  const text = normalizeText(value, 24);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function idFilter(ids = []) {
  return `in.(${ids.filter(Boolean).join(",")})`;
}

function dashboardStatus(profile = {}, focus = null, clipCount = 0) {
  if (!focus) return "No Active Focus";
  if (clipCount > 0) return "New Clips To Review";
  if (focus.status === "Needs Evidence" || focus.evidence_status === "Needs Evidence") return "Needs Evidence";
  if (focus.review_date && new Date(`${focus.review_date}T00:00:00Z`) < new Date()) return "Review Due";
  if (focus.status === "Completed") return "Completed";
  return profile.status === "watch" ? "Needs Evidence" : "On Track";
}

function buildNextAction(profile = {}, focus = null, explicitAction = null, clipCount = 0) {
  if (explicitAction?.title) return explicitAction.title;
  if (!focus) return "Create current focus";
  if (clipCount > 0) return "Review clip bank";
  if (focus.evidence_status === "Needs Evidence") return "Add evidence";
  if (focus.status === "Ready For Review") return "Complete review";
  if (focus.review_date) return "Review focus";
  return profile.next_review_on ? "Prepare next review" : "Set review date";
}

async function listByPlayer(table, scope, playerId, options = {}) {
  const params = buildTeamParams(scope);
  params.set("select", "*");
  params.set("player_id", `eq.${playerId}`);
  if (options.notDeleted !== false) params.set("deleted_at", "is.null");
  if (options.status) params.set("status", options.status);
  params.set("order", options.order || "created_at.desc");
  params.set("limit", String(asLimit(options.limit, 100)));
  const result = await selectRows(table, params);
  if (isMissingOptionalTable(table, result)) return { ok: true, payload: [] };
  return result;
}

async function latestTimestampForTable(scope, playerId, tableConfig) {
  const params = buildTeamParams(scope);
  params.set("select", tableConfig.column);
  if (playerId) params.set("player_id", `eq.${playerId}`);
  params.set("order", `${tableConfig.column}.desc`);
  params.set("limit", "1");
  const result = await selectRows(tableConfig.table, params);
  if (isMissingOptionalTable(tableConfig.table, result)) return { ok: true, payload: "" };
  if (!result.ok) return result;
  return { ok: true, payload: normalizeText(result.payload?.[0]?.[tableConfig.column], 80) };
}

async function buildSyncMeta(scope, playerId = "") {
  const safePlayerId = normalizeText(playerId, 160);
  const results = await Promise.all(SYNC_TABLES.map((tableConfig) => latestTimestampForTable(scope, safePlayerId, tableConfig)));
  const failed = results.find((result) => !result.ok);
  if (failed) return failed;
  const updatedAt = results
    .map((result) => normalizeText(result.payload, 80))
    .filter(Boolean)
    .sort()
    .pop() || "";
  return {
    ok: true,
    payload: {
      scope: {
        organizationId: scope.organizationId,
        teamId: scope.teamId,
      },
      playerId: safePlayerId,
      updatedAt,
      revision: updatedAt,
    },
  };
}

async function listDashboard(query, actor) {
  const scope = actorScope(actor);
  const sync = await buildSyncMeta(scope);
  if (!sync.ok) return sync;
  const profileParams = buildTeamParams(scope);
  profileParams.set("select", "*");
  profileParams.set("deleted_at", "is.null");
  profileParams.set("order", "updated_at.desc");
  profileParams.set("limit", String(asLimit(query.limit, 80)));
  const profiles = await selectRows("idp_profiles", profileParams);
  if (!profiles.ok) return profiles;
  const playerIds = profiles.payload.map((profile) => profile.player_id).filter(Boolean);
  if (!playerIds.length) return { ok: true, payload: { schema: IDP_SCHEMA, players: [], sync: sync.payload } };

  const scopedChildParams = (table, order = "updated_at.desc") => {
    const params = buildTeamParams(scope);
    params.set("select", "*");
    params.set("player_id", idFilter(playerIds));
    params.set("deleted_at", "is.null");
    params.set("order", order);
    return [table, params];
  };
  const [focuses, clips, actions, evidence] = await Promise.all([
    selectRows(...scopedChildParams("idp_focuses")),
    selectRows(...scopedChildParams("idp_clip_bank_items", "created_at.desc")),
    selectRows(...scopedChildParams("idp_next_actions", "created_at.desc")),
    selectRows(...scopedChildParams("idp_evidence", "created_at.desc")),
  ]);
  const activeFocusByPlayer = new Map();
  for (const focus of rowList(focuses)) {
    if (!["Active", "Needs Evidence", "Ready For Review", "Reviewed"].includes(focus.status)) continue;
    if (!activeFocusByPlayer.has(focus.player_id)) activeFocusByPlayer.set(focus.player_id, focus);
  }
  const countByPlayer = (rows, predicate = () => true) => rows.reduce((map, row) => {
    if (predicate(row)) map.set(row.player_id, (map.get(row.player_id) || 0) + 1);
    return map;
  }, new Map());
  const clipCounts = countByPlayer(rowList(clips), (clip) => clip.status === "New");
  const evidenceCounts = countByPlayer(rowList(evidence));
  const actionByPlayer = new Map(rowList(actions).filter((action) => action.status === "open").map((action) => [action.player_id, action]));
  const players = profiles.payload.map((profile) => {
    const focus = activeFocusByPlayer.get(profile.player_id) || null;
    const newClipCount = clipCounts.get(profile.player_id) || 0;
    return {
      profile,
      focus,
      evidenceCount: evidenceCounts.get(profile.player_id) || 0,
      newClipCount,
      nextAction: buildNextAction(profile, focus, actionByPlayer.get(profile.player_id), newClipCount),
      overallStatus: dashboardStatus(profile, focus, newClipCount),
    };
  });
  return { ok: true, payload: { schema: IDP_SCHEMA, players, sync: sync.payload } };
}

async function getPlayerDevelopment(query, actor) {
  const scope = actorScope(actor);
  const playerId = normalizeText(query.playerId || query.player_id, 160);
  if (!playerId) return { ok: false, status: 400, reason: "playerId is required." };
  const sync = await buildSyncMeta(scope, playerId);
  if (!sync.ok) return sync;
  const [profiles, focuses, clipBank, evidence, reviews, actions, milestones, ownership, interventions, goals, goalCheckins] = await Promise.all([
    listByPlayer("idp_profiles", scope, playerId, { limit: 1, order: "updated_at.desc" }),
    listByPlayer("idp_focuses", scope, playerId, { limit: 50, order: "updated_at.desc" }),
    listByPlayer("idp_clip_bank_items", scope, playerId, { limit: 120, order: "created_at.desc" }),
    listByPlayer("idp_evidence", scope, playerId, { limit: 120, order: "created_at.desc" }),
    listByPlayer("idp_reviews", scope, playerId, { limit: 80, order: "created_at.desc" }),
    listByPlayer("idp_next_actions", scope, playerId, { limit: 40, order: "created_at.desc" }),
    listByPlayer("idp_milestones", scope, playerId, { notDeleted: false, limit: 80, order: "occurred_on.desc,created_at.desc" }),
    listByPlayer("idp_staff_ownership", scope, playerId, { limit: 60, order: "created_at.desc" }),
    listByPlayer("idp_development_interventions", scope, playerId, { limit: 60, order: "updated_at.desc" }),
    listByPlayer("idp_development_goals", scope, playerId, { limit: 80, order: "updated_at.desc" }),
    listByPlayer("idp_goal_checkins", scope, playerId, { limit: 120, order: "checkin_on.desc,created_at.desc" }),
  ]);
  const failed = [profiles, focuses, clipBank, evidence, reviews, actions, milestones, ownership, interventions, goals, goalCheckins].find((result) => !result.ok);
  if (failed) return failed;
  const enrichedClipBank = await enrichClipBankItems(clipBank.payload, scope);
  return {
    ok: true,
    payload: {
      schema: IDP_SCHEMA,
      profile: profiles.payload[0] || null,
      focuses: focuses.payload,
      clipBank: enrichedClipBank,
      evidence: evidence.payload,
      reviews: reviews.payload,
      nextActions: actions.payload,
      milestones: milestones.payload,
      ownership: ownership.payload,
      interventions: interventions.payload,
      goals: goals.payload,
      goalCheckins: goalCheckins.payload,
      sync: sync.payload,
    },
  };
}

async function getSyncStatus(query, actor) {
  const scope = actorScope(actor);
  const sync = await buildSyncMeta(scope, query.playerId || query.player_id || "");
  return sync.ok ? { ok: true, payload: { schema: IDP_SCHEMA, sync: sync.payload } } : sync;
}

async function ensureProfile(scope, playerId, payload = {}) {
  const existing = await listByPlayer("idp_profiles", scope, playerId, { limit: 1 });
  if (!existing.ok) return existing;
  if (existing.payload[0]) return { ok: true, payload: existing.payload[0] };
  const result = await insertRow("idp_profiles", {
    organization_id: scope.organizationId,
    club_id: scope.clubId,
    team_id: scope.teamId,
    player_id: playerId,
    position_label: normalizeText(payload.positionLabel || payload.position_label, 80) || null,
    role_label: normalizeText(payload.roleLabel || payload.role_label, 120) || null,
    primary_owner_id: normalizeText(payload.ownerId || payload.owner_id || scope.actorId, 160) || null,
    created_by: scope.actorId,
    updated_by: scope.actorId,
  });
  return result.ok ? { ok: true, payload: result.payload?.[0] || null } : result;
}

async function selectVideoClipMoment(scope, clipId) {
  const safeClipId = normalizeUuid(clipId);
  if (!safeClipId) return null;
  const params = buildTeamParams(scope);
  params.set("select", "id,match_id,video_id,start_ms,end_ms,metadata,created_at");
  params.set("id", `eq.${safeClipId}`);
  params.set("limit", "1");
  const result = await selectRows("video_clip_instances", params);
  return result.ok ? result.payload?.[0] || null : null;
}

async function findExistingClipBankItemForMoment(scope, playerId, incomingClip) {
  if (!incomingClip?.id) return null;
  const itemParams = buildTeamParams(scope);
  itemParams.set("select", "*");
  itemParams.set("player_id", `eq.${playerId}`);
  itemParams.set("source_module", "eq.video-analysis");
  itemParams.set("deleted_at", "is.null");
  itemParams.set("order", "created_at.desc");
  itemParams.set("limit", "500");
  const items = await selectRows("idp_clip_bank_items", itemParams);
  if (!items.ok) return null;

  const candidateItems = rowList(items).filter((item) => item.clip_instance_id && item.clip_instance_id !== incomingClip.id);
  const clipIds = candidateItems.map((item) => normalizeUuid(item.clip_instance_id)).filter(Boolean);
  if (!clipIds.length) return null;

  const clipParams = buildTeamParams(scope);
  clipParams.set("select", "id,match_id,video_id,start_ms,end_ms,metadata,created_at");
  clipParams.set("id", idFilter(clipIds));
  clipParams.set("limit", String(Math.max(1, clipIds.length)));
  const clips = await selectRows("video_clip_instances", clipParams);
  if (!clips.ok) return null;

  const clipsById = new Map(rowList(clips).map((clip) => [clip.id, clip]));
  return candidateItems.find((item) => clipsShareIdpMoment(incomingClip, clipsById.get(item.clip_instance_id))) || null;
}

async function requireOwnedFocus(scope, playerId, focusId) {
  const safeFocusId = normalizeUuid(focusId);
  if (!safeFocusId) return { ok: false, status: 400, reason: "focusId is invalid." };
  const params = buildTeamParams(scope);
  params.set("select", "*");
  params.set("id", `eq.${safeFocusId}`);
  params.set("player_id", `eq.${playerId}`);
  params.set("deleted_at", "is.null");
  params.set("limit", "1");
  const result = await selectRows("idp_focuses", params);
  if (!result.ok) return result;
  const focus = result.payload?.[0] || null;
  return focus
    ? { ok: true, payload: focus }
    : { ok: false, status: 404, reason: "Focus was not found for this player." };
}

async function requireOwnedGoal(scope, playerId, goalId) {
  const safeGoalId = normalizeUuid(goalId);
  if (!safeGoalId) return { ok: false, status: 400, reason: "goalId is invalid." };
  const params = buildTeamParams(scope);
  params.set("select", "*");
  params.set("id", `eq.${safeGoalId}`);
  params.set("player_id", `eq.${playerId}`);
  params.set("deleted_at", "is.null");
  params.set("limit", "1");
  const result = await selectRows("idp_development_goals", params);
  if (isMissingOptionalTable("idp_development_goals", result)) return { ok: false, status: 404, reason: "Development goal was not found." };
  if (!result.ok) return result;
  const goal = result.payload?.[0] || null;
  return goal
    ? { ok: true, payload: goal }
    : { ok: false, status: 404, reason: "Development goal was not found." };
}

async function createFocus(payload, actor) {
  const scope = actorScope(actor);
  const playerId = normalizeText(payload.playerId || payload.player_id, 160);
  const title = normalizeText(payload.title, 180);
  if (!playerId || !title) return { ok: false, status: 400, reason: "playerId and title are required." };
  const profileResult = await ensureProfile(scope, playerId, payload);
  if (!profileResult.ok) return profileResult;
  const focusResult = await insertRow("idp_focuses", {
    organization_id: scope.organizationId,
    club_id: scope.clubId,
    team_id: scope.teamId,
    profile_id: profileResult.payload.id,
    player_id: playerId,
    title,
    description: normalizeNote(payload.description, 1200) || null,
    category: normalizeCategory(payload.category),
    focus_level: normalizeFocusLevel(payload.focusLevel || payload.focus_level),
    linked_phase: normalizeText(payload.linkedPhase || payload.linked_phase, 80) || null,
    linked_sub_phase: normalizeText(payload.linkedSubPhase || payload.linked_sub_phase, 80) || null,
    team_principle_id: normalizeText(payload.teamPrincipleId || payload.team_principle_id, 120) || null,
    mini_game_principle_id: normalizeText(payload.miniGamePrincipleId || payload.mini_game_principle_id, 120) || null,
    owner_id: normalizeText(payload.ownerId || payload.owner_id || scope.actorId, 160) || null,
    status: normalizeFocusStatus(payload.status),
    evidence_status: "Needs Evidence",
    review_date: dateOrNull(payload.reviewDate || payload.review_date),
    created_by: scope.actorId,
    updated_by: scope.actorId,
  });
  if (!focusResult.ok) return focusResult;
  const focus = focusResult.payload?.[0] || null;
  await insertRow("idp_milestones", {
    organization_id: scope.organizationId,
    team_id: scope.teamId,
    player_id: playerId,
    profile_id: profileResult.payload.id,
    focus_id: focus?.id,
    milestone_type: "Current Focus Created",
    title: "Current focus created",
    source_module: "idp",
    source_id: focus?.id || null,
    created_by: scope.actorId,
  });
  const sync = await buildSyncMeta(scope, playerId);
  return { ok: true, payload: { schema: IDP_SCHEMA, focus, sync: sync.ok ? sync.payload : null } };
}

async function updateFocus(payload, actor) {
  const scope = actorScope(actor);
  const focusId = normalizeUuid(payload.id || payload.focusId || payload.focus_id);
  if (!focusId) return { ok: false, status: 400, reason: "focus id is required." };
  const params = buildTeamParams(scope);
  params.set("id", `eq.${focusId}`);
  params.set("deleted_at", "is.null");
  const patch = {
    updated_by: scope.actorId,
  };
  if ("title" in payload) patch.title = normalizeText(payload.title, 180);
  if ("description" in payload) patch.description = normalizeNote(payload.description, 1200) || null;
  if ("category" in payload) patch.category = normalizeCategory(payload.category);
  if ("status" in payload) patch.status = normalizeFocusStatus(payload.status);
  if ("ownerId" in payload || "owner_id" in payload) patch.owner_id = normalizeText(payload.ownerId || payload.owner_id, 160) || null;
  if ("reviewDate" in payload || "review_date" in payload) patch.review_date = dateOrNull(payload.reviewDate || payload.review_date);
  if ("evidenceStatus" in payload || "evidence_status" in payload) {
    patch.evidence_status = normalizeText(payload.evidenceStatus || payload.evidence_status, 80);
  }
  const result = await patchRows("idp_focuses", params, patch);
  if (!result.ok) return result;
  const focus = result.payload?.[0] || null;
  const sync = await buildSyncMeta(scope, focus?.player_id || "");
  return { ok: true, payload: { schema: IDP_SCHEMA, focus, sync: sync.ok ? sync.payload : null } };
}

async function closeFocus(payload, actor, lifecycleAction = "archive") {
  const scope = actorScope(actor);
  const focusId = normalizeUuid(payload.id || payload.focusId || payload.focus_id);
  const playerId = normalizeText(payload.playerId || payload.player_id, 160);
  if (!focusId || !playerId) return { ok: false, status: 400, reason: "focusId and playerId are required." };
  const current = await requireOwnedFocus(scope, playerId, focusId);
  if (!current.ok) return current;
  const before = current.payload;
  const params = buildTeamParams(scope);
  params.set("id", `eq.${focusId}`);
  params.set("player_id", `eq.${playerId}`);
  params.set("deleted_at", "is.null");
  const result = await patchRows("idp_focuses", params, {
    status: "Archived",
    deleted_at: new Date().toISOString(),
    deleted_by: scope.actorId,
    updated_by: scope.actorId,
  });
  if (!result.ok) return result;
  const focus = result.payload?.[0] || null;
  if (!focus) return { ok: false, status: 404, reason: "Focus was not found." };
  await insertAuditEvent(scope, {
    playerId,
    action: lifecycleAction === "delete" ? "focus.deleted" : "focus.archived",
    entityType: "idp_focus",
    entityId: focus.id,
    changedFields: ["status", "deleted_at", "deleted_by"],
    beforeSummary: focusAuditSummary(before),
    afterSummary: focusAuditSummary(focus),
  });
  const sync = await buildSyncMeta(scope, playerId);
  return { ok: true, payload: { schema: IDP_SCHEMA, focus, sync: sync.ok ? sync.payload : null } };
}

async function archiveFocus(payload, actor) {
  return closeFocus(payload, actor, "archive");
}

async function deleteFocus(payload, actor) {
  return closeFocus(payload, actor, "delete");
}

async function upsertClipBankItem(payload, actor) {
  const scope = actorScope(actor);
  const playerId = normalizeText(payload.playerId || payload.player_id, 160);
  const clipId = normalizeUuid(payload.clipInstanceId || payload.clip_instance_id || payload.clipId || payload.clip_id);
  if (!playerId || !clipId) return { ok: false, status: 400, reason: "playerId and clipInstanceId are required." };
  const profileResult = await ensureProfile(scope, playerId, payload);
  if (!profileResult.ok) return profileResult;
  const existingParams = buildTeamParams(scope);
  existingParams.set("select", "*");
  existingParams.set("player_id", `eq.${playerId}`);
  existingParams.set("clip_instance_id", `eq.${clipId}`);
  existingParams.set("deleted_at", "is.null");
  existingParams.set("limit", "1");
  const existing = await selectRows("idp_clip_bank_items", existingParams);
  if (!existing.ok) return existing;
  if (existing.payload[0]) {
    const sync = await buildSyncMeta(scope, playerId);
    return { ok: true, payload: { schema: IDP_SCHEMA, clipBankItem: existing.payload[0], created: false, sync: sync.ok ? sync.payload : null } };
  }
  const incomingClip = await selectVideoClipMoment(scope, clipId);
  const existingMomentItem = await findExistingClipBankItemForMoment(scope, playerId, incomingClip);
  if (existingMomentItem) {
    const sync = await buildSyncMeta(scope, playerId);
    return { ok: true, payload: { schema: IDP_SCHEMA, clipBankItem: existingMomentItem, created: false, sync: sync.ok ? sync.payload : null } };
  }
  const result = await insertRow("idp_clip_bank_items", {
    organization_id: scope.organizationId,
    team_id: scope.teamId,
    player_id: playerId,
    profile_id: profileResult.payload.id,
    clip_instance_id: clipId,
    source_module: "video-analysis",
    source_id: clipId,
    status: "New",
    created_by: scope.actorId,
    updated_by: scope.actorId,
  });
  if (!result.ok) return result;
  const sync = await buildSyncMeta(scope, playerId);
  return { ok: true, payload: { schema: IDP_SCHEMA, clipBankItem: result.payload?.[0] || null, created: true, sync: sync.ok ? sync.payload : null } };
}

async function reviewClipBank(payload, actor) {
  const scope = actorScope(actor);
  const itemId = normalizeUuid(payload.id || payload.clipBankItemId || payload.clip_bank_item_id);
  if (!itemId) return { ok: false, status: 400, reason: "clip bank item id is required." };
  const params = buildTeamParams(scope);
  params.set("id", `eq.${itemId}`);
  params.set("deleted_at", "is.null");
  const status = normalizeClipStatus(payload.status);
  const patch = {
    status,
    linked_focus_id: normalizeUuid(payload.focusId || payload.focus_id) || null,
    reviewed_by: scope.actorId,
    reviewed_at: new Date().toISOString(),
    updated_by: scope.actorId,
  };
  const result = await patchRows("idp_clip_bank_items", params, patch);
  if (!result.ok) return result;
  const item = result.payload?.[0] || null;
  if (status === "Marked As Evidence" && item?.linked_focus_id) {
    await addEvidence({
      playerId: item.player_id,
      focusId: item.linked_focus_id,
      clipBankItemId: item.id,
      evidenceType: "Video Clip",
      sourceModule: "video-analysis",
      sourceTable: "video_clip_instances",
      sourceId: item.clip_instance_id,
      note: payload.note,
    }, actor);
  }
  const sync = await buildSyncMeta(scope, item?.player_id || "");
  return { ok: true, payload: { schema: IDP_SCHEMA, clipBankItem: item, sync: sync.ok ? sync.payload : null } };
}

async function removeClipBankItem(payload, actor) {
  const scope = actorScope(actor);
  const itemId = normalizeUuid(payload.id || payload.clipBankItemId || payload.clip_bank_item_id);
  const playerId = normalizeText(payload.playerId || payload.player_id, 160);
  if (!itemId || !playerId) return { ok: false, status: 400, reason: "clip bank item id and playerId are required." };
  const beforeParams = buildTeamParams(scope);
  beforeParams.set("select", "*");
  beforeParams.set("id", `eq.${itemId}`);
  beforeParams.set("player_id", `eq.${playerId}`);
  beforeParams.set("deleted_at", "is.null");
  beforeParams.set("limit", "1");
  const beforeResult = await selectRows("idp_clip_bank_items", beforeParams);
  if (!beforeResult.ok) return beforeResult;
  const before = beforeResult.payload?.[0] || null;
  if (!before) return { ok: false, status: 404, reason: "Clip bank item was not found." };
  const params = buildTeamParams(scope);
  params.set("id", `eq.${itemId}`);
  params.set("player_id", `eq.${playerId}`);
  params.set("deleted_at", "is.null");
  const result = await patchRows("idp_clip_bank_items", params, {
    status: "Hidden",
    deleted_at: new Date().toISOString(),
    deleted_by: scope.actorId,
    updated_by: scope.actorId,
  });
  if (!result.ok) return result;
  const item = result.payload?.[0] || null;
  if (!item) return { ok: false, status: 404, reason: "Clip bank item was not found." };
  await insertAuditEvent(scope, {
    playerId,
    action: "clip_bank.removed",
    entityType: "idp_clip_bank_item",
    entityId: item.id,
    changedFields: ["status", "deleted_at", "deleted_by"],
    beforeSummary: clipBankAuditSummary(before),
    afterSummary: clipBankAuditSummary(item),
  });
  const sync = await buildSyncMeta(scope, playerId);
  return { ok: true, payload: { schema: IDP_SCHEMA, clipBankItem: item, sync: sync.ok ? sync.payload : null } };
}

async function addEvidence(payload, actor) {
  const scope = actorScope(actor);
  const playerId = normalizeText(payload.playerId || payload.player_id, 160);
  const focusId = normalizeUuid(payload.focusId || payload.focus_id);
  if (!playerId || !focusId) return { ok: false, status: 400, reason: "playerId and focusId are required." };
  const profileResult = await ensureProfile(scope, playerId, payload);
  if (!profileResult.ok) return profileResult;
  const result = await insertRow("idp_evidence", {
    organization_id: scope.organizationId,
    team_id: scope.teamId,
    player_id: playerId,
    profile_id: profileResult.payload.id,
    focus_id: focusId,
    clip_bank_item_id: normalizeUuid(payload.clipBankItemId || payload.clip_bank_item_id) || null,
    evidence_type: normalizeEvidenceType(payload.evidenceType || payload.evidence_type),
    source_module: normalizeText(payload.sourceModule || payload.source_module || "idp", 80),
    source_table: normalizeText(payload.sourceTable || payload.source_table, 80) || null,
    source_id: normalizeText(payload.sourceId || payload.source_id, 160) || null,
    note: normalizeNote(payload.note, 1200) || null,
    created_by: scope.actorId,
    updated_by: scope.actorId,
  });
  if (!result.ok) return result;
  const focusParams = buildTeamParams(scope);
  focusParams.set("id", `eq.${focusId}`);
  await patchRows("idp_focuses", focusParams, { evidence_status: "Has Evidence", updated_by: scope.actorId });
  await insertRow("idp_milestones", {
    organization_id: scope.organizationId,
    team_id: scope.teamId,
    player_id: playerId,
    profile_id: profileResult.payload.id,
    focus_id: focusId,
    milestone_type: "First Evidence Added",
    title: "Evidence added",
    source_module: "idp",
    source_id: result.payload?.[0]?.id || null,
    created_by: scope.actorId,
  });
  const sync = await buildSyncMeta(scope, playerId);
  return { ok: true, payload: { schema: IDP_SCHEMA, evidence: result.payload?.[0] || null, sync: sync.ok ? sync.payload : null } };
}

async function updateEvidence(payload, actor) {
  const scope = actorScope(actor);
  const evidenceId = normalizeUuid(payload.id || payload.evidenceId || payload.evidence_id);
  const playerId = normalizeText(payload.playerId || payload.player_id, 160);
  if (!evidenceId || !playerId) return { ok: false, status: 400, reason: "evidenceId and playerId are required." };
  const params = buildTeamParams(scope);
  params.set("id", `eq.${evidenceId}`);
  params.set("player_id", `eq.${playerId}`);
  params.set("deleted_at", "is.null");
  const patch = {
    evidence_type: normalizeEvidenceType(payload.evidenceType || payload.evidence_type),
    note: normalizeNote(payload.note, 1200) || null,
    updated_by: scope.actorId,
  };
  const result = await patchRows("idp_evidence", params, patch);
  if (!result.ok) return result;
  const evidence = result.payload?.[0] || null;
  if (!evidence) return { ok: false, status: 404, reason: "Observation was not found." };
  const sync = await buildSyncMeta(scope, playerId);
  return { ok: true, payload: { schema: IDP_SCHEMA, evidence, sync: sync.ok ? sync.payload : null } };
}

async function deleteEvidence(payload, actor) {
  const scope = actorScope(actor);
  const evidenceId = normalizeUuid(payload.id || payload.evidenceId || payload.evidence_id);
  const playerId = normalizeText(payload.playerId || payload.player_id, 160);
  if (!evidenceId || !playerId) return { ok: false, status: 400, reason: "evidenceId and playerId are required." };
  const params = buildTeamParams(scope);
  params.set("id", `eq.${evidenceId}`);
  params.set("player_id", `eq.${playerId}`);
  params.set("deleted_at", "is.null");
  const result = await patchRows("idp_evidence", params, {
    status: "archived",
    deleted_at: new Date().toISOString(),
    deleted_by: scope.actorId,
    updated_by: scope.actorId,
  });
  if (!result.ok) return result;
  const evidence = result.payload?.[0] || null;
  if (!evidence) return { ok: false, status: 404, reason: "Observation was not found." };
  const sync = await buildSyncMeta(scope, playerId);
  return { ok: true, payload: { schema: IDP_SCHEMA, evidence, sync: sync.ok ? sync.payload : null } };
}

async function deactivateOwnership(scope, playerId, ownershipType, focusId = "") {
  const params = buildTeamParams(scope);
  params.set("player_id", `eq.${playerId}`);
  params.set("ownership_type", `eq.${ownershipType}`);
  params.set("status", "eq.active");
  params.set("deleted_at", "is.null");
  if (focusId) params.set("focus_id", `eq.${focusId}`);
  return patchRows("idp_staff_ownership", params, {
    status: "inactive",
    updated_by: scope.actorId,
  });
}

async function insertOwnership(scope, profile, playerId, ownerId, ownershipType, focusId = "") {
  if (!ownerId) return { ok: true, payload: [] };
  return insertRow("idp_staff_ownership", {
    organization_id: scope.organizationId,
    team_id: scope.teamId,
    player_id: playerId,
    profile_id: profile?.id || null,
    focus_id: focusId || null,
    owner_id: ownerId,
    ownership_type: ownershipType,
    status: "active",
    created_by: scope.actorId,
    updated_by: scope.actorId,
  });
}

async function assignOwner(payload, actor) {
  const scope = actorScope(actor);
  const playerId = normalizeText(payload.playerId || payload.player_id, 160);
  const ownerId = normalizeText(payload.ownerId || payload.owner_id, 160);
  const focusId = normalizeUuid(payload.focusId || payload.focus_id);
  if (!playerId) return { ok: false, status: 400, reason: "playerId is required." };
  const profileResult = await ensureProfile(scope, playerId, { ownerId });
  if (!profileResult.ok) return profileResult;

  const profileParams = buildTeamParams(scope);
  profileParams.set("id", `eq.${profileResult.payload.id}`);
  profileParams.set("deleted_at", "is.null");
  const profilePatch = await patchRows("idp_profiles", profileParams, {
    primary_owner_id: ownerId || null,
    updated_by: scope.actorId,
  });
  if (!profilePatch.ok) return profilePatch;

  let focus = null;
  if (focusId) {
    const focusParams = buildTeamParams(scope);
    focusParams.set("id", `eq.${focusId}`);
    focusParams.set("deleted_at", "is.null");
    const focusPatch = await patchRows("idp_focuses", focusParams, {
      owner_id: ownerId || null,
      updated_by: scope.actorId,
    });
    if (!focusPatch.ok) return focusPatch;
    focus = focusPatch.payload?.[0] || null;
  }

  const inactivePlayerOwner = await deactivateOwnership(scope, playerId, "player-owner");
  if (!inactivePlayerOwner.ok) return inactivePlayerOwner;
  if (focusId) {
    const inactiveFocusOwner = await deactivateOwnership(scope, playerId, "focus-owner", focusId);
    if (!inactiveFocusOwner.ok) return inactiveFocusOwner;
  }
  const playerOwner = await insertOwnership(scope, profilePatch.payload?.[0] || profileResult.payload, playerId, ownerId, "player-owner");
  if (!playerOwner.ok) return playerOwner;
  if (focusId) {
    const focusOwner = await insertOwnership(scope, profilePatch.payload?.[0] || profileResult.payload, playerId, ownerId, "focus-owner", focusId);
    if (!focusOwner.ok) return focusOwner;
  }

  const sync = await buildSyncMeta(scope, playerId);
  return {
    ok: true,
    payload: {
      schema: IDP_SCHEMA,
      focus,
      ownerId: ownerId || "",
      profile: profilePatch.payload?.[0] || null,
      sync: sync.ok ? sync.payload : null,
    },
  };
}

async function completeReview(payload, actor) {
  const scope = actorScope(actor);
  const playerId = normalizeText(payload.playerId || payload.player_id, 160);
  const focusId = normalizeUuid(payload.focusId || payload.focus_id);
  if (!playerId || !focusId) return { ok: false, status: 400, reason: "playerId and focusId are required." };
  const profileResult = await ensureProfile(scope, playerId, payload);
  if (!profileResult.ok) return profileResult;
  const result = await insertRow("idp_reviews", {
    organization_id: scope.organizationId,
    team_id: scope.teamId,
    player_id: playerId,
    profile_id: profileResult.payload.id,
    focus_id: focusId,
    review_type: normalizeText(payload.reviewType || payload.review_type || "coach-review", 80),
    progress_summary: normalizeNote(payload.progressSummary || payload.progress_summary, 1200) || null,
    evidence_summary: normalizeNote(payload.evidenceSummary || payload.evidence_summary, 1200) || null,
    coach_note: normalizeNote(payload.coachNote || payload.coach_note, 1200) || null,
    player_response: normalizeNote(payload.playerResponse || payload.player_response, 1200) || null,
    next_action: normalizeText(payload.nextAction || payload.next_action, 400) || null,
    status_change: normalizeText(payload.statusChange || payload.status_change, 80) || null,
    created_by: scope.actorId,
    updated_by: scope.actorId,
  });
  if (!result.ok) return result;
  const focusParams = buildTeamParams(scope);
  focusParams.set("id", `eq.${focusId}`);
  await patchRows("idp_focuses", focusParams, {
    evidence_status: "Ready For Review",
    status: normalizeFocusStatus(payload.statusChange || payload.status_change, "Reviewed"),
    updated_by: scope.actorId,
  });
  const nextAction = normalizeText(payload.nextAction || payload.next_action, 180);
  if (nextAction) {
    await insertRow("idp_next_actions", {
      organization_id: scope.organizationId,
      team_id: scope.teamId,
      player_id: playerId,
      profile_id: profileResult.payload.id,
      focus_id: focusId,
      action_type: "Create Next Focus",
      title: nextAction,
      owner_id: scope.actorId,
      due_on: dateOrNull(payload.nextActionDueOn || payload.next_action_due_on),
      status: "open",
      source_module: "idp",
      source_id: result.payload?.[0]?.id || null,
      created_by: scope.actorId,
      updated_by: scope.actorId,
    });
  }
  await insertRow("idp_milestones", {
    organization_id: scope.organizationId,
    team_id: scope.teamId,
    player_id: playerId,
    profile_id: profileResult.payload.id,
    focus_id: focusId,
    milestone_type: "First Review Completed",
    title: "Review completed",
    source_module: "idp",
    source_id: result.payload?.[0]?.id || null,
    created_by: scope.actorId,
  });
  const sync = await buildSyncMeta(scope, playerId);
  return { ok: true, payload: { schema: IDP_SCHEMA, review: result.payload?.[0] || null, sync: sync.ok ? sync.payload : null } };
}

async function createDevelopmentGoal(payload, actor) {
  const scope = actorScope(actor);
  const playerId = normalizeText(payload.playerId || payload.player_id, 160);
  const title = normalizeText(payload.title, 180);
  const metricLabel = normalizeText(payload.metricLabel || payload.metric_label, 160) || "Coach observation";
  if (!playerId || !title) return { ok: false, status: 400, reason: "playerId and title are required." };
  const profileResult = await ensureProfile(scope, playerId, payload);
  if (!profileResult.ok) return profileResult;
  const focusId = normalizeUuid(payload.focusId || payload.focus_id) || null;
  if (focusId) {
    const focusResult = await requireOwnedFocus(scope, playerId, focusId);
    if (!focusResult.ok) return focusResult;
  }
  const result = await insertRow("idp_development_goals", {
    organization_id: scope.organizationId,
    club_id: scope.clubId,
    team_id: scope.teamId,
    player_id: playerId,
    profile_id: profileResult.payload.id,
    focus_id: focusId,
    goal_role: normalizeGoalRole(payload.goalRole || payload.goal_role),
    category: normalizeCategory(payload.category),
    title,
    description: normalizeNote(payload.description, 1200) || null,
    metric_label: metricLabel,
    metric_type: normalizeGoalMetricType(payload.metricType || payload.metric_type),
    baseline_value: normalizeOptionalNumeric(payload.baselineValue ?? payload.baseline_value),
    current_value: normalizeOptionalNumeric(payload.currentValue ?? payload.current_value),
    target_value: normalizeOptionalNumeric(payload.targetValue ?? payload.target_value),
    unit: normalizeText(payload.unit, 40) || null,
    cadence: normalizeGoalCadence(payload.cadence),
    due_on: dateOrNull(payload.dueOn || payload.due_on),
    status: normalizeGoalStatus(payload.status),
    created_by: scope.actorId,
    updated_by: scope.actorId,
  });
  if (!result.ok) return result;
  const goal = result.payload?.[0] || null;
  await insertAuditEvent(scope, {
    playerId,
    action: "development_goal.created",
    entityType: "idp_development_goal",
    entityId: goal?.id,
    changedFields: ["title", "goal_role", "category", "metric_label", "target_value", "status"],
    afterSummary: goalAuditSummary(goal),
  });
  const sync = await buildSyncMeta(scope, playerId);
  return { ok: true, payload: { schema: IDP_SCHEMA, goal, sync: sync.ok ? sync.payload : null } };
}

async function updateDevelopmentGoal(payload, actor) {
  const scope = actorScope(actor);
  const goalId = normalizeUuid(payload.id || payload.goalId || payload.goal_id);
  const playerId = normalizeText(payload.playerId || payload.player_id, 160);
  const expectedRowVersion = normalizeRowVersion(payload.rowVersion || payload.row_version || payload.expectedRowVersion || payload.expected_row_version);
  if (!goalId || !playerId || !expectedRowVersion) {
    return { ok: false, status: 400, reason: "goalId, playerId and rowVersion are required." };
  }
  const currentParams = buildTeamParams(scope);
  currentParams.set("select", "*");
  currentParams.set("id", `eq.${goalId}`);
  currentParams.set("player_id", `eq.${playerId}`);
  currentParams.set("deleted_at", "is.null");
  currentParams.set("limit", "1");
  const current = await selectRows("idp_development_goals", currentParams);
  if (!current.ok) return current;
  const before = current.payload?.[0] || null;
  if (!before) return { ok: false, status: 404, reason: "Development goal was not found." };
  if (Number(before.row_version) !== expectedRowVersion) return { ok: false, status: 409, reason: "Development goal changed elsewhere. Reload and try again." };

  const patch = { updated_by: scope.actorId };
  const changedFields = [];
  if ("focusId" in payload || "focus_id" in payload) {
    patch.focus_id = normalizeUuid(payload.focusId || payload.focus_id) || null;
    if (patch.focus_id) {
      const focusResult = await requireOwnedFocus(scope, playerId, patch.focus_id);
      if (!focusResult.ok) return focusResult;
    }
    changedFields.push("focus_id");
  }
  if ("goalRole" in payload || "goal_role" in payload) {
    patch.goal_role = normalizeGoalRole(payload.goalRole || payload.goal_role);
    changedFields.push("goal_role");
  }
  if ("category" in payload) {
    patch.category = normalizeCategory(payload.category);
    changedFields.push("category");
  }
  if ("title" in payload) {
    patch.title = normalizeText(payload.title, 180);
    changedFields.push("title");
  }
  if ("description" in payload) {
    patch.description = normalizeNote(payload.description, 1200) || null;
    changedFields.push("description");
  }
  if ("metricLabel" in payload || "metric_label" in payload) {
    patch.metric_label = normalizeText(payload.metricLabel || payload.metric_label, 160) || "Coach observation";
    changedFields.push("metric_label");
  }
  if ("metricType" in payload || "metric_type" in payload) {
    patch.metric_type = normalizeGoalMetricType(payload.metricType || payload.metric_type);
    changedFields.push("metric_type");
  }
  if ("baselineValue" in payload || "baseline_value" in payload) {
    patch.baseline_value = normalizeOptionalNumeric(payload.baselineValue ?? payload.baseline_value);
    changedFields.push("baseline_value");
  }
  if ("currentValue" in payload || "current_value" in payload) {
    patch.current_value = normalizeOptionalNumeric(payload.currentValue ?? payload.current_value);
    changedFields.push("current_value");
  }
  if ("targetValue" in payload || "target_value" in payload) {
    patch.target_value = normalizeOptionalNumeric(payload.targetValue ?? payload.target_value);
    changedFields.push("target_value");
  }
  if ("unit" in payload) {
    patch.unit = normalizeText(payload.unit, 40) || null;
    changedFields.push("unit");
  }
  if ("cadence" in payload) {
    patch.cadence = normalizeGoalCadence(payload.cadence);
    changedFields.push("cadence");
  }
  if ("dueOn" in payload || "due_on" in payload) {
    patch.due_on = dateOrNull(payload.dueOn || payload.due_on);
    changedFields.push("due_on");
  }
  if ("status" in payload) {
    patch.status = normalizeGoalStatus(payload.status);
    changedFields.push("status");
  }
  const params = buildTeamParams(scope);
  params.set("id", `eq.${goalId}`);
  params.set("player_id", `eq.${playerId}`);
  params.set("row_version", `eq.${expectedRowVersion}`);
  params.set("deleted_at", "is.null");
  const result = await patchRows("idp_development_goals", params, patch);
  if (!result.ok) return result;
  const goal = result.payload?.[0] || null;
  if (!goal) return { ok: false, status: 409, reason: "Development goal changed elsewhere. Reload and try again." };
  await insertAuditEvent(scope, {
    playerId,
    action: "development_goal.updated",
    entityType: "idp_development_goal",
    entityId: goal.id,
    changedFields,
    beforeSummary: goalAuditSummary(before),
    afterSummary: goalAuditSummary(goal),
  });
  const sync = await buildSyncMeta(scope, playerId);
  return { ok: true, payload: { schema: IDP_SCHEMA, goal, sync: sync.ok ? sync.payload : null } };
}

async function archiveDevelopmentGoal(payload, actor) {
  const scope = actorScope(actor);
  const goalId = normalizeUuid(payload.id || payload.goalId || payload.goal_id);
  const playerId = normalizeText(payload.playerId || payload.player_id, 160);
  const expectedRowVersion = normalizeRowVersion(payload.rowVersion || payload.row_version || payload.expectedRowVersion || payload.expected_row_version);
  if (!goalId || !playerId || !expectedRowVersion) {
    return { ok: false, status: 400, reason: "goalId, playerId and rowVersion are required." };
  }
  const currentParams = buildTeamParams(scope);
  currentParams.set("select", "*");
  currentParams.set("id", `eq.${goalId}`);
  currentParams.set("player_id", `eq.${playerId}`);
  currentParams.set("deleted_at", "is.null");
  currentParams.set("limit", "1");
  const current = await selectRows("idp_development_goals", currentParams);
  if (!current.ok) return current;
  const before = current.payload?.[0] || null;
  if (!before) return { ok: false, status: 404, reason: "Development goal was not found." };
  if (Number(before.row_version) !== expectedRowVersion) return { ok: false, status: 409, reason: "Development goal changed elsewhere. Reload and try again." };
  const params = buildTeamParams(scope);
  params.set("id", `eq.${goalId}`);
  params.set("player_id", `eq.${playerId}`);
  params.set("row_version", `eq.${expectedRowVersion}`);
  params.set("deleted_at", "is.null");
  const result = await patchRows("idp_development_goals", params, {
    status: "archived",
    deleted_at: new Date().toISOString(),
    deleted_by: scope.actorId,
    updated_by: scope.actorId,
  });
  if (!result.ok) return result;
  const goal = result.payload?.[0] || null;
  if (!goal) return { ok: false, status: 409, reason: "Development goal changed elsewhere. Reload and try again." };
  await insertAuditEvent(scope, {
    playerId,
    action: "development_goal.archived",
    entityType: "idp_development_goal",
    entityId: goal.id,
    changedFields: ["status", "deleted_at", "deleted_by"],
    beforeSummary: goalAuditSummary(before),
    afterSummary: goalAuditSummary(goal),
  });
  const sync = await buildSyncMeta(scope, playerId);
  return { ok: true, payload: { schema: IDP_SCHEMA, goal, sync: sync.ok ? sync.payload : null } };
}

async function addGoalCheckin(payload, actor) {
  const scope = actorScope(actor);
  const goalId = normalizeUuid(payload.goalId || payload.goal_id);
  const playerId = normalizeText(payload.playerId || payload.player_id, 160);
  if (!goalId || !playerId) return { ok: false, status: 400, reason: "goalId and playerId are required." };
  const goalParams = buildTeamParams(scope);
  goalParams.set("select", "*");
  goalParams.set("id", `eq.${goalId}`);
  goalParams.set("player_id", `eq.${playerId}`);
  goalParams.set("deleted_at", "is.null");
  goalParams.set("limit", "1");
  const goalResult = await selectRows("idp_development_goals", goalParams);
  if (!goalResult.ok) return goalResult;
  const goal = goalResult.payload?.[0] || null;
  if (!goal) return { ok: false, status: 404, reason: "Development goal was not found." };
  const value = normalizeOptionalNumeric(payload.value);
  const checkinResult = await insertRow("idp_goal_checkins", {
    organization_id: scope.organizationId,
    club_id: scope.clubId,
    team_id: scope.teamId,
    player_id: playerId,
    profile_id: goal.profile_id,
    goal_id: goal.id,
    focus_id: goal.focus_id || null,
    value,
    confidence: normalizeConfidence(payload.confidence),
    note: normalizeNote(payload.note, 1200) || null,
    status_snapshot: normalizeGoalStatus(payload.statusSnapshot || payload.status_snapshot || goal.status),
    checkin_on: dateOrNull(payload.checkinOn || payload.checkin_on) || new Date().toISOString().slice(0, 10),
    created_by: scope.actorId,
    updated_by: scope.actorId,
  });
  if (!checkinResult.ok) return checkinResult;
  if (value !== null) {
    const patchParams = buildTeamParams(scope);
    patchParams.set("id", `eq.${goal.id}`);
    patchParams.set("player_id", `eq.${playerId}`);
    patchParams.set("deleted_at", "is.null");
    await patchRows("idp_development_goals", patchParams, { current_value: value, updated_by: scope.actorId });
  }
  const checkin = checkinResult.payload?.[0] || null;
  await insertAuditEvent(scope, {
    playerId,
    action: "development_goal.checkin_added",
    entityType: "idp_goal_checkin",
    entityId: checkin?.id,
    changedFields: ["value", "confidence", "note", "status_snapshot"],
    afterSummary: {
      goal_id: goal.id,
      value,
      checkin_on: normalizeText(checkin?.checkin_on, 40),
      status_snapshot: normalizeText(checkin?.status_snapshot, 40),
    },
  });
  const sync = await buildSyncMeta(scope, playerId);
  return { ok: true, payload: { schema: IDP_SCHEMA, checkin, sync: sync.ok ? sync.payload : null } };
}

async function createDevelopmentIntervention(payload, actor) {
  const scope = actorScope(actor);
  const playerId = normalizeText(payload.playerId || payload.player_id, 160);
  const focusId = normalizeUuid(payload.focusId || payload.focus_id);
  const title = normalizeText(payload.title, 180);
  if (!playerId || !focusId || !title) return { ok: false, status: 400, reason: "playerId, focusId and title are required." };
  const profileResult = await ensureProfile(scope, playerId, payload);
  if (!profileResult.ok) return profileResult;
  const boardState = normalizeBoardState(payload.boardState || payload.board_state);
  const focusResult = await requireOwnedFocus(scope, playerId, focusId);
  if (!focusResult.ok) return focusResult;
  const goalId = normalizeUuid(payload.goalId || payload.goal_id) || null;
  if (goalId) {
    const goalResult = await requireOwnedGoal(scope, playerId, goalId);
    if (!goalResult.ok) return goalResult;
    if (goalResult.payload.focus_id && goalResult.payload.focus_id !== focusId) {
      return { ok: false, status: 409, reason: "Development goal belongs to a different focus." };
    }
  }
  const result = await insertRow("idp_development_interventions", {
    organization_id: scope.organizationId,
    club_id: scope.clubId,
    team_id: scope.teamId,
    player_id: playerId,
    profile_id: profileResult.payload.id,
    focus_id: focusId,
    goal_id: goalId,
    title,
    objective: normalizeNote(payload.objective, 1200) || null,
    coaching_cue: normalizeNote(payload.coachingCue || payload.coaching_cue, 800) || null,
    success_criteria: normalizeTextList(payload.successCriteria || payload.success_criteria),
    pitch_mode: normalizePitchMode(payload.pitchMode || payload.pitch_mode),
    board_state: boardState,
    status: normalizeInterventionStatus(payload.status),
    created_by: scope.actorId,
    updated_by: scope.actorId,
  });
  if (!result.ok) return result;
  const intervention = result.payload?.[0] || null;
  await insertAuditEvent(scope, {
    playerId,
    action: "development_intervention.created",
    entityType: "idp_development_intervention",
    entityId: intervention?.id,
    changedFields: ["title", "objective", "goal_id", "coaching_cue", "success_criteria", "pitch_mode", "board_state", "status"],
    afterSummary: interventionAuditSummary(intervention),
  });
  const sync = await buildSyncMeta(scope, playerId);
  return { ok: true, payload: { schema: IDP_SCHEMA, intervention, sync: sync.ok ? sync.payload : null } };
}

async function updateDevelopmentIntervention(payload, actor) {
  const scope = actorScope(actor);
  const interventionId = normalizeUuid(payload.id || payload.interventionId || payload.intervention_id);
  const playerId = normalizeText(payload.playerId || payload.player_id, 160);
  const expectedRowVersion = normalizeRowVersion(payload.rowVersion || payload.row_version || payload.expectedRowVersion || payload.expected_row_version);
  if (!interventionId || !playerId || !expectedRowVersion) {
    return { ok: false, status: 400, reason: "interventionId, playerId and rowVersion are required." };
  }
  const currentParams = buildTeamParams(scope);
  currentParams.set("select", "*");
  currentParams.set("id", `eq.${interventionId}`);
  currentParams.set("player_id", `eq.${playerId}`);
  currentParams.set("deleted_at", "is.null");
  currentParams.set("limit", "1");
  const current = await selectRows("idp_development_interventions", currentParams);
  if (!current.ok) return current;
  const before = current.payload?.[0] || null;
  if (!before) return { ok: false, status: 404, reason: "Individual exercise was not found." };
  if (Number(before.row_version) !== expectedRowVersion) return { ok: false, status: 409, reason: "Individual exercise changed elsewhere. Reload and try again." };

  const patch = { updated_by: scope.actorId };
  const changedFields = [];
  if ("title" in payload) {
    patch.title = normalizeText(payload.title, 180);
    changedFields.push("title");
  }
  if ("objective" in payload) {
    patch.objective = normalizeNote(payload.objective, 1200) || null;
    changedFields.push("objective");
  }
  if ("goalId" in payload || "goal_id" in payload) {
    patch.goal_id = normalizeUuid(payload.goalId || payload.goal_id) || null;
    if (patch.goal_id) {
      const goalResult = await requireOwnedGoal(scope, playerId, patch.goal_id);
      if (!goalResult.ok) return goalResult;
      if (goalResult.payload.focus_id && before.focus_id && goalResult.payload.focus_id !== before.focus_id) {
        return { ok: false, status: 409, reason: "Development goal belongs to a different focus." };
      }
    }
    changedFields.push("goal_id");
  }
  if ("coachingCue" in payload || "coaching_cue" in payload) {
    patch.coaching_cue = normalizeNote(payload.coachingCue || payload.coaching_cue, 800) || null;
    changedFields.push("coaching_cue");
  }
  if ("successCriteria" in payload || "success_criteria" in payload) {
    patch.success_criteria = normalizeTextList(payload.successCriteria || payload.success_criteria);
    changedFields.push("success_criteria");
  }
  if ("pitchMode" in payload || "pitch_mode" in payload) {
    patch.pitch_mode = normalizePitchMode(payload.pitchMode || payload.pitch_mode);
    changedFields.push("pitch_mode");
  }
  if ("boardState" in payload || "board_state" in payload) {
    patch.board_state = normalizeBoardState(payload.boardState || payload.board_state);
    changedFields.push("board_state");
  }
  if ("status" in payload) {
    patch.status = normalizeInterventionStatus(payload.status);
    changedFields.push("status");
  }
  const params = buildTeamParams(scope);
  params.set("id", `eq.${interventionId}`);
  params.set("player_id", `eq.${playerId}`);
  params.set("row_version", `eq.${expectedRowVersion}`);
  params.set("deleted_at", "is.null");
  const result = await patchRows("idp_development_interventions", params, patch);
  if (!result.ok) return result;
  const intervention = result.payload?.[0] || null;
  if (!intervention) return { ok: false, status: 409, reason: "Individual exercise changed elsewhere. Reload and try again." };
  await insertAuditEvent(scope, {
    playerId,
    action: "development_intervention.updated",
    entityType: "idp_development_intervention",
    entityId: intervention.id,
    changedFields,
    beforeSummary: interventionAuditSummary(before),
    afterSummary: interventionAuditSummary(intervention),
  });
  const sync = await buildSyncMeta(scope, playerId);
  return { ok: true, payload: { schema: IDP_SCHEMA, intervention, sync: sync.ok ? sync.payload : null } };
}

async function archiveDevelopmentIntervention(payload, actor) {
  const scope = actorScope(actor);
  const interventionId = normalizeUuid(payload.id || payload.interventionId || payload.intervention_id);
  const playerId = normalizeText(payload.playerId || payload.player_id, 160);
  const expectedRowVersion = normalizeRowVersion(payload.rowVersion || payload.row_version || payload.expectedRowVersion || payload.expected_row_version);
  if (!interventionId || !playerId || !expectedRowVersion) {
    return { ok: false, status: 400, reason: "interventionId, playerId and rowVersion are required." };
  }
  const currentParams = buildTeamParams(scope);
  currentParams.set("select", "*");
  currentParams.set("id", `eq.${interventionId}`);
  currentParams.set("player_id", `eq.${playerId}`);
  currentParams.set("deleted_at", "is.null");
  currentParams.set("limit", "1");
  const current = await selectRows("idp_development_interventions", currentParams);
  if (!current.ok) return current;
  const before = current.payload?.[0] || null;
  if (!before) return { ok: false, status: 404, reason: "Individual exercise was not found." };
  if (Number(before.row_version) !== expectedRowVersion) return { ok: false, status: 409, reason: "Individual exercise changed elsewhere. Reload and try again." };
  const params = buildTeamParams(scope);
  params.set("id", `eq.${interventionId}`);
  params.set("player_id", `eq.${playerId}`);
  params.set("row_version", `eq.${expectedRowVersion}`);
  params.set("deleted_at", "is.null");
  const result = await patchRows("idp_development_interventions", params, {
    status: "archived",
    deleted_at: new Date().toISOString(),
    deleted_by: scope.actorId,
    updated_by: scope.actorId,
  });
  if (!result.ok) return result;
  const intervention = result.payload?.[0] || null;
  if (!intervention) return { ok: false, status: 409, reason: "Individual exercise changed elsewhere. Reload and try again." };
  await insertAuditEvent(scope, {
    playerId,
    action: "development_intervention.archived",
    entityType: "idp_development_intervention",
    entityId: intervention.id,
    changedFields: ["status", "deleted_at", "deleted_by"],
    beforeSummary: interventionAuditSummary(before),
    afterSummary: interventionAuditSummary(intervention),
  });
  const sync = await buildSyncMeta(scope, playerId);
  return { ok: true, payload: { schema: IDP_SCHEMA, intervention, sync: sync.ok ? sync.payload : null } };
}

function statusPayload(actor) {
  return {
    ok: true,
    schema: IDP_SCHEMA,
    mode: "player-development-system",
    enabled: true,
    scope: actorScope(actor),
    ownsPlayerIdentity: false,
    ownsClipMetadata: false,
    evidenceIsCurated: true,
  };
}

async function handleIdpRequest(req, res, actor) {
  const url = new URL(req.url || "/api/idp", "https://footballscience.local");
  if (req.method === "GET") {
    const action = normalizeText(url.searchParams.get("action") || "dashboard", 40);
    const query = Object.fromEntries(url.searchParams.entries());
    const result = action === "status"
      ? { ok: true, payload: statusPayload(actor) }
      : action === "sync"
        ? await getSyncStatus(query, actor)
        : action === "player"
          ? await getPlayerDevelopment(query, actor)
          : await listDashboard(query, actor);
    return sendJson(res, result.ok ? 200 : result.status || 500, result.ok ? result.payload : { ok: false, reason: result.reason });
  }

  const body = await parseJsonBody(req, { maxBytes: MAX_BODY_BYTES });
  const action = normalizeText(body.action || url.searchParams.get("action"), 80);
  const result =
    action === "create-focus"
      ? await createFocus(body.focus || body, actor)
      : action === "update-focus"
        ? await updateFocus(body.focus || body, actor)
        : action === "archive-focus"
          ? await archiveFocus(body.focus || body, actor)
          : action === "delete-focus"
            ? await deleteFocus(body.focus || body, actor)
            : action === "video-player-tagged"
              ? await upsertClipBankItem(body.clip || body, actor)
              : action === "review-clip-bank"
                ? await reviewClipBank(body.clipBankItem || body, actor)
                : action === "remove-clip-bank-item"
                  ? await removeClipBankItem(body.clipBankItem || body, actor)
                  : action === "add-evidence"
                    ? await addEvidence(body.evidence || body, actor)
                  : action === "update-evidence"
                    ? await updateEvidence(body.evidence || body, actor)
                    : action === "delete-evidence"
                      ? await deleteEvidence(body.evidence || body, actor)
                      : action === "assign-owner"
                        ? await assignOwner(body.ownership || body, actor)
                        : action === "complete-review"
                          ? await completeReview(body.review || body, actor)
                          : action === "create-goal"
                            ? await createDevelopmentGoal(body.goal || body, actor)
                            : action === "update-goal"
                              ? await updateDevelopmentGoal(body.goal || body, actor)
                              : action === "archive-goal"
                                ? await archiveDevelopmentGoal(body.goal || body, actor)
                                : action === "add-goal-checkin"
                                  ? await addGoalCheckin(body.checkin || body, actor)
                                  : action === "create-intervention"
                                    ? await createDevelopmentIntervention(body.intervention || body, actor)
                                    : action === "update-intervention"
                                      ? await updateDevelopmentIntervention(body.intervention || body, actor)
                                      : action === "archive-intervention"
                                        ? await archiveDevelopmentIntervention(body.intervention || body, actor)
                                        : { ok: false, status: 400, reason: "Unsupported IDP action." };
  return sendJson(res, result.ok ? 200 : result.status || 500, result.ok ? result.payload : { ok: false, reason: result.reason });
}

module.exports = {
  IDP_SCHEMA,
  addEvidence,
  addGoalCheckin,
  archiveFocus,
  archiveDevelopmentIntervention,
  archiveDevelopmentGoal,
  assignOwner,
  buildSyncMeta,
  completeReview,
  createDevelopmentGoal,
  createDevelopmentIntervention,
  createFocus,
  dashboardStatus,
  deleteFocus,
  deleteEvidence,
  getSyncStatus,
  handleIdpRequest,
  normalizeCategory,
  removeClipBankItem,
  reviewClipBank,
  updateDevelopmentGoal,
  updateDevelopmentIntervention,
  updateEvidence,
  updateFocus,
  upsertClipBankItem,
};
