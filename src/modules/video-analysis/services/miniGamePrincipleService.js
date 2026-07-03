import { miniGamePrincipleGroups, miniGamePrinciples } from "../constants/miniGamePrinciples.js";
import { videoAnalysisSubPhases } from "../constants/subPhases.js";

const principleById = new Map(miniGamePrinciples.map((principle) => [principle.id, principle]));
const principleIdByLabel = new Map(miniGamePrinciples.map((principle) => [principle.label.toLowerCase(), principle.id]));
const subPhaseSet = new Set(videoAnalysisSubPhases);
const subPhaseByNormalizedLabel = new Map(videoAnalysisSubPhases.map((label) => [normalizeTextKey(label), label]));
const subPhaseByPrincipleId = new Map(miniGamePrincipleGroups.flatMap((group) => {
  const subPhase = subPhaseForGroup(group);
  return group.principles.map((principle) => [principle.id, subPhase]);
}));

function normalizeTextKey(value = "") {
  return String(value || "").trim().toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();
}

function subPhaseForGroup(group = {}) {
  const explicit = subPhaseByNormalizedLabel.get(normalizeTextKey(group.label));
  if (explicit) return explicit;
  const aliases = new Map([
    ["build with gk", "Build With GK"],
    ["build up with gk", "Build With GK"],
    ["high press vs gk and high press", "High Press"],
    ["throw ins off", "Throw-ins"],
    ["throw ins def", "Throw-ins"],
    ["goalkicks off", "Build With GK"],
  ]);
  return aliases.get(normalizeTextKey(group.label)) || "";
}

function labelType(entry = {}) {
  return String(entry.type || entry.labelType || entry.label_type || "").trim().toLowerCase();
}

function labelValue(entry = {}) {
  return String(entry.value || entry.labelValue || entry.label_value || "").trim();
}

function labelText(entry = {}) {
  return String(entry.label || entry.labelText || entry.label_text || "").trim();
}

export function isMiniGamePrincipleId(value = "") {
  return principleById.has(String(value || "").trim());
}

export function miniGamePrincipleLabel(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  return principleById.get(text)?.label || text;
}

export function subPhaseForMiniGamePrinciple(value = "", fallbackSubPhase = "") {
  const id = normalizeMiniGamePrincipleId(value);
  const fallback = String(fallbackSubPhase || "").trim();
  if (subPhaseSet.has(fallback)) return fallback;
  const mapped = subPhaseByPrincipleId.get(id);
  return mapped && subPhaseSet.has(mapped) ? mapped : "";
}

export function normalizeMiniGamePrincipleId(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  if (principleById.has(text)) return text;
  return principleIdByLabel.get(text.toLowerCase()) || "";
}

export function uniqueMiniGamePrincipleIds(values = []) {
  const ids = [];
  const seen = new Set();
  for (const value of values) {
    const id = normalizeMiniGamePrincipleId(value);
    if (!id || seen.has(id)) continue;
    ids.push(id);
    seen.add(id);
  }
  return ids;
}

export function clipMiniGamePrincipleIds(clip = {}) {
  const ids = [];
  const primary = clip.miniGamePrincipleId || clip.mini_game_principle_id || "";
  if (primary) ids.push(primary);
  for (const entry of Array.isArray(clip.labels) ? clip.labels : []) {
    if (labelType(entry) !== "mini_game_principle") continue;
    ids.push(labelValue(entry) || labelText(entry));
  }
  return uniqueMiniGamePrincipleIds(ids);
}

export function clipMiniGamePrincipleLabels(clip = {}) {
  return clipMiniGamePrincipleIds(clip).map(miniGamePrincipleLabel).filter(Boolean);
}

export function buildMiniGamePrincipleLabels(values = []) {
  return uniqueMiniGamePrincipleIds(values).map((id) => ({
    type: "mini_game_principle",
    value: id,
    label: miniGamePrincipleLabel(id),
    label_type: "mini_game_principle",
    label_value: id,
    label_text: miniGamePrincipleLabel(id),
  }));
}

export function replaceMiniGamePrincipleLabels(labels = [], values = []) {
  const existing = Array.isArray(labels) ? labels : [];
  return [
    ...existing.filter((entry) => labelType(entry) !== "mini_game_principle"),
    ...buildMiniGamePrincipleLabels(values),
  ];
}

export function withMiniGamePrinciples(clip = {}, values = []) {
  const ids = uniqueMiniGamePrincipleIds(values);
  return {
    ...clip,
    miniGamePrincipleId: ids[0] || "",
    mini_game_principle_id: ids[0] || null,
    labels: replaceMiniGamePrincipleLabels(clip.labels, ids),
  };
}
