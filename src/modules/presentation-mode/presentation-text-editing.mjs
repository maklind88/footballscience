// Presentation owns this tab-local recovery format. Keep legacy scoped drafts readable.
export const presentationTextDraftStorageKey = "football-presentation-text-drafts-v1";

function textValue(element) {
  const value = typeof element?.value === "string" ? element.value : element?.innerText ?? element?.textContent ?? "";
  return String(value).replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ");
}

function setText(element, value) {
  if (typeof element.value === "string") element.value = value;
  else element.textContent = value;
}

export function createPresentationTextEditing({ win, documentRef, getRoot, getContext, readSaved, writeSaved, getScope }) {
  const sessions = new WeakMap();
  let drafts = new Map();
  let timer = 0;
  let rendering = false;
  let storageFailed = false;
  let draftsChanged = false;
  try {
    const parsed = JSON.parse(win?.sessionStorage?.getItem(presentationTextDraftStorageKey) || "{}");
    if (parsed.version === 1 && Array.isArray(parsed.entries)) {
      drafts = new Map(parsed.entries.filter((entry) => entry?.scope && entry.recordId && entry.field && typeof entry.value === "string")
        .map((entry) => {
          const [dateValue, meetingType, ...slideIds] = entry.recordId.split(":");
          return [`${entry.scope}:${entry.recordId}:${entry.field}`, { dateValue, meetingType, slideId: slideIds.join(":"),
            infoField: entry.field.startsWith("info.") ? entry.field.slice(5) : "", ...entry }];
        }));
    }
  } catch { storageFailed = true; }

  function key(context) { return `${context.scope}:${context.recordId}:${context.field}`; }
  function isCurrent(session) { return session && session.context.scope === String(getScope?.() || "").trim(); }
  function fields() { return Array.from(getRoot()?.querySelectorAll?.("[data-presentation-text-field]") || []); }

  function flush() {
    if (timer) win?.clearTimeout?.(timer);
    timer = 0;
    if (!draftsChanged) return !storageFailed;
    try {
      const value = JSON.stringify({ version: 1, entries: [...drafts.values()] });
      win.sessionStorage.setItem(presentationTextDraftStorageKey, value);
      storageFailed = win.sessionStorage.getItem(presentationTextDraftStorageKey) !== value;
      if (!storageFailed) draftsChanged = false;
    } catch { storageFailed = true; }
    return !storageFailed;
  }

  function remember(session, value) {
    if (!isCurrent(session) || !session.context.scope) return false;
    draftsChanged = true;
    drafts.set(key(session.context), { ...session.context, baseValue: session.base, value, updatedAt: Date.now() });
    if (timer) win?.clearTimeout?.(timer);
    timer = win?.setTimeout?.(() => { flush(); showRecovery(); }, 650);
    return true;
  }

  function bind(element) {
    if (!element) return null;
    if (sessions.has(element)) return sessions.get(element);
    if (element.readOnly || element.getAttribute?.("contenteditable") === "false") return null;
    const context = getContext(element);
    if (!context) return null;
    const saved = readSaved(context, textValue(element));
    const session = { context, base: saved.value, dirty: false, status: "", fallback: textValue(element) };
    sessions.set(element, session);
    const draft = drafts.get(key(context));
    if (draft && draft.value !== saved.value) {
      if (saved.exists && saved.value === draft.baseValue) {
        setText(element, draft.value);
        session.dirty = true;
      } else session.status = "conflict";
    }
    return session;
  }

  function record(element) {
    const session = sessions.get(element) || bind(element);
    if (!isCurrent(session) || rendering) return false;
    const value = textValue(element);
    session.dirty = value !== session.base;
    remember(session, value);
    return true;
  }

  function commit(element) {
    if (rendering || !getRoot()?.contains?.(element)) return false;
    const session = sessions.get(element);
    if (!isCurrent(session) || !session.dirty) return false;
    const value = textValue(element);
    remember(session, value);
    flush();
    const saved = readSaved(session.context, session.fallback);
    if (!saved.exists || (saved.value !== session.base && saved.value !== value)) {
      session.status = "conflict";
      showRecovery();
      return false;
    }
    try {
      if (saved.value !== value) writeSaved(session.context, value);
      const verified = readSaved(session.context, session.fallback);
      if (verified.exists && verified.value === value) {
        session.base = value;
        session.dirty = false;
        session.status = "";
      } else session.status = "unsaved";
    } catch { session.status = "unsaved"; }
    // Keep the recovery copy: a local read-back is not a server acknowledgement.
    showRecovery();
    return !session.dirty;
  }

  function leave() {
    fields().forEach(commit);
    flush();
  }

  function beforeRender() {
    const element = documentRef.activeElement?.closest?.("[data-presentation-text-field]");
    const session = element && sessions.get(element);
    const retained = isCurrent(session) ? { element, session, start: element.selectionStart, end: element.selectionEnd,
      direction: element.selectionDirection, scrollTop: element.scrollTop, scrollLeft: element.scrollLeft,
      range: documentRef.getSelection?.()?.rangeCount ? documentRef.getSelection().getRangeAt(0).cloneRange() : null } : null;
    flush();
    rendering = true; // DOM replacement can synchronously dispatch change/focusout.
    return retained;
  }

  function afterRender(retained) {
    let retainedElement = null;
    fields().forEach((element) => {
      const context = getContext(element);
      if (retained && context && key(context) === key(retained.session.context) && !element.readOnly && isCurrent(retained.session)) {
        retained.element.setAttribute("style", element.getAttribute("style") || "");
        element.replaceWith(retained.element);
        retainedElement = retained.element;
        const saved = readSaved(retained.session.context, retained.session.fallback);
        if (!retained.session.dirty) {
          const draft = drafts.get(key(context));
          setText(retainedElement, saved.value);
          retained.session.base = saved.value;
          retained.session.status = draft && draft.value !== saved.value ? "conflict" : "";
        } else if (!saved.exists || (saved.value !== retained.session.base && saved.value !== textValue(retainedElement))) {
          retained.session.status = "conflict";
        }
      } else bind(element);
    });
    if (retainedElement) {
      retainedElement.focus({ preventScroll: true });
      if (typeof retained.start === "number") retainedElement.setSelectionRange(retained.start, retained.end, retained.direction);
      else if (retained.range && retainedElement.contains(retained.range.commonAncestorContainer)) {
        const selection = documentRef.getSelection(); selection.removeAllRanges(); selection.addRange(retained.range);
      }
      retainedElement.scrollTop = retained.scrollTop;
      retainedElement.scrollLeft = retained.scrollLeft;
    }
    rendering = false;
    showRecovery();
  }

  function showRecovery() {
    const root = getRoot();
    if (!root?.querySelectorAll) return;
    const previous = root.querySelector("[data-presentation-draft-recovery]");
    const affected = fields().map((element) => ({ element, session: sessions.get(element) }))
      .filter(({ session }) => isCurrent(session) && (session.status || (storageFailed && session.dirty)));
    if (!affected.length) { previous?.remove(); return; }
    const signature = JSON.stringify(affected.map(({ element, session }) => [key(session.context), session.status,
      storageFailed, drafts.get(key(session.context))?.value ?? textValue(element)]));
    if (previous?.dataset.recoverySignature === signature) return;
    previous?.remove();
    const panel = documentRef.createElement("aside");
    panel.className = "presentation-draft-recovery";
    panel.dataset.recoverySignature = signature;
    panel.setAttribute("data-presentation-draft-recovery", "");
    panel.setAttribute("role", "status");
    for (const { element, session } of affected) {
      const draft = drafts.get(key(session.context));
      const group = documentRef.createElement("div");
      const message = documentRef.createElement("p");
      message.textContent = storageFailed ? "Browser recovery storage is unavailable. Copy your text before leaving."
        : session.status === "conflict" ? "Saved text changed. Your draft is preserved."
          : "This text could not be saved exactly. Your draft is preserved.";
      const preview = documentRef.createElement("textarea");
      preview.readOnly = true;
      preview.value = draft?.value ?? textValue(element);
      preview.setAttribute("data-presentation-recovered-text", "");
      preview.setAttribute("aria-label", `Your draft: ${element.getAttribute("aria-label") || session.context.field}`);
      const useDraft = documentRef.createElement("button");
      useDraft.type = "button"; useDraft.textContent = "Use my draft";
      useDraft.addEventListener("click", () => {
        if (!isCurrent(session)) return;
        const saved = readSaved(session.context, session.fallback);
        if (!saved.exists) return;
        session.base = saved.value; session.status = "";
        setText(element, preview.value); session.dirty = true;
        commit(element);
      });
      const keepSaved = documentRef.createElement("button");
      keepSaved.type = "button"; keepSaved.textContent = "Keep saved text";
      keepSaved.addEventListener("click", () => {
        if (!isCurrent(session)) return;
        const saved = readSaved(session.context, session.fallback);
        if (!saved.exists) return;
        setText(element, saved.value); session.base = saved.value; session.dirty = false; session.status = "";
        drafts.delete(key(session.context)); draftsChanged = true; flush(); showRecovery();
      });
      group.append(message, preview, useDraft, keepSaved); panel.append(group);
    }
    root.append(panel);
  }

  function focus(element) {
    if (!rendering) bind(element); // focus and focusin must not reset the edit baseline twice.
  }

  function discardDeletedRecord(recordId, field = "") {
    const scope = String(getScope?.() || "").trim();
    for (const [id, draft] of drafts) {
      if (draft.scope === scope && draft.recordId === recordId && (!field || draft.field === field)) {
        drafts.delete(id); draftsChanged = true;
      }
    }
    flush();
  }

  function beforeUnload(event) {
    // Browser-tab closure is also an explicit edit boundary. A tab-local draft
    // alone cannot protect a conflicting edit after the tab itself is closed.
    leave();
    const persisted = flush();
    const currentDrafts = [...drafts.values()].filter((draft) => draft.scope === String(getScope?.() || "").trim());
    const atRisk = currentDrafts.some((draft) => {
      const saved = readSaved(draft, draft.baseValue);
      return !saved.exists || saved.value !== draft.value;
    });
    if (atRisk || (!persisted && currentDrafts.length) || fields().some((element) => {
      const session = sessions.get(element);
      return isCurrent(session) && session.dirty;
    })) {
      event.preventDefault(); event.returnValue = "";
    }
  }

  return { record, commit, leave, beforeRender, afterRender, focus, flush, beforeUnload, discardDeletedRecord };
}
