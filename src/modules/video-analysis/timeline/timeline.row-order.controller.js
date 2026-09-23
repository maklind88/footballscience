import { createTimelineRowOrderPreferences, moveTimelineRow, orderTimelineLanes } from "./timeline.row-order.js";
import { preserveTimelineViewport } from "./timeline.clip-editor.controller.js";

const labelSelector = "[data-video-analysis-row-drag]";
const rowSelector = "[data-video-analysis-row-key]";

export function createTimelineRowOrderController({ store, getContext, getRoot }) {
  const preferences = createTimelineRowOrderPreferences(getContext);
  let root = null;
  let boundWindow = null;
  let session = null;
  let frame = 0;
  let suppressClickUntil = 0;
  const win = () => getContext().win || root?.ownerDocument.defaultView;
  const key = row => row.dataset.videoAnalysisRowKey;
  const rowsFor = label => [...label.closest(".video-analysis-lane-stack").querySelectorAll(rowSelector)];

  function stop(event, prevent = true) {
    if (prevent) event.preventDefault();
    event.stopImmediatePropagation();
    event.__videoAnalysisHandled = true;
  }

  function clear() {
    if (!session) return;
    if (frame) win()?.cancelAnimationFrame(frame);
    frame = 0;
    session.row.classList.remove("is-row-dragging");
    session.ghost?.remove();
    session.line?.remove();
    try { session.label.releasePointerCapture(session.pointerId); } catch { /* Capture may already be released. */ }
    win()?.removeEventListener("pointermove", move, true);
    win()?.removeEventListener("pointerup", finish, true);
    win()?.removeEventListener("pointercancel", cancel, true);
    win()?.removeEventListener("blur", cancel);
    session = null;
  }

  function cancel() {
    if (session?.active) suppressClickUntil = Date.now() + 350;
    clear();
  }

  function prepare(state) {
    // Repainting or changing matches cancels an unfinished drag, never commits it.
    cancel();
    return { ...state, timeline: { ...state.timeline, rowOrder: preferences.read(state).order } };
  }

  function commit(rows, source, target, after, keyboard = false) {
    const state = store.getState();
    const current = preferences.read(state);
    const keys = rows.map(key);
    const next = moveTimelineRow(current.order, keys, source, target, after);
    const previousVisible = current.order.filter(value => keys.includes(value));
    for (const value of keys) if (!previousVisible.includes(value)) previousVisible.push(value);
    if (JSON.stringify(next.filter(value => keys.includes(value))) === JSON.stringify(previousVisible)) return;
    const restore = preserveTimelineViewport(getRoot());
    const result = preferences.save(state, next);
    store.update(value => ({ ...value, ...(!result.saved ? { message: "Row order kept for this session; browser storage is unavailable." } : {}) }));
    restore();
    const label = [...getRoot().querySelectorAll(labelSelector)].find(element => element.dataset.videoAnalysisRowDrag === source);
    label?.focus({ preventScroll: true });
    if (keyboard) label?.scrollIntoView({ block: "nearest", inline: "nearest" });
    const status = getRoot().querySelector("[data-video-analysis-row-order-status]");
    if (status) status.textContent = `${label?.textContent.trim() || "Row"}, position ${next.filter(value => keys.includes(value)).indexOf(source) + 1} of ${keys.length}`;
  }

  function targetAtPointer() {
    if (!session?.active) return;
    const { x, y, row, rows, stack, line, ghost, offsetY } = session;
    ghost.style.top = `${y - offsetY}px`;
    const bounds = stack.getBoundingClientRect();
    const candidates = rows.filter(element => element !== row);
    if (x < bounds.left || x > bounds.right || y < Math.max(0, bounds.top - 28) || y > Math.min(win().innerHeight, bounds.bottom + 28)) {
      session.target = null;
      line.hidden = true;
      return;
    }
    const target = candidates.find(element => {
      const rect = element.getBoundingClientRect();
      return y < rect.top + rect.height / 2;
    }) || candidates.at(-1);
    const rect = target.getBoundingClientRect();
    const after = y >= rect.top + rect.height / 2;
    session.target = { key: key(target), after };
    line.hidden = false;
    line.style.top = `${after ? rect.bottom : rect.top}px`;
  }

  function scrollFrame() {
    frame = 0;
    if (!session?.active) return;
    const doc = root.ownerDocument;
    for (let node = session.stack.parentElement; node; node = node.parentElement) {
      const documentScroll = node === doc.scrollingElement;
      if (node.scrollHeight <= node.clientHeight || (!documentScroll && !/auto|scroll/.test(win().getComputedStyle(node).overflowY))) continue;
      const rect = documentScroll ? { top: 0, bottom: win().innerHeight } : node.getBoundingClientRect();
      const top = Math.max(0, rect.top), bottom = Math.min(win().innerHeight, rect.bottom);
      const delta = session.y < top + 32 ? -10 : session.y > bottom - 32 ? 10 : 0;
      if (!delta) break;
      const previous = node.scrollTop;
      node.scrollTop += delta;
      if (node.scrollTop !== previous) { targetAtPointer(); break; }
    }
    frame = win().requestAnimationFrame(scrollFrame);
  }

  function activate() {
    const rect = session.row.getBoundingClientRect();
    const labelRect = session.label.getBoundingClientRect();
    const scrollRect = session.stack.closest(".video-analysis-timeline-scroll").getBoundingClientRect();
    const right = Math.min(rect.right, scrollRect.right, win().innerWidth);
    const rowStyle = win().getComputedStyle(session.row);
    const labelStyle = win().getComputedStyle(session.label);
    session.active = true;
    session.ghost = session.row.cloneNode(true);
    session.ghost.classList.add("video-analysis-row-ghost");
    session.ghost.setAttribute("aria-hidden", "true");
    session.ghost.setAttribute("inert", "");
    // The floating copy retains the timeline's exact columns even outside its scroller.
    session.ghost.style.gridTemplateColumns = rowStyle.gridTemplateColumns;
    session.ghost.style.gap = rowStyle.gap;
    const ghostLabel = session.ghost.querySelector(labelSelector);
    ghostLabel.style.font = labelStyle.font;
    ghostLabel.style.left = `${Math.max(0, labelRect.left - rect.left)}px`;
    session.line = root.ownerDocument.createElement("div");
    session.line.className = "video-analysis-row-drop-line";
    session.line.setAttribute("aria-hidden", "true");
    for (const element of [session.ghost, session.line]) {
      element.style.left = `${rect.left}px`;
      element.style.width = `${right - rect.left}px`;
      root.ownerDocument.body.appendChild(element);
    }
    session.ghost.style.height = `${rect.height}px`;
    session.line.style.left = `${labelRect.left}px`;
    session.line.style.width = `${right - labelRect.left}px`;
    session.row.classList.add("is-row-dragging");
    try { session.label.setPointerCapture(session.pointerId); } catch { /* Window listeners also cover uncaptured pointers. */ }
    frame = win().requestAnimationFrame(scrollFrame);
  }

  function move(event) {
    if (!session || event.pointerId !== session.pointerId) return;
    if (!session.row.isConnected || preferences.read(store.getState()).key !== session.scope) { cancel(); return; }
    session.x = event.clientX;
    session.y = event.clientY;
    if (!session.active && Math.hypot(session.x - session.startX, session.y - session.startY) < 5) return;
    if (!session.active) activate();
    stop(event);
    targetAtPointer();
  }

  function finish(event) {
    if (!session || event.pointerId !== session.pointerId) return;
    const { active, rows, row, scope } = session;
    if (active) {
      session.x = event.clientX;
      session.y = event.clientY;
      targetAtPointer();
      stop(event);
      suppressClickUntil = Date.now() + 350;
    }
    const target = session.target;
    clear();
    if (active && target && scope === preferences.read(store.getState()).key) commit(rows, key(row), target.key, target.after);
  }

  function down(event) {
    if (event.button === 0) suppressClickUntil = 0;
    const label = event.target.closest?.(labelSelector);
    if (!label || event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.pointerType === "touch" && !event.target.closest("[data-video-analysis-row-grip]")) return;
    const rows = rowsFor(label);
    if (rows.length < 2) return;
    clear();
    const row = label.closest(rowSelector);
    session = { row, label, rows, stack: row.parentElement, pointerId: event.pointerId,
      startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY,
      offsetY: event.clientY - row.getBoundingClientRect().top, scope: preferences.read(store.getState()).key };
    win().addEventListener("pointermove", move, { capture: true, passive: false });
    win().addEventListener("pointerup", finish, true);
    win().addEventListener("pointercancel", cancel, true);
    win().addEventListener("blur", cancel);
  }

  function click(event) {
    if (event.detail > 0 && Date.now() < suppressClickUntil && event.target.closest?.("[data-video-analysis-timeline-module]")) stop(event);
  }

  function dragstart(event) {
    if (event.target.closest?.(labelSelector)) stop(event);
  }

  function keydown(event) {
    if (session && event.key === "Escape") { stop(event); cancel(); return; }
    const label = event.target.closest?.(labelSelector);
    if (!label || !root.contains(label) || !event.altKey || event.ctrlKey || event.metaKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
    stop(event);
    cancel();
    const rows = rowsFor(label);
    const source = label.dataset.videoAnalysisRowDrag;
    const index = rows.findIndex(row => key(row) === source);
    const target = rows[index + (event.key === "ArrowDown" ? 1 : -1)];
    if (target) commit(rows, source, key(target), event.key === "ArrowDown", true);
  }

  function dispose() {
    cancel();
    root?.removeEventListener("pointerdown", down, true);
    root?.removeEventListener("click", click, true);
    root?.removeEventListener("dblclick", click, true);
    root?.removeEventListener("dragstart", dragstart, true);
    boundWindow?.removeEventListener("keydown", keydown, true);
    root = null;
  }

  function bind(nextRoot) {
    if (root === nextRoot) return;
    dispose();
    root = nextRoot;
    boundWindow = win();
    root.addEventListener("pointerdown", down, true);
    root.addEventListener("click", click, true);
    root.addEventListener("dblclick", click, true);
    root.addEventListener("dragstart", dragstart, true);
    boundWindow.addEventListener("keydown", keydown, true);
  }

  return { prepare, bind, dispose, orderLanes: (lanes, state) => orderTimelineLanes(lanes, preferences.read(state).order) };
}
