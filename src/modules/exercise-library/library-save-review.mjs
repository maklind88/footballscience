import { libraryRecords } from "./library-save-protocol.mjs";
import { importLibraryRecovery } from "./library-recovery-import.mjs";

export async function openLibrarySaveReview({ win, client, getScope, refresh }) {
  const doc = win.document, expected = getScope();
  if (!expected || doc.querySelector("dialog[data-library-save-review]")) return;
  const dialog = doc.createElement("dialog"); dialog.dataset.librarySaveReview = "";
  dialog.setAttribute("aria-label", "Library saved versions");
  const title = doc.createElement("h2"); title.textContent = "Library saved versions";
  const status = doc.createElement("p"); status.setAttribute("role", "status"); status.textContent = "Checking the current central version...";
  const list = doc.createElement("div"), close = doc.createElement("button");
  close.textContent = "Close"; close.type = "button"; close.onclick = () => dialog.close();
  dialog.append(title, status, list, close); doc.body.append(dialog); dialog.showModal();
  const invalidate = () => {
    if (expected === getScope()) return;
    list.replaceChildren(); status.textContent = "Account changed. Reopen this review.";
  };
  win.addEventListener("platform:user-change", invalidate);
  dialog.addEventListener("close", () => { win.removeEventListener("platform:user-change", invalidate); dialog.remove(); }, { once: true });
  const active = () => dialog.isConnected && expected === getScope();
  try {
    if (!await refresh() || !active()) { status.textContent = "Connect with the same account to compare central and local versions."; return; }
    const importLabel = doc.createElement("label"), importFile = doc.createElement("input");
    importLabel.textContent = "Review a library backup file "; importFile.type = "file"; importFile.accept = ".json,application/json";
    importFile.setAttribute("aria-label", "Review a library backup file"); importLabel.append(importFile); list.append(importLabel);
    importFile.onchange = async () => {
      const file = importFile.files?.[0];
      if (!file || !active()) return;
      if (file.size > 32 * 1024 * 1024) { status.textContent = "Backup exceeds the 32 MiB review limit."; return; }
      importFile.disabled = true;
      try {
        const payload = JSON.parse(await file.text());
        if (!active()) return;
        await importLibraryRecovery({ payload, client, getScope });
        if (!active()) return;
        const closed = new Promise(resolve => dialog.addEventListener("close", resolve, { once: true }));
        dialog.close(); await closed;
        if (expected === getScope()) await openLibrarySaveReview({ win, client, getScope, refresh });
      } catch (error) { if (active()) { status.textContent = error.message; importFile.disabled = false; } }
    };
    const rows = await client.store.list(expected);
    if (!active()) { status.textContent = "Account changed. Reopen this review."; return; }
    status.textContent = rows.length ? "Review retained edits below. Choosing a version archives the original local edit." : "No pending library edits for this account.";
    for (const row of rows) {
      const shownCentral = client.centralValue(row.key);
      if (typeof shownCentral !== "string") {
        const unavailable = doc.createElement("p");
        unavailable.textContent = "A current authorized library read is required to compare this retained edit. It remains in your recovery export.";
        list.append(unavailable); continue;
      }
      const central = new Map(libraryRecords(shownCentral).map(record => [record.id, record]));
      const section = doc.createElement("section"), heading = doc.createElement("h3");
      heading.textContent = row.key.includes("folders") ? "Folder changes" : "Exercise changes"; section.append(heading);
      for (const record of row.change.records) {
        const details = doc.createElement("details"), summary = doc.createElement("summary"), content = doc.createElement("pre");
        summary.textContent = record.after.title || record.after.name || "Library record";
        content.textContent = JSON.stringify({ central: central.get(record.id) ?? null, retained: record.after }, null, 2);
        content.style.maxWidth = "70vw"; content.style.whiteSpace = "pre-wrap";
        details.append(summary, content); section.append(details);
      }
      let confirming = false;
      for (const choice of ["central", "local"]) {
        const button = doc.createElement("button"); button.type = "button";
        button.textContent = choice === "central" ? "Keep central version" : "Use my retained version";
        button.onclick = async () => {
          if (!active()) { status.textContent = "Account changed. Reopen this review."; return; }
          if (confirming) return;
          confirming = true;
          const confirmed = await new Promise(resolve => {
            const prompt = doc.createElement("div"), message = doc.createElement("p");
            message.textContent = choice === "central" ? "Archive this local edit without changing the central library?"
              : "Apply the retained records as a new edit? Newer concurrent changes will still be checked.";
            prompt.append(message);
            for (const [label, answer] of [["Confirm", true], ["Cancel", false]]) {
              const action = doc.createElement("button"); action.type = "button"; action.textContent = label;
              action.onclick = () => { prompt.remove(); resolve(answer); }; prompt.append(action);
            }
            section.append(prompt); prompt.querySelector("button").focus();
            dialog.addEventListener("close", () => resolve(false), { once: true });
          });
          confirming = false;
          if (!confirmed || !active()) return;
          section.querySelectorAll("button").forEach(item => { item.disabled = true; });
          try {
            const result = await client.resolvePending(row, choice, shownCentral);
            if (!active()) return;
            if (!result.saved) throw new Error(result.reason || "The selected version could not be saved.");
            section.remove(); status.textContent = "Version reviewed. The original edit remains archived.";
            win.dispatchEvent(new win.CustomEvent("footballscience:central-state-partial", { detail: { readKeys: [row.key] } }));
          } catch (error) {
            if (active()) { status.textContent = error.message; section.querySelectorAll("button").forEach(item => { item.disabled = false; }); }
          }
        };
        section.append(button);
      }
      list.append(section);
    }
  } catch { if (active()) status.textContent = "Local versions could not be read. Keep this page open and retry."; }
}
