import { describeSessionDifferences } from "./session-save-protocol.mjs";

export async function openSessionSaveReview({ document: doc, bridge, legacy, onResolved = () => {}, canReview }) {
  if (!canReview() || doc.querySelector("dialog.session-save-review")) return;
  const previousFocus = doc.activeElement;
  if (!doc.querySelector("[data-session-save-review-css]")) {
    const link = doc.createElement("link");
    link.rel = "stylesheet";
    link.href = new URL("./session-save-review.css", import.meta.url).href;
    link.dataset.sessionSaveReviewCss = "";
    doc.head.append(link);
  }
  const dialog = doc.createElement("dialog");
  dialog.className = "session-save-review";
  dialog.setAttribute("aria-label", "Review local saves");
  const head = doc.createElement("header");
  const title = doc.createElement("h2"); title.textContent = "Review local saves";
  const close = doc.createElement("button"); close.type = "button"; close.textContent = "Close";
  close.addEventListener("click", () => dialog.close());
  head.append(title, close);
  const content = doc.createElement("div"); content.className = "session-save-review-content";
  const status = doc.createElement("p"); status.setAttribute("role", "status"); status.textContent = "Loading local saves...";
  content.append(status); dialog.append(head, content); doc.body.append(dialog);
  dialog.addEventListener("close", () => { dialog.remove(); previousFocus?.focus(); }, { once: true });
  dialog.showModal();
  let busy = false;
  dialog.addEventListener("cancel", (event) => { if (busy) event.preventDefault(); });
  const text = (value) => value === undefined || value === null ? "Not present" : typeof value === "string" ? value : JSON.stringify(value, null, 2);
  async function render() {
    if (!canReview()) { dialog.close(); return; }
    if (bridge.hydrate && !await bridge.hydrate({ fresh: true })) throw new Error("Central training could not be refreshed. Local copies are retained.");
    const queued = await bridge.getSessionSaveReviews?.() || [];
    const old = await legacy.list();
    if (!canReview() || !dialog.isConnected) { dialog.close(); return; }
    content.replaceChildren(status);
    const rows = [...queued.map((row) => ({ ...row, date: row.change.date, local: row.change.after,
      differences: describeSessionDifferences(row.central, row.change.after, row.change.date), queued: true })), ...old];
    status.textContent = rows.length ? `${rows.length} local version${rows.length === 1 ? "" : "s"} to review` : "No unresolved local versions.";
    for (const row of rows) {
      const section = doc.createElement("section");
      const heading = doc.createElement("h3"); heading.textContent = `${row.date} - ${row.local.session?.title || "Training"}`;
      section.append(heading);
      for (const difference of row.differences) {
        const details = doc.createElement("details");
        const summary = doc.createElement("summary"); summary.textContent = `${difference.title} - ${difference.field}`;
        const comparison = doc.createElement("div"); comparison.className = "session-save-comparison";
        for (const [label, value] of [["Central", difference.before], ["Local", difference.after]]) {
          const column = doc.createElement("div");
          const strong = doc.createElement("strong"); strong.textContent = label;
          const pre = doc.createElement("pre"); pre.textContent = text(value);
          column.append(strong, pre); comparison.append(column);
        }
        details.append(summary, comparison); section.append(details);
      }
      const actions = doc.createElement("footer");
      for (const [label, useLocal] of [["Keep central version", false], ["Use local version", true]]) {
        const button = doc.createElement("button"); button.type = "button"; button.textContent = label;
        button.addEventListener("click", async () => {
          if (busy || !canReview()) return;
          if (!doc.defaultView.confirm(`${label} for ${row.date}? The local copy will remain archived.`)) return;
          busy = true; close.disabled = true;
          dialog.querySelectorAll("footer button").forEach((item) => { item.disabled = true; });
          try {
            if (bridge.hydrate && !await bridge.hydrate({ fresh: true })) throw new Error("Central training could not be refreshed. Local copies are retained.");
            if (!canReview()) throw new Error("Account or team changed.");
            const result = row.queued ? await bridge.resolveSessionSaveReview(row.change.id, useLocal, row.central) : await legacy.resolve(row, useLocal);
            if (!result.ok) throw new Error(result.reason || "Review could not be saved.");
            await onResolved();
            await render();
          } catch (error) { status.textContent = error.message || "Review could not be saved."; }
          finally {
            busy = false; close.disabled = false;
            dialog.querySelectorAll("footer button").forEach((item) => { item.disabled = false; });
          }
        });
        actions.append(button);
      }
      section.append(actions); content.append(section);
    }
  }
  try { await bridge.prepareSessionLocalReview?.(); await render(); } catch (error) { status.textContent = error.message || "Local saves could not be read."; }
}
