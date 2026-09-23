import { escapeHtml } from "../components/renderHelpers.js";
import { activeAnalysisTimeline } from "../domain/timelineWorkspace.model.js";
import { renderClipReview } from "./timeline.clip-review.js";

const snapshot = (review, playlist) => JSON.stringify({
  label: playlist.label.trim(), clipIds: review.entries.map(entry => entry.clip.id),
  edits: review.entries.map(entry => entry.clip.playlistEdits || {}),
});

export function createReviewPlaylist(review, row, state) {
  const playlist = {
    key: row?.query.playlistKey || globalThis.crypto.randomUUID(), rowId: row?.id || "",
    label: row?.label || review.title, revision: activeAnalysisTimeline(state.timelineWorkspace)?.revision || 0,
    saved: Boolean(row), pending: false, error: "",
  };
  playlist.baseline = snapshot(review, playlist);
  return playlist;
}

export const reviewPlaylistDirty = (review, playlist) => review.hasDrafts() || snapshot(review, playlist) !== playlist.baseline;

export function renderReviewPlaylist(review, playlist, activeId, canEdit) {
  const dirty = reviewPlaylistDirty(review, playlist);
  return `<section class="video-analysis-review-playlist" data-review-playlist aria-label="Playlist">
    <div class="video-analysis-review-playlist__tools">
      <input type="text" data-playlist-name aria-label="Playlist name" maxlength="120" value="${escapeHtml(playlist.label)}" ${!canEdit || playlist.pending ? "disabled" : ""}>
      <span role="status" data-playlist-status>${playlist.pending ? "Saving..." : playlist.saved && !dirty ? "Saved" : dirty ? "Unsaved" : ""}</span>
      ${canEdit ? `<button type="button" data-playlist-copy ${playlist.pending ? "disabled" : ""}>New playlist</button>
      <button type="button" data-playlist-save ${playlist.pending || !review.entries.length ? "disabled" : ""}>Save playlist</button>` : ""}
    </div>
    ${renderClipReview(review, activeId)}
    <p class="video-analysis-clip-editor__error" role="alert" ${playlist.error ? "" : "hidden"}>${escapeHtml(playlist.error)}</p>
  </section>`;
}

export function bindReviewPlaylist({ dialog, review, playlist, getState, save, applyDrafts, busy, refresh, setPending }) {
  let dragId = "";
  let suppressClick = false;
  const item = target => target?.closest?.("[data-clip-review-select]");
  const move = (id, targetId, after) => {
    if (busy() || !getState().canEdit || !review.move(id, targetId, after)) return;
    refresh();
    const button = [...dialog.querySelectorAll("[data-clip-review-select]")].find(element => element.dataset.clipReviewSelect === id);
    button?.focus({ preventScroll: true });
    button?.scrollIntoView({ block: "nearest", inline: "nearest" });
  };
  dialog.addEventListener("dragstart", event => {
    const button = item(event.target);
    if (!button) return;
    if (busy() || !getState().canEdit) { event.preventDefault(); return; }
    dragId = button.dataset.clipReviewSelect;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", dragId);
  });
  dialog.addEventListener("dragover", event => {
    const button = item(event.target);
    if (!dragId || !button || busy()) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    dialog.querySelectorAll("[data-playlist-drop]").forEach(element => element.removeAttribute("data-playlist-drop"));
    const bounds = button.getBoundingClientRect();
    button.dataset.playlistDrop = event.clientX > bounds.x + bounds.width / 2 ? "after" : "before";
    const list = button.closest("ol");
    const rect = list.getBoundingClientRect();
    if (event.clientX > rect.right - 40) list.scrollLeft += 24;
    if (event.clientX < rect.left + 40) list.scrollLeft -= 24;
  });
  dialog.addEventListener("drop", event => {
    const button = item(event.target);
    if (!dragId || !button) return;
    event.preventDefault();
    const id = dragId;
    dragId = "";
    suppressClick = true;
    move(id, button.dataset.clipReviewSelect, button.dataset.playlistDrop === "after");
  });
  dialog.addEventListener("dragend", () => {
    dragId = "";
    dialog.querySelectorAll("[data-playlist-drop]").forEach(element => element.removeAttribute("data-playlist-drop"));
  });
  dialog.addEventListener("pointerdown", () => { suppressClick = false; }, true);
  dialog.addEventListener("keydown", event => {
    const button = item(event.target);
    if (!button || !event.altKey || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const id = button.dataset.clipReviewSelect;
    const index = review.entries.findIndex(entry => entry.clip.id === id);
    const after = event.key === "ArrowRight";
    move(id, review.entries[index + (after ? 1 : -1)]?.clip.id, after);
  });
  dialog.addEventListener("input", event => {
    if (!event.target.matches("[data-playlist-name]") || busy()) return;
    playlist.label = event.target.value;
    const status = dialog.querySelector("[data-playlist-status]");
    status.textContent = reviewPlaylistDirty(review, playlist) ? "Unsaved" : playlist.saved ? "Saved" : "";
  });
  dialog.addEventListener("click", async event => {
    if (suppressClick && item(event.target)) { event.stopImmediatePropagation(); suppressClick = false; return; }
    if (busy() || !getState().canEdit) return;
    if (event.target.closest("[data-playlist-copy]")) {
      playlist.key = globalThis.crypto.randomUUID();
      playlist.rowId = "";
      playlist.saved = false;
      playlist.label = `${playlist.label.trim()} copy`.slice(0, 120);
      playlist.error = "";
      refresh();
      const input = dialog.querySelector("[data-playlist-name]");
      input.focus(); input.select();
    }
    if (!event.target.closest("[data-playlist-save]")) return;
    try {
      applyDrafts();
      playlist.pending = true;
      playlist.error = "";
      setPending(true);
      refresh();
      const result = await save({
        key: playlist.key, rowId: playlist.rowId, revision: playlist.revision, label: playlist.label,
        clipIds: review.entries.map(entry => entry.clip.id),
        clipEdits: Object.fromEntries(review.entries.map(entry => [entry.clip.id, entry.clip.playlistEdits || {}])),
      });
      playlist.rowId = result.row.id;
      playlist.revision = result.revision;
      playlist.label = result.row.label;
      playlist.saved = true;
      playlist.baseline = snapshot(review, playlist);
    } catch (error) { playlist.error = error.message || "Could not save playlist. Your changes are still here."; }
    finally {
      playlist.pending = false;
      setPending(false);
      if (dialog.isConnected) { refresh(); dialog.querySelector("[data-playlist-save]")?.focus(); }
    }
  }, true);
}
