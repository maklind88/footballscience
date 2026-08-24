const {
  asLimit,
  asMs,
  actorScope,
  buildTeamParams,
  insertRow,
  normalizeCodingMode,
  normalizeText,
  normalizeUuid,
  patchRows,
  rejectForbiddenPayload,
  selectRows,
} = require("./video-analysis-database-core.js");

const VIDEO_ANALYSIS_SCHEMA = "footballscience-video-analysis-v2";
const CODING_BUTTON_TYPES = new Set(["phase", "sub_phase", "team_principle", "mini_game_principle", "outcome", "descriptor", "player", "unit", "custom"]);
const CODING_BUTTON_BEHAVIORS = new Set(["create_tag", "toggle_duration", "label_current", "descriptor", "player_tag", "custom"]);
const CODING_FIELD_TO_BUTTON_TYPE = Object.freeze({
  subPhase: "sub_phase",
  teamPrincipleId: "team_principle",
  miniGamePrincipleId: "mini_game_principle",
});
const BUTTON_TYPE_TO_CODING_FIELD = Object.freeze({
  sub_phase: "subPhase",
  team_principle: "teamPrincipleId",
  mini_game_principle: "miniGamePrincipleId",
});
const CANONICAL_CODING_TARGET_FIELDS = Object.freeze({
  sub_phase: "subPhase",
  team_principle: "teamPrincipleId",
  team_principle_id: "teamPrincipleId",
  mini_game_principle: "miniGamePrincipleId",
  mini_game_principle_id: "miniGamePrincipleId",
  player: "playerId",
  player_id: "playerId",
  pitch_zone: "pitchZone",
});
const BUTTON_TYPE_GROUPS = Object.freeze({
  phase: "Phase",
  sub_phase: "Sub-phase",
  team_principle: "Team Principle",
  mini_game_principle: "Mini-game Principle",
  outcome: "Outcome",
  descriptor: "Descriptors",
  player: "Player",
  unit: "Unit",
  custom: "Custom",
});
const TEMPLATE_BEHAVIOR_COLUMNS = Object.freeze(["default_clip_duration_ms"]);
const BUTTON_BEHAVIOR_COLUMNS = Object.freeze([
  "group_id",
  "target_field",
  "button_behavior",
  "creates_clip",
  "applies_label",
  "default_duration_ms",
  "start_offset_ms",
  "end_offset_ms",
  "exclusive_group_key",
]);

function rowList(result) {
  return result.ok && Array.isArray(result.payload) ? result.payload : [];
}

function asSignedMs(value, fallback = 0) {
  const ms = Math.round(Number(value));
  return Number.isFinite(ms) ? ms : fallback;
}

function asSortOrder(value, fallback = 0) {
  const order = Math.round(Number(value));
  return Number.isFinite(order) && order >= 0 ? order : fallback;
}

function normalizeCodingButtonType(value) {
  const raw = normalizeText(value, 80);
  const type = (CODING_FIELD_TO_BUTTON_TYPE[raw] || raw).toLowerCase().replace(/[\s-]+/g, "_");
  return CODING_BUTTON_TYPES.has(type) ? type : "custom";
}

function normalizeCodingTargetField(value, type = "custom") {
  const targetField = normalizeText(value, 120);
  if (targetField) return CANONICAL_CODING_TARGET_FIELDS[targetField] || targetField;
  return BUTTON_TYPE_TO_CODING_FIELD[type] || type;
}

function normalizeButtonBehavior(value) {
  const behavior = normalizeText(value, 80).toLowerCase().replace(/[\s-]+/g, "_");
  return CODING_BUTTON_BEHAVIORS.has(behavior) ? behavior : "create_tag";
}

function normalizeCodingButtonPayload(button = {}, index = 0) {
  const type = normalizeCodingButtonType(button.buttonType || button.button_type || button.type);
  const label = normalizeText(button.label || button.name || button.value, 120);
  const value = normalizeText(button.value || button.label || button.name, 180);
  if (!label || !value) return null;
  const behavior = normalizeButtonBehavior(button.buttonBehavior || button.button_behavior);
  const defaultDurationMs = Math.max(100, asMs(button.defaultDurationMs || button.default_duration_ms, 15000));
  const createsClip = button.createsClip ?? button.creates_clip;
  const appliesLabel = button.appliesLabel ?? button.applies_label;
  return {
    databaseId: normalizeUuid(button.databaseId || button.id),
    clientId: normalizeText(button.id || button.clientId || button.client_id, 160),
    type: normalizeText(button.type, 80) || (BUTTON_TYPE_TO_CODING_FIELD[type] || type),
    buttonType: type,
    label,
    value,
    hotkey: normalizeText(button.hotkey, 40) || null,
    color: normalizeText(button.color, 40) || null,
    group: normalizeText(button.group, 120) || BUTTON_TYPE_GROUPS[type] || "Custom",
    groupId: normalizeText(button.groupId || button.group_id, 120) || type,
    targetField: normalizeCodingTargetField(button.targetField || button.target_field, type),
    buttonBehavior: behavior,
    createsClip: createsClip === undefined ? ["create_tag", "toggle_duration"].includes(behavior) : Boolean(createsClip),
    appliesLabel: appliesLabel === undefined ? ["label_current", "descriptor", "player_tag"].includes(behavior) : Boolean(appliesLabel),
    defaultDurationMs,
    startOffsetMs: asSignedMs(button.startOffsetMs ?? button.start_offset_ms, 0),
    endOffsetMs: Math.max(100, asSignedMs(button.endOffsetMs ?? button.end_offset_ms, defaultDurationMs)),
    instantEnabled: button.instantEnabled !== false && button.instant_enabled !== false,
    exclusiveGroupKey: normalizeText(button.exclusiveGroupKey || button.exclusive_group_key, 120) || null,
    groupSortOrder: asSortOrder(button.groupSortOrder ?? button.group_sort_order ?? button.metadata?.groupSortOrder ?? button.metadata?.group_sort_order, index),
    sortOrder: asSortOrder(button.sortOrder ?? button.sort_order, index),
  };
}

function normalizeCodingButtonLinkPayload(link = {}) {
  const sourceValue = normalizeText(link.sourceValue || link.source_value, 180);
  const targetValue = normalizeText(link.targetValue || link.target_value, 180);
  if (!sourceValue || !targetValue) return null;
  const linkType = normalizeText(link.linkType || link.link_type, 40);
  return {
    sourceValue,
    sourceType: normalizeCodingButtonType(link.sourceType || link.source_type || "custom"),
    targetValue,
    targetType: normalizeCodingButtonType(link.targetType || link.target_type || "custom"),
    linkType: ["activates", "suggests", "requires", "excludes"].includes(linkType) ? linkType : "activates",
  };
}

function normalizeCodingTemplatePayload(payload = {}, actor = {}) {
  rejectForbiddenPayload(payload);
  const scope = actorScope(actor);
  const title = normalizeText(payload.title || payload.name || "Football Science Tag Panel", 180);
  if (!title) {
    const error = new Error("Template title is required.");
    error.status = 400;
    throw error;
  }
  const defaultClipDurationMs = Math.max(100, asMs(payload.defaultClipDurationMs || payload.default_clip_duration_ms, 15000));
  const buttons = Array.isArray(payload.buttons) ? payload.buttons : [];
  return {
    ...scope,
    id: normalizeUuid(payload.databaseId || payload.id),
    title,
    description: normalizeText(payload.description, 1000) || null,
    defaultMode: normalizeCodingMode(payload.defaultMode || payload.default_mode || "instant"),
    defaultClipDurationMs,
    preRollMs: asMs(payload.preRollMs || payload.pre_roll_ms, 0),
    postRollMs: asMs(payload.postRollMs || payload.post_roll_ms, defaultClipDurationMs),
    isDefault: payload.isDefault === true || payload.is_default === true,
    settings: payload.settings && typeof payload.settings === "object" && !Array.isArray(payload.settings) ? payload.settings : {},
    buttons: buttons.map((button, index) => normalizeCodingButtonPayload(button, index)).filter(Boolean).slice(0, 240),
    links: Array.isArray(payload.links) ? payload.links.map(normalizeCodingButtonLinkPayload).filter(Boolean).slice(0, 500) : [],
  };
}

function isMissingCodingTemplateSchema(result = {}) {
  const reason = String(result.reason || result.payload?.message || result.payload?.hint || "");
  return result.status === 404 || /video_coding_templates|video_coding_buttons|schema cache|relation .* does not exist/i.test(reason);
}

function isMissingColumn(result = {}, table = "", columns = []) {
  const reason = String([
    result.reason,
    result.payload?.message,
    result.payload?.hint,
    result.payload?.details,
    result.payload?.code,
  ].filter(Boolean).join(" "));
  const normalizedReason = reason.toLowerCase();
  const normalizedTable = String(table || "").toLowerCase();
  if (!/schema cache|column|pgrst204/i.test(normalizedReason)) return false;
  if (normalizedTable && !normalizedReason.includes(normalizedTable)) return false;
  if (!columns.length) return true;
  return columns.some((column) => normalizedReason.includes(String(column || "").toLowerCase()));
}

function omitColumns(row = {}, columns = []) {
  const next = { ...row };
  for (const column of columns) delete next[column];
  return next;
}

function mapTemplateRow(row = {}, buttons = [], links = []) {
  return {
    id: row.id || "",
    databaseId: row.id || "",
    title: row.title || "Football Science Tag Panel",
    description: row.description || "",
    defaultMode: row.default_mode || "instant",
    defaultClipDurationMs: row.default_clip_duration_ms || row.settings?.defaultClipDurationMs || row.post_roll_ms || 15000,
    preRollMs: row.pre_roll_ms || 0,
    postRollMs: row.post_roll_ms || row.default_clip_duration_ms || 15000,
    isDefault: row.is_default === true,
    settings: row.settings || {},
    buttons,
    links,
  };
}

function mapButtonRow(row = {}) {
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const buttonType = normalizeCodingButtonType(row.button_type);
  const targetField = normalizeCodingTargetField(row.target_field || metadata.targetField, buttonType);
  return {
    id: normalizeText(metadata.clientId || row.id, 160),
    databaseId: row.id || "",
    type: normalizeText(metadata.type, 80) || targetField,
    buttonType,
    label: row.label || row.value || "Button",
    value: row.value || row.label || "",
    hotkey: row.hotkey || "",
    group: normalizeText(metadata.group, 120) || BUTTON_TYPE_GROUPS[buttonType] || "Custom",
    groupId: row.group_id || metadata.groupId || buttonType,
    color: row.color || "#143522",
    defaultDurationMs: row.default_duration_ms || metadata.defaultDurationMs || 15000,
    startOffsetMs: row.start_offset_ms ?? metadata.startOffsetMs ?? 0,
    endOffsetMs: row.end_offset_ms || metadata.endOffsetMs || row.default_duration_ms || metadata.defaultDurationMs || 15000,
    buttonBehavior: row.button_behavior || metadata.buttonBehavior || "create_tag",
    createsClip: row.creates_clip ?? metadata.createsClip ?? true,
    appliesLabel: row.applies_label ?? metadata.appliesLabel ?? false,
    targetField,
    instantEnabled: row.instant_enabled !== false,
    exclusiveGroupKey: row.exclusive_group_key || metadata.exclusiveGroupKey || "",
    groupSortOrder: asSortOrder(metadata.groupSortOrder ?? metadata.group_sort_order, 0),
    sortOrder: asSortOrder(row.sort_order, 0),
  };
}

function mapLinkRow(row = {}, buttonById = new Map()) {
  const source = buttonById.get(row.source_button_id);
  const target = buttonById.get(row.target_button_id);
  if (!source || !target) return null;
  return {
    sourceValue: source.value,
    sourceType: source.type,
    targetValue: target.value,
    targetType: target.type,
    linkType: row.link_type || "activates",
  };
}

async function listCodingTemplates(query, actor) {
  const scope = actorScope(actor);
  const params = buildTeamParams(scope);
  params.set("select", "*");
  params.set("status", "eq.active");
  params.set("order", "is_default.desc,updated_at.desc");
  params.set("limit", String(asLimit(query.limit, 20)));
  const templatesResult = await selectRows("video_coding_templates", params);
  if (!templatesResult.ok) {
    if (isMissingCodingTemplateSchema(templatesResult)) return { ok: true, payload: { schema: VIDEO_ANALYSIS_SCHEMA, templates: [] } };
    return templatesResult;
  }
  const templateRows = rowList(templatesResult);
  if (!templateRows.length) return { ok: true, payload: { schema: VIDEO_ANALYSIS_SCHEMA, templates: [] } };

  const templateIds = templateRows.map((row) => row.id).filter(Boolean);
  const idFilter = `in.(${templateIds.join(",")})`;
  const buttonParams = buildTeamParams(scope);
  buttonParams.set("select", "*");
  buttonParams.set("template_id", idFilter);
  buttonParams.set("status", "eq.active");
  buttonParams.set("order", "sort_order.asc,id.asc");
  const linkParams = buildTeamParams(scope);
  linkParams.set("select", "*");
  linkParams.set("template_id", idFilter);
  linkParams.set("status", "eq.active");
  const [buttonsResult, linksResult] = await Promise.all([
    selectRows("video_coding_buttons", buttonParams),
    selectRows("video_coding_button_links", linkParams),
  ]);
  if (!buttonsResult.ok) return buttonsResult;
  if (!linksResult.ok) return linksResult;

  const buttonRows = rowList(buttonsResult);
  const mappedButtons = buttonRows.map(mapButtonRow);
  const buttonByDatabaseId = new Map(mappedButtons.map((button) => [button.databaseId, button]));
  const buttonsByTemplate = new Map();
  for (const row of buttonRows) {
    const mapped = buttonByDatabaseId.get(row.id);
    const list = buttonsByTemplate.get(row.template_id) || [];
    list.push(mapped);
    buttonsByTemplate.set(row.template_id, list);
  }
  const linksByTemplate = new Map();
  for (const row of rowList(linksResult)) {
    const mapped = mapLinkRow(row, buttonByDatabaseId);
    if (!mapped) continue;
    const list = linksByTemplate.get(row.template_id) || [];
    list.push(mapped);
    linksByTemplate.set(row.template_id, list);
  }
  const templates = templateRows.map((row) => mapTemplateRow(row, buttonsByTemplate.get(row.id) || [], linksByTemplate.get(row.id) || []));
  return { ok: true, payload: { schema: VIDEO_ANALYSIS_SCHEMA, templates } };
}

async function findCodingTemplate(template = {}) {
  const params = buildTeamParams(template);
  params.set("select", "*");
  if (template.id) params.set("id", `eq.${template.id}`);
  else params.set("title", `eq.${template.title}`);
  params.set("limit", "1");
  const result = await selectRows("video_coding_templates", params);
  if (!result.ok) return result;
  return { ok: true, payload: rowList(result)[0] || null };
}

async function saveCodingTemplateRow(template = {}) {
  const existing = await findCodingTemplate(template);
  if (!existing.ok) return existing;
  const settings = {
    ...(template.settings || {}),
    defaultClipDurationMs: template.defaultClipDurationMs,
    preRollMs: template.preRollMs,
    postRollMs: template.postRollMs,
  };
  const row = {
    organization_id: template.organizationId,
    team_id: template.teamId,
    title: template.title,
    description: template.description,
    default_mode: template.defaultMode,
    default_clip_duration_ms: template.defaultClipDurationMs,
    pre_roll_ms: template.preRollMs,
    post_roll_ms: template.postRollMs,
    is_default: template.isDefault,
    status: "active",
    created_by: template.actorId,
    settings,
  };
  if (!existing.payload?.id) {
    const inserted = await insertRow("video_coding_templates", row);
    if (!inserted.ok && isMissingColumn(inserted, "video_coding_templates", TEMPLATE_BEHAVIOR_COLUMNS)) {
      const fallbackInserted = await insertRow("video_coding_templates", omitColumns(row, TEMPLATE_BEHAVIOR_COLUMNS));
      return fallbackInserted.ok ? { ok: true, payload: fallbackInserted.payload?.[0] || null } : fallbackInserted;
    }
    return inserted.ok ? { ok: true, payload: inserted.payload?.[0] || null } : inserted;
  }
  const params = buildTeamParams(template);
  params.set("id", `eq.${existing.payload.id}`);
  const patched = await patchRows("video_coding_templates", params, row);
  if (!patched.ok && isMissingColumn(patched, "video_coding_templates", TEMPLATE_BEHAVIOR_COLUMNS)) {
    const fallbackPatched = await patchRows("video_coding_templates", params, omitColumns(row, TEMPLATE_BEHAVIOR_COLUMNS));
    return fallbackPatched.ok ? { ok: true, payload: fallbackPatched.payload?.[0] || existing.payload } : fallbackPatched;
  }
  return patched.ok ? { ok: true, payload: patched.payload?.[0] || existing.payload } : patched;
}

function buttonRow(button = {}, template = {}, templateId = "") {
  return {
    organization_id: template.organizationId,
    team_id: template.teamId,
    template_id: templateId,
    button_type: button.buttonType,
    label: button.label,
    value: button.value,
    hotkey: button.hotkey,
    color: button.color,
    sort_order: button.sortOrder,
    instant_enabled: button.instantEnabled,
    exclusive_group_key: button.exclusiveGroupKey,
    status: "active",
    created_by: template.actorId,
    group_id: button.groupId,
    target_field: button.targetField,
    button_behavior: button.buttonBehavior,
    creates_clip: button.createsClip,
    applies_label: button.appliesLabel,
    default_duration_ms: button.defaultDurationMs,
    start_offset_ms: button.startOffsetMs,
    end_offset_ms: button.endOffsetMs,
    metadata: {
      clientId: button.clientId,
      group: button.group,
      groupId: button.groupId,
      groupSortOrder: button.groupSortOrder,
      type: button.type,
      targetField: button.targetField,
      buttonBehavior: button.buttonBehavior,
      createsClip: button.createsClip,
      appliesLabel: button.appliesLabel,
      defaultDurationMs: button.defaultDurationMs,
      startOffsetMs: button.startOffsetMs,
      endOffsetMs: button.endOffsetMs,
      exclusiveGroupKey: button.exclusiveGroupKey,
    },
  };
}

async function writeCodingButtonRow(table, row, params = null) {
  const result = params ? await patchRows(table, params, row) : await insertRow(table, row);
  if (!result.ok && isMissingColumn(result, table, BUTTON_BEHAVIOR_COLUMNS)) {
    const fallbackRow = omitColumns(row, BUTTON_BEHAVIOR_COLUMNS);
    return params ? patchRows(table, params, fallbackRow) : insertRow(table, fallbackRow);
  }
  return result;
}

async function saveCodingButtons(template = {}, templateId = "") {
  const params = buildTeamParams(template);
  params.set("select", "*");
  params.set("template_id", `eq.${templateId}`);
  const existingResult = await selectRows("video_coding_buttons", params);
  if (!existingResult.ok) return existingResult;
  const existingRows = rowList(existingResult);
  const existingByKey = new Map(existingRows.map((row) => [`${row.button_type}:${row.value}`, row]));
  const saved = [];
  for (const button of template.buttons) {
    const row = buttonRow(button, template, templateId);
    const existing = button.databaseId ? existingRows.find((item) => item.id === button.databaseId) : existingByKey.get(`${button.buttonType}:${button.value}`);
    const result = existing?.id
      ? await writeCodingButtonRow("video_coding_buttons", row, buildIdParams(template, existing.id))
      : await writeCodingButtonRow("video_coding_buttons", row);
    if (!result.ok) return result;
    saved.push(result.payload?.[0] || existing || row);
  }
  return { ok: true, payload: saved };
}

function buildIdParams(scope = {}, id = "") {
  const params = buildTeamParams(scope);
  params.set("id", `eq.${id}`);
  return params;
}

async function archiveMissingCodingRows(table = "", template = {}, templateId = "", keepIds = []) {
  const params = buildTeamParams(template);
  params.set("template_id", `eq.${templateId}`);
  params.set("status", "eq.active");
  if (keepIds.length) params.set("id", `not.in.(${keepIds.join(",")})`);
  return patchRows(table, params, {
    status: "archived",
    archived_at: new Date().toISOString(),
  });
}

async function saveCodingButtonLinks(template = {}, templateId = "", savedButtons = []) {
  if (!savedButtons.length) {
    const archiveAll = await archiveMissingCodingRows("video_coding_button_links", template, templateId, []);
    return archiveAll.ok ? { ok: true, payload: [] } : archiveAll;
  }
  const buttonsByKey = new Map(savedButtons.map((button) => [`${button.button_type}:${button.value}`, button]));
  const savedLinks = [];
  for (const link of template.links) {
    const source = buttonsByKey.get(`${link.sourceType}:${link.sourceValue}`) || savedButtons.find((button) => button.value === link.sourceValue);
    const target = buttonsByKey.get(`${link.targetType}:${link.targetValue}`) || savedButtons.find((button) => button.value === link.targetValue);
    if (!source?.id || !target?.id) continue;
    const params = buildTeamParams(template);
    params.set("select", "*");
    params.set("template_id", `eq.${templateId}`);
    params.set("source_button_id", `eq.${source.id}`);
    params.set("target_button_id", `eq.${target.id}`);
    params.set("link_type", `eq.${link.linkType}`);
    params.set("limit", "1");
    const existing = await selectRows("video_coding_button_links", params);
    if (!existing.ok) return existing;
    const row = {
      organization_id: template.organizationId,
      team_id: template.teamId,
      template_id: templateId,
      source_button_id: source.id,
      target_button_id: target.id,
      link_type: link.linkType,
      status: "active",
      created_by: template.actorId,
      metadata: {
        sourceValue: link.sourceValue,
        targetValue: link.targetValue,
      },
    };
    const existingLink = rowList(existing)[0];
    const result = existingLink?.id
      ? await patchRows("video_coding_button_links", buildIdParams(template, existingLink.id), row)
      : await insertRow("video_coding_button_links", row);
    if (!result.ok && result.status !== 409) return result;
    if (result.ok) savedLinks.push(result.payload?.[0] || row);
  }
  const archiveMissingLinks = await archiveMissingCodingRows(
    "video_coding_button_links",
    template,
    templateId,
    savedLinks.map((row) => row.id).filter(Boolean)
  );
  if (!archiveMissingLinks.ok) return archiveMissingLinks;
  return { ok: true, payload: savedLinks };
}

async function saveCodingTemplate(payload, actor) {
  const template = normalizeCodingTemplatePayload(payload, actor);
  const templateResult = await saveCodingTemplateRow(template);
  if (!templateResult.ok) return templateResult;
  const savedTemplate = templateResult.payload;
  if (!savedTemplate?.id) return { ok: false, status: 500, reason: "Coding template could not be saved." };
  const buttonsResult = await saveCodingButtons(template, savedTemplate.id);
  if (!buttonsResult.ok) return buttonsResult;
  const archiveMissingButtons = await archiveMissingCodingRows(
    "video_coding_buttons",
    template,
    savedTemplate.id,
    rowList(buttonsResult).map((row) => row.id).filter(Boolean)
  );
  if (!archiveMissingButtons.ok) return archiveMissingButtons;
  const linksResult = await saveCodingButtonLinks(template, savedTemplate.id, rowList(buttonsResult));
  if (!linksResult.ok) return linksResult;
  const buttonRows = rowList(buttonsResult).map(mapButtonRow);
  const buttonById = new Map(buttonRows.map((button) => [button.databaseId, button]));
  const links = rowList(linksResult).map((row) => mapLinkRow(row, buttonById)).filter(Boolean);
  return {
    ok: true,
    payload: {
      schema: VIDEO_ANALYSIS_SCHEMA,
      template: mapTemplateRow(savedTemplate, buttonRows, links.length ? links : template.links),
    },
  };
}

module.exports = {
  listCodingTemplates,
  normalizeCodingTemplatePayload,
  saveCodingTemplate,
};
