import { buildLocalVideoHandleIdentity } from "../services/localVideoSessionService.js";
import { normalizeTimelineLaneMode } from "./timeline.service.js";

const prefix = "footballscience:video-analysis:row-order:v1:";

export function normalizeTimelineRowOrder(value) {
  return [...new Set((Array.isArray(value) ? value : [])
    .filter(key => typeof key === "string" && key.length > 0 && key.length <= 500))].slice(0, 1000);
}

export function orderTimelineLanes(lanes = [], order = []) {
  const positions = new Map(normalizeTimelineRowOrder(order).map((key, index) => [key, index]));
  return lanes.slice().sort((a, b) => (positions.get(a.id) ?? Infinity) - (positions.get(b.id) ?? Infinity));
}

export function moveTimelineRow(order, visibleKeys, source, target, after = false) {
  const visible = normalizeTimelineRowOrder(visibleKeys);
  const current = normalizeTimelineRowOrder([...normalizeTimelineRowOrder(order), ...visible]);
  if (source === target || !visible.includes(source) || !visible.includes(target)) return current;
  const next = current.filter(key => key !== source);
  next.splice(next.indexOf(target) + Number(after), 0, source);
  return next;
}

export function timelineRowOrderScope(state = {}, context = {}) {
  const user = context.getCurrentPlatformUser?.() || context.currentUser || context.user || {};
  const userId = String(user.id || user.userId || user.user_id || user.authId || user.auth_id || "");
  const identity = buildLocalVideoHandleIdentity(state, context, { userId });
  const matchId = String(state.match?.id || state.videoRef?.matchId || identity.matchId || "");
  const parts = [identity.organizationId, identity.teamId, userId, matchId, normalizeTimelineLaneMode(state.timeline?.laneMode)];
  return { key: prefix + JSON.stringify(parts), persistent: Boolean(userId && matchId) };
}

export function createTimelineRowOrderPreferences(getContext) {
  const cache = new Map();

  function read(state) {
    const context = getContext();
    const scope = timelineRowOrderScope(state, context);
    if (!cache.has(scope.key)) {
      let order = [];
      try {
        if (scope.persistent) order = normalizeTimelineRowOrder(JSON.parse(context.win?.localStorage?.getItem(scope.key) || "[]"));
      } catch { /* Browser preferences are optional; keep the match usable. */ }
      if (cache.size >= 100) cache.delete(cache.keys().next().value);
      cache.set(scope.key, order);
    }
    return { ...scope, order: cache.get(scope.key).slice() };
  }

  function save(state, order) {
    const context = getContext();
    const scope = timelineRowOrderScope(state, context);
    const next = normalizeTimelineRowOrder(order);
    cache.set(scope.key, next);
    if (!scope.persistent) return { saved: false };
    try {
      const storage = context.win?.localStorage;
      if (!storage) return { saved: false };
      storage.setItem(scope.key, JSON.stringify(next));
      return { saved: true };
    } catch {
      return { saved: false };
    }
  }

  return { read, save };
}
