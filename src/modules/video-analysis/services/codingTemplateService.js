import { miniGamePrinciples } from "../constants/miniGamePrinciples.js";
import { videoAnalysisOutcomes } from "../constants/outcomes.js";
import { videoAnalysisPhases } from "../constants/phases.js";
import { teamPrinciples } from "../constants/principles.js";
import { videoAnalysisSubPhases } from "../constants/subPhases.js";

const phaseHotkeys = ["1", "2", "3", "4", "5"];
const principleHotkeys = ["6", "7", "8", "9", "0", "-"];

function button(id, type, label, value, hotkey = "", group = type) {
  return { id, type, label, value, hotkey, group, instantEnabled: true };
}

function buttonsFromList(type, items, hotkeys = [], group = type) {
  return items.map((item, index) => {
    const value = typeof item === "string" ? item : item.id;
    const label = typeof item === "string" ? item : item.label;
    return button(`${type}-${value}`.replace(/[^a-z0-9]+/gi, "-").toLowerCase(), type, label, value, hotkeys[index] || "", group);
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
    title: "Football Science Principle Coding",
    defaultMode: "manual",
    preRollMs: 4000,
    postRollMs: 4000,
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

export function findTemplateButton(template = {}, buttonId = "") {
  return (template.buttons || []).find((item) => item.id === buttonId) || null;
}

export function findButtonByHotkey(template = {}, key = "") {
  const normalized = String(key || "").toLowerCase();
  return (template.buttons || []).find((item) => String(item.hotkey || "").toLowerCase() === normalized) || null;
}

export function applyCodingButtonToDraft(draft = {}, template = {}, button = {}) {
  if (!button?.type) return draft;
  const nextDraft = { ...draft, [button.type]: button.value };
  for (const link of template.links || []) {
    if (link.sourceValue === button.value && link.targetType && link.targetValue) {
      nextDraft[link.targetType] = link.targetValue;
    }
  }
  return nextDraft;
}

export function buildInstantClipRange(playheadMs = 0, session = {}) {
  const preRollMs = Number(session.preRollMs ?? 4000);
  const postRollMs = Number(session.postRollMs ?? 4000);
  const startMs = Math.max(0, Math.round(Number(playheadMs || 0) - preRollMs));
  const endMs = Math.max(startMs + 100, Math.round(Number(playheadMs || 0) + postRollMs));
  return { startMs, endMs, preRollMs, postRollMs };
}

export function shouldIgnoreShortcutTarget(target) {
  const tag = String(target?.tagName || "").toLowerCase();
  return ["input", "textarea", "select"].includes(tag) || Boolean(target?.isContentEditable);
}
