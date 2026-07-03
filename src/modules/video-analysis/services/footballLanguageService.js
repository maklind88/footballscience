const phaseBySubPhase = new Map([
  ["build with gk", "In Possession"],
  ["build up with gk", "In Possession"],
  ["build up", "In Possession"],
  ["creating phase", "In Possession"],
  ["finishing phase", "In Possession"],
  ["high press vs gk", "Out of Possession"],
  ["high press", "Out of Possession"],
  ["block defending", "Out of Possession"],
  ["box defending", "Out of Possession"],
  ["offensive transition", "Offensive Transition"],
  ["defensive transition", "Defensive Transition"],
  ["offensive set pieces", "Set Pieces"],
  ["defensive set pieces", "Set Pieces"],
  ["throw-ins", "Set Pieces"],
  ["throw ins", "Set Pieces"],
  ["throw-in", "Set Pieces"],
  ["throw in", "Set Pieces"],
]);

function normalizeLanguageKey(value = "") {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function phaseForSubPhase(subPhase = "", fallbackPhase = "") {
  const key = normalizeLanguageKey(subPhase);
  return phaseBySubPhase.get(key) || String(fallbackPhase || "").trim();
}

export function withPhaseForSubPhase(value = {}) {
  const subPhase = String(value.subPhase || value.sub_phase || "").trim();
  const phase = phaseForSubPhase(subPhase, value.phase || "");
  return phase ? { ...value, phase } : value;
}
