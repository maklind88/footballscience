import { presentationQueue } from "../services/presentationService.js";
import { thumbnailCacheKey } from "../services/localThumbnailCacheService.js";
import { formatVideoTime } from "../services/videoPlaybackService.js";
import { escapeHtml } from "./renderHelpers.js";

function parseDateLabel(value = "") {
  if (!value) return "Draft";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Draft";
  return new Intl.DateTimeFormat("en", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function safeNumber(value, fallback = 0) {
  const number = Math.round(Number(value));
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function itemDurationMs(item = {}) {
  const clip = item.clip || {};
  const startMs = safeNumber(item.startMs ?? clip.startMs ?? clip.start_ms, 0);
  const endMs = safeNumber(item.endMs ?? clip.endMs ?? clip.end_ms, startMs);
  return Math.max(0, endMs - startMs);
}

function presentationStats(presentation = {}) {
  const queue = presentationQueue(presentation);
  const metadata = presentation.metadata || {};
  const metadataClipCount = metadata.clipCount ?? metadata.clip_count;
  const hasKnownClipCount = queue.length > 0 || metadataClipCount !== undefined;
  const clipCount = hasKnownClipCount ? (queue.length || safeNumber(metadataClipCount, 0)) : null;
  const totalDurationMs = queue.length
    ? queue.reduce((sum, item) => sum + itemDurationMs(item), 0)
    : safeNumber(metadata.totalDurationMs || metadata.total_duration_ms, 0);
  return { clipCount, hasKnownClipCount, totalDurationMs, queue };
}

function shareLabel(presentation = {}) {
  const targets = Array.isArray(presentation.shareTargets) ? presentation.shareTargets : [];
  if (targets.some((target) => target.targetType === "team")) return "Team";
  if (targets.some((target) => target.targetType === "player")) return "Players";
  if (targets.some((target) => target.targetType === "group")) return "Group";
  if (targets.some((target) => target.targetType === "user")) return "Selected users";
  return "Coach + analyst";
}

function cardPresentation(presentation = {}, current = {}) {
  if (presentation.id && presentation.id === current.id) return { ...presentation, ...current };
  return presentation;
}

function cardThumbnail(state = {}, presentation = {}, queue = []) {
  const firstClip = queue[0]?.clip || null;
  if (!firstClip) return "";
  return state.presentation?.thumbnails?.[thumbnailCacheKey(state.videoRef || {}, firstClip)] || "";
}

function presentationSearchText(presentation = {}) {
  return [
    presentation.title,
    presentation.purpose,
    presentation.status,
    presentation.ownerId,
    presentation.updatedAt,
    presentation.createdAt,
  ].filter(Boolean).join(" ").toLowerCase();
}

function renderPresentationCard(state = {}, presentation = {}) {
  const current = state.presentation?.current || {};
  const card = cardPresentation(presentation, current);
  const { clipCount, hasKnownClipCount, totalDurationMs, queue } = presentationStats(card);
  const thumbnailUrl = cardThumbnail(state, card, queue);
  const title = card.title || "Football Science Review";
  const updatedAt = parseDateLabel(card.updatedAt || card.createdAt);
  const owner = card.ownerName || card.ownerId || "Football Science";
  const duration = totalDurationMs ? formatVideoTime(totalDurationMs) : "00:00";
  const canPresent = Boolean(card.id || clipCount > 0);
  const clipLabel = hasKnownClipCount ? `${clipCount} clips` : "Open deck";
  return `
    <article class="video-analysis-presentation-library-card">
      <button type="button" class="video-analysis-presentation-library-card__media" data-video-analysis-presentation-present="${escapeHtml(card.id || "")}" ${canPresent ? "" : "disabled"}>
        ${thumbnailUrl ? `<img src="${escapeHtml(thumbnailUrl)}" alt="">` : `<span class="video-analysis-presentation-library-card__field" aria-hidden="true"></span>`}
        <span class="video-analysis-presentation-library-card__play" aria-hidden="true"></span>
        <span class="video-analysis-presentation-library-card__runtime">
          <strong>${escapeHtml(clipLabel)}</strong>
          <small>${escapeHtml(duration)}</small>
        </span>
      </button>
      <div class="video-analysis-presentation-library-card__body">
        <span>${escapeHtml(updatedAt)}</span>
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(owner)} / ${escapeHtml(shareLabel(card))}</p>
        <div class="video-analysis-presentation-library-card__actions">
          <button type="button" data-video-analysis-presentation-open="${escapeHtml(card.id || "")}">Open</button>
          <button type="button" class="video-analysis-primary-action" data-video-analysis-presentation-present="${escapeHtml(card.id || "")}" ${canPresent ? "" : "disabled"}>Present</button>
          <button type="button" aria-label="More presentation actions">...</button>
        </div>
      </div>
    </article>
  `;
}

export function renderPresentationOverview(state = {}) {
  const presentationState = state.presentation || {};
  const current = presentationState.current || {};
  const saved = Array.isArray(presentationState.presentations) ? presentationState.presentations : [];
  const currentIsUnsaved = !current.id && presentationQueue(current).length;
  const presentations = [
    ...(currentIsUnsaved ? [{ ...current, id: "", updatedAt: "", ownerId: "Unsaved draft" }] : []),
    ...saved,
  ];
  const search = String(presentationState.librarySearch || "").trim().toLowerCase();
  const filtered = search
    ? presentations.filter((presentation) => presentationSearchText(cardPresentation(presentation, current)).includes(search))
    : presentations;
  const totalClips = presentations.reduce((sum, presentation) => sum + (presentationStats(cardPresentation(presentation, current)).clipCount || 0), 0);

  return `
    <section class="video-analysis-presentation-library" aria-label="Presentation library">
      <header class="video-analysis-presentation-library-hero">
        <div>
          <h2>Presentations</h2>
          <p>Build, collect and present coaching clip decks.</p>
        </div>
        <button type="button" class="video-analysis-presentation-library-new" data-video-analysis-presentation-new>
          <span aria-hidden="true">+</span>
          New
        </button>
      </header>
      <section class="video-analysis-presentation-library-toolbar" aria-label="Presentation tools">
        <div>
          <strong>${escapeHtml(String(presentations.length))}</strong>
          <span>presentations</span>
        </div>
        <div>
          <strong>${escapeHtml(String(totalClips))}</strong>
          <span>clips</span>
        </div>
        <label>
          <span aria-hidden="true">Search</span>
          <input type="search" placeholder="Search presentations" data-video-analysis-presentation-library-search value="${escapeHtml(presentationState.librarySearch || "")}">
        </label>
      </section>
      <section class="video-analysis-presentation-library-grid" aria-label="Saved presentations">
        ${filtered.length
          ? filtered.map((presentation) => renderPresentationCard(state, presentation)).join("")
          : `
            <div class="video-analysis-presentation-library-empty">
              <strong>No presentations found</strong>
              <span>Create a new deck or adjust the search.</span>
              <button type="button" data-video-analysis-presentation-new>New presentation</button>
            </div>
          `}
      </section>
    </section>
  `;
}
