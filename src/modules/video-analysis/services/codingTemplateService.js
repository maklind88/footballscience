import { miniGamePrinciples } from "../constants/miniGamePrinciples.js";
import { videoAnalysisOutcomes } from "../constants/outcomes.js";
import { videoAnalysisPhases } from "../constants/phases.js";
import { teamPrinciples } from "../constants/principles.js";
import { videoAnalysisSubPhases } from "../constants/subPhases.js";
import { groupCodingTemplateButtons, rebuildTemplateFromGroups } from "./codingTemplateLayoutService.js";

export {
  groupCodingTemplateButtons,
  moveCodingButtonByStep,
  moveCodingButtonInTemplate,
  moveCodingGroupByStep,
  moveCodingTemplateGroup,
  reservedCodingHotkeys,
  templateHotkeyIssues,
} from "./codingTemplateLayoutService.js";

const phaseHotkeys = ["1", "2", "3", "4", "5"];
const principleHotkeys = ["6", "7", "8", "9", "0", "-"];
const defaultClipDurationMs = 15000;
const defaultButtonBehavior = "create_tag";
const buttonBehaviorSettings = Object.freeze({
  create_tag: { createsClip: true, appliesLabel: false },
  toggle_duration: { createsClip: true, appliesLabel: false },
  label_current: { createsClip: false, appliesLabel: true },
  descriptor: { createsClip: false, appliesLabel: true },
  player_tag: { createsClip: false, appliesLabel: true },
});
const groupColors = Object.freeze({
  Phase: "#1f5eff",
  "Sub-phase": "#0f8a63",
  "Team Principle": "#7c3aed",
  "Mini-game Principle": "#d97706",
  Outcome: "#334155",
  Descriptors: "#0f766e",
});
const buttonTypeByField = Object.freeze({
  subPhase: "sub_phase",
  teamPrincipleId: "team_principle",
  miniGamePrincipleId: "mini_game_principle",
});

function slug(value = "") {
  return String(value || "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
}

function normalizeColor(value = "", fallback = "#143522") {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
}

function normalizeHotkey(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .slice(0, 12);
}

function behaviorSettings(behavior = defaultButtonBehavior) {
  return buttonBehaviorSettings[behavior] || buttonBehaviorSettings.create_tag;
}

function normalizeGroupName(value = "") {
  const group = String(value || "").trim().replace(/\s+/g, " ");
  return group || "Custom";
}

function nextSortOrder(buttons = []) {
  return buttons.reduce((highest, item, index) => Math.max(highest, Number(item.sortOrder ?? index)), -1) + 1;
}

function uniqueLabel(buttons = [], baseLabel = "New tag", group = "", ignoreId = "") {
  const base = String(baseLabel || "New tag").trim() || "New tag";
  const groupKey = normalizeGroupName(group).toLowerCase();
  const labels = new Set(buttons
    .filter((item) => item.id !== ignoreId && normalizeGroupName(item.group).toLowerCase() === groupKey)
    .map((item) => String(item.label || "").toLowerCase()));
  if (!labels.has(base.toLowerCase())) return base;
  let index = 2;
  while (labels.has(`${base} ${index}`.toLowerCase())) index += 1;
  return `${base} ${index}`;
}

function uniqueValue(buttons = [], baseValue = "New tag", buttonType = "custom", ignoreId = "") {
  const base = String(baseValue || "New tag").trim() || "New tag";
  const type = buttonType || "custom";
  const values = new Set(buttons
    .filter((item) => item.id !== ignoreId && (item.buttonType || item.type || "custom") === type)
    .map((item) => String(item.value || "").toLowerCase()));
  if (!values.has(base.toLowerCase())) return base;
  let index = 2;
  while (values.has(`${base} ${index}`.toLowerCase())) index += 1;
  return `${base} ${index}`;
}

function uniqueButtonId(buttons = [], seed = "custom-button") {
  const base = slug(seed) || "custom-button";
  const ids = new Set(buttons.map((item) => item.id));
  if (!ids.has(base)) return base;
  let index = 2;
  while (ids.has(`${base}-${index}`)) index += 1;
  return `${base}-${index}`;
}

function button(id, type, label, value, hotkey = "", group = type, options = {}) {
  const buttonBehavior = options.buttonBehavior || defaultButtonBehavior;
  const settings = behaviorSettings(buttonBehavior);
  return {
    id,
    databaseId: options.databaseId || "",
    type,
    buttonType: options.buttonType || buttonTypeByField[type] || type,
    label,
    value,
    hotkey: normalizeHotkey(hotkey),
    group,
    groupId: options.groupId || slug(group),
    groupSortOrder: Number(options.groupSortOrder ?? 0),
    color: normalizeColor(options.color || groupColors[group] || "#143522"),
    defaultDurationMs: Number(options.defaultDurationMs ?? defaultClipDurationMs),
    startOffsetMs: Number(options.startOffsetMs ?? 0),
    endOffsetMs: Number(options.endOffsetMs ?? defaultClipDurationMs),
    buttonBehavior,
    createsClip: options.createsClip ?? settings.createsClip,
    appliesLabel: options.appliesLabel ?? settings.appliesLabel,
    targetField: options.targetField || type,
    instantEnabled: options.instantEnabled !== false,
    sortOrder: Number(options.sortOrder ?? 0),
  };
}

function buttonsFromList(type, items, hotkeys = [], group = type) {
  return items.map((item, index) => {
    const value = typeof item === "string" ? item : item.id;
    const label = typeof item === "string" ? item : item.label;
    return button(`${type}-${slug(value)}`, type, label, value, hotkeys[index] || "", group);
  });
}

export function createDefaultCodingTemplate() {
  const buttons = [
    ...buttonsFromList("phase", videoAnalysisPhases, phaseHotkeys, "Phase"),
    ...buttonsFromList("subPhase", videoAnalysisSubPhases, [], "Sub-phase"),
    ...buttonsFromList("teamPrincipleId", teamPrinciples, principleHotkeys, "Team Principle"),
    ...buttonsFromList("miniGamePrincipleId", miniGamePrinciples, [], "Mini-game Principle"),
    ...buttonsFromList("outcome", videoAnalysisOutcomes, ["z", "x", "c"], "Outcome"),
  ];
  return {
    id: "football-science-default-template",
    title: "Football Science Tag Panel",
    defaultMode: "instant",
    defaultClipDurationMs,
    preRollMs: 0,
    postRollMs: defaultClipDurationMs,
    buttons,
    links: [
      { sourceValue: "Build Up", targetType: "miniGamePrincipleId", targetValue: "third-player" },
      { sourceValue: "Build Up", targetType: "miniGamePrincipleId", targetValue: "fix-release" },
      { sourceValue: "High Press", targetType: "miniGamePrincipleId", targetValue: "screen-and-cover" },
      { sourceValue: "Offensive Transition", targetType: "miniGamePrincipleId", targetValue: "counterpress-five-seconds" },
      { sourceValue: "Finishing Phase", targetType: "miniGamePrincipleId", targetValue: "box-arrivals" },
    ],
  };
}

export function addCodingButtonToTemplate(template = {}, options = {}) {
  const buttons = Array.isArray(template.buttons) ? template.buttons : [];
  const group = normalizeGroupName(options.group || "Custom");
  const groups = groupCodingTemplateButtons(template);
  const groupIndex = groups.findIndex((item) => item.label === group);
  const label = uniqueLabel(buttons, options.label || "New tag", group);
  const buttonType = options.buttonType || "custom";
  const value = uniqueValue(buttons, options.value || label, buttonType);
  const id = uniqueButtonId(buttons, `custom-${group}-${value}`);
  const durationMs = Number(options.defaultDurationMs ?? template.defaultClipDurationMs ?? defaultClipDurationMs);
  const nextButton = button(id, "custom", label, value, "", group, {
    buttonType,
    color: options.color || groupColors[group] || "#1f5eff",
    defaultDurationMs: durationMs,
    startOffsetMs: Number(options.startOffsetMs ?? 0),
    endOffsetMs: Number(options.endOffsetMs ?? durationMs),
    buttonBehavior: options.buttonBehavior || defaultButtonBehavior,
    targetField: options.targetField || "tags",
    groupId: options.groupId || slug(group) || "custom",
    groupSortOrder: groupIndex >= 0 ? groupIndex : groups.length,
    sortOrder: nextSortOrder(buttons),
  });
  const nextTemplate = { ...template, buttons: [...buttons, nextButton] };
  return rebuildTemplateFromGroups(nextTemplate, groupCodingTemplateButtons(nextTemplate));
}

export function addCodingButtonGroupToTemplate(template = {}, groupName = "Custom") {
  return addCodingButtonToTemplate(template, { group: groupName, label: "New tag" });
}

export function duplicateCodingButtonInTemplate(template = {}, buttonId = "") {
  const buttons = Array.isArray(template.buttons) ? template.buttons : [];
  const source = buttons.find((item) => item.id === buttonId);
  if (!source) return template;
  const label = uniqueLabel(buttons, `${source.label || "Button"} copy`, source.group || "Custom");
  const value = source.targetField === "tags" || source.buttonType === "custom"
    ? uniqueValue(buttons, label, source.buttonType || "custom")
    : uniqueValue(buttons, `${source.value || label} copy`, source.buttonType || source.type || "custom");
  const duplicate = {
    ...source,
    id: uniqueButtonId(buttons, `${source.id || source.type || "button"}-copy`),
    databaseId: "",
    label,
    value,
    hotkey: "",
    sortOrder: nextSortOrder(buttons),
  };
  const nextTemplate = { ...template, buttons: [...buttons, duplicate] };
  return rebuildTemplateFromGroups(nextTemplate, groupCodingTemplateButtons(nextTemplate));
}

function targetFieldForBehavior(currentTargetField = "", behavior = defaultButtonBehavior) {
  if (currentTargetField && currentTargetField !== "tags") return currentTargetField;
  if (behavior === "descriptor") return "unit";
  if (behavior === "player_tag") return "playerId";
  return currentTargetField || "tags";
}

export function removeCodingButtonFromTemplate(template = {}, buttonId = "") {
  const nextTemplate = {
    ...template,
    buttons: (template.buttons || []).filter((item) => item.id !== buttonId),
    links: (template.links || []).filter((link) => {
      const source = findTemplateButton(template, buttonId);
      if (!source) return true;
      return link.sourceValue !== source.value && link.targetValue !== source.value;
    }),
  };
  return rebuildTemplateFromGroups(nextTemplate, groupCodingTemplateButtons(nextTemplate));
}

export function updateCodingButtonField(template = {}, buttonId = "", fieldName = "", value = "") {
  const numericFields = new Set(["defaultDurationMs", "startOffsetMs", "endOffsetMs"]);
  const normalizedValue = fieldName === "hotkey"
    ? normalizeHotkey(value)
    : fieldName === "color"
      ? normalizeColor(value)
      : value;
  const nextValue = numericFields.has(fieldName) ? Math.round(Number(value || 0)) : normalizedValue;
  return {
    ...template,
    buttons: (template.buttons || []).map((item) => {
      if (item.id !== buttonId) return item;
      const behavior = fieldName === "buttonBehavior" ? nextValue : item.buttonBehavior || defaultButtonBehavior;
      const settings = behaviorSettings(behavior);
      const next = {
        ...item,
        [fieldName]: nextValue,
        ...(fieldName === "buttonBehavior" ? {
          createsClip: settings.createsClip,
          appliesLabel: settings.appliesLabel,
          targetField: targetFieldForBehavior(item.targetField || item.type, nextValue),
        } : {}),
      };
      if (fieldName === "label" && (item.targetField === "tags" || item.buttonType === "custom")) {
        next.value = uniqueValue(template.buttons || [], nextValue, item.buttonType || "custom", buttonId);
      }
      if (fieldName === "targetField" && nextValue === "tags" && item.buttonType === "custom") {
        next.value = uniqueValue(template.buttons || [], item.label || item.value, item.buttonType || "custom", buttonId);
      }
      return next;
    }),
  };
}

export function updateCodingButtonMsField(template = {}, buttonId = "", fieldName = "", seconds = 0, mode = "") {
  const rawSeconds = Math.round(Number(seconds || 0));
  const signedSeconds = fieldName === "startOffsetMs" && mode === "lead" ? -Math.abs(rawSeconds) : rawSeconds;
  const milliseconds = Math.max(fieldName === "startOffsetMs" ? -120000 : 1000, signedSeconds * 1000);
  return {
    ...template,
    buttons: (template.buttons || []).map((item) => item.id === buttonId ? {
      ...item,
      [fieldName]: milliseconds,
      ...(fieldName === "defaultDurationMs" ? { endOffsetMs: milliseconds } : {}),
    } : item),
  };
}

export function findTemplateButton(template = {}, buttonId = "") {
  return (template.buttons || []).find((item) => item.id === buttonId) || null;
}

export function findButtonByHotkey(template = {}, key = "") {
  const normalized = String(key || "").toLowerCase();
  return (template.buttons || []).find((item) => String(item.hotkey || "").toLowerCase() === normalized) || null;
}

export function applyCodingButtonToDraft(draft = {}, template = {}, button = {}) {
  const targetField = button?.targetField || button?.type;
  if (!targetField) return draft;
  const nextDraft = { ...draft, [targetField]: button.value };
  if (targetField === "tags") {
    const existingTags = String(draft.tags || "")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    nextDraft.tags = [...new Set([...existingTags, button.value])].join(", ");
  }
  for (const link of template.links || []) {
    if (link.sourceValue === button.value && link.targetType && link.targetValue) {
      nextDraft[link.targetType] = link.targetValue;
    }
  }
  return nextDraft;
}

export function buildInstantClipRange(playheadMs = 0, session = {}, button = {}) {
  const defaultDuration = Number(button.defaultDurationMs ?? session.defaultClipDurationMs ?? defaultClipDurationMs);
  const startOffsetMs = Number(button.startOffsetMs ?? -Number(session.preRollMs ?? 0));
  const endOffsetMs = Number(button.endOffsetMs ?? defaultDuration);
  const preRollMs = Math.max(0, -startOffsetMs);
  const postRollMs = Math.max(0, endOffsetMs);
  const playhead = Number(playheadMs || 0);
  const startMs = Math.max(0, Math.round(playhead + startOffsetMs));
  const calculatedEndMs = Math.round(playhead + endOffsetMs);
  const endMs = Math.max(startMs + 100, calculatedEndMs || startMs + defaultDuration);
  return { startMs, endMs, preRollMs, postRollMs };
}

export function buildCodingButtonAction(state = {}, button = {}, playheadMs = 0) {
  const behavior = button.buttonBehavior || defaultButtonBehavior;
  const nextDraft = applyCodingButtonToDraft(state.draft || {}, state.template || {}, button);
  const nextSession = {
    ...(state.codingSession || {}),
    activeButtonId: button.id,
    activeButtonDatabaseId: button.databaseId || "",
    mode: button.createsClip === false ? state.codingSession?.mode || "instant" : "instant",
  };

  if (behavior === "toggle_duration") {
    const openTag = state.codingSession?.openTag || null;
    if (openTag?.buttonId === button.id) {
      const startMs = Math.max(0, Math.round(Number(openTag.startMs || playheadMs || 0)));
      const endMs = Math.max(startMs + 100, Math.round(Number(playheadMs || 0)));
      return {
        nextDraft: { ...nextDraft, startMs, endMs },
        nextSession: { ...nextSession, openTag: null, preRollMs: 0, postRollMs: endMs - startMs },
        shouldCreateClip: true,
        message: `${button.label} duration saved.`,
      };
    }
    return {
      nextDraft,
      nextSession: { ...nextSession, openTag: { buttonId: button.id, startMs: Math.max(0, Math.round(Number(playheadMs || 0))) } },
      shouldCreateClip: false,
      message: `${button.label} started.`,
    };
  }

  if (button.createsClip === false || behavior === "descriptor" || behavior === "label_current" || behavior === "player_tag") {
    return {
      nextDraft,
      nextSession,
      shouldCreateClip: false,
      message: `${button.label} applied.`,
    };
  }

  const range = buildInstantClipRange(playheadMs, nextSession, button);
  return {
    nextDraft: { ...nextDraft, ...range },
    nextSession: { ...nextSession, preRollMs: range.preRollMs, postRollMs: range.postRollMs },
    shouldCreateClip: true,
    message: `${button.label} tagged ${Math.round((range.endMs - range.startMs) / 1000)}s.`,
  };
}

export function shouldIgnoreShortcutTarget(target) {
  const tag = String(target?.tagName || "").toLowerCase();
  return ["input", "textarea", "select"].includes(tag) || Boolean(target?.isContentEditable);
}
