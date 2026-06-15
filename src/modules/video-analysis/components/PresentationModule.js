import { formatVideoTime } from "../services/videoPlaybackService.js";
import { buildVideoLibraryItems } from "../services/videoLibraryService.js";
import { renderClipFilters } from "./ClipFilters.js";
import { renderClipIntelligence } from "./ClipIntelligence.js";
import { renderClipList } from "./ClipList.js";
import { escapeHtml } from "./renderHelpers.js";

function formatDate(value = "") {
  if (!value) return "No date";
  const [year, month, day] = String(value).split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function eventTypeLabel(type = "") {
  return String(type || "").toLowerCase() === "match" ? "Match" : "Training";
}

const presentationModes = Object.freeze([
  { id: "build", label: "Build" },
  { id: "stage", label: "Stage" },
  { id: "draw", label: "Draw" },
  { id: "deliver", label: "Deliver" },
]);

const drawingTools = Object.freeze([
  { id: "arrow", label: "Arrow" },
  { id: "circle", label: "Circle" },
  { id: "spotlight", label: "Spotlight" },
  { id: "text", label: "Text" },
  { id: "freeze", label: "Freeze" },
  { id: "zoom", label: "Zoom" },
]);

function normalizePresentationMode(mode = "") {
  return presentationModes.some((item) => item.id === mode) ? mode : "build";
}

function normalizeDrawingTool(tool = "") {
  return drawingTools.some((item) => item.id === tool) ? tool : "arrow";
}

function clipLabel(clip = {}) {
  return `${clip.phase || "Clip"} / ${clip.outcome || "Neutral"}`;
}

function presentationClipItems(sections = [], clipsById = new Map()) {
  return sections.flatMap((section) => {
    const items = Array.isArray(section.items) ? section.items : [];
    return items
      .filter((item) => item?.clipId)
      .map((item, index) => ({
        ...item,
        index,
        sectionId: section.id || "",
        sectionTitle: section.title || "Review",
        sectionNote: section.note || "",
        clip: clipsById.get(item.clipId) || { id: item.clipId },
      }));
  });
}

function activePresentationItem(items = [], selectedClipId = "") {
  return items.find((item) => item.clipId === selectedClipId) || items[0] || null;
}

function renderPresentationModeBar(activeMode = "build") {
  return `
    <div class="video-analysis-presentation-modebar" role="tablist" aria-label="Presentation mode">
      ${presentationModes.map((mode) => `
        <button type="button"
          class="${activeMode === mode.id ? "is-active" : ""}"
          role="tab"
          aria-selected="${activeMode === mode.id ? "true" : "false"}"
          data-video-analysis-presentation-mode="${escapeHtml(mode.id)}">
          ${escapeHtml(mode.label)}
        </button>
      `).join("")}
    </div>
  `;
}

function renderPresentationQueueItem(item = {}, active = false) {
  const clip = item.clip || {};
  const startMs = clip.startMs || clip.start_ms || 0;
  return `
    <button type="button"
      class="video-analysis-presentation-queue-item${active ? " is-active" : ""}"
      data-video-analysis-seek="${escapeHtml(item.clipId || clip.id || "")}">
      <span>${escapeHtml(formatVideoTime(startMs))}</span>
      <strong>${escapeHtml(clipLabel(clip))}</strong>
      <small>${escapeHtml(item.sectionTitle || "Review")}</small>
    </button>
  `;
}

function renderPresentationStats(sections = [], queueItems = []) {
  const sectionsWithClips = sections.filter((section) => Number((section.items || []).length)).length;
  return `
    <div class="video-analysis-presentation-stats" aria-label="Presentation totals">
      <span><strong>${queueItems.length}</strong><small>clips</small></span>
      <span><strong>${sectionsWithClips}</strong><small>sections</small></span>
    </div>
  `;
}

function renderPresentationBuildRoom(state = {}, sections = [], clipsById = new Map(), queueItems = []) {
  return `
    <div class="video-analysis-presentation-board">
      ${renderTaggedSessionList(state)}
      <section class="video-analysis-presentation-library" aria-label="Presentation clip library">
        ${renderClipFilters(state)}
        ${renderClipIntelligence(state)}
        ${renderClipList(state)}
      </section>
    </div>
    <div class="video-analysis-presentation-sections">
      ${sections.map((section) => renderPresentationSection(section, clipsById, state.activeReviewSectionId)).join("")}
    </div>
    ${renderPresentationStats(sections, queueItems)}
  `;
}

function renderPresentationStage(state = {}, sections = [], clipsById = new Map(), queueItems = []) {
  const activeItem = activePresentationItem(queueItems, state.selectedClipId);
  const activeClip = activeItem?.clip || {};
  const startMs = activeClip.startMs || activeClip.start_ms || 0;
  return `
    <div class="video-analysis-presentation-stage">
      <section class="video-analysis-presentation-stage__player" aria-label="Presentation stage">
        <div>
          <p class="video-analysis-kicker">Stage</p>
          <h3>${escapeHtml(activeItem ? clipLabel(activeClip) : "No staged clips")}</h3>
        </div>
        <div class="video-analysis-presentation-stage-frame">
          <span>${escapeHtml(activeItem?.sectionTitle || "Presentation")}</span>
          <strong>${escapeHtml(formatVideoTime(startMs))}</strong>
          <small>${escapeHtml(activeItem?.sectionNote || state.reviewTitle || "Football Science Review")}</small>
        </div>
      </section>
      <aside class="video-analysis-presentation-queue" aria-label="Presentation queue">
        <div class="video-analysis-panel-header">
          <div>
            <p class="video-analysis-kicker">Queue</p>
            <h3>${escapeHtml(`${queueItems.length} clips`)}</h3>
          </div>
        </div>
        <div class="video-analysis-presentation-queue-list">
          ${queueItems.length
            ? queueItems.map((item) => renderPresentationQueueItem(item, item.clipId === activeItem?.clipId)).join("")
            : `<p class="video-analysis-muted">No staged clips.</p>`}
        </div>
      </aside>
    </div>
    <div class="video-analysis-presentation-sections is-compact">
      ${sections.map((section) => renderPresentationSection(section, clipsById, state.activeReviewSectionId)).join("")}
    </div>
  `;
}

function renderDrawTool(tool = {}, activeTool = "arrow") {
  const active = tool.id === activeTool;
  return `
    <button type="button"
      class="${active ? "is-active" : ""}"
      aria-pressed="${active ? "true" : "false"}"
      data-video-analysis-draw-tool="${escapeHtml(tool.id)}">
      ${escapeHtml(tool.label)}
    </button>
  `;
}

function renderPresentationDrawRoom(state = {}, queueItems = []) {
  const activeTool = normalizeDrawingTool(state.presentationDrawingTool);
  const activeItem = activePresentationItem(queueItems, state.selectedClipId);
  const activeClip = activeItem?.clip || {};
  return `
    <div class="video-analysis-draw-room">
      <section class="video-analysis-draw-preview" aria-label="Drawing preview">
        <div>
          <p class="video-analysis-kicker">Draw</p>
          <h3>${escapeHtml(activeItem ? clipLabel(activeClip) : "No staged clips")}</h3>
        </div>
        <div class="video-analysis-draw-canvas is-${escapeHtml(activeTool)}">
          <span class="video-analysis-draw-freeze"></span>
          <span class="video-analysis-draw-line"></span>
          <span class="video-analysis-draw-target"></span>
          <strong>${escapeHtml(drawingTools.find((tool) => tool.id === activeTool)?.label || "Arrow")}</strong>
        </div>
      </section>
      <aside class="video-analysis-draw-tools" aria-label="Drawing tools">
        <div class="video-analysis-panel-header">
          <div>
            <p class="video-analysis-kicker">Tools</p>
            <h3>${escapeHtml(drawingTools.find((tool) => tool.id === activeTool)?.label || "Arrow")}</h3>
          </div>
        </div>
        <div class="video-analysis-draw-tool-grid">
          ${drawingTools.map((tool) => renderDrawTool(tool, activeTool)).join("")}
        </div>
        <div class="video-analysis-presentation-queue-list">
          ${queueItems.length
            ? queueItems.map((item) => renderPresentationQueueItem(item, item.clipId === activeItem?.clipId)).join("")
            : `<p class="video-analysis-muted">No staged clips.</p>`}
        </div>
      </aside>
    </div>
  `;
}

function renderDeliverSection(section = {}, clipsById = new Map()) {
  const items = Array.isArray(section.items) ? section.items : [];
  return `
    <section class="video-analysis-deliver-section">
      <div>
        <p class="video-analysis-kicker">${escapeHtml(`${items.length} clips`)}</p>
        <h3>${escapeHtml(section.title || "Review")}</h3>
      </div>
      ${section.note ? `<p>${escapeHtml(section.note)}</p>` : ""}
      <ol>
        ${items.length
          ? items.map((item) => {
              const clip = clipsById.get(item.clipId) || {};
              return `<li><span>${escapeHtml(formatVideoTime(clip.startMs || clip.start_ms || 0))}</span>${escapeHtml(clipLabel(clip))}</li>`;
            }).join("")
          : `<li class="video-analysis-muted">No clips selected.</li>`}
      </ol>
    </section>
  `;
}

function renderPresentationDeliverRoom(state = {}, sections = [], clipsById = new Map(), queueItems = []) {
  const activeItem = activePresentationItem(queueItems, state.selectedClipId);
  const deliverSections = sections.filter((section) => Number((section.items || []).length));
  return `
    <div class="video-analysis-deliver-room">
      <section class="video-analysis-deliver-hero" aria-label="Delivery view">
        <div>
          <p class="video-analysis-kicker">Deliver</p>
          <h3>${escapeHtml(state.reviewTitle || "Football Science Review")}</h3>
        </div>
        ${renderPresentationStats(sections, queueItems)}
        <div class="video-analysis-deliver-now">
          <span>${escapeHtml(activeItem?.sectionTitle || "Presentation")}</span>
          <strong>${escapeHtml(activeItem ? clipLabel(activeItem.clip || {}) : "No staged clips")}</strong>
        </div>
      </section>
      <div class="video-analysis-deliver-sections">
        ${deliverSections.length
          ? deliverSections.map((section) => renderDeliverSection(section, clipsById)).join("")
          : `<section class="video-analysis-deliver-section"><p class="video-analysis-muted">No clips selected.</p></section>`}
      </div>
    </div>
  `;
}

function renderPresentationItem(item = {}, clip = {}, sectionId = "") {
  const startMs = clip.startMs || clip.start_ms || 0;
  return `
    <li class="video-analysis-presentation-item">
      <button type="button" data-video-analysis-seek="${escapeHtml(item.clipId)}">${escapeHtml(formatVideoTime(startMs))}</button>
      <span>${escapeHtml(clip.phase || "Clip")} / ${escapeHtml(clip.outcome || "Neutral")}</span>
      <button type="button" data-video-analysis-review-remove="${escapeHtml(sectionId)}:${escapeHtml(item.clipId)}">Remove</button>
    </li>
  `;
}

function renderPresentationSection(section = {}, clipsById = new Map(), activeSectionId = "") {
  const items = Array.isArray(section.items) ? section.items : [];
  return `
    <section class="video-analysis-presentation-section${activeSectionId === section.id ? " is-active" : ""}">
      <button type="button" class="video-analysis-presentation-section__header" data-video-analysis-review-section="${escapeHtml(section.id)}">
        <span>${escapeHtml(section.title)}</span>
        <strong>${items.length}</strong>
      </button>
      <textarea rows="2" placeholder="Meeting note" data-video-analysis-review-note="${escapeHtml(section.id)}">${escapeHtml(section.note || "")}</textarea>
      <ol>
        ${items.length ? items.map((item) => renderPresentationItem(item, clipsById.get(item.clipId) || {}, section.id)).join("") : `<li class="video-analysis-muted">No clips selected.</li>`}
      </ol>
    </section>
  `;
}

function taggedSessions(state = {}) {
  const items = buildVideoLibraryItems(state)
    .filter((item) => item.kind === "match" && item.hasVideo && Number(item.clipCount || 0) > 0);
  if (items.length || !state.match?.id || !Number((state.clips || []).length)) return items;
  return [{
    key: `match:${state.match.id}`,
    id: state.match.id,
    title: state.match.title || "Current session",
    matchDate: state.match.match_date || state.match.matchDate || "",
    eventType: state.match.event_type || state.match.eventType || "match",
    clipCount: (state.clips || []).length,
  }];
}

function renderTaggedSession(item = {}, state = {}) {
  const active = item.id && state.match?.id === item.id;
  return `
    <button type="button" class="video-analysis-presentation-session${active ? " is-active" : ""}"
      data-video-analysis-presentation-session="${escapeHtml(item.key)}">
      <span>${escapeHtml(item.title || "Untitled session")}</span>
      <small>${escapeHtml(`${formatDate(item.matchDate)} - ${eventTypeLabel(item.eventType)} - ${item.clipCount || 0} clips`)}</small>
    </button>
  `;
}

function renderTaggedSessionList(state = {}) {
  const sessions = taggedSessions(state);
  return `
    <aside class="video-analysis-presentation-sessions" aria-label="Tagged matches and training">
      <div class="video-analysis-panel-header">
        <div>
          <p class="video-analysis-kicker">Tagged sessions</p>
          <h3>${escapeHtml(`${sessions.length} ready`)}</h3>
        </div>
      </div>
      <div class="video-analysis-presentation-session-list">
        ${sessions.length
          ? sessions.map((item) => renderTaggedSession(item, state)).join("")
          : `<p class="video-analysis-muted">No tagged matches or training sessions yet.</p>`}
      </div>
    </aside>
  `;
}

export function renderPresentationModule(state = {}) {
  const clipsById = new Map((state.clips || []).map((clip) => [clip.id, clip]));
  const sections = Array.isArray(state.reviewSections) ? state.reviewSections : [];
  const activeMode = normalizePresentationMode(state.presentationMode);
  const queueItems = presentationClipItems(sections, clipsById);
  const roomContent = {
    build: renderPresentationBuildRoom(state, sections, clipsById, queueItems),
    stage: renderPresentationStage(state, sections, clipsById, queueItems),
    draw: renderPresentationDrawRoom(state, queueItems),
    deliver: renderPresentationDeliverRoom(state, sections, clipsById, queueItems),
  }[activeMode];
  return `
    <section class="video-analysis-presentation" data-video-analysis-presentation-module>
      <div class="video-analysis-panel-header">
        <div>
          <p class="video-analysis-kicker">Presentation</p>
          <h3>${escapeHtml(state.reviewTitle || "Football Science Review")}</h3>
        </div>
        <div class="video-analysis-presentation-actions">
          <input class="video-analysis-file-input" type="file" accept="video/*" data-video-analysis-file hidden>
          <button type="button" class="video-analysis-primary-action" data-video-analysis-load>Link local video</button>
          <button type="button" data-video-analysis-save-review ${state.canEdit ? "" : "disabled"}>Save presentation</button>
        </div>
      </div>
      ${renderPresentationModeBar(activeMode)}
      ${roomContent}
    </section>
  `;
}
