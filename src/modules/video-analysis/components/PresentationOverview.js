import { filteredPlaylistLibrary, playlistLibraryEntries } from "../services/playlistLibraryService.js";
import { playerHeaderIcon } from "./playerHeaderIcons.js";
import { escapeHtml } from "./renderHelpers.js";

function dateLabel(value) {
  const date = new Date(value || "");
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("en", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function renderPlaylist(item, state) {
  const title = escapeHtml(item.title);
  const key = escapeHtml(item.key);
  const attributes = item.kind === "timeline" ? `data-playlist-library-open="${key}"`
    : `data-video-analysis-presentation-open="${escapeHtml(item.presentation.id || "")}"`;
  const playAttributes = item.kind === "timeline" ? attributes
    : `data-video-analysis-presentation-present="${escapeHtml(item.presentation.id || "")}"`;
  const busy = state.playlistLibrary?.openingKey ? "disabled" : "";
  return `<li class="video-analysis-playlist-library__row" data-playlist-library-item="${key}">
    <button type="button" class="video-analysis-playlist-library__title" ${attributes} ${busy}>
      <strong>${title}</strong><span>${escapeHtml(item.matchTitle)}</span>
    </button>
    <span class="video-analysis-playlist-library__count">${item.clipCount == null ? "" : `${item.clipCount} ${item.clipCount === 1 ? "clip" : "clips"}`}</span>
    <span class="video-analysis-playlist-library__date">${item.draft ? "Not saved" : escapeHtml(dateLabel(item.updatedAt))}</span>
    <button type="button" class="video-analysis-playlist-library__play" ${playAttributes} title="Play ${title}" aria-label="Play ${title}" ${busy}>${playerHeaderIcon("play")}</button>
  </li>`;
}

export function renderPresentationOverview(state = {}) {
  const library = state.playlistLibrary || {};
  const entries = filteredPlaylistLibrary(state);
  const pageSize = 50;
  const totalPages = Math.max(1, Math.ceil(entries.length / pageSize));
  const page = Math.max(0, Math.min(Number(state.presentation?.libraryPage) || 0, totalPages - 1));
  const sort = state.presentation?.librarySort || "updated";
  return `<section class="video-analysis-playlist-library" aria-label="Playlist library">
    <header><h2>Playlists <small>${playlistLibraryEntries(state).length}</small></h2>
      <button type="button" data-video-analysis-presentation-new ${state.canEdit ? "" : "disabled"}>New playlist</button>
    </header>
    <div class="video-analysis-playlist-library__toolbar">
      <input type="search" aria-label="Search playlists" placeholder="Search playlists" data-video-analysis-presentation-library-search value="${escapeHtml(state.presentation?.librarySearch || "")}">
      <select aria-label="Sort playlists" data-playlist-library-sort>
        ${[["updated", "Recently updated"], ["name", "Name"], ["clips", "Clip count"]].map(([value, label]) => `<option value="${value}" ${sort === value ? "selected" : ""}>${label}</option>`).join("")}
      </select>
    </div>
    ${library.status === "loading" ? '<p role="status">Loading playlists...</p>' : ""}
    ${library.error ? `<p role="alert">${escapeHtml(library.error)} <button type="button" data-playlist-library-retry>Retry</button></p>` : ""}
    <ul class="video-analysis-playlist-library__list" aria-label="Saved playlists">
      ${entries.slice(page * pageSize, (page + 1) * pageSize).map(item => renderPlaylist(item, state)).join("")}
    </ul>
    ${!entries.length && library.status !== "loading" && !library.error ? '<p class="video-analysis-playlist-library__empty">No playlists found</p>' : ""}
    ${totalPages > 1 ? `<nav class="video-analysis-playlist-library__pages" aria-label="Playlist pages">
      <button type="button" data-playlist-library-page="${page - 1}" aria-label="Previous page" ${page ? "" : "disabled"}>${playerHeaderIcon("chevronLeft")}</button>
      <span>${page + 1} / ${totalPages}</span>
      <button type="button" data-playlist-library-page="${page + 1}" aria-label="Next page" ${page + 1 < totalPages ? "" : "disabled"}>${playerHeaderIcon("chevronRight")}</button>
    </nav>` : ""}
  </section>`;
}
