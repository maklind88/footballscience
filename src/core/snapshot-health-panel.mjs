const messages = {
  available: "A browser snapshot has been recorded for this account/team. This does not confirm that your latest work is saved centrally.",
  busy: "Browser snapshot copying was busy. The latest attempt was not recorded. Existing copies were kept. You can retry here. Module saving has its own status.",
  paused: "Browser snapshots are paused because the safety-copy limit was reached. Existing copies have been kept. Saving in each module has its own status.",
  failed: "The last browser snapshot could not be saved. Existing copies have been kept. Check the saving status in the module you are using.",
  unknown: "Browser snapshot status for this account/team is unavailable. This is not proof that your work is saved or lost.",
};

export function addSnapshotHealthPanel({ doc, content, dialog, report, scope, getScope, retrySnapshot, inventoryStatus }) {
  const explanation = doc.createElement("p"); explanation.textContent = messages[report.snapshotState] || messages.unknown;
  explanation.setAttribute("role", "status"); explanation.setAttribute("aria-label", "Browser snapshot status"); content.append(explanation);
  if (!["paused", "failed", "busy"].includes(report.snapshotState)) return;
  const guidance = doc.createElement("p");
  guidance.textContent = "Do not clear browser data. Retry after normal saving or the module's review has completed. A retry preserves copies it cannot safely replace; it does not resolve conflicts or confirm central saving.";
  content.append(guidance);
  if (!scope || typeof retrySnapshot !== "function") return;
  const button = doc.createElement("button"); button.type = "button"; button.textContent = "Retry browser snapshot";
  button.addEventListener("click", async () => {
    if (button.disabled) return;
    if (getScope() !== scope) { explanation.textContent = "Account or team changed. Reopen this check."; button.disabled = true; return; }
    button.disabled = true; explanation.textContent = "Retrying browser snapshot...";
    let result;
    try { result = await retrySnapshot(); } catch { result = { ok: false, state: "failed" }; }
    if (!dialog.isConnected) return;
    if (getScope() !== scope) { explanation.textContent = "Account or team changed. Reopen this check."; return; }
    explanation.textContent = result?.ok === true ? messages.available : messages[["paused", "busy"].includes(result?.state) ? result.state : "failed"];
    inventoryStatus.textContent = "Snapshot retry finished. Reopen Storage health to refresh the storage measurements.";
    button.disabled = result?.ok === true;
    guidance.hidden = result?.ok === true;
  });
  content.append(button);
}
