function defaultEscapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function clamp(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : min;
}

export const tacticalBoardPitchDimensions = {
  length: 105,
  width: 65,
};

export const tacticalBoardPitchModeOptions = [
  { key: "full", label: "Full pitch", dimensions: { x: 65, y: 105 }, landscape: false },
  { key: "full-wide", label: "Full pitch wide", dimensions: { x: 105, y: 65 }, landscape: true },
  { key: "attacking-half", label: "Attacking half", dimensions: { x: 65, y: 52.5 }, landscape: false },
  { key: "defending-half", label: "Defending half", dimensions: { x: 65, y: 52.5 }, landscape: false },
  { key: "goalkeeper", label: "Goalkeeper box", dimensions: { x: 65, y: 33 }, landscape: false },
];

export const tacticalBoardPitchModeKeys = new Set(tacticalBoardPitchModeOptions.map((option) => option.key));

export function normalizeTacticalBoardPitchMode(value = "attacking-half", fallback = "attacking-half") {
  const aliases = {
    half: "attacking-half",
    "final-third": "attacking-half",
    box: "goalkeeper",
  };
  const normalized = String(value || fallback).trim();
  const resolved = aliases[normalized] || normalized;
  return tacticalBoardPitchModeKeys.has(resolved) ? resolved : fallback;
}

export function getTacticalBoardPitchModeOption(mode = "attacking-half", fallback = "attacking-half") {
  const normalized = normalizeTacticalBoardPitchMode(mode, fallback);
  return tacticalBoardPitchModeOptions.find((option) => option.key === normalized)
    || tacticalBoardPitchModeOptions.find((option) => option.key === fallback)
    || tacticalBoardPitchModeOptions[0];
}

export function tacticalBoardPitchModeLabel(mode = "attacking-half", fallback = "attacking-half") {
  return getTacticalBoardPitchModeOption(mode, fallback).label;
}

export function tacticalBoardPitchMeasurementLabel(mode = "attacking-half") {
  const option = getTacticalBoardPitchModeOption(mode);
  return `${option.dimensions.x} x ${option.dimensions.y} m`;
}

export function renderTacticalBoardArrowMarkerDef(markerId = "tactical-board-arrow", options = {}) {
  const escapeHtml = typeof options.escapeHtml === "function" ? options.escapeHtml : defaultEscapeHtml;
  return `
    <marker id="${escapeHtml(markerId)}" markerWidth="6" markerHeight="6" refX="5.45" refY="3" orient="auto" markerUnits="strokeWidth" viewBox="0 0 6 6">
      <path d="M0.75,0.6 L5.45,3 L0.75,5.4 Z" fill="context-stroke" stroke="context-stroke" stroke-width="0.22" stroke-linejoin="round"></path>
    </marker>
  `;
}

export function renderTacticalBoardPitchSvgLines(mode = "attacking-half", options = {}) {
  const escapeHtml = typeof options.escapeHtml === "function" ? options.escapeHtml : defaultEscapeHtml;
  const pitchMode = normalizeTacticalBoardPitchMode(mode);
  const className = String(options.className || "").trim();
  const label = String(options.ariaLabel || "Tactical pitch lines").trim();
  const rootClass = [
    "session-pitch-diagram",
    `session-pitch-diagram-mode-${pitchMode}`,
    "tactical-board-pitch-lines",
    className,
  ].filter(Boolean).join(" ");
  const isWide = pitchMode === "full-wide";
  const includeTop = ["full", "attacking-half", "goalkeeper"].includes(pitchMode);
  const includeBottom = ["full", "defending-half"].includes(pitchMode);
  const includeCenter = ["full", "full-wide"].includes(pitchMode);
  const includeHalfLine = !["goalkeeper"].includes(pitchMode);
  if (isWide) {
    return `
      <g class="${escapeHtml(rootClass)}" aria-label="${escapeHtml(label)}">
        <rect class="session-pitch-touchline" x="3" y="3" width="94" height="94" rx="1.1"></rect>
        <line class="session-pitch-halfway-line" x1="50" y1="3" x2="50" y2="97"></line>
        <circle class="session-pitch-centre-circle" cx="50" cy="50" r="8.8"></circle>
        <circle class="session-pitch-centre-spot" cx="50" cy="50" r=".55"></circle>
        <rect class="session-pitch-goal session-pitch-goal-top" x=".8" y="44.4" width="2.2" height="11.2" rx=".35"></rect>
        <rect class="session-pitch-goal session-pitch-goal-bottom" x="97" y="44.4" width="2.2" height="11.2" rx=".35"></rect>
        <rect class="session-pitch-box session-pitch-box-top" x="3" y="20.35" width="15.7" height="59.3"></rect>
        <rect class="session-pitch-box session-pitch-box-bottom" x="81.3" y="20.35" width="15.7" height="59.3"></rect>
        <rect class="session-pitch-goal-area session-pitch-goal-area-top" x="3" y="36.55" width="5.25" height="26.9"></rect>
        <rect class="session-pitch-goal-area session-pitch-goal-area-bottom" x="91.75" y="36.55" width="5.25" height="26.9"></rect>
        <circle class="session-pitch-penalty-spot session-pitch-penalty-spot-top" cx="13.48" cy="50" r=".55"></circle>
        <circle class="session-pitch-penalty-spot session-pitch-penalty-spot-bottom" cx="86.52" cy="50" r=".55"></circle>
      </g>
    `;
  }
  return `
    <g class="${escapeHtml(rootClass)}" aria-label="${escapeHtml(label)}">
      <rect class="session-pitch-touchline" x="3" y="3" width="94" height="94" rx="1.1"></rect>
      ${includeHalfLine ? `<line class="session-pitch-halfway-line" x1="3" y1="${pitchMode === "attacking-half" ? "97" : pitchMode === "defending-half" ? "3" : "50"}" x2="97" y2="${pitchMode === "attacking-half" ? "97" : pitchMode === "defending-half" ? "3" : "50"}"></line>` : ""}
      ${includeCenter ? '<circle class="session-pitch-centre-circle" cx="50" cy="50" r="8.8"></circle><circle class="session-pitch-centre-spot" cx="50" cy="50" r=".55"></circle>' : ""}
      ${pitchMode === "attacking-half" ? '<circle class="session-pitch-centre-circle session-pitch-centre-circle-partial" cx="50" cy="97" r="8.8"></circle>' : ""}
      ${pitchMode === "defending-half" ? '<circle class="session-pitch-centre-circle session-pitch-centre-circle-partial" cx="50" cy="3" r="8.8"></circle>' : ""}
      ${includeTop ? `
        <rect class="session-pitch-goal session-pitch-goal-top" x="44.4" y=".8" width="11.2" height="2.2" rx=".35"></rect>
        <rect class="session-pitch-box session-pitch-box-top" x="20.35" y="3" width="59.3" height="${pitchMode === "goalkeeper" ? "50" : "15.7"}"></rect>
        <rect class="session-pitch-goal-area session-pitch-goal-area-top" x="36.55" y="3" width="26.9" height="${pitchMode === "goalkeeper" ? "16.7" : "5.25"}"></rect>
        <circle class="session-pitch-penalty-spot session-pitch-penalty-spot-top" cx="50" cy="${pitchMode === "goalkeeper" ? "36.3" : "13.48"}" r=".55"></circle>
      ` : ""}
      ${includeBottom ? `
        <rect class="session-pitch-goal session-pitch-goal-bottom" x="44.4" y="97" width="11.2" height="2.2" rx=".35"></rect>
        <rect class="session-pitch-box session-pitch-box-bottom" x="20.35" y="81.3" width="59.3" height="15.7"></rect>
        <rect class="session-pitch-goal-area session-pitch-goal-area-bottom" x="36.55" y="91.75" width="26.9" height="5.25"></rect>
        <circle class="session-pitch-penalty-spot session-pitch-penalty-spot-bottom" cx="50" cy="86.52" r=".55"></circle>
      ` : ""}
    </g>
  `;
}

export function tacticalBoardDefaultCurveControlPoint(from = {}, to = {}, options = {}) {
  const bend = Number.isFinite(Number(options.bend)) ? Number(options.bend) : 13;
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

function tacticalBoardSvgNumber(value, fallback = 50, localClamp = clamp) {
  return Number.isFinite(Number(value)) ? localClamp(Number(value), 0, 100) : fallback;
}

function defaultIsTacticalBoardEndpointElement(element = {}) {
  return Boolean(element && [
    "arrow",
    "pass",
    "run",
    "line",
    "dashed-line",
    "curve",
    "zone",
    "dashed-zone",
    "ellipse",
  ].includes(element.type));
}

function tacticalBoardClassName(baseClassName = "", element = {}, slot = "element", options = {}) {
  const getClassName = typeof options.getClassName === "function" ? options.getClassName : null;
  const className = getClassName ? getClassName(baseClassName, element, slot) : baseClassName;
  return defaultEscapeHtml(String(className || "").trim());
}

function tacticalBoardAttributes(element = {}, slot = "element", options = {}) {
  const getAttributes = typeof options.getAttributes === "function" ? options.getAttributes : null;
  const attributes = getAttributes ? String(getAttributes(element, slot) || "").trim() : "";
  return attributes ? ` ${attributes}` : "";
}

export function getTacticalBoardElementEndpointCoordinates(element = {}, options = {}) {
  const isEndpointElement =
    typeof options.isEndpointElement === "function"
      ? options.isEndpointElement
      : defaultIsTacticalBoardEndpointElement;
  if (!isEndpointElement(element)) {
    return null;
  }
  const localClamp = typeof options.clamp === "function" ? options.clamp : clamp;
  const getCurveControlPoint =
    typeof options.getCurveControlPoint === "function"
      ? options.getCurveControlPoint
      : (candidate = {}, coordinates = null) => {
        if (Number.isFinite(Number(candidate.controlX)) && Number.isFinite(Number(candidate.controlY))) {
          return {
            x: localClamp(Number(candidate.controlX), 0, 100),
            y: localClamp(Number(candidate.controlY), 0, 100),
          };
        }
        return tacticalBoardDefaultCurveControlPoint(
          { x: coordinates?.x ?? candidate.x, y: coordinates?.y ?? candidate.y },
          { x: coordinates?.x2 ?? candidate.x2, y: coordinates?.y2 ?? candidate.y2 },
        );
      };
  const x = tacticalBoardSvgNumber(element.x, 50, localClamp);
  const y = tacticalBoardSvgNumber(element.y, 50, localClamp);
  const hasEndPoint = Number.isFinite(Number(element.x2)) && Number.isFinite(Number(element.y2));
  const isRectangularElement = element.type === "zone" || element.type === "dashed-zone";
  const x2 = hasEndPoint ? localClamp(Number(element.x2), 0, 100) : localClamp(x + (isRectangularElement ? 24 : 10), 0, 100);
  const y2 = hasEndPoint ? localClamp(Number(element.y2), 0, 100) : localClamp(y + (isRectangularElement ? 14 : 0), 0, 100);
  const coordinates = { x, y, x2, y2 };
  if (element.type === "curve") {
    const controlPoint = getCurveControlPoint(element, coordinates);
    return {
      ...coordinates,
      controlX: controlPoint.x,
      controlY: controlPoint.y,
    };
  }
  return coordinates;
}

export function getTacticalBoardSvgElementTagName(element = {}) {
  if (["arrow", "pass", "line", "dashed-line"].includes(element.type)) return "line";
  if (["curve", "run", "freehand"].includes(element.type)) return "path";
  if (["zone", "dashed-zone"].includes(element.type)) return "rect";
  if (element.type === "ellipse") return "ellipse";
  return "";
}

export function getTacticalBoardSvgElementGeometryAttributes(element = {}, markerId = "tactical-board-arrow", options = {}) {
  const localClamp = typeof options.clamp === "function" ? options.clamp : clamp;
  const normalizeColor =
    typeof options.normalizeColor === "function"
      ? options.normalizeColor
      : (value, fallback = "#111827") => {
        const color = String(value || "").trim();
        return /^#[0-9a-f]{3,8}$/i.test(color) ? color : fallback;
      };
  const getDefaultColor =
    typeof options.getDefaultColor === "function" ? options.getDefaultColor : () => "#111827";
  const getRenderStrokeWidth =
    typeof options.getRenderStrokeWidth === "function" ? options.getRenderStrokeWidth : (value) => localClamp(Number(value) || 1.1, 0.16, 3.15);
  const getStrokeDasharray =
    typeof options.getStrokeDasharray === "function" ? options.getStrokeDasharray : () => "";
  const getDefaultLineStyle =
    typeof options.getDefaultLineStyle === "function" ? options.getDefaultLineStyle : () => "solid";
  const getDefaultCurveControlPoint =
    typeof options.getDefaultCurveControlPoint === "function"
      ? options.getDefaultCurveControlPoint
      : tacticalBoardDefaultCurveControlPoint;
  const getCurveControlPoint =
    typeof options.getCurveControlPoint === "function"
      ? options.getCurveControlPoint
      : (candidate = {}, coordinates = null) => getDefaultCurveControlPoint(candidate, coordinates || candidate);
  const coordinates = getTacticalBoardElementEndpointCoordinates(element, {
    clamp: localClamp,
    getCurveControlPoint,
  });
  const x = coordinates?.x ?? tacticalBoardSvgNumber(element.x, 50, localClamp);
  const y = coordinates?.y ?? tacticalBoardSvgNumber(element.y, 50, localClamp);
  const x2 = coordinates?.x2 ?? localClamp(x + 10, 0, 100);
  const y2 = coordinates?.y2 ?? y;
  const color = normalizeColor(element.color, getDefaultColor(element.type));
  const lineWidth = getRenderStrokeWidth(element.lineWidth);
  const dashArray = getStrokeDasharray(element.lineStyle || getDefaultLineStyle(element.type));
  const markerEnd = `url(#${String(markerId || "tactical-board-arrow")})`;
  const baseLineAttributes = {
    stroke: color,
    "stroke-width": String(lineWidth),
  };
  if (dashArray) baseLineAttributes["stroke-dasharray"] = dashArray;
  if (["arrow", "pass", "line", "dashed-line"].includes(element.type)) {
    const attributes = {
      x1: String(x),
      y1: String(y),
      x2: String(x2),
      y2: String(y2),
      ...baseLineAttributes,
    };
    if (element.type !== "line" && element.type !== "dashed-line") {
      attributes["marker-end"] = markerEnd;
    }
    return {
      tagName: "line",
      attributes,
      removeAttributes: ["d", "fill", "rx", "width", "height", "x", "y", "marker-end", "stroke-dasharray"],
    };
  }
  if (element.type === "curve" || element.type === "run") {
    const controlPoint = element.type === "curve"
      ? getCurveControlPoint(element, { x, y, x2, y2 })
      : getDefaultCurveControlPoint({ x, y }, { x: x2, y: y2 });
    const attributes = {
      d: `M ${x} ${y} Q ${controlPoint.x} ${controlPoint.y} ${x2} ${y2}`,
      fill: "none",
      ...baseLineAttributes,
    };
    if (element.type === "run") {
      attributes["marker-end"] = markerEnd;
    }
    return {
      tagName: "path",
      attributes,
      removeAttributes: ["x1", "y1", "x2", "y2", "rx", "width", "height", "x", "y", "marker-end", "stroke-dasharray"],
    };
  }
  if (element.type === "zone" || element.type === "dashed-zone") {
    const rectX = Math.min(x, x2);
    const rectY = Math.min(y, y2);
    const rectWidth = Math.max(Math.abs(x2 - x), 4);
    const rectHeight = Math.max(Math.abs(y2 - y), 4);
    const attributes = {
      x: String(rectX),
      y: String(rectY),
      width: String(rectWidth),
      height: String(rectHeight),
      rx: "3",
      fill: element.type === "dashed-zone" ? "none" : color,
      stroke: color,
      "stroke-width": String(Math.max(0.16, lineWidth * 0.72)),
    };
    if (dashArray) attributes["stroke-dasharray"] = dashArray;
    return {
      tagName: "rect",
      attributes,
      removeAttributes: ["d", "x1", "y1", "x2", "y2", "marker-end", "stroke-dasharray"],
    };
  }
  return { tagName: getTacticalBoardSvgElementTagName(element), attributes: {}, removeAttributes: [] };
}

export function applyTacticalBoardSvgElementGeometry(node, element = {}, markerId = "tactical-board-arrow", options = {}) {
  const model = getTacticalBoardSvgElementGeometryAttributes(element, markerId, options);
  if (!node || !model.tagName || typeof node.setAttribute !== "function") return false;
  if (String(node.tagName || "").toLowerCase() !== model.tagName) return false;
  const attributes = model.attributes || {};
  model.removeAttributes?.forEach?.((name) => {
    if (!Object.prototype.hasOwnProperty.call(attributes, name)) {
      node.removeAttribute?.(name);
    }
  });
  Object.entries(attributes).forEach(([name, value]) => {
    node.setAttribute(name, String(value));
  });
  return true;
}

export function renderTacticalBoardSvgElement(element = {}, markerId = "tactical-board-arrow", options = {}) {
  const escapeHtml = typeof options.escapeHtml === "function" ? options.escapeHtml : defaultEscapeHtml;
  const localClamp = typeof options.clamp === "function" ? options.clamp : clamp;
  const isSelected = typeof options.isSelected === "function" ? options.isSelected : () => false;
  const normalizeColor =
    typeof options.normalizeColor === "function"
      ? options.normalizeColor
      : (value, fallback = "#111827") => {
        const color = String(value || "").trim();
        return /^#[0-9a-f]{3,8}$/i.test(color) ? color : fallback;
      };
  const getDefaultColor =
    typeof options.getDefaultColor === "function" ? options.getDefaultColor : () => "#111827";
  const getRenderStrokeWidth =
    typeof options.getRenderStrokeWidth === "function" ? options.getRenderStrokeWidth : (value) => localClamp(Number(value) || 1.1, 0.16, 3.15);
  const getStrokeDasharray =
    typeof options.getStrokeDasharray === "function" ? options.getStrokeDasharray : () => "";
  const getDefaultLineStyle =
    typeof options.getDefaultLineStyle === "function" ? options.getDefaultLineStyle : () => "solid";
  const getDefaultCurveControlPoint =
    typeof options.getDefaultCurveControlPoint === "function"
      ? options.getDefaultCurveControlPoint
      : tacticalBoardDefaultCurveControlPoint;
  const getCurveControlPoint =
    typeof options.getCurveControlPoint === "function"
      ? options.getCurveControlPoint
      : (candidate = {}, coordinates = null) => getDefaultCurveControlPoint(candidate, coordinates || candidate);
  const dataAttributeName = String(options.dataAttributeName || "data-tactical-board-element-id");
  const classPrefix = String(options.classPrefix || "tactical-board");
  const hitTargetClassName = String(options.hitTargetClassName || `${classPrefix}-hit-target`);
  const shapeHitTargetClassName = String(options.shapeHitTargetClassName || `${classPrefix}-shape-hit-target`);
  const idAttribute = `${dataAttributeName}="${escapeHtml(element.id)}"`;
  const selectedClass = isSelected(element.id) ? " is-selected" : "";
  const previewClass = element.preview ? " is-preview" : "";
  const coordinates = getTacticalBoardElementEndpointCoordinates(element, {
    clamp: localClamp,
    getCurveControlPoint,
  });
  const x = coordinates?.x ?? tacticalBoardSvgNumber(element.x, 50, localClamp);
  const y = coordinates?.y ?? tacticalBoardSvgNumber(element.y, 50, localClamp);
  const x2 = coordinates?.x2 ?? localClamp(x + 10, 0, 100);
  const y2 = coordinates?.y2 ?? y;
  const color = normalizeColor(element.color, getDefaultColor(element.type));
  const lineWidth = getRenderStrokeWidth(element.lineWidth);
  const dashArray = getStrokeDasharray(element.lineStyle || getDefaultLineStyle(element.type));
  const dashAttribute = dashArray ? `stroke-dasharray="${escapeHtml(dashArray)}"` : "";
  const elementAttributes = tacticalBoardAttributes(element, "element", options);
  const hitTargetAttributes = tacticalBoardAttributes(element, "hit-target", options);
  if (["arrow", "pass", "line", "dashed-line"].includes(element.type)) {
    const shouldUseArrow = element.type !== "line" && element.type !== "dashed-line";
    return `
      <line
        ${idAttribute}${elementAttributes}
        class="${tacticalBoardClassName(`${classPrefix}-${escapeHtml(element.type)}${selectedClass}${previewClass}`, element, "element", options)}"
        x1="${x}"
        y1="${y}"
        x2="${x2}"
        y2="${y2}"
        stroke="${escapeHtml(color)}"
        stroke-width="${lineWidth}"
        ${dashAttribute}
        ${shouldUseArrow ? `marker-end="url(#${escapeHtml(markerId)})"` : ""}
      ></line>
      <line
        ${idAttribute}${hitTargetAttributes}
        class="${tacticalBoardClassName(hitTargetClassName, element, "hit-target", options)}"
        x1="${x}"
        y1="${y}"
        x2="${x2}"
        y2="${y2}"
      ></line>
    `;
  }
  if (element.type === "curve" || element.type === "run") {
    const controlPoint = element.type === "curve"
      ? getCurveControlPoint(element, { x, y, x2, y2 })
      : getDefaultCurveControlPoint({ x, y }, { x: x2, y: y2 });
    const controlX = controlPoint.x;
    const controlY = controlPoint.y;
    return `
      <path
        ${idAttribute}${elementAttributes}
        class="${tacticalBoardClassName(`${classPrefix}-${escapeHtml(element.type)}${selectedClass}${previewClass}`, element, "element", options)}"
        d="M ${x} ${y} Q ${controlX} ${controlY} ${x2} ${y2}"
        stroke="${escapeHtml(color)}"
        stroke-width="${lineWidth}"
        ${dashAttribute}
        ${element.type === "run" ? `marker-end="url(#${escapeHtml(markerId)})"` : ""}
      ></path>
      <path
        ${idAttribute}${hitTargetAttributes}
        class="${tacticalBoardClassName(hitTargetClassName, element, "hit-target", options)}"
        d="M ${x} ${y} Q ${controlX} ${controlY} ${x2} ${y2}"
      ></path>
    `;
  }
  if (element.type === "zone" || element.type === "dashed-zone") {
    const rectX = Math.min(x, x2);
    const rectY = Math.min(y, y2);
    const rectWidth = Math.max(Math.abs(x2 - x), 4);
    const rectHeight = Math.max(Math.abs(y2 - y), 4);
    const isDashedZone = element.type === "dashed-zone";
    return `
      <rect
        ${idAttribute}${elementAttributes}
        class="${tacticalBoardClassName(`${classPrefix}-${escapeHtml(element.type)}${selectedClass}${previewClass}`, element, "element", options)}"
        x="${rectX}"
        y="${rectY}"
        width="${rectWidth}"
        height="${rectHeight}"
        rx="3"
        fill="${isDashedZone ? "none" : escapeHtml(color)}"
        stroke="${escapeHtml(color)}"
        stroke-width="${Math.max(0.16, lineWidth * 0.72)}"
        ${dashAttribute}
      ></rect>
      <rect
        ${idAttribute}${hitTargetAttributes}
        class="${tacticalBoardClassName(`${hitTargetClassName} ${shapeHitTargetClassName}`, element, "hit-target", options)}"
        x="${rectX}"
        y="${rectY}"
        width="${rectWidth}"
        height="${rectHeight}"
        rx="3"
      ></rect>
    `;
  }
  if (element.type === "ellipse") {
    const rectX = Math.min(x, x2);
    const rectY = Math.min(y, y2);
    const rectWidth = Math.max(Math.abs(x2 - x), 5);
    const rectHeight = Math.max(Math.abs(y2 - y), 5);
    return `
      <ellipse
        ${idAttribute}${elementAttributes}
        class="${tacticalBoardClassName(`${classPrefix}-ellipse${selectedClass}${previewClass}`, element, "element", options)}"
        cx="${rectX + rectWidth / 2}"
        cy="${rectY + rectHeight / 2}"
        rx="${rectWidth / 2}"
        ry="${rectHeight / 2}"
        fill="${escapeHtml(color)}"
        stroke="${escapeHtml(color)}"
        stroke-width="${Math.max(0.16, lineWidth * 0.72)}"
        ${dashAttribute}
      ></ellipse>
      <ellipse
        ${idAttribute}${hitTargetAttributes}
        class="${tacticalBoardClassName(`${hitTargetClassName} ${shapeHitTargetClassName}`, element, "hit-target", options)}"
        cx="${rectX + rectWidth / 2}"
        cy="${rectY + rectHeight / 2}"
        rx="${rectWidth / 2}"
        ry="${rectHeight / 2}"
      ></ellipse>
    `;
  }
  if (element.type === "freehand" && Array.isArray(element.points) && element.points.length > 1) {
    const d = element.points
      .map((point, index) => `${index === 0 ? "M" : "L"} ${localClamp(point.x, 0, 100)} ${localClamp(point.y, 0, 100)}`)
      .join(" ");
    return `
      <path
        ${idAttribute}${elementAttributes}
        class="${tacticalBoardClassName(`${classPrefix}-freehand${selectedClass}${previewClass}`, element, "element", options)}"
        d="${escapeHtml(d)}"
        stroke="${escapeHtml(color)}"
        stroke-width="${lineWidth}"
        ${dashAttribute}
      ></path>
      <path
        ${idAttribute}${hitTargetAttributes}
        class="${tacticalBoardClassName(hitTargetClassName, element, "hit-target", options)}"
        d="${escapeHtml(d)}"
      ></path>
    `;
  }
  return "";
}
