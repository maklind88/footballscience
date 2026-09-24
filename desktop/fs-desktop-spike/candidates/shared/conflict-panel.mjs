import { ConflictReviewController } from "./conflict-controller.mjs";

function element(tag, text, parent) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  parent?.append(node);
  return node;
}

export function mountConflictPanel(bridge) {
  const controller = new ConflictReviewController(bridge);
  const launcher = element("button", "Offline conflict review · synthetic experiment", document.body);
  launcher.type = "button";
  launcher.className = "fs-conflict-launcher";
  const dialog = element("dialog", null, document.body);
  dialog.className = "fs-conflict-panel";
  dialog.setAttribute("aria-label", "Offline conflict review");
  let disposed = false;
  function render() {
    const { review, receipt, busy, message } = controller.snapshot();
    dialog.replaceChildren();
    dialog.setAttribute("aria-busy", String(busy));
    element("h2", "Review offline conflict", dialog);
    element("p", "Local synthetic Session Planner experiment. No production data or automatic upload.", dialog);
    const status = element("p", message || "Load the current server version to review this conflict. Your queued work remains on this device.", dialog);
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    if (review) {
      element("p", `Local revision ${review.localRevision} · Server revision ${review.serverRevision}`, dialog);
      const table = element("table", null, dialog);
      element("caption", "Current local and server values", table);
      const headers = element("tr", null, element("thead", null, table));
      for (const label of ["Field", "On this device", "On the server"]) {
        const th = element("th", label, headers); th.scope = "col";
      }
      const tbody = element("tbody", null, table);
      const row = (label, local, remote) => {
        const tr = element("tr", null, tbody);
        const th = element("th", label, tr); th.scope = "row";
        element("td", local, tr); element("td", remote, tr);
      };
      row("Session name", review.localTitle, review.serverTitle);
      for (const [index, block] of review.blocks.entries()) {
        row(`Block ${index + 1} name`, block.localTitle, block.serverTitle);
        row(`Block ${index + 1} minutes`, String(block.localMinutes), String(block.serverMinutes));
      }
      const editLabel = review.operations.length === 1 ? "edit" : "edits";
      element("h3", `${review.operations.length} queued ${editLabel}, in application order`, dialog);
      const operations = element("ol", null, dialog);
      for (const { operation } of review.operations) {
        const label = operation.operationType === "session.rename" ? `Set session name to “${operation.title}”`
          : `Set “${review.blocks.find((b) => b.id === operation.blockId)?.localTitle}” to ${operation.durationMinutes} minutes`;
        element("li", label, operations);
      }
      element("p", "Reapplying keeps the server’s other supported values. The edits above may replace values changed by another coach. Their originals are retained in a local checkpoint, not a cloud backup.", dialog);
      const confirmation = element("label", null, dialog);
      const checkbox = element("input", null, confirmation);
      checkbox.type = "checkbox";
      checkbox.disabled = busy;
      confirmation.append(document.createTextNode(` I reviewed ${review.operations.length} ${editLabel} and want to reapply on server revision ${review.serverRevision}.`));
      const recover = element("button", "Reapply reviewed edits locally", dialog);
      recover.type = "button"; recover.disabled = true;
      checkbox.addEventListener("change", () => { recover.disabled = busy || !checkbox.checked; });
      recover.addEventListener("click", async () => {
        const pending = controller.recover(checkbox.checked);
        render(); await pending;
        if (!disposed && dialog.open) { render(); dialog.querySelector("h2")?.focus(); }
      });
    }
    if (!receipt) {
      const load = element("button", review ? "Refresh review" : "Load current server version", dialog);
      load.type = "button"; load.disabled = busy;
      load.addEventListener("click", async () => {
        const pending = controller.review();
        render(); await pending;
        if (!disposed && dialog.open) { render(); dialog.querySelector("h2")?.focus(); }
      });
    }
    const close = element("button", receipt ? "Close" : "Leave conflict unchanged", dialog);
    close.type = "button"; close.disabled = busy;
    close.addEventListener("click", () => dialog.close());
    dialog.querySelector("h2").tabIndex = -1;
  }
  launcher.addEventListener("click", () => { render(); dialog.showModal(); });
  dialog.addEventListener("cancel", (event) => {
    // An in-flight transaction cannot be cancelled truthfully by closing a dialog.
    if (controller.snapshot().busy) event.preventDefault();
  });
  dialog.addEventListener("close", () => { controller.cancel(); dialog.replaceChildren(); launcher.focus(); });
  const timer = setInterval(async () => {
    if (dialog.open && !await controller.guard() && !disposed) render();
  }, 1000);
  return () => { disposed = true; clearInterval(timer); controller.cancel(); dialog.remove(); launcher.remove(); };
}
