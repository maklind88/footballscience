export const presentationLineupFormationOptions = Object.freeze([
  {
    id: "4-3-3",
    label: "4-3-3",
    slots: [
      { id: "gk", label: "GK", x: 50, y: 90 },
      { id: "lb", label: "LB", x: 14, y: 70 },
      { id: "lcb", label: "LCB", x: 38, y: 70 },
      { id: "rcb", label: "RCB", x: 62, y: 70 },
      { id: "rb", label: "RB", x: 86, y: 70 },
      { id: "lcm", label: "LCM", x: 27, y: 49 },
      { id: "cm", label: "CM", x: 50, y: 49 },
      { id: "rcm", label: "RCM", x: 73, y: 49 },
      { id: "lw", label: "LW", x: 18, y: 27 },
      { id: "st", label: "ST", x: 50, y: 16 },
      { id: "rw", label: "RW", x: 82, y: 27 },
    ],
  },
  {
    id: "4-2-3-1",
    label: "4-2-3-1",
    slots: [
      { id: "gk", label: "GK", x: 50, y: 90 },
      { id: "lb", label: "LB", x: 14, y: 70 },
      { id: "lcb", label: "LCB", x: 38, y: 70 },
      { id: "rcb", label: "RCB", x: 62, y: 70 },
      { id: "rb", label: "RB", x: 86, y: 70 },
      { id: "ldm", label: "LDM", x: 34, y: 50 },
      { id: "rdm", label: "RDM", x: 66, y: 50 },
      { id: "lam", label: "LAM", x: 17, y: 32 },
      { id: "cam", label: "CAM", x: 50, y: 32 },
      { id: "ram", label: "RAM", x: 83, y: 32 },
      { id: "st", label: "ST", x: 50, y: 12 },
    ],
  },
  {
    id: "4-4-2",
    label: "4-4-2",
    slots: [
      { id: "gk", label: "GK", x: 50, y: 90 },
      { id: "lb", label: "LB", x: 14, y: 70 },
      { id: "lcb", label: "LCB", x: 38, y: 70 },
      { id: "rcb", label: "RCB", x: 62, y: 70 },
      { id: "rb", label: "RB", x: 86, y: 70 },
      { id: "lm", label: "LM", x: 15, y: 46 },
      { id: "lcm", label: "LCM", x: 38, y: 46 },
      { id: "rcm", label: "RCM", x: 62, y: 46 },
      { id: "rm", label: "RM", x: 85, y: 46 },
      { id: "lst", label: "LST", x: 37, y: 20 },
      { id: "rst", label: "RST", x: 63, y: 20 },
    ],
  },
  {
    id: "3-5-2",
    label: "3-5-2",
    slots: [
      { id: "gk", label: "GK", x: 50, y: 90 },
      { id: "lcb", label: "LCB", x: 29, y: 68 },
      { id: "cb", label: "CB", x: 50, y: 68 },
      { id: "rcb", label: "RCB", x: 71, y: 68 },
      { id: "lwb", label: "LWB", x: 12, y: 48 },
      { id: "lcm", label: "LCM", x: 32, y: 46 },
      { id: "cm", label: "CM", x: 50, y: 41 },
      { id: "rcm", label: "RCM", x: 68, y: 46 },
      { id: "rwb", label: "RWB", x: 88, y: 48 },
      { id: "lst", label: "LST", x: 37, y: 18 },
      { id: "rst", label: "RST", x: 63, y: 18 },
    ],
  },
  {
    id: "3-4-3",
    label: "3-4-3",
    slots: [
      { id: "gk", label: "GK", x: 50, y: 90 },
      { id: "lcb", label: "LCB", x: 29, y: 68 },
      { id: "cb", label: "CB", x: 50, y: 68 },
      { id: "rcb", label: "RCB", x: 71, y: 68 },
      { id: "lm", label: "LM", x: 16, y: 46 },
      { id: "lcm", label: "LCM", x: 38, y: 46 },
      { id: "rcm", label: "RCM", x: 62, y: 46 },
      { id: "rm", label: "RM", x: 84, y: 46 },
      { id: "lw", label: "LW", x: 18, y: 24 },
      { id: "st", label: "ST", x: 50, y: 14 },
      { id: "rw", label: "RW", x: 82, y: 24 },
    ],
  },
  {
    id: "4-1-4-1",
    label: "4-1-4-1",
    slots: [
      { id: "gk", label: "GK", x: 50, y: 90 },
      { id: "lb", label: "LB", x: 14, y: 70 },
      { id: "lcb", label: "LCB", x: 38, y: 70 },
      { id: "rcb", label: "RCB", x: 62, y: 70 },
      { id: "rb", label: "RB", x: 86, y: 70 },
      { id: "dm", label: "DM", x: 50, y: 50 },
      { id: "lm", label: "LM", x: 14, y: 32 },
      { id: "lcm", label: "LCM", x: 34, y: 32 },
      { id: "rcm", label: "RCM", x: 66, y: 32 },
      { id: "rm", label: "RM", x: 86, y: 32 },
      { id: "st", label: "ST", x: 50, y: 12 },
    ],
  },
]);

export function normalizePresentationLineupFormation(value = "") {
  const formation = String(value || "").trim();
  return presentationLineupFormationOptions.some((option) => option.id === formation)
    ? formation
    : presentationLineupFormationOptions[0].id;
}

export function normalizePresentationLineupAssignments(lineup = {}) {
  const assignments = lineup && typeof lineup === "object" && !Array.isArray(lineup) ? lineup : {};
  return Object.fromEntries(
    Object.entries(assignments)
      .map(([slotId, playerId]) => [String(slotId || "").trim(), String(playerId || "").trim()])
      .filter(([slotId, playerId]) => slotId && playerId)
  );
}

export function normalizePresentationMatchSquadPlayerIds(value = []) {
  const values = Array.isArray(value)
    ? value
    : value && typeof value === "object"
      ? Object.values(value)
      : String(value || "").split(/\s*(?:,|;|\n)\s*/);
  return [...new Set(values.map((playerId) => String(playerId || "").trim()).filter(Boolean))];
}

export function getPresentationLineupFormation(value = "") {
  const formation = normalizePresentationLineupFormation(value);
  return presentationLineupFormationOptions.find((option) => option.id === formation) || presentationLineupFormationOptions[0];
}
