function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizeText(value = "", fallback = "") {
  return String(value || fallback).trim();
}

function timeValue(value = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
}

function sortStamp(item = {}) {
  return normalizeText(item.matchDate || item.createdAt);
}

export function sortClipBankItems(items = []) {
  return [...items].sort((first, second) => {
    const firstStamp = sortStamp(first);
    const secondStamp = sortStamp(second);
    if (firstStamp !== secondStamp) return secondStamp.localeCompare(firstStamp);
    const firstVideo = normalizeText(first.videoId || first.matchId);
    const secondVideo = normalizeText(second.videoId || second.matchId);
    if (firstVideo && firstVideo === secondVideo) return timeValue(first.startMs) - timeValue(second.startMs);
    return normalizeText(second.createdAt).localeCompare(normalizeText(first.createdAt));
  });
}

export function formatClipTime(ms = 0) {
  const totalSeconds = Math.max(0, Math.floor(timeValue(ms) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function durationLabel(clip = {}) {
  const start = timeValue(clip.startMs);
  const end = timeValue(clip.endMs);
  const duration = Math.max(0, end - start);
  return duration ? `${Math.round(duration / 1000)}s` : "";
}

function dateLabel(clip = {}) {
  const date = normalizeText(clip.matchDate || clip.createdAt).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "No date";
}

function sourceTitle(clip = {}) {
  return normalizeText(
    clip.matchTitle || clip.videoTitle || (clip.eventType === "match" ? "Match video" : "Training video"),
    "Training video"
  );
}

function eventTypeLabel(clip = {}) {
  return normalizeText(clip.eventType).toLowerCase() === "match" ? "Match" : "Training";
}

function tacticalTitle(clip = {}) {
  return [clip.subPhase, clip.phase].map((item) => normalizeText(item)).filter(Boolean).join(" / ")
    || "Tagged clip";
}

function principleLabels(clip = {}) {
  const labels = Array.isArray(clip.miniGamePrinciples) ? clip.miniGamePrinciples : [];
  const visible = labels.map((entry) => normalizeText(entry.label || entry.value)).filter(Boolean);
  if (!visible.length && normalizeText(clip.miniGamePrincipleId)) visible.push(clip.miniGamePrincipleId);
  return visible.slice(0, 3);
}

function clipSearchBlob(clip = {}) {
  return [
    tacticalTitle(clip),
    sourceTitle(clip),
    dateLabel(clip),
    eventTypeLabel(clip),
    clip.outcome,
    clip.status,
    ...principleLabels(clip),
  ].map((item) => normalizeText(item).toLowerCase()).join(" ");
}

function clipKey(clip = {}) {
  return normalizeText(clip.id || clip.clipInstanceId);
}

function renderClipCard(clip = {}, index = 0, selected = false, canEdit = false) {
  const id = clipKey(clip);
  const principles = principleLabels(clip);
  return `
    <article class="idp-clip-bank-row${selected ? " is-selected" : ""}">
      <label class="idp-clip-bank-row__select" aria-label="Select clip">
        <input type="checkbox" data-idp-clip-select="${escapeHtml(id)}" ${selected ? "checked" : ""}>
        <span>${escapeHtml(String(index + 1).padStart(2, "0"))}</span>
      </label>
      <button type="button" class="idp-clip-bank-row__body" data-idp-clip-play="${escapeHtml(id)}" title="Play clip">
        <strong>${escapeHtml(tacticalTitle(clip))}</strong>
        <span>${escapeHtml(sourceTitle(clip))}</span>
        <small>${escapeHtml([dateLabel(clip), eventTypeLabel(clip), formatClipTime(clip.startMs), durationLabel(clip)].filter(Boolean).join(" · "))}</small>
      </button>
      <div class="idp-clip-bank-row__meta">
        ${principles.map((label) => `<span>${escapeHtml(label)}</span>`).join("")}
        ${clip.outcome ? `<span>${escapeHtml(clip.outcome)}</span>` : ""}
      </div>
      <div class="idp-clip-bank-row__actions">
        <button
          type="button"
          class="idp-clip-bank-play"
          data-idp-clip-play="${escapeHtml(id)}"
          title="Play clip"
          aria-label="Play clip"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M8 5v14l11-7L8 5Z"></path>
          </svg>
        </button>
        ${canEdit ? `
          <button
            type="button"
            class="idp-clip-bank-remove"
            data-idp-clip-remove="${escapeHtml(id)}"
            title="Remove from Clip Bank"
            aria-label="Remove clip from Clip Bank"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M9 3h6l1 2h4v2H4V5h4l1-2Z"></path>
              <path d="M7 9h10l-.7 10.2c-.1 1-1 1.8-2 1.8H9.7c-1 0-1.9-.8-2-1.8L7 9Z"></path>
              <path d="M10 11v7M14 11v7"></path>
            </svg>
          </button>
        ` : ""}
      </div>
    </article>
  `;
}

export function renderClipBankOrganizer(detail = {}, canEdit = false, ui = {}) {
  const clips = sortClipBankItems(detail.clipBank || []);
  const query = normalizeText(ui.clipBankSearchQuery || "");
  const normalizedQuery = query.toLowerCase();
  const filteredClips = normalizedQuery
    ? clips.filter((clip) => clipSearchBlob(clip).includes(normalizedQuery))
    : clips;
  const selectedIds = new Set(Array.isArray(ui.selectedClipBankIds) ? ui.selectedClipBankIds : []);
  const visibleClips = filteredClips.slice(0, 24);
  const countLabel = normalizedQuery
    ? `${filteredClips.length} of ${clips.length} clips`
    : `${clips.length} clips`;
  return `
    <article class="idp-filmstrip-panel idp-clip-bank-organizer">
      <div class="idp-section-head idp-clip-bank-head">
        <div>
          <span>Clip Bank</span>
          <strong>${escapeHtml(countLabel)}</strong>
        </div>
        <div class="idp-clip-bank-actions">
          ${canEdit ? `<button type="button" data-idp-action="evidence">Log observation</button>` : ""}
        </div>
      </div>
      <label class="idp-clip-bank-search">
        <span>Search clips</span>
        <input type="text" data-idp-clip-search value="${escapeHtml(query)}" placeholder="Find clip, player, date or principle" autocomplete="off" spellcheck="false">
        <strong>${escapeHtml(countLabel)}</strong>
      </label>
      <div class="idp-clip-bank-list">
        ${visibleClips.length
          ? visibleClips.map((clip, index) => renderClipCard(clip, index, selectedIds.has(clipKey(clip)), canEdit)).join("")
          : `<div class="idp-empty-signal">${clips.length ? "No clips match this search." : "No clips waiting."}</div>`}
      </div>
      ${filteredClips.length > visibleClips.length ? `<div class="idp-clip-bank-more">${escapeHtml(String(filteredClips.length - visibleClips.length))} more clips in this player bank.</div>` : ""}
    </article>
  `;
}

export function renderIdpClipPreviewOverlay(detail = {}, ui = {}) {
  if (!ui.clipPreviewOpen) return "";
  const clips = sortClipBankItems(detail.clipBank || []);
  const queueIds = Array.isArray(ui.clipPreviewQueueIds) ? ui.clipPreviewQueueIds : [];
  const activeIndex = Math.max(0, Math.min(Number(ui.clipPreviewActiveIndex || 0), Math.max(0, queueIds.length - 1)));
  const queueMap = new Map(clips.map((clip) => [clipKey(clip), clip]));
  const activeClip = queueMap.get(queueIds[activeIndex]) || clips[0] || {};
  const url = normalizeText(ui.clipPreviewObjectUrl);
  const ready = ui.clipPreviewStatus === "ready" && url;
  return `
    <div class="idp-clip-preview-layer" data-idp-clip-preview-layer>
      <section class="idp-clip-preview-panel" role="dialog" aria-modal="true" aria-label="Clip preview">
        <header class="idp-clip-preview-header">
          <div>
            <span>${escapeHtml(`${activeIndex + 1} of ${Math.max(1, queueIds.length)}`)}</span>
            <strong>${escapeHtml(sourceTitle(activeClip))}</strong>
            <small>${escapeHtml([dateLabel(activeClip), tacticalTitle(activeClip), formatClipTime(activeClip.startMs)].filter(Boolean).join(" · "))}</small>
          </div>
          <button type="button" data-idp-clip-preview-close aria-label="Close preview">Close</button>
        </header>
        <div class="idp-clip-preview-video-wrap">
          ${ready
            ? `<video data-idp-clip-preview-video controls playsinline src="${escapeHtml(url)}" data-start-ms="${escapeHtml(String(timeValue(activeClip.startMs)))}" data-end-ms="${escapeHtml(String(timeValue(activeClip.endMs)))}"></video>`
            : `<div class="idp-clip-preview-status">
                <strong>${escapeHtml(ui.clipPreviewMessage || "Connecting local video")}</strong>
                <span>The clip metadata is central, but playback needs the local file on this device.</span>
              </div>`}
        </div>
        <footer class="idp-clip-preview-footer">
          <button type="button" data-idp-clip-preview-prev ${activeIndex <= 0 ? "disabled" : ""}>Previous</button>
          <div class="idp-clip-preview-queue">
            ${queueIds.slice(0, 10).map((id, index) => {
              const clip = queueMap.get(id) || {};
              return `<button type="button" class="${index === activeIndex ? "is-active" : ""}" data-idp-clip-preview-jump="${escapeHtml(String(index))}">${escapeHtml(formatClipTime(clip.startMs))}</button>`;
            }).join("")}
          </div>
          <button type="button" data-idp-clip-preview-next ${activeIndex >= queueIds.length - 1 ? "disabled" : ""}>Next</button>
        </footer>
      </section>
    </div>
  `;
}
