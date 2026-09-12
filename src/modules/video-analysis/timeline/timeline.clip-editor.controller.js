import { renderClipEditor, formatClipEditorTime, parseClipEditorTime, clipEditorSubPhaseOptions } from "./timeline.clip-editor.renderer.js";
import { createClipPreview } from "./timeline.clip-preview.controller.js";
import { phaseForSubPhase } from "../services/footballLanguageService.js";
import { createClipReview, readClipEditorDraft, renderClipReview } from "./timeline.clip-review.js";

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
  let review = null;
  let baseline = null;
  let editorTitle = "";
  let restoreViewport = null;
  const contextKey = () => `${getState().match?.id || ""}:${getState().video?.id || ""}`;
  const field = name => dialog?.querySelector(`[data-video-analysis-timeline-edit-field="${name}"]`);

  function showError(message = "") {
    const error = dialog?.querySelector("[role=alert]");
    if (error) { error.textContent = message; error.hidden = !message; }
  }

  const editDialog = () => dialog?.querySelector("#video-analysis-clip-edit-dialog");

  function setEditingOpen(open, focus = false) {
    const button = dialog?.querySelector("[data-clip-edit-open], [data-clip-details-open]");
    if (!button || pending) return;
    button.setAttribute("aria-expanded", String(open));
    if (open) {
      preview?.setBusy(true);
      dialog.querySelector("[data-clip-review-close-confirm]").hidden = true;
      if (!editDialog().open) editDialog().showModal();
    } else {
      editDialog().close();
      preview?.setBusy(false);
    }
    const focusTarget = getState().canEdit ? field("startMs") : editDialog().querySelector("[data-clip-edit-back]");
    if (focus) (open ? focusTarget : button).focus({ preventScroll: !open });
  }

  function close() {
    if (!dialog || pending) return;
    const clipId = activeClip?.id;
    const returnToRow = Boolean(review);
    preview?.dispose();
    preview = null;
    editDialog()?.close();
    dialog.close();
    dialog.remove();
    if (contextKey() === originalContext) restoreViewport?.();
    restoreViewport = null;
    dialog = null;
    activeClip = null;
    lastClick = null;
    review = null;
    baseline = null;
    const root = getRoot();
    if (returnToRow) {
      const row = [...(root?.querySelectorAll("[data-video-analysis-timeline-category]") || [])]
        .find(button => button.dataset.videoAnalysisTimelineCategoryLabel === returnLane);
      if (row) { row.focus({ preventScroll: true }); return; }
    }
    const targets = [...(root?.querySelectorAll(".video-analysis-clip-block[data-video-analysis-seek]") || [])];
    const matching = targets.filter(button => button.dataset.videoAnalysisSeek === clipId);
    const target = matching.find(button => button.closest(".video-analysis-lane")?.querySelector("[data-video-analysis-timeline-category-label]")?.dataset.videoAnalysisTimelineCategoryLabel === returnLane) || matching[0];
    (target || root?.querySelector("[data-video-analysis-timeline-lane-select]"))?.focus({ preventScroll: true });
  }

  function requestClose() {
    if (!dialog || pending) return;
    const dirty = review ? review.hasDrafts() : JSON.stringify(readClipEditorDraft(dialog)) !== JSON.stringify(baseline);
    if (!dirty) { close(); return; }
    preview?.setBusy(true);
    const confirmation = dialog.querySelector("[data-clip-review-close-confirm]");
    confirmation.hidden = false;
    confirmation.scrollIntoView({ block: "nearest" });
    confirmation.querySelector("[data-clip-review-keep]").focus({ preventScroll: true });
  }

  function refreshReviewNav() {
    if (!dialog) return;
    dialog.querySelector("[data-clip-review-nav]").outerHTML = renderClipReview(review, activeClip.id, activeClip);
    rememberDraft();
    dialog.querySelector('[data-clip-review-select][aria-pressed="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function rememberDraft() {
    const draft = readClipEditorDraft(dialog);
    const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
    dialog.querySelector("[data-clip-review-notice]").textContent = dirty ? "Unsaved" : "";
    review?.remember(activeClip.id, draft, baseline);
    const button = [...dialog.querySelectorAll("[data-clip-review-select]")].find(item => item.dataset.clipReviewSelect === activeClip.id);
    if (button) {
      button.querySelector("[data-clip-review-dirty]").hidden = !dirty;
      button.setAttribute("aria-description", dirty ? "Unsaved changes" : "");
    }
  }

  function restoreDraft(draft) {
    if (!draft) return;
    field("subPhase").innerHTML = clipEditorSubPhaseOptions(draft.fields.phase, draft.fields.subPhase);
    for (const [name, value] of Object.entries(draft.fields)) if (field(name)) field(name).value = value;
    dialog.querySelectorAll("[data-video-analysis-timeline-edit-principle]").forEach(input => { input.checked = draft.principles.includes(input.value); });
    dialog.querySelector("[data-video-analysis-principle-count]").textContent = draft.principles.length || "";
  }

  function renderCurrentClip(clip) {
    preview?.dispose();
    editDialog()?.close();
    activeClip = structuredClone(clip);
    dialog.setAttribute("data-video-analysis-clip-editor", clip.id);
    dialog.innerHTML = renderClipEditor(clip, { laneMode: getState().timeline?.laneMode, canEdit: getState().canEdit, title: editorTitle, review });
    baseline = readClipEditorDraft(dialog);
    restoreDraft(review?.entries.find(entry => entry.clip.id === clip.id)?.draft);
    editDialog().addEventListener("cancel", event => {
      event.preventDefault();
      event.stopPropagation();
      setEditingOpen(false, true);
    });
    editDialog().addEventListener("keydown", event => {
      if (event.key !== "Tab") return;
      const focusable = [...editDialog().querySelectorAll("button, input, select, textarea, summary, [tabindex]")]
        .filter(element => !element.matches(":disabled") && element.tabIndex >= 0 && element.getClientRects().length);
      const first = focusable[0], last = focusable.at(-1);
      const active = dialog.ownerDocument.activeElement;
      if ((event.shiftKey && active === first) || (!event.shiftKey && active === last)) {
        event.preventDefault();
        (event.shiftKey ? last : first)?.focus();
      }
    });
    rememberDraft();
    preview = createClipPreview({
      dialog, getState, subscribe, reconnect, selectFile,
      getRange: () => ({
        startMs: parseClipEditorTime(field("startMs").value),
        endMs: field("duration").valueAsNumber > 0 ? parseClipEditorTime(field("endMs").value) : NaN,
      }),
      onContextChange: close,
    });
  }

  function selectReviewClip(id) {
    if (pending || editDialog()?.open || !review || id === activeClip.id) return;
    const entry = review.entries.find(item => item.clip.id === id);
    if (!entry) return;
    rememberDraft();
    renderCurrentClip(entry.clip);
    const button = [...dialog.querySelectorAll("[data-clip-review-select]")].find(item => item.dataset.clipReviewSelect === id);
    button?.focus({ preventScroll: true });
    button?.scrollIntoView({ block: "nearest", inline: "nearest" });
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
    rememberDraft();
    showError();
  }

  function values() {
    const startMs = parseClipEditorTime(field("startMs").value);
    const endMs = parseClipEditorTime(field("endMs").value);
    const state = getState();
    if (contextKey() !== originalContext) throw new Error("The selected video has changed. Reopen this clip.");
    const totalMs = Number(state.videoRef?.durationMs || state.video?.durationMs || state.video?.duration_ms || 0);
    const invalidTime = (message, name) => {
      setEditingOpen(true);
      field(name).focus();
      throw new Error(message);
    };
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) invalidTime("Enter a time such as 0:01:07.", Number.isFinite(startMs) ? "endMs" : "startMs");
    if (endMs <= startMs) invalidTime("End must be after start.", "endMs");
    if (!(field("duration").valueAsNumber > 0)) invalidTime("Duration must be greater than zero.", "duration");
    if (totalMs > 0 && endMs > totalMs) invalidTime(`End cannot exceed ${formatClipEditorTime(totalMs)}.`, "endMs");
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
    if (pending || !editDialog()?.open || !getState().canEdit) return;
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
    dialog.removeAttribute("aria-busy");
    dialog.querySelectorAll("fieldset").forEach(element => { element.disabled = !getState().canEdit; });
    dialog.querySelectorAll("button").forEach(button => { button.disabled = false; });
    preview?.setBusy(true);
    if (success) {
      const savedClip = getState().clips.find(clip => clip.id === activeClip.id);
      if (savedClip) { activeClip = structuredClone(savedClip); review?.saved(savedClip); }
      baseline = readClipEditorDraft(dialog);
      refreshReviewNav();
      dialog.querySelector("[data-clip-review-close-confirm]").hidden = true;
      dialog.querySelector("[data-clip-review-notice]").textContent = "Clip saved";
      setEditingOpen(false, true);
      return;
    }
    refreshReviewNav();
    showError(getState().error || "Could not save clip. Your changes are still here.");
  }

  function open(clip, trigger, rowClips = null) {
    if (!clip?.id || dialog) return false;
    restoreViewport = preserveTimelineViewport(getRoot());
    pause();
    originalContext = contextKey();
    returnLane = trigger?.closest(".video-analysis-lane")?.querySelector("[data-video-analysis-timeline-category-label]")?.dataset.videoAnalysisTimelineCategoryLabel || "";
    const doc = getRoot().ownerDocument;
    dialog = doc.createElement("dialog");
    review = rowClips ? createClipReview(rowClips) : null;
    dialog.className = `video-analysis-clip-editor${review ? " is-row-review" : ""}`;
    dialog.setAttribute("aria-labelledby", "video-analysis-clip-editor-title");
    editorTitle = trigger?.closest(".video-analysis-lane")?.querySelector(".video-analysis-lane__name")?.textContent || "";
    if (review) review.title = editorTitle || "Clips";
    dialog.addEventListener("cancel", event => {
      event.preventDefault();
      if (event.target === dialog) requestClose();
    });
    dialog.addEventListener("keydown", event => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      event.stopPropagation();
      if (editDialog()?.open) setEditingOpen(false, true);
      else requestClose();
    });
    dialog.addEventListener("input", timingChanged);
    dialog.addEventListener("submit", submit);
    dialog.addEventListener("click", async event => {
      if (event.target.closest("[data-video-analysis-timeline-edit-cancel]")) { requestClose(); return; }
      if (pending) return;
      if (event.target.closest("[data-clip-edit-open], [data-clip-details-open]")) { setEditingOpen(true, true); return; }
      if (event.target.closest("[data-clip-edit-back]")) { setEditingOpen(false, true); return; }
      if (event.target.closest("[data-clip-review-discard]")) { close(); return; }
      if (event.target.closest("[data-clip-review-keep]")) {
        dialog.querySelector("[data-clip-review-close-confirm]").hidden = true;
        preview?.setBusy(false);
      }
      const clipButton = event.target.closest("[data-clip-review-select]");
      if (clipButton) selectReviewClip(clipButton.dataset.clipReviewSelect);
      const step = event.target.closest("[data-clip-review-step]");
      if (step && review) {
        const index = review.entries.findIndex(entry => entry.clip.id === activeClip.id);
        selectReviewClip(review.entries[index + Number(step.dataset.clipReviewStep)]?.clip.id);
      }
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
          if (deleted) {
            const next = review?.remove(activeClip.id);
            if (next) renderCurrentClip(next);
            else close();
          }
          else showError(getState().error || "");
        } catch (error) {
          showError(error.message || "Could not delete clip.");
        } finally { pending = false; preview?.setBusy(Boolean(editDialog()?.open)); }
      }
    });
    // Outside the repainted workspace: background state updates must not erase an unsaved draft.
    doc.body.appendChild(dialog);
    renderCurrentClip(review?.entries[0]?.clip || clip);
    dialog.showModal();
    dialog.querySelector(".video-analysis-clip-editor__close")?.focus({ preventScroll: true });
    return true;
  }

  function isDoubleClick(event, key) {
    if (!key || !event.detail || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) {
      lastClick = null;
      return false;
    }
    // A first click repaints both clip and row buttons; native dblclick alone is unreliable.
    const doubleClick = lastClick?.key === key && event.timeStamp - lastClick.at >= 0 && event.timeStamp - lastClick.at < 450;
    lastClick = { key, at: event.timeStamp };
    return doubleClick;
  }

  return {
    open,
    openRow: (clips, trigger) => open(clips[0], trigger, clips),
    close,
    isOpen: () => Boolean(dialog?.open),
    handleClipClick(event, clip, trigger) {
      return isDoubleClick(event, clip?.id ? `clip:${clip.id}` : "") ? open(clip, trigger) : false;
    },
    handleRowClick(event, clips, trigger) {
      const key = `row:${trigger.dataset.videoAnalysisTimelineCategoryMode}:${trigger.dataset.videoAnalysisTimelineCategoryLabel}`;
      return isDoubleClick(event, clips.length ? key : "") ? open(clips[0], trigger, clips) : false;
    },
  };
}
