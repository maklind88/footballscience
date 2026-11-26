import { playerHeaderIcon } from "../components/playerHeaderIcons.js";
import { geometryFromDrag, pointerPercent } from "../services/presentationLayerGeometryService.js";
import { containedVideoRect } from "./timeline.player-pair.geometry.js";
import { clipDrawingTools, MAX_CLIP_DRAWINGS } from "./timeline.clip-drawing.model.js";

const icons = { arrow: "arrowUpRight", spotlight: "focus", line: "minus" };
const toolButton = (key, label, icon, pressed = "") =>
  `<button type="button" data-clip-drawing-${key} aria-label="${label}" title="${label}" ${pressed}>${playerHeaderIcon(icon)}</button>`;

export const renderClipDrawToggle = () => toolButton("toggle", "Draw", "paintbrush", 'aria-expanded="false" aria-controls="clip-drawing-tools" disabled');

export function renderClipDrawingOverlay(canEdit) {
  return `<svg xmlns="http://www.w3.org/2000/svg" class="video-analysis-clip-drawing" data-clip-drawing-overlay aria-hidden="true"></svg>
    ${canEdit ? `<div id="clip-drawing-tools" class="video-analysis-clip-drawing__tools" data-clip-drawing-tools role="group" aria-label="Drawing tools" hidden>
      ${clipDrawingTools.map(tool => toolButton(`tool="${tool}"`, tool[0].toUpperCase() + tool.slice(1), icons[tool], 'aria-pressed="false"')).join("")}
      ${toolButton("undo", "Undo drawing", "undo2")}
    </div>` : ""}`;
}

function shapeMarkup({ tool, geometry }, rect) {
  const x = value => Number((value * rect.width / 100).toFixed(3));
  const y = value => Number((value * rect.height / 100).toFixed(3));
  if (tool === "spotlight") {
    return `<ellipse class="is-spotlight" cx="${x(geometry.cx)}" cy="${y(geometry.cy)}" rx="${x(geometry.rx)}" ry="${y(geometry.ry)}"/>`;
  }
  const x1 = x(geometry.x1), y1 = y(geometry.y1), x2 = x(geometry.x2), y2 = y(geometry.y2);
  const line = `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
  if (tool !== "arrow") return line;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const wing = direction => {
    const a = angle + direction * Math.PI / 5;
    const size = Math.min(14, Math.hypot(x2 - x1, y2 - y1) * .8);
    return `${x2 - size * Math.cos(a)},${y2 - size * Math.sin(a)}`;
  };
  return `${line}<polyline points="${wing(-1)} ${x2},${y2} ${wing(1)}"/>`;
}

export function createClipDrawing({ dialog, getSourceId, getRange, getDrawings, changeDrawings, canDraw, onStart, pause }) {
  const video = dialog.querySelector("[data-video-analysis-clip-preview]");
  const svg = dialog.querySelector("[data-clip-drawing-overlay]");
  const toggle = dialog.querySelector("[data-clip-drawing-toggle]");
  const controls = dialog.querySelector("[data-clip-drawing-tools]");
  const undo = controls?.querySelector("[data-clip-drawing-undo]");
  const win = dialog.ownerDocument.defaultView;
  const events = new win.AbortController();
  const presented = new Set();
  let tool = "arrow";
  let open = false;
  let drag = null;
  let rect = null;
  let lastMarkup = "";
  const listen = (node, name, listener) => node?.addEventListener(name, listener, { signal: events.signal });
  const atFrame = () => Math.round(video.currentTime * 1000);
  const durationHas = atMs => {
    const range = getRange();
    return range && atMs >= Math.floor(range.start) && atMs < range.end - 2;
  };
  const drawingsForSource = sourceId => sourceId
    ? getDrawings().filter(drawing => drawing.sourceId === sourceId && durationHas(drawing.atMs)) : [];

  function paint() {
    const sourceId = video.readyState >= 2 && !video.seeking ? getSourceId() : "";
    if (toggle) {
      toggle.disabled = !sourceId || !canDraw() || !durationHas(atFrame());
      toggle.title = !sourceId ? "Connect the original video to draw" : "Draw";
    }
    const editing = open && sourceId && canDraw() && video.paused && durationHas(atFrame());
    svg.classList.toggle("is-drawing", Boolean(editing));
    if (controls) {
      controls.hidden = !open;
      undo.disabled = !editing || !getDrawings().length;
      for (const button of controls.querySelectorAll("[data-clip-drawing-tool]")) {
        button.disabled = !editing || getDrawings().length >= MAX_CLIP_DRAWINGS;
        button.setAttribute("aria-pressed", String(button.dataset.clipDrawingTool === tool));
      }
    }
    const drawings = video.paused ? drawingsForSource(sourceId).filter(item => Math.abs(item.atMs - atFrame()) <= 17) : [];
    if (drag && editing && drag.geometry) drawings.push({ tool, geometry: drag.geometry });
    const markup = rect ? drawings.map(item => shapeMarkup(item, rect)).join("") : "";
    if (markup !== lastMarkup) { svg.innerHTML = markup; lastMarkup = markup; }
  }

  function size() {
    const { width, height } = video.getBoundingClientRect();
    rect = containedVideoRect(width, height, video.videoWidth, video.videoHeight);
    if (rect) {
      svg.setAttribute("viewBox", `0 0 ${rect.width} ${rect.height}`);
      Object.assign(svg.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    }
    paint();
  }

  function dismiss() {
    if (!open) return false;
    open = false;
    drag = null;
    toggle?.setAttribute("aria-expanded", "false");
    paint();
    return true;
  }

  function updateDrag(event) {
    if (drag?.id !== event.pointerId) return;
    const point = pointerPercent(event, svg);
    if (Math.hypot(point.x - drag.start.x, point.y - drag.start.y) < .75 && tool !== "spotlight") {
      drag.geometry = null;
    } else {
      drag.geometry = geometryFromDrag(tool === "line" ? "arrow" : tool, drag.start, point);
    }
  }

  listen(toggle, "click", () => {
    if (dismiss() || toggle.disabled) return;
    onStart();
    pause();
    open = true;
    toggle.setAttribute("aria-expanded", "true");
    paint();
  });
  listen(controls, "click", event => {
    const button = event.target.closest("[data-clip-drawing-tool]");
    if (button) { drag = null; tool = button.dataset.clipDrawingTool; paint(); }
    if (event.target.closest("[data-clip-drawing-undo]") && !undo.disabled) {
      changeDrawings(getDrawings().slice(0, -1));
      paint();
    }
  });
  listen(svg, "pointerdown", event => {
    if (!svg.classList.contains("is-drawing") || drag || event.button !== 0
      || getDrawings().length >= MAX_CLIP_DRAWINGS) return;
    event.preventDefault();
    svg.setPointerCapture(event.pointerId);
    drag = { id: event.pointerId, start: pointerPercent(event, svg), sourceId: getSourceId(), atMs: atFrame() };
  });
  listen(svg, "pointermove", event => { if (drag) { updateDrag(event); paint(); } });
  listen(svg, "pointerup", event => {
    if (drag?.id !== event.pointerId) return;
    updateDrag(event);
    const { geometry, atMs, sourceId } = drag;
    drag = null;
    if (geometry && sourceId && sourceId === getSourceId() && atMs === atFrame() && canDraw()) {
      changeDrawings([...getDrawings(), { tool, geometry, sourceId, atMs }]);
    }
    paint();
  });
  listen(svg, "lostpointercapture", () => { drag = null; paint(); });
  for (const event of ["play", "seeking", "emptied"]) listen(video, event, () => { dismiss(); paint(); });
  for (const event of ["loadeddata", "resize"]) listen(video, event, size);
  for (const event of ["pause", "seeked", "error"]) listen(video, event, paint);
  const observer = new win.ResizeObserver(size);
  observer.observe(video);
  size();

  return {
    dismiss, refresh: paint,
    resetPresentation: () => presented.clear(),
    nextPausePoint(from, to) {
      const at = drawingsForSource(getSourceId()).map(item => item.atMs).sort((a, b) => a - b)
        .find(time => time >= from - .5 && time <= to && !presented.has(time));
      if (at !== undefined) presented.add(at);
      return at;
    },
    dispose() { events.abort(); observer.disconnect(); },
  };
}
