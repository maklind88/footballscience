import { escapeSetPieceHtml } from "./board-renderer.mjs";

export function renderSetPiecesSaveReviews(rows = []) {
  const byPlay = new Map();
  for (const row of rows) byPlay.set(row.payload.change.playId, row);
  if (!byPlay.size) return "";
  return `<div class="spr-save-reviews" role="region" aria-label="Set piece save conflicts">
    ${[...byPlay].map(([playId, row]) => `<div class="spr-save-review">
      <span><strong>${escapeSetPieceHtml(row.payload.change.after?.title || row.central?.title || "Deleted set piece")}</strong> has a conflicting team edit.</span>
      <div class="spr-inline-actions">
        <button type="button" data-set-piece-review="central" data-review-play="${escapeSetPieceHtml(playId)}">Keep team version</button>
        ${row.payload.change.after ? `<button type="button" data-set-piece-review="copy" data-review-play="${escapeSetPieceHtml(playId)}">Save mine as a copy</button>` : ""}
      </div>
    </div>`).join("")}
  </div>`;
}
