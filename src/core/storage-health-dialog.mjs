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
  const win = doc.defaultView;
  let invalidated = false;
  const invalidate = () => {
    if (invalidated) return;
    invalidated = true;
    content.replaceChildren();
    status.textContent = "Account or team changed. Reopen this check.";
  };
  const isCurrent = () => !invalidated && getScope() === scope;
  win?.addEventListener('platform:user-change', invalidate);
  const scopeTimer = win?.setInterval(() => { if (!isCurrent()) invalidate(); }, 250);
  const close = doc.createElement("button"); close.type = "button"; close.textContent = "Close storage health";
  close.addEventListener("click", () => dialog.close());
  dialog.append(title, status, content, close); doc.body.append(dialog);
  dialog.addEventListener("close", () => {
    win?.removeEventListener('platform:user-change', invalidate); win?.clearInterval(scopeTimer);
    dialog.remove(); if (returnFocus?.isConnected) returnFocus.focus();
  }, { once: true });
  dialog.showModal();
  const report = await collectStorageHealth({ ...options, scope });
  if (!dialog.isConnected) return;
  if (!isCurrent()) { invalidate(); return; }
  status.textContent = (report.partial || report.indexedDb.status !== "complete") ? "Storage check incomplete. Some information could not be read." : "Available storage information read. No data was changed.";
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
  add("These are legacy localStorage copies. The active library may use IndexedDB; matching legacy copies do not prove central saving or make either copy safe to delete.");
  add(`Pending module markers for this account/team: ${report.pendingForCurrentScope ?? "Unavailable"}. This is not a count of individual edits or proof they are saved locally.`);
  add(`Recovery copies in local browser storage: ${report.recoveryCopies}. The IndexedDB summary below counts stored rows, not individual recovery dates or confirmed conflicts.`);
  add("IndexedDB: approximate JSON sizes in the known Safety/Sessions, Library, Medical recovery and additional saved-copy databases, across accounts on this browser. Binary payload bytes are counted separately without decoding. This is not physical disk usage or proof of central saving. Other databases and media are outside this check.");
  const rotation = options.getSnapshotRotation?.();
  add(rotation === 'limited' ? 'The last history rotation on this page reached its inspection limit. No copies were removed by that attempt; saving a copy does not mean history growth is bounded.'
    : rotation === 'failed' ? 'The last history rotation on this page failed. Retained copies must be preserved.'
    : rotation === 'complete' ? 'The last history rotation on this page completed. Protected history can still grow.'
    : 'History rotation result is unavailable on this page. This inspection does not run rotation.');
  for (const database of report.indexedDb.databases) {
    add(`${database.label}: ${database.status === "absent" ? "Not present" : database.status === "unavailable" ? "Unavailable" : `${database.records} rows inspected of ${database.totalRecords ?? "an unknown number of"} stored rows, approximately ${size(database.approximateJsonUtf16Bytes)} inspected${database.status === "partial" ? " (incomplete scan)" : ""}`}.`);
    if (database.status === "partial") {
      const reason = { bytes: "size limit", records: "row limit", timeout: "time limit", 'unknown-stores': 'unsupported storage collections' }[database.stoppedBecause] || "unavailable storage";
      add(`Inspection stopped at ${reason}. Sizes and categories below describe inspected rows only.`);
      if (database.unknownStores) add(`${database.unknownStores} unsupported collections were not inspected. Their contents and sizes are unknown.`);
      for (const store of database.stores) add(`${store.label}: ${store.totalRecords ?? "Unknown"} stored rows; ${store.scannedRecords} inspected.`);
    }
    for (const group of database.groups) add(`${group.label}: ${group.records} rows, approximately ${size(group.approximateJsonUtf16Bytes)}.`);
    if (database.binaryBytes) add(`Binary payloads in inspected rows: ${size(database.binaryBytes)}. Excludes database/index overhead.`);
    for (const reason of database.protection) add(`${reason.label}: ${reason.records} snapshots, approximately ${size(reason.approximateJsonUtf16Bytes)}.`);
  }
  add('Each inspected snapshot has one primary retention explanation; several protections may apply. Acknowledged automatic history is not a deletion list. Unread snapshots remain unclassified, and later central saving does not prove an older pending version is archived centrally.');
  if (report.indexedDb.status !== "complete") add("IndexedDB inventory is incomplete. Unread data must not be treated as empty or safe to delete. Store totals do not identify pending edits, owners or conflicts.");
  add("Archived and recovery rows remain protected. These counts do not authorize cleanup or select a version to restore.");
  add(`Browser origin estimate: ${size(report.originUsageBytes)} used / ${size(report.originQuotaBytes)} quota. This is not the localStorage limit or its remaining space.`);
  add(`Persistent storage: ${report.persistent === null ? "Unavailable" : report.persistent ? "Granted" : "Not granted"}. This does not increase the localStorage limit.`);
  if (options.reviewSnapshots && options.getSnapshotScope?.()) {
    const review = doc.createElement("button"); review.type = "button"; review.textContent = "Review saved browser copies";
    review.addEventListener("click", async () => {
      if (!isCurrent()) { invalidate(); return; }
      review.disabled = true;
      try { await options.reviewSnapshots(() => {
        if (!dialog.isConnected || !isCurrent()) return false;
        dialog.close(); return true;
      }); }
      catch {
        if (dialog.isConnected) {
          if (!isCurrent()) { invalidate(); return; }
          status.textContent = "Saved-copy review could not open. Reconnect or reopen this check and try again. Your data is unchanged.";
          review.disabled = false;
        }
      }
    }); content.append(review);
  }
  if (options.reviewLibrary) {
    const review = doc.createElement("button"); review.type = "button"; review.textContent = "Review library saved versions";
    review.addEventListener("click", () => { dialog.close(); options.reviewLibrary(); }); content.append(review);
  }
  add("If saving fails, keep the page open. Do not clear browser data while edits or local reviews are pending. Open Sessions local review to compare retained versions.");
}
