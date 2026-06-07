function defaultClamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return min;
  }
  return Math.min(max, Math.max(min, number));
}

function createDefaultLineState() {
  return {
    color: "#0d4f86",
    lineWidth: 1.1,
    lineStyle: "solid",
  };
}

const defaultPitchModeOptions = [
  { key: "full", label: "Full pitch", dimensions: { x: 65, y: 105 }, landscape: false },
];

function getPitchModeKeys(options = []) {
  return new Set(options.map((option) => option.key).filter(Boolean));
}

export function createSessionPlannerTacticalHelpers(options = {}) {
  const clamp = typeof options.clamp === "function" ? options.clamp : defaultClamp;
  const getLineState = typeof options.getLineState === "function" ? options.getLineState : createDefaultLineState;
  const getSelectedBlock = typeof options.getSelectedBlock === "function" ? options.getSelectedBlock : () => ({});
  const tacticalPitchModeOptions = Array.isArray(options.tacticalPitchModeOptions) && options.tacticalPitchModeOptions.length
    ? options.tacticalPitchModeOptions
    : defaultPitchModeOptions;
  const tacticalPitchModeKeys = options.tacticalPitchModeKeys instanceof Set
    ? options.tacticalPitchModeKeys
    : getPitchModeKeys(tacticalPitchModeOptions);
  const tacticalMaxFrames = Number.isFinite(Number(options.tacticalMaxFrames))
    ? Math.max(1, Math.floor(Number(options.tacticalMaxFrames)))
    : 12;

  function getDefaultTacticalColor(type = "blue-player") {
    const colors = {
      "blue-player": "#1d8bff",
      "red-player": "#ff4f4f",
      "neutral-player": "#fbbf24",
      coach: "#1d1d1f",
      ball: "#1d1d1f",
      cone: "#f97316",
      "mini-goal": "#1d1d1f",
      "big-goal": "#1d1d1f",
      mannequin: "#111827",
      pole: "#f59e0b",
      gate: "#10b981",
      "dashed-line": "#111827",
      zone: "#f59e0b",
      "dashed-zone": "#111827",
      ellipse: "#22c55e",
      arrow: "#111827",
      pass: "#2563eb",
      run: "#111827",
      line: "#111827",
      curve: "#111827",
      freehand: "#111827",
      text: "#111827",
      remove: "#d92d20",
    };
    return colors[type] || "#111827";
  }

  function normalizeTacticalColor(value, fallback = "#111827") {
    const color = String(value || "").trim();
    return /^#[0-9a-f]{3,8}$/i.test(color) ? color : fallback;
  }

  function normalizeTacticalLineStyle(value) {
    return ["solid", "dashed", "dotted"].includes(value) ? value : "solid";
  }

  function normalizeTacticalLineWidth(value, fallback = 1.1) {
    const number = Number(value);
    return Number.isFinite(number) ? clamp(number, 0.25, 6) : fallback;
  }

  function normalizeTacticalRotation(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return 0;
    }
    return Math.round(((number % 360) + 360) % 360);
  }

  function isSessionPlannerTacticalGoalType(type = "") {
    return type === "mini-goal" || type === "big-goal";
  }

  function isSessionPlannerTacticalPlayerType(type = "") {
    return type === "blue-player" || type === "red-player" || type === "neutral-player";
  }

  function normalizeSessionPlannerTacticalPlayerBadge(value) {
    const raw = String(value ?? "").trim();
    if (!raw) {
      return "";
    }
    return raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 2);
  }

  function getSessionPlannerTacticalPlayerBadgeFromKeyboardEvent(event) {
    if (event.metaKey || event.ctrlKey || event.altKey) {
      return "";
    }
    const key = String(event.key || "");
    return /^[a-zA-Z0-9]$/.test(key) ? key : "";
  }

  function getTacticalStrokeDasharray(lineStyle) {
    if (lineStyle === "dashed") {
      return "3 2";
    }
    if (lineStyle === "dotted") {
      return "0.7 1.6";
    }
    return "";
  }

  function getSessionPlannerTacticalRenderStrokeWidth(value) {
    const logicalWidth = normalizeTacticalLineWidth(value);
    return clamp(logicalWidth * 0.52, 0.16, 3.15);
  }

  function getDefaultTacticalLineStyle(type = "line") {
    if (type === "pass" || type === "dashed-line" || type === "dashed-zone") {
      return "dashed";
    }
    if (type === "freehand") {
      return "solid";
    }
    return "solid";
  }

  function getSessionPlannerTacticalDefaultCurveControlPoint(from = {}, to = {}, bend = 13) {
    const x = Number.isFinite(Number(from.x)) ? Number(from.x) : 50;
    const y = Number.isFinite(Number(from.y)) ? Number(from.y) : 50;
    const x2 = Number.isFinite(Number(to.x)) ? Number(to.x) : x + 10;
    const y2 = Number.isFinite(Number(to.y)) ? Number(to.y) : y;
    const dx = x2 - x;
    const dy = y2 - y;
    const distance = Math.hypot(dx, dy) || 1;
    return {
      x: clamp((x + x2) / 2 + (-dy / distance) * bend, 0, 100),
      y: clamp((y + y2) / 2 + (dx / distance) * bend, 0, 100),
    };
  }

  function getSessionPlannerTacticalCurveControlPoint(element = {}, coordinates = null) {
    if (Number.isFinite(Number(element.controlX)) && Number.isFinite(Number(element.controlY))) {
      return {
        x: clamp(Number(element.controlX), 0, 100),
        y: clamp(Number(element.controlY), 0, 100),
      };
    }
    const from = {
      x: Number.isFinite(Number(coordinates?.x)) ? Number(coordinates.x) : element.x,
      y: Number.isFinite(Number(coordinates?.y)) ? Number(coordinates.y) : element.y,
    };
    const to = {
      x: Number.isFinite(Number(coordinates?.x2)) ? Number(coordinates.x2) : element.x2,
      y: Number.isFinite(Number(coordinates?.y2)) ? Number(coordinates.y2) : element.y2,
    };
    return getSessionPlannerTacticalDefaultCurveControlPoint(from, to);
  }

  function createSessionPlannerLineElement(type, from, to, elementOptions = {}) {
    const lineState = getLineState();
    const element = {
      type,
      x: from.x,
      y: from.y,
      x2: to.x,
      y2: to.y,
      color: lineState.color,
      lineWidth: lineState.lineWidth,
      lineStyle: lineState.lineStyle || getDefaultTacticalLineStyle(type),
    };
    if (type === "curve") {
      const controlPoint = elementOptions.controlPoint || getSessionPlannerTacticalDefaultCurveControlPoint(from, to);
      element.controlX = controlPoint.x;
      element.controlY = controlPoint.y;
    }
    return element;
  }

  function normalizeSessionPlannerTacticalPitchMode(value) {
    const key = String(value || "").trim();
    return tacticalPitchModeKeys.has(key) ? key : "full";
  }

  function getSessionPlannerTacticalPitchModeOption(mode) {
    const normalizedMode = normalizeSessionPlannerTacticalPitchMode(mode);
    return tacticalPitchModeOptions.find((option) => option.key === normalizedMode) ?? tacticalPitchModeOptions[0];
  }

  function getSessionPlannerTacticalPitchDimensionsForBlock(block = getSelectedBlock()) {
    return getSessionPlannerTacticalPitchModeOption(block?.tacticalPitchMode).dimensions;
  }

  function createSessionPlannerStableId(prefix = "item") {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  }

  function cloneSessionPlannerTacticalElement(element = {}) {
    const type = element.type || "blue-player";
    const playerBadge = normalizeSessionPlannerTacticalPlayerBadge(element.playerNumber);
    const points = Array.isArray(element.points)
      ? element.points
        .map((point) => ({
          x: Number.isFinite(Number(point?.x)) ? clamp(Number(point.x), 0, 100) : null,
          y: Number.isFinite(Number(point?.y)) ? clamp(Number(point.y), 0, 100) : null,
        }))
        .filter((point) => point.x !== null && point.y !== null)
      : [];
    return {
      id: element.id || createSessionPlannerStableId("tactical"),
      type,
      x: Number.isFinite(Number(element.x)) ? clamp(Number(element.x), 0, 100) : 50,
      y: Number.isFinite(Number(element.y)) ? clamp(Number(element.y), 0, 100) : 50,
      x2: Number.isFinite(Number(element.x2)) ? clamp(Number(element.x2), 0, 100) : null,
      y2: Number.isFinite(Number(element.y2)) ? clamp(Number(element.y2), 0, 100) : null,
      controlX: Number.isFinite(Number(element.controlX)) ? clamp(Number(element.controlX), 0, 100) : null,
      controlY: Number.isFinite(Number(element.controlY)) ? clamp(Number(element.controlY), 0, 100) : null,
      label: element.label || "",
      playerNumber: playerBadge || null,
      color: normalizeTacticalColor(element.color, getDefaultTacticalColor(type)),
      lineWidth: normalizeTacticalLineWidth(element.lineWidth),
      lineStyle: normalizeTacticalLineStyle(element.lineStyle || getDefaultTacticalLineStyle(type)),
      size: Number.isFinite(Number(element.size)) ? clamp(Number(element.size), 0.75, 1.65) : 1,
      rotation: normalizeTacticalRotation(element.rotation),
      points,
    };
  }

  function normalizeSessionPlannerTacticalFrameLabel(value = "", index = 0) {
    const label = String(value || "").trim().replace(/\s+/g, " ");
    return label || `Frame ${index + 1}`;
  }

  function cloneSessionPlannerTacticalFrame(frame = {}, index = 0) {
    return {
      id: String(frame.id || "").trim() || createSessionPlannerStableId("tactical-frame"),
      label: normalizeSessionPlannerTacticalFrameLabel(frame.label, index),
      elements: Array.isArray(frame.elements)
        ? frame.elements.map(cloneSessionPlannerTacticalElement)
        : [],
    };
  }

  function normalizeSessionPlannerTacticalFrames(frames = []) {
    if (!Array.isArray(frames)) {
      return [];
    }
    const usedIds = new Set();
    return frames
      .filter((frame) => frame && typeof frame === "object" && !Array.isArray(frame))
      .slice(0, tacticalMaxFrames)
      .map((frame, index) => {
        const clonedFrame = cloneSessionPlannerTacticalFrame(frame, index);
        let frameId = clonedFrame.id;
        while (usedIds.has(frameId)) {
          frameId = createSessionPlannerStableId("tactical-frame");
        }
        usedIds.add(frameId);
        return {
          ...clonedFrame,
          id: frameId,
        };
      });
  }

  function normalizeSessionPlannerTacticalActiveFrameId(activeFrameId = "", frames = []) {
    const normalizedId = String(activeFrameId || "").trim();
    return frames.some((frame) => frame.id === normalizedId) ? normalizedId : frames[0]?.id || "";
  }

  return {
    cloneTacticalElement: cloneSessionPlannerTacticalElement,
    cloneTacticalFrame: cloneSessionPlannerTacticalFrame,
    createLineElement: createSessionPlannerLineElement,
    createStableId: createSessionPlannerStableId,
    getDefaultTacticalColor,
    getDefaultTacticalLineStyle,
    getTacticalCurveControlPoint: getSessionPlannerTacticalCurveControlPoint,
    getTacticalDefaultCurveControlPoint: getSessionPlannerTacticalDefaultCurveControlPoint,
    getTacticalPitchDimensionsForBlock: getSessionPlannerTacticalPitchDimensionsForBlock,
    getTacticalPitchModeOption: getSessionPlannerTacticalPitchModeOption,
    getTacticalRenderStrokeWidth: getSessionPlannerTacticalRenderStrokeWidth,
    getTacticalStrokeDasharray,
    getTacticalPlayerBadgeFromKeyboardEvent: getSessionPlannerTacticalPlayerBadgeFromKeyboardEvent,
    isTacticalGoalType: isSessionPlannerTacticalGoalType,
    isTacticalPlayerType: isSessionPlannerTacticalPlayerType,
    normalizeTacticalActiveFrameId: normalizeSessionPlannerTacticalActiveFrameId,
    normalizeTacticalColor,
    normalizeTacticalFrameLabel: normalizeSessionPlannerTacticalFrameLabel,
    normalizeTacticalFrames: normalizeSessionPlannerTacticalFrames,
    normalizeTacticalLineStyle,
    normalizeTacticalLineWidth,
    normalizeTacticalPitchMode: normalizeSessionPlannerTacticalPitchMode,
    normalizeTacticalPlayerBadge: normalizeSessionPlannerTacticalPlayerBadge,
    normalizeTacticalRotation,
  };
}
