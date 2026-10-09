import { createMedicalDraftStore } from "./medical-draft-store.mjs";

// Read-only rescue review. This service has no central write, replay, merge,
// deletion or cache-cleanup capability. Medical's accepted state stays separate.
export function createMedicalDraftRecovery({ win = globalThis, key = "football-medical-team-v1",
  canEdit = () => false, store = createMedicalDraftStore({ getIndexedDB: () => win.indexedDB }) } = {}) {
  let host = null, generation = 0, renderGeneration = 0, notice = null;
  const access = () => {
    const bridge = win.footballScienceCentralState;
    return canEdit() && bridge?.canAutoSyncKey?.(key) === true ? bridge.getReadScope?.() || "" : "";
  };
  const current = scope => Boolean(scope && access() === scope);
  const report = message => win.footballScienceDataSafety?.reportSaveIssue?.(key, message);
  const node = (tag, text) => {
    const element = win.document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    return element;
  };

  function addCopy(container, row, scope) {
    const item = node("details"), title = node("summary", `Copy from ${new Date(row.createdAt).toLocaleString()}`);
    item.append(title); container.append(item);
    let loaded = false;
    item.addEventListener("toggle", async () => {
      if (!current(scope)) { host?.replaceChildren(); return; }
      if (!item.open || loaded) return;
      loaded = true;
      try { row = await store.read(scope, row.id); } catch { row = null; }
      if (!current(scope) || !container.contains(item)) return;
      if (!row) {
        item.append(node("p", "This recovery copy could not be read. Keep unsaved work open and retry.")); return;
      }
      let state;
      try { state = JSON.parse(row.value); } catch { /* Preserve unreadable copies for export/recovery. */ }
      if (!state || typeof state !== "object") {
        item.append(node("p", "This recovery copy could not be displayed. Contact an administrator; the stored copy is preserved.")); return;
      }
      const players = new Map((Array.isArray(state.players) ? state.players : []).filter(Boolean).map(player => [player.id, player.name]));
      const text = node("p", "Retained after a browser save failed. This copy may differ from central work. Review it before making changes in Medical.");
      const table = node("table"), heading = node("tr");
      for (const label of ["Date", "Player", "Participation", "Comment"]) heading.append(node("th", label));
      table.append(heading);
      for (const record of (Array.isArray(state.records) ? state.records : []).filter(Boolean).slice(0, 200)) {
        const tr = node("tr");
        for (const value of [record.date, players.get(record.playerId) || record.playerId,
          record.participation === undefined ? "" : `${record.participation}%`, record.comment || record.coachComment || ""]) {
          tr.append(node("td", String(value ?? "")));
        }
        table.append(tr);
      }
      const full = node("details"); full.append(node("summary", "All retained content"));
      full.addEventListener("toggle", () => {
        if (!current(scope)) { host?.replaceChildren(); return; }
        if (full.open && full.childElementCount === 1) {
          const pre = node("pre", JSON.stringify(state, null, 2));
          full.append(pre);
        }
      });
      const download = node("button", "Download this recovery copy"); download.type = "button";
      download.addEventListener("click", () => {
        if (!current(scope)) { host?.replaceChildren(); return; }
        const url = win.URL.createObjectURL(new win.Blob([JSON.stringify({ type: "medical-recovery-copy", ...row })], { type: "application/json" }));
        const link = node("a"); link.href = url; link.download = `medical-recovery-${row.id}.json`;
        link.click(); win.setTimeout(() => win.URL.revokeObjectURL(url), 1000);
      });
      item.append(text, table, node("p", "The table shows up to 200 recommendations. All retained content and the download include the complete copy."), full, download);
    });
  }

  async function refresh() {
    const target = host, epoch = ++renderGeneration, scope = access();
    if (!target) return;
    target.replaceChildren(); target.hidden = true;
    if (!scope) return;
    try {
      const rows = await store.list(scope);
      if (epoch !== renderGeneration || target !== host || !current(scope)) return;
      const message = notice?.scope === scope ? notice.message : "";
      if (!rows.length && !message) return;
      target.hidden = false;
      target.append(node("h2", "Medical recovery copies"));
      const status = node("p", message || "Local copies are available for review. Central saving is not confirmed by these copies.");
      status.setAttribute("role", "status"); target.append(status);
      for (const row of rows) addCopy(target, row, scope);
    } catch {
      if (epoch !== renderGeneration || target !== host || !current(scope)) return;
      target.hidden = false;
      target.append(node("p", notice?.scope === scope ? notice.message : "Recovery copies could not be checked. Keep unsaved work open and retry."));
    }
  }

  function retain(value, previousValue = null, expectedScope = access()) {
    const scope = access(), attempt = ++generation;
    if (!scope || expectedScope !== scope) return Promise.resolve(false);
    const metadata = win.footballScienceCentralState?.getStatus?.()?.metadata?.[key];
    const baseRevision = win.footballScienceCentralState?.isKeyHydrated?.(key) === true
      && Number.isInteger(metadata?.revision) && metadata.revision >= 0 ? metadata.revision : null;
    const setNotice = message => {
      if (attempt !== generation || !current(scope)) return;
      notice = { scope, message }; report(message); void refresh();
    };
    setNotice("Medical saving is not confirmed. Creating a recovery copy; keep this page open.");
    return store.retain({ scope, value, previousValue, baseRevision }).then(() => {
      setNotice("A Medical recovery copy is saved on this device. Review it here; central saving is not confirmed by this copy.");
      return true;
    }, () => {
      setNotice("The new Medical changes could not be saved on this device. Keep this page open. Older recovery copies are preserved.");
      return false;
    });
  }

  function beginWrite() {
    // Any newer clinical save, including a successful ordinary write, supersedes
    // the status callback of an older rescue attempt. Copies remain untouched.
    generation++;
    if (notice) { notice = null; void refresh(); }
  }

  function mount(element) { host = element; void refresh(); }
  for (const event of ["platform:user-change", "footballscience:central-state-ready"]) {
    win.addEventListener?.(event, () => { host?.replaceChildren(); void refresh(); });
  }
  win.addEventListener?.("focus", () => { void refresh(); });
  return { retain, mount, refresh, beginWrite };
}
