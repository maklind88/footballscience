const MY_TEAM_PITCH_LAYOUTS = {
  "4-3-3": {
    GK: [50, 86],
    LB: [14, 70],
    LCB: [38, 74],
    RCB: [62, 74],
    RB: [86, 70],
    DMF: [50, 57],
    LCMF: [36, 45],
    RCMF: [64, 45],
    LW: [13, 23],
    CF: [50, 14],
    RW: [87, 23],
  },
  "4-2-3-1": {
    GK: [50, 86],
    LB: [14, 70],
    LCB: [38, 74],
    RCB: [62, 74],
    RB: [86, 70],
    DMF: [42, 57],
    RCMF: [58, 57],
    LCMF: [50, 40],
    LW: [13, 29],
    CF: [50, 14],
    RW: [87, 29],
  },
  "3-4-3": {
    GK: [50, 86],
    LCB: [32, 74],
    DMF: [50, 76],
    RCB: [68, 74],
    LB: [12, 51],
    LCMF: [41, 50],
    RCMF: [59, 50],
    RB: [88, 51],
    LW: [14, 23],
    CF: [50, 14],
    RW: [86, 23],
  },
  "3-5-2": {
    GK: [50, 86],
    LCB: [32, 74],
    DMF: [50, 76],
    RCB: [68, 74],
    LB: [12, 51],
    LCMF: [38, 48],
    RW: [50, 41],
    RCMF: [62, 48],
    RB: [88, 51],
    CF: [57, 16],
    LW: [43, 16],
  },
  "4-4-2": {
    GK: [50, 86],
    LB: [14, 70],
    LCB: [38, 74],
    RCB: [62, 74],
    RB: [86, 70],
    LW: [13, 43],
    LCMF: [40, 43],
    RCMF: [60, 43],
    RW: [87, 43],
    CF: [57, 16],
    DMF: [43, 16],
  },
};

function normalizeControllerText(value = "", limit = 160, normalizeText = null) {
  if (typeof normalizeText === "function") {
    return normalizeText(value, limit);
  }
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
}

export function createScoutingMyTeamPitchService(deps = {}) {
  function normalizeText(value = "", limit = 160) {
    return normalizeControllerText(value, limit, deps.normalizeText);
  }

  function normalizeFormation(value = "") {
    return deps.normalizeFormation?.(value) || "4-3-3";
  }

  function normalizePitchCoordinate(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return null;
    }
    return Math.max(4, Math.min(96, Math.round(number * 100) / 100));
  }

  function getSlotPitchPosition(slot = {}, formation = "4-3-3") {
    const role = normalizeText(slot?.label || slot?.id, 40).toUpperCase();
    const normalizedFormation = normalizeFormation(formation);
    const override = deps.getMyTeamState?.()?.positions?.[normalizedFormation]?.[slot?.id];
    if (Number.isFinite(override?.x) && Number.isFinite(override?.y)) {
      return {
        x: normalizePitchCoordinate(override.x),
        y: normalizePitchCoordinate(override.y),
      };
    }
    const coordinates = MY_TEAM_PITCH_LAYOUTS[normalizedFormation]?.[role] || [Number(slot?.x) || 50, Number(slot?.y) || 50];
    return { x: coordinates[0], y: coordinates[1] };
  }

  function getPointerPitchPosition(event, pitchElement) {
    const rect = pitchElement?.getBoundingClientRect?.();
    if (!rect?.width || !rect?.height) {
      return null;
    }
    const x = normalizePitchCoordinate(((event.clientX - rect.left) / rect.width) * 100);
    const y = normalizePitchCoordinate(((event.clientY - rect.top) / rect.height) * 100);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }
    return { x, y };
  }

  function previewSlotPitchPosition(slotElement, coordinates) {
    if (!slotElement || !coordinates) {
      return false;
    }
    slotElement.style?.setProperty?.("--x", `${coordinates.x}%`);
    slotElement.style?.setProperty?.("--y", `${coordinates.y}%`);
    return true;
  }

  function getAssignedIds(state = deps.ensureState?.()) {
    const myTeam = deps.getMyTeamState?.(state);
    const slots = myTeam?.slots && typeof myTeam.slots === "object" ? myTeam.slots : {};
    return new Set(Object.values(slots).flatMap((slotValue) => deps.normalizeSlotPlayerIds?.(slotValue) || []).filter(Boolean));
  }

  return {
    getAssignedIds,
    getPointerPitchPosition,
    getSlotPitchPosition,
    normalizePitchCoordinate,
    previewSlotPitchPosition,
  };
}
