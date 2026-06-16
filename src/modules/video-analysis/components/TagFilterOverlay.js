import { escapeHtml } from "./renderHelpers.js";

function normalizeText(value = "") {
  return String(value || "").trim();
}

function shortOwnerId(ownerId = "") {
  const value = normalizeText(ownerId);
  if (!value) return "Team clips";
  return `User ${value.slice(0, 6)}`;
}

function ownerLabel(clip = {}) {
  return normalizeText(
    clip.ownerName
    || clip.owner_name
    || clip.createdByName
    || clip.created_by_name
    || clip.createdByLabel
    || clip.created_by_label
  ) || shortOwnerId(clip.ownerId || clip.owner_id || clip.createdBy || clip.created_by);
}

function buildCountOptions(items = [], getKey = () => "", getLabel = getKey) {
  const byKey = new Map();
  for (const item of items) {
    const key = normalizeText(getKey(item));
    if (!key) continue;
    const current = byKey.get(key) || { key, label: normalizeText(getLabel(item)) || key, count: 0 };
    current.count += 1;
    byKey.set(key, current);
  }
  return [...byKey.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function clipTags(clip = {}) {
  return Array.isArray(clip.tags) ? clip.tags.map(normalizeText).filter(Boolean) : [];
}

function tagOptions(clips = []) {
  const rows = [];
  for (const clip of clips) {
    for (const tag of clipTags(clip)) rows.push({ tag });
  }
  return buildCountOptions(rows, (item) => item.tag);
}

function ownerOptions(clips = []) {
  return buildCountOptions(
    clips,
    (clip) => clip.ownerId || clip.owner_id || clip.createdBy || clip.created_by || "team",
    ownerLabel
  );
}

function filterChip({ kind, value, label, count, active = false, primary = false }) {
  return `
    <button
      type="button"
      class="video-analysis-tag-filter-chip${active ? " is-active" : ""}${primary ? " is-primary" : ""}"
      data-video-analysis-tag-filter
      data-video-analysis-tag-filter-kind="${escapeHtml(kind)}"
      data-video-analysis-tag-filter-value="${escapeHtml(value)}"
      aria-pressed="${active ? "true" : "false"}"
    >
      <span>${escapeHtml(label)}</span>
      ${Number.isFinite(count) ? `<strong>${escapeHtml(String(count))}</strong>` : ""}
    </button>
  `;
}

function renderFilterGroup(title = "", chips = []) {
  return `
    <section class="video-analysis-tag-filter-group">
      <h4>${escapeHtml(title)}</h4>
      <div class="video-analysis-tag-filter-chip-row">
        ${chips.join("")}
      </div>
    </section>
  `;
}

export function renderTagFilterOverlay(state = {}) {
  const timeline = state.timeline || {};
  if (!timeline.tagFilterOpen) return "";
  const clips = Array.isArray(state.allClips) && state.allClips.length ? state.allClips : state.clips || [];
  const filters = state.filters || {};
  const owners = ownerOptions(clips).filter((owner) => owner.key !== "team");
  const tags = tagOptions(clips);
  const totalCount = clips.length;
  return `
    <div class="video-analysis-tag-filter-overlay" role="dialog" aria-modal="true" aria-labelledby="video-analysis-tag-filter-title">
      <button type="button" class="video-analysis-tag-filter-backdrop" data-video-analysis-tag-filter-close aria-label="Close tag filters"></button>
      <section class="video-analysis-tag-filter-panel">
        <header class="video-analysis-tag-filter-header">
          <div>
            <p class="video-analysis-kicker">Timeline filters</p>
            <h3 id="video-analysis-tag-filter-title">Filter tags</h3>
          </div>
          <button type="button" class="video-analysis-tag-filter-close" data-video-analysis-tag-filter-close aria-label="Close tag filters">x</button>
        </header>
        <div class="video-analysis-tag-filter-body">
          ${renderFilterGroup("Dataset", [
            filterChip({
              kind: "ownerId",
              value: "",
              label: "All datasets",
              count: totalCount,
              active: !filters.ownerId,
              primary: true,
            }),
            ...owners.map((owner) => filterChip({
              kind: "ownerId",
              value: owner.key === "team" ? "" : owner.key,
              label: owner.label,
              count: owner.count,
              active: Boolean(filters.ownerId) && filters.ownerId === owner.key,
            })),
          ])}
          ${renderFilterGroup("Main tags", [
            filterChip({
              kind: "tag",
              value: "",
              label: "All tags",
              count: totalCount,
              active: !filters.tag,
              primary: true,
            }),
            ...(tags.length
              ? tags.map((tag) => filterChip({
                kind: "tag",
                value: tag.key,
                label: tag.label,
                count: tag.count,
                active: filters.tag === tag.key,
              }))
              : [`<span class="video-analysis-tag-filter-empty">No tags on the current clips.</span>`]),
          ])}
        </div>
      </section>
    </div>
  `;
}
