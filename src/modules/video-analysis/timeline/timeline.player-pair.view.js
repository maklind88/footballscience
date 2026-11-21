import { playerHeaderIcon } from "../components/playerHeaderIcons.js";
import { containedVideoRect } from "./timeline.player-pair.geometry.js";

export function renderPlayerPairTool() {
  return `<button type="button" data-player-pair-toggle aria-label="Follow two players" title="Follow two players" aria-pressed="false">${playerHeaderIcon("ruler")}</button>`;
}

export function renderPlayerPairOverlay() {
  return `<div class="video-analysis-player-pair" data-player-pair hidden>
    <canvas data-player-pair-canvas aria-label="Player tracking overlay"></canvas>
    <div class="video-analysis-player-pair__status">
      <output data-player-pair-status role="status"></output>
      <button type="button" data-player-pair-retry aria-label="Select two players again" title="Select two players again">${playerHeaderIcon("pencil")}</button>
      <button type="button" data-player-pair-hide aria-label="Hide tracking" title="Hide tracking">${playerHeaderIcon("x")}</button>
    </div>
  </div>`;
}

export function drawPlayerPair(canvas, video, { points, boxes = [], distanceLabel = "" } = {}) {
  const width = canvas.clientWidth, height = canvas.clientHeight;
  const ratio = Math.min(2, canvas.ownerDocument.defaultView.devicePixelRatio || 1);
  if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const rect = containedVideoRect(width, height, video.videoWidth, video.videoHeight);
  if (!rect) return;
  const x = value => rect.x + value * rect.width;
  const y = value => rect.y + value * rect.height;
  ctx.lineWidth = 2;
  const colours = ["#51e6ef", "#ffe36b"];
  if (points) {
    const [a, b] = points.map(point => ({ x: x(point.groundPoint.x), y: y(point.groundPoint.y) }));
    ctx.strokeStyle = "#091510"; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2;
    ctx.stroke();
    if (distanceLabel) {
      const text = distanceLabel;
      ctx.font = "700 14px system-ui";
      const labelWidth = ctx.measureText(text).width + 16;
      const labelX = Math.max(0, Math.min(width - labelWidth, (a.x + b.x - labelWidth) / 2));
      const labelY = Math.max(0, Math.min(height - 26, (a.y + b.y) / 2 - 30));
      ctx.fillStyle = "#091510"; ctx.fillRect(labelX, labelY, labelWidth, 26);
      ctx.fillStyle = "#fff"; ctx.fillText(text, labelX + 8, labelY + 18);
    }
    points.forEach((point, index) => {
      ctx.strokeStyle = colours[index];
      ctx.strokeRect(x(point.x - point.width / 2), y(point.y - point.height / 2), point.width * rect.width, point.height * rect.height);
      ctx.fillStyle = colours[index];
      ctx.beginPath(); ctx.arc(x(point.groundPoint.x), y(point.groundPoint.y), 4, 0, Math.PI * 2); ctx.fill();
    });
  } else boxes.forEach((box, index) => {
    ctx.strokeStyle = colours[index];
    ctx.strokeRect(x(box.left), y(box.top), box.width * rect.width, box.height * rect.height);
  });
}
