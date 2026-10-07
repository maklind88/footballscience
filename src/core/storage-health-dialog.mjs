import { collectStorageHealth } from "./storage-health-report.mjs";

export async function openStorageHealth(options) {
  const { documentRef: doc, getScope = () => "" } = options;
  if (!doc?.body || doc.querySelector("dialog[data-storage-health]")) return;
  const scope = getScope();
  const returnFocus = doc.activeElement;
  const dialog = doc.createElement("dialog");
  dialog.dataset.storageHealth = "";
  dialog.setAttribute("aria-label", "Storage health");
  const title = doc.createElement("h2"); title.textContent = "Storage health";
  const status = doc.createElement("p"); status.setAttribute("role", "status"); status.textContent = "Checking storage...";
  const content = doc.createElement("div");
  const close = doc.createElement("button"); close.type = "button"; close.textContent = "Close storage health";
  close.addEventListener("click", () => dialog.close());
  dialog.append(title, status, content, close); doc.body.append(dialog);
  dialog.addEventListener("close", () => { dialog.remove(); if (returnFocus?.isConnected) returnFocus.focus(); }, { once: true });
  dialog.showModal();
  const report = await collectStorageHealth({ ...options, scope });
  if (!dialog.isConnected) return;
  if (getScope() !== scope) { status.textContent = "Account or team changed. Reopen this check."; return; }
  status.textContent = report.partial ? "Storage check incomplete. Some information could not be read." : "Storage check complete. No data was changed.";
  const add = (text) => { const p = doc.createElement("p"); p.textContent = text; content.append(p); };
  const size = value => value === null ? "Unavailable" : `${(value / 1024 / 1024).toFixed(2)} MiB`;
  add(`Local browser storage: approximately ${size(report.approximateUtf16Bytes)} across ${report.entries} entries.`);
  const list = doc.createElement("ul");
  for (const row of report.modules) { const item = doc.createElement("li"); item.textContent = `${row.label}: ${size(row.approximateUtf16Bytes)}`; list.append(item); }
  content.append(list);
  const mirror = report.libraryMirror;
  const mirrorText = { matching: "The local Exercise Library and its backup contain matching exercise payloads.",
    different: "The local Exercise Library and its backup contain different exercise payloads. Preserve both.",
    missing: "A local Exercise Library copy or its backup is absent.", invalid: "Exercise Library backup integrity could not be verified.",
    changed: "Exercise Library changed during this check. Reopen the check.", unavailable: "Exercise Library comparison unavailable." };
  add(mirrorText[mirror.status]);
  if (Number.isInteger(mirror.exerciseCount)) add(`Library: ${mirror.exerciseCount} exercises. Backup: ${mirror.backupExerciseCount} exercises.`);
  add("Matching local copies do not prove central saving or make either copy safe to delete.");
  add(`Pending module markers for this account/team: ${report.pendingForCurrentScope ?? "Unavailable"}. This is not a count of individual edits or proof they are saved locally.`);
  add(`Recovery copies in local browser storage: ${report.recoveryCopies}. IndexedDB queues, review archives and backup contents are not inspected by this check.`);
  add(`Browser origin estimate: ${size(report.originUsageBytes)} used / ${size(report.originQuotaBytes)} quota. This is not the localStorage limit or its remaining space.`);
  add(`Persistent storage: ${report.persistent === null ? "Unavailable" : report.persistent ? "Granted" : "Not granted"}. This does not increase the localStorage limit.`);
  add("If saving fails, keep the page open. Do not clear browser data while edits or local reviews are pending. Open Sessions local review to compare retained versions.");
}
