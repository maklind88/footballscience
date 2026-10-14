// This panel reads the save client's exact current working generation. Export
// never reads IndexedDB, refreshes central state, or acknowledges a save.
export function mountSessionWorkingRecovery({ document: doc, host, working, canUse }) {
  const win = doc.defaultView;
  const section = doc.createElement("section");
  section.className = "session-working-recovery";
  section.dataset.sessionWorkingRecovery = "";
  host.append(section);
  let busy = false;
  const read = () => canUse() ? working?.get?.() || null : null;
  const node = (tag, text) => { const element = doc.createElement(tag); element.textContent = text; return element; };
  function render(message = "") {
    const draft = read();
    section.replaceChildren();
    section.hidden = !draft && !message;
    if (!canUse()) { section.hidden = true; return; }
    if (!draft && !message) return;
    section.append(node("h3", draft ? "Unsaved work in this tab" : "Local retry complete"));
    const status = node("p", message); status.setAttribute("role", "status"); section.append(status);
    if (!draft) return;
    section.append(node("p", "This work is only in this tab. Keep the page open: closing or reloading it can lose these changes. Retry saving or download a recovery copy."));
    const details = node("details", ""), summary = node("summary", "View the exact unsaved copy");
    const preview = node("pre", draft.value); details.append(summary, preview); section.append(details);
    const actions = node("footer", ""), retry = node("button", "Retry saving"), download = node("button", "Download unsaved work");
    retry.type = download.type = "button";
    retry.disabled = busy;
    const current = () => {
      if (!section.isConnected) return null;
      const next = read();
      if (!next || next.scope !== draft.scope || next.owner !== draft.owner || next.token !== draft.token) {
        render("Work or access changed. Review the latest copy before continuing.");
        return null;
      }
      return next;
    };
    download.addEventListener("click", () => {
      const copy = current(); if (!copy) return;
      try {
        const payload = { schema: "football-science-session-working-copy-v1", exportedAt: new Date().toISOString(), ...copy };
        const url = win.URL.createObjectURL(new win.Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
        try {
          const link = node("a", ""); link.href = url; link.download = "sessions-unsaved-work.json";
          doc.body.append(link);
          try { link.click(); } finally { link.remove(); }
        } finally { win.setTimeout(() => win.URL.revokeObjectURL(url), 1000); }
        status.textContent = "Recovery download requested. This does not confirm central saving.";
      } catch { status.textContent = "The download could not start. Keep this page open and try again."; }
    });
    retry.addEventListener("click", async () => {
      if (busy || !current()) return;
      busy = true; retry.disabled = true;
      status.textContent = "Retrying local saving…";
      try {
        const result = await working.retry(draft.token);
        if (!canUse() || !section.isConnected) return;
        const newer = read();
        render(newer ? "Unsaved work remains in this tab. Keep it open or download a copy."
          : result?.ok ? "Saved on this device. Check the main save status for central sync or review."
          : "Saving could not be confirmed. Keep this page open.");
      } catch {
        if (section.isConnected) render("Saving could not be confirmed. Keep this page open or download a copy.");
      } finally {
        busy = false;
        if (section.isConnected) section.querySelectorAll("button").forEach(button => { button.disabled = false; });
      }
    });
    actions.append(retry, download); section.append(actions);
  }
  render();
  return { render };
}
