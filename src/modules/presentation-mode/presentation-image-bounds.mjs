// Image geometry uses slide percentages and allows bleed beyond the canvas.
export function imageBounds({ x = 12, y = 22, width = 34, height = 24 } = {}) {
  const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  width = Math.min(200, Math.max(2, finite(width, 34)));
  height = Math.min(300, Math.max(2, finite(height, 24)));
  return {
    x: Math.min(100 - Math.min(10, width), Math.max(Math.min(10, width) - width, finite(x, 12))),
    y: Math.min(100 - Math.min(10, height), Math.max(Math.min(10, height) - height, finite(y, 22))),
    width, height,
  };
}

export function resizeImageBounds(resize, event) {
  const axis = resize.axis || "se";
  const dx = (event.clientX - resize.startClientX) / resize.slideWidth * 100;
  const dy = (event.clientY - resize.startClientY) / resize.slideHeight * 100;
  const sx = (axis.includes("w") ? -dx : dx) / resize.startWidth;
  const sy = (axis.includes("n") ? -dy : dy) / resize.startHeight;
  const horizontal = /[ew]/.test(axis);
  const vertical = /[ns]/.test(axis);
  const change = horizontal && vertical ? (Math.abs(sx) >= Math.abs(sy) ? sx : sy) : horizontal ? sx : sy;
  const scale = Math.max(2 / resize.startWidth, 2 / resize.startHeight,
    Math.min(200 / resize.startWidth, 300 / resize.startHeight, 1 + change));
  const width = resize.startWidth * scale;
  const height = resize.startHeight * scale;
  return {
    ...imageBounds({
      x: resize.startX - (axis.includes("w") ? width - resize.startWidth : 0),
      y: resize.startY - (axis.includes("n") ? height - resize.startHeight : 0),
      width, height,
    }),
    fontSize: resize.startFontSize,
  };
}
