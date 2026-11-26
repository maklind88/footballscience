export const clipDrawingTools = Object.freeze(["arrow", "spotlight", "line"]);
export const MAX_CLIP_DRAWINGS = 24;

export function normalizeClipDrawings(value) {
  if (!Array.isArray(value)) return [];
  const drawings = [];
  for (const drawing of value.slice(0, MAX_CLIP_DRAWINGS)) {
    if (!drawing || !clipDrawingTools.includes(drawing.tool)
      || typeof drawing.sourceId !== "string" || !/^local-video-[a-f0-9]{40}$/.test(drawing.sourceId)
      || !Number.isSafeInteger(drawing.atMs) || drawing.atMs < 0) continue;
    const keys = drawing.tool === "spotlight" ? ["cx", "cy", "rx", "ry"] : ["x1", "y1", "x2", "y2"];
    const geometry = drawing.geometry;
    if (!geometry || !keys.every(key => Number.isFinite(geometry[key]) && geometry[key] >= 0 && geometry[key] <= 100)
      || (drawing.tool === "spotlight" && (!geometry.rx || !geometry.ry))) continue;
    drawings.push({ tool: drawing.tool, sourceId: drawing.sourceId, atMs: drawing.atMs,
      geometry: Object.fromEntries(keys.map(key => [key, Math.round(geometry[key] * 1000) / 1000])) });
  }
  return drawings;
}
