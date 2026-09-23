export const VIDEO_SHUTTLE_MIN_SPEED = 4;
const VIDEO_SHUTTLE_MAX_SPEED = 7;
const VIDEO_SHUTTLE_SPEED_DELTA_PX = 60;
export const VIDEO_SHUTTLE_MIN_DELTA_PX = 6;
const VIDEO_SHUTTLE_CONTAIN_DELTA_PX = 2;
const VIDEO_SHUTTLE_CONTAIN_RATIO = 0.6;
const VIDEO_SHUTTLE_DOMINANCE_RATIO = 1.35;
export const VIDEO_SHUTTLE_IDLE_MS = 520;
export const VIDEO_SHUTTLE_MAX_FRAME_MS = 80;

function wheelDeltaPixelValue(value = 0, deltaMode = 0) {
  const numeric = Number(value || 0);
  if (!numeric) return 0;
  if (Number(deltaMode) === 1) return numeric * 16;
  if (Number(deltaMode) === 2) return numeric * 800;
  return numeric;
}

function wheelDeltaX(event = {}) {
  if ("deltaX" in event) return Number(event.deltaX || 0);
  const wheelDeltaXValue = Number(event.wheelDeltaX || 0);
  return wheelDeltaXValue ? -wheelDeltaXValue : 0;
}

function wheelDeltaY(event = {}) {
  if ("deltaY" in event) return Number(event.deltaY || 0);
  const wheelDeltaYValue = Number(event.wheelDeltaY || event.wheelDelta || 0);
  return wheelDeltaYValue ? -wheelDeltaYValue : 0;
}

export function videoShuttleHorizontalDelta(event = {}) {
  const deltaMode = Number(event.deltaMode || 0);
  const deltaX = wheelDeltaPixelValue(wheelDeltaX(event), deltaMode);
  const deltaY = wheelDeltaPixelValue(wheelDeltaY(event), deltaMode);
  if (event.shiftKey && Math.abs(deltaY) >= VIDEO_SHUTTLE_MIN_DELTA_PX) return deltaY;
  if (Math.abs(deltaX) < Math.max(VIDEO_SHUTTLE_MIN_DELTA_PX, Math.abs(deltaY) * VIDEO_SHUTTLE_DOMINANCE_RATIO)) return 0;
  return deltaX;
}

export function videoShuttleHasHorizontalIntent(event = {}) {
  const deltaMode = Number(event.deltaMode || 0);
  const deltaX = wheelDeltaPixelValue(wheelDeltaX(event), deltaMode);
  const deltaY = wheelDeltaPixelValue(wheelDeltaY(event), deltaMode);
  if (event.shiftKey && Math.abs(deltaY) >= VIDEO_SHUTTLE_CONTAIN_DELTA_PX) return true;
  return Math.abs(deltaX) >= VIDEO_SHUTTLE_CONTAIN_DELTA_PX
    && Math.abs(deltaX) >= Math.abs(deltaY) * VIDEO_SHUTTLE_CONTAIN_RATIO;
}

export function videoShuttleSpeedFromDelta(deltaPx = 0) {
  const intensity = Math.min(1, Math.abs(Number(deltaPx || 0)) / VIDEO_SHUTTLE_SPEED_DELTA_PX);
  const speed = VIDEO_SHUTTLE_MIN_SPEED + ((VIDEO_SHUTTLE_MAX_SPEED - VIDEO_SHUTTLE_MIN_SPEED) * intensity);
  return Math.round(speed * 10) / 10;
}
