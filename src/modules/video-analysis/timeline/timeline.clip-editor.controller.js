import { renderClipEditor, formatClipEditorTime, parseClipEditorTime, clipEditorSubPhaseOptions } from "./timeline.clip-editor.renderer.js";
import { createClipPreview } from "./timeline.clip-preview.controller.js";
import { phaseForSubPhase } from "../services/footballLanguageService.js";

export function preserveTimelineViewport(root) {
  const ancestors = [];
  for (let node = root; node; node = node.parentElement) {
    ancestors.push({ node, top: node.scrollTop, left: node.scrollLeft });
  }
  const selectors = [".video-analysis-fs-player-timeline", ".video-analysis-timeline-scroll"];
  const panes = selectors.map(selector => {
    const node = root?.querySelector(selector);
    return { selector, top: node?.scrollTop || 0, left: node?.scrollLeft || 0 };
  });
  return () => {
    // Repainting detaches the timeline and can reset scroll before the second click.
    for (const { selector, top, left } of panes) {
      const node = root?.querySelector(selector);
      if (node) { node.scrollTop = top; node.scrollLeft = left; }
    }
    for (const { node, top, left } of ancestors) { node.scrollTop = top; node.scrollLeft = left; }
  };
}

export function createTimelineClipEditor({ getState, getRoot, save, remove, pause, subscribe, reconnect, selectFile }) {
  let dialog = null;
  let activeClip = null;
  let pending = false;
  let lastClick = null;
  let returnLane = "";
  let preview = null;
  let originalContext = "";
  const contextKey = () => `${getState().match?.id || ""}:${getState().video?.id || ""}`;
  const field = name => dialog?.querySelector(`[data-video-analysis-timeline-edit-field="${name}"]`);

  function showError(message = "") {
    const error = dialog?.querySelector("[role=alert]");
    if (error) { error.textContent = message; error.hidden = !message; }
  }

  function close() {
    if (!dialog || pending) return;
    const clipId = activeClip?.id;
    preview?.dispose();
    preview = null;
    dialog.close();
    dialog.remove();
    dialog = null;
    activeClip = null;
    lastClick = null;
    const root = getRoot();
    const targets = [...(root?.querySelectorAll(".video-analysis-clip-block[data-video-analysis-seek]") || [])];
    const matching = targets.filter(button => button.dataset.videoAnalysisSeek === clipId);
    const target = matching.find(button => button.closest(".video-analysis-lane")?.querySelector("[data-video-analysis-timeline-category-label]")?.dataset.videoAnalysisTimelineCategoryLabel === returnLane) || matching[0];
    (target || root?.querySelector("[data-video-analysis-timeline-lane-select]"))?.focus({ preventScroll: true });
  }

  function timingChanged(event) {
    const name = event.target.dataset.videoAnalysisTimelineEditField;
    if (!name && !event.target.hasAttribute("data-video-analysis-timeline-edit-principle")) return;
    const start = parseClipEditorTime(field("startMs").value);
    if (name === "duration") {
      const duration = field("duration").valueAsNumber;
      if (Number.isFinite(start) && Number.isFinite(duration) && duration > 0) {
        field("endMs").value = formatClipEditorTime(start + Math.round(duration * 1000));
      }
    } else if (name === "startMs" || name === "endMs") {
      const end = parseClipEditorTime(field("endMs").value);
      field("duration").value = Number.isFinite(start) && Number.isFinite(end) && end > start ? (end - start) / 1000 : "";
    }
    if (name === "phase") {
      const current = field("subPhase").value;
      field("subPhase").innerHTML = clipEditorSubPhaseOptions(field("phase").value, current);
      if (phaseForSubPhase(current, field("phase").value) !== field("phase").value) field("subPhase").value = "";
    }
    if (["startMs", "endMs", "duration"].includes(name)) preview?.updateRange();
    const count = dialog.querySelectorAll("[data-video-analysis-timeline-edit-principle]:checked").length;
    dialog.querySelector("[data-video-analysis-principle-count]").textContent = count || "";
    showError();
  }

  function values() {
    const startMs = parseClipEditorTime(field("startMs").value);
    const endMs = parseClipEditorTime(field("endMs").value);
    const state = getState();
    if (contextKey() !== originalContext) throw new Error("The selected video has changed. Reopen this clip.");
    const totalMs = Number(state.videoRef?.durationMs || state.video?.durationMs || state.video?.duration_ms || 0);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) throw new Error("Enter a time such as 0:01:07.");
    if (endMs <= startMs) throw new Error("End must be after start.");
    if (!(field("duration").valueAsNumber > 0)) throw new Error("Duration must be greater than zero.");
    if (totalMs > 0 && endMs > totalMs) throw new Error(`End cannot exceed ${formatClipEditorTime(totalMs)}.`);
    if (!field("subPhase").value) throw new Error("Choose a sub-phase.");
    return {
      startMs, endMs,
      phase: field("phase").value,
      subPhase: field("subPhase").value,
      outcome: field("outcome").value,
      tags: field("tags").value,
      note: field("note").value,
      miniGamePrincipleIds: [...dialog.querySelectorAll("[data-video-analysis-timeline-edit-principle]:checked")].map(input => input.value),
    };
  }

  async function submit(event) {
    event.preventDefault();
    if (pending || !getState().canEdit) return;
    let edits;
    try { edits = values(); } catch (error) { showError(error.message); return; }
    pending = true;
    preview?.setBusy(true);
    dialog.setAttribute("aria-busy", "true");
    dialog.querySelectorAll("fieldset").forEach(element => { element.disabled = true; });
    dialog.querySelectorAll("button").forEach(button => { button.disabled = true; });
    let success = false;
    try { success = await save(edits, activeClip); }
    catch (error) { showError(error.message || "Could not save clip."); }
    pending = false;
    if (contextKey() !== originalContext) { close(); return; }
    if (success) { close(); return; }
    dialog.removeAttribute("aria-busy");
    dialog.querySelectorAll("fieldset").forEach(element => { element.disabled = !getState().canEdit; });
    dialog.querySelectorAll("button").forEach(button => { button.disabled = false; });
    preview?.setBusy(false);
    showError(getState().error || "Could not save clip. Your changes are still here.");
  }

  function open(clip, trigger) {
    if (!clip?.id || dialog) return false;
    pause();
    activeClip = structuredClone(clip);
    originalContext = contextKey();
    returnLane = trigger?.closest(".video-analysis-lane")?.querySelector("[data-video-analysis-timeline-category-label]")?.dataset.videoAnalysisTimelineCategoryLabel || "";
    const doc = getRoot().ownerDocument;
    dialog = doc.createElement("dialog");
    dialog.className = "video-analysis-clip-editor";
    dialog.setAttribute("aria-labelledby", "video-analysis-clip-editor-title");
    dialog.setAttribute("data-video-analysis-clip-editor", clip.id);
    const title = trigger?.closest(".video-analysis-lane")?.querySelector(".video-analysis-lane__name")?.textContent || "";
    dialog.innerHTML = renderClipEditor(clip, { laneMode: getState().timeline?.laneMode, canEdit: getState().canEdit, title });
    dialog.addEventListener("cancel", event => { event.preventDefault(); close(); });
    dialog.addEventListener("input", timingChanged);
    dialog.addEventListener("submit", submit);
    dialog.addEventListener("click", async event => {
      if (event.target.closest("[data-video-analysis-timeline-edit-cancel]")) close();
      if (event.target.closest("[data-video-analysis-clip-editor-delete]") && !pending && getState().canEdit) {
        dialog.querySelector("[data-video-analysis-clip-editor-confirm]").hidden = false;
        dialog.querySelector("[data-video-analysis-clip-editor-keep]").focus();
      }
      if (event.target.closest("[data-video-analysis-clip-editor-keep]")) {
        dialog.querySelector("[data-video-analysis-clip-editor-confirm]").hidden = true;
      }
      if (event.target.closest("[data-video-analysis-clip-editor-delete-confirm]") && !pending && getState().canEdit) {
        pending = true;
        preview?.setBusy(true);
        try {
          const deleted = await remove(activeClip.id);
          pending = false;
          if (deleted) close();
          else showError(getState().error || "");
        } catch (error) {
          showError(error.message || "Could not delete clip.");
        } finally { pending = false; preview?.setBusy(false); }
      }
    });
    // Outside the repainted workspace: background state updates must not erase an unsaved draft.
    doc.body.appendChild(dialog);
    dialog.showModal();
    preview = createClipPreview({
      dialog, getState, subscribe, reconnect, selectFile,
      getRange: () => ({
        startMs: parseClipEditorTime(field("startMs").value),
        endMs: field("duration").valueAsNumber > 0 ? parseClipEditorTime(field("endMs").value) : NaN,
      }),
      onContextChange: close,
    });
    dialog.querySelector(".video-analysis-clip-editor__close")?.focus({ preventScroll: true });
    return true;
  }

  return {
    open,
    close,
    isOpen: () => Boolean(dialog?.open),
    handleClipClick(event, clip, trigger) {
      if (!clip?.id || !event.detail || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) {
        lastClick = null;
        return false;
      }
      // The first click repaints the clip node, so native dblclick alone is unreliable.
      const doubleClick = lastClick?.id === clip.id && event.timeStamp - lastClick.at < 450;
      lastClick = { id: clip.id, at: event.timeStamp };
      return doubleClick ? open(clip, trigger) : false;
    },
  };
}
