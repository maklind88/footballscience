function defaultEscapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function defaultState() {
  return {
    printOverlayOpen: false,
    printPaper: "letter",
    printSections: {},
    selectedDate: "",
  };
}

function defaultPaperOptions() {
  return {
    letter: {
      label: "US Letter",
      detail: "11 x 8.5 in landscape",
      pageSize: "letter landscape",
      width: "11in",
      height: "8.5in",
    },
  };
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function createSessionPlannerPrintRenderer(options = {}) {
  const escapeHtml = typeof options.escapeHtml === "function" ? options.escapeHtml : defaultEscapeHtml;
  const getState = typeof options.getState === "function" ? options.getState : defaultState;
  const getPaperOptions = typeof options.getPaperOptions === "function" ? () => normalizeObject(options.getPaperOptions()) : defaultPaperOptions;
  const getSectionOptions = typeof options.getSectionOptions === "function" ? () => normalizeArray(options.getSectionOptions()) : () => [];
  const normalizeMultiValue = typeof options.normalizeMultiValue === "function" ? options.normalizeMultiValue : (value) => normalizeArray(value);
  const getPeriodizationDay = typeof options.getPeriodizationDay === "function" ? options.getPeriodizationDay : () => ({});
  const getMedicalAvailability = typeof options.getMedicalAvailability === "function" ? options.getMedicalAvailability : () => ({ all: [], available: [], limited: [], unconfirmed: [] });
  const getPlayerBoardCustomColor = typeof options.getPlayerBoardCustomColor === "function" ? options.getPlayerBoardCustomColor : () => "";
  const getPlayerBoardTone = typeof options.getPlayerBoardTone === "function" ? options.getPlayerBoardTone : () => "full";
  const getPlayerBoardSummary = typeof options.getPlayerBoardSummary === "function" ? options.getPlayerBoardSummary : () => ({ boardPlayers: [], rule: { valueLabel: "Players" } });
  const getInitialLabelMap = typeof options.getInitialLabelMap === "function" ? options.getInitialLabelMap : () => new Map();
  const getReadablePlayerBoardPositions = typeof options.getReadablePlayerBoardPositions === "function" ? options.getReadablePlayerBoardPositions : () => new Map();
  const getReadableSpacing = typeof options.getReadableSpacing === "function" ? options.getReadableSpacing : () => ({});
  const getPlayerBoardPosition = typeof options.getPlayerBoardPosition === "function" ? options.getPlayerBoardPosition : () => ({ x: 50, y: 50 });
  const getPlayerBoardTextColor = typeof options.getPlayerBoardTextColor === "function" ? options.getPlayerBoardTextColor : () => "#1d1d1f";
  const getPlayerInitials = typeof options.getPlayerInitials === "function" ? options.getPlayerInitials : () => "?";
  const renderExerciseVisual = typeof options.renderExerciseVisual === "function" ? options.renderExerciseVisual : () => "";
  const getSessionDateLabel = typeof options.getSessionDateLabel === "function" ? options.getSessionDateLabel : (value) => String(value || "");
  const getMatchDayLabel = typeof options.getMatchDayLabel === "function" ? options.getMatchDayLabel : () => "";
  const getDayScheduleLabel = typeof options.getDayScheduleLabel === "function" ? options.getDayScheduleLabel : () => "";
  const getScheduledSessionTitle = typeof options.getScheduledSessionTitle === "function" ? options.getScheduledSessionTitle : () => "";
  const getTotalMinutes = typeof options.getTotalMinutes === "function" ? options.getTotalMinutes : () => 0;

function getSessionPlannerPrintPaperOption(value = getState().printPaper) {
return getPaperOptions()[value] ?? getPaperOptions().letter;
}
function getSessionPlannerPrintFieldValue(value, fallback = "-") {
const text = Array.isArray(value)
? value.map((item) => String(item ?? "").trim()).filter(Boolean).join(", ")
: String(value ?? "").trim();
return text || fallback;
}
function getSessionPlannerPrintMultiValue(value, fallback = "-") {
const values = normalizeMultiValue(value);
return values.length ? values.join(", ") : fallback;
}
function getSessionPlannerPrintBlocks(session) {
return Array.isArray(session?.blocks) ? session.blocks : [];
}
function renderSessionPlannerPrintPaperSelect() {
return `
    <label class="session-print-control">
      <span>Paper</span>
      <select data-session-print-paper>
        ${Object.entries(getPaperOptions())
          .map(([key, option]) => `
<option value="${escapeHtml(key)}"${getState().printPaper === key ? " selected" : ""}>
${escapeHtml(option.label)} - ${escapeHtml(option.detail)}
</option>
`)
          .join("")}
      </select>
    </label>
  `;
}
function renderSessionPlannerPrintSectionToggles() {
return `
    <div class="session-print-section-toggles" aria-label="Print sections">
      ${getSectionOptions()
        .map((option) => `
<label>
<input
type="checkbox"
data-session-print-section="${escapeHtml(option.key)}"
${getState().printSections[option.key] ? "checked" : ""}
/>
<span>${escapeHtml(option.label)}</span>
</label>
`)
        .join("")}
    </div>
  `;
}
function renderSessionPlannerPrintMetaItem(label, value) {
return `
    <span>
      <small>${escapeHtml(label)}</small>
      <strong>${escapeHtml(getSessionPlannerPrintFieldValue(value))}</strong>
    </span>
  `;
}
function renderSessionPlannerPrintPeriodizationCard(dateValue) {
const day = getPeriodizationDay(dateValue);
const matchPhases = getSessionPlannerPrintMultiValue(day.matchPhases, "");
const subPhases = getSessionPlannerPrintMultiValue(day.subPhases, "");
const principles = getSessionPlannerPrintMultiValue(day.teamPrinciples, "");
const mainFocus = getSessionPlannerPrintFieldValue(day.mainFocus, "");
const phaseLine = subPhases
? `${matchPhases || "Phase not set"} (${subPhases})`
: matchPhases || "";
return `
    <section class="session-print-card session-print-day-context-card">
      <dl class="session-print-compact-list session-print-day-context-list">
        <div><dt>Phases & subphases</dt><dd>${escapeHtml(phaseLine || "-")}</dd></div>
        <div><dt>Principles</dt><dd>${escapeHtml(principles || "-")}</dd></div>
        <div><dt>Main focus</dt><dd>${escapeHtml(mainFocus || "-")}</dd></div>
      </dl>
    </section>
  `;
}
function renderSessionPlannerPrintMedicalCard(dateValue) {
const availability = getMedicalAvailability(dateValue);
const buckets = [0, 10, 25, 50, 75, 100].map((participation) => ({
participation,
count: availability.all.filter((item) => item.record && item.participation === participation).length,
}));
return `
    <section class="session-print-card session-print-medical-card session-print-medical-compact-card">
      <header>
        <span>Medical availability</span>
        <strong>${availability.available.length} full / ${availability.limited.length} limited</strong>
      </header>
      <div class="session-print-medical-buckets">
        ${buckets
          .map((bucket) => `
<span class="session-print-medical-bucket is-availability-${bucket.participation}">
<strong>${bucket.participation}%</strong>
<small>${bucket.count}</small>
</span>
`)
          .join("")}
      </div>
      ${availability.unconfirmed.length > 0 ? `<small>${availability.unconfirmed.length} not set</small>` : ""}
    </section>
  `;
}
function renderSessionPlannerPrintMaterialCard(blocks) {
const materialItems = blocks
.map((block, index) => ({
title: block.title || block.label || `Block ${index + 1}`,
material: getSessionPlannerPrintFieldValue(block.material, ""),
}))
.filter((item) => item.material);
return `
    <section class="session-print-card session-print-material-card">
      <header>
        <span>Setup</span>
        <strong>Measure & material</strong>
      </header>
      <ul>
        ${
          materialItems.length
            ? materialItems
                .map((item) => `<li><strong>${escapeHtml(item.title)}</strong> ${escapeHtml(item.material)}</li>`)
                .join("")
            : "<li>No material added.</li>"
        }
      </ul>
    </section>
  `;
}
function renderSessionPlannerPrintBlockFlow(session) {
const blocks = getSessionPlannerPrintBlocks(session);
if (!blocks.length) {
return `<p class="session-print-empty">No blocks planned for this session.</p>`;
}
return `
    <section class="session-print-flow">
      ${blocks
        .map((block, index) => `
<article>
<div class="session-print-flow-time">
<span>${escapeHtml(block.label || `B${index + 1}`)}</span>
<strong>${Number(block.minutes) || "-"}'</strong>
</div>
<div>
<strong>${escapeHtml(block.title || "Untitled block")}</strong>
<span>${escapeHtml(getSessionPlannerPrintMultiValue(block.phase))} / ${escapeHtml(getSessionPlannerPrintMultiValue(block.subPhase))}</span>
<p>${escapeHtml(getSessionPlannerPrintFieldValue(block.focus, ""))}</p>
</div>
</article>
`)
        .join("")}
    </section>
  `;
}
function getSessionPlannerPrintPlayerColor(item, block) {
const customColor = getPlayerBoardCustomColor(block, item.player.id);
if (customColor) {
return customColor;
}
const colors = {
low: "#f97316",
rehab: "#f59e0b",
controlled: "#0ea5e9",
modified: "#7c3aed",
full: "#16a34a",
};
return colors[getPlayerBoardTone(item.participation)] ?? colors.full;
}
function renderSessionPlannerPrintPlayerBoardMini(block) {
const { boardPlayers, rule } = getPlayerBoardSummary(block);
const labelMap = getInitialLabelMap(boardPlayers);
const printPositions = getReadablePlayerBoardPositions(
block,
boardPlayers,
getReadableSpacing(boardPlayers.length, "print")
);
return `
    <div class="session-print-player-board-mini" aria-label="Player board snapshot">
      <span class="session-print-board-line session-print-board-line-half"></span>
      <span class="session-print-board-line session-print-board-line-box-left"></span>
      <span class="session-print-board-line session-print-board-line-box-right"></span>
      ${
        boardPlayers.length
          ? boardPlayers
              .map((item, index) => {
                const position =
                  printPositions.get(item.player.id) ??
                  getPlayerBoardPosition(block, item, index, boardPlayers);
                const color = getSessionPlannerPrintPlayerColor(item, block);
                return `
<span
class="session-print-player-token${item.player.playerBoardCustom ? " is-custom-person" : ""}"
style="left: ${position.x}%; top: ${position.y}%; --session-print-player-color: ${escapeHtml(color)}; --session-print-player-text: ${escapeHtml(getPlayerBoardTextColor(color))};"
title="${escapeHtml(`${item.player.name} ${item.participation}%`)}"
>${escapeHtml(labelMap.get(item.player.id) ?? getPlayerInitials(item.player))}</span>
`;
              })
              .join("")
          : `<span class="session-print-board-empty">${escapeHtml(rule.valueLabel)}: no players</span>`
      }
    </div>
  `;
}
function renderSessionPlannerPrintVisual(block, options = {}) {
if (!getState().printSections.visuals) {
return "";
}
const classes = ["session-print-visual"];
if (options.landscape) {
classes.push("is-landscape");
}
const visual = renderExerciseVisual(block, {
printRotated: Boolean(options.landscape),
});
return `
    <div class="${classes.join(" ")}">
      ${
        options.landscape
          ? `<div class="session-print-visual-rotated-frame">${visual}</div>`
          : visual
      }
    </div>
  `;
}
function renderSessionPlannerPrintBlockCopyItems(block) {
const items = [
["Focus", getSessionPlannerPrintFieldValue(block.focus, "")],
["Objective", getSessionPlannerPrintFieldValue(block.objective, "")],
["Why", getSessionPlannerPrintFieldValue(block.why, "")],
["Organization", getSessionPlannerPrintFieldValue(block.organization, "")],
["Measure & material", getSessionPlannerPrintFieldValue(block.material, "")],
["Principles & coaching points", getSessionPlannerPrintFieldValue(block.principles, "")],
].filter(([, value]) => value);
if (!items.length) {
return `<p><strong>Notes</strong>No exercise text added.</p>`;
}
return items
.map(([label, value]) => `<p><strong>${escapeHtml(label)}</strong>${escapeHtml(value)}</p>`)
.join("");
}
function renderSessionPlannerPrintFeatureNote(label, value) {
return `
    <p class="session-print-feature-note">
      <strong>${escapeHtml(label)}</strong>
      <span>${escapeHtml(value || "-")}</span>
    </p>
  `;
}
function renderSessionPlannerPrintFeatureBlock(block, index) {
if (!block) {
return `
      <article class="session-print-feature-block is-empty">
        <div>
          <span>Block ${index + 1}</span>
          <strong>No block planned</strong>
        </div>
      </article>
    `;
}
const phaseLabel = [
getSessionPlannerPrintMultiValue(block.phase, ""),
getSessionPlannerPrintMultiValue(block.subPhase, ""),
].filter(Boolean).join(" / ");
const organization = getSessionPlannerPrintFieldValue(block.organization, "");
const principles = getSessionPlannerPrintFieldValue(block.principles, "");
return `
    <article class="session-print-feature-block">
      <header>
        <div class="session-print-feature-title">
          <span>${escapeHtml(block.label || `Block ${index + 1}`)} · ${Number(block.minutes) || "-"} min</span>
          <strong>${escapeHtml(block.title || "Untitled block")}</strong>
          <small>${escapeHtml(phaseLabel || "Phase not set")}</small>
        </div>
        <div class="session-print-feature-notes">
          ${renderSessionPlannerPrintFeatureNote("Organization", organization)}
          ${renderSessionPlannerPrintFeatureNote("Coaching Points & Principles", principles)}
        </div>
      </header>
      <div class="session-print-feature-body${getState().printSections.players ? " has-player-board" : ""}">
        <div class="session-print-feature-visuals">
          ${renderSessionPlannerPrintVisual(block, { landscape: true })}
        </div>
        ${
          getState().printSections.players
            ? `<div class="session-print-feature-player-board">${renderSessionPlannerPrintPlayerBoardMini(block)}</div>`
            : ""
        }
      </div>
    </article>
  `;
}
function renderSessionPlannerPrintFeaturedBlocks(blocks, startIndex = 0) {
return [0, 1]
.map((offset) => {
const blockIndex = startIndex + offset;
return renderSessionPlannerPrintFeatureBlock(blocks[blockIndex], blockIndex);
})
.join("");
}
function renderSessionPlannerPrintBlockDetail(block, index) {
const phaseLabel = [
getSessionPlannerPrintMultiValue(block.phase, ""),
getSessionPlannerPrintMultiValue(block.subPhase, ""),
].filter(Boolean).join(" / ");
return `
    <article class="session-print-block-card">
      <header>
        <span>${escapeHtml(block.label || `Block ${index + 1}`)} · ${Number(block.minutes) || "-"} min</span>
        <strong>${escapeHtml(block.title || "Untitled block")}</strong>
        <small>${escapeHtml(phaseLabel || "Phase not set")}</small>
      </header>
      ${renderSessionPlannerPrintVisual(block)}
      <div class="session-print-block-copy">
        ${renderSessionPlannerPrintBlockCopyItems(block)}
      </div>
      ${getState().printSections.players ? renderSessionPlannerPrintPlayerBoardMini(block) : ""}
    </article>
  `;
}
function renderSessionPlannerPrintNotes() {
if (!getState().printSections.notes) {
return "";
}
return `
    <section class="session-print-notes">
      <div><span>Live adjustments</span></div>
      <div><span>Medical / load changes</span></div>
      <div><span>Next-session reminders</span></div>
    </section>
  `;
}
function renderSessionPlannerPrintDocument(session) {
const paper = getSessionPlannerPrintPaperOption();
const blocks = getSessionPlannerPrintBlocks(session);
const dateValue = getState().selectedDate;
const dateLabel = getSessionDateLabel(dateValue, {
weekday: "long",
day: "numeric",
month: "long",
});
const weekdayLabel = getSessionDateLabel(dateValue, { weekday: "long" });
const periodizationDay = getPeriodizationDay(dateValue);
const matchDayLabel = getMatchDayLabel(periodizationDay.matchDay);
const dayScheduleLabel = getDayScheduleLabel(periodizationDay) || periodizationDay.sessionType || "Training";
const frontDateLine = [weekdayLabel, matchDayLabel].filter(Boolean).join(" / ");
const sessionTitle =
session?.title && session.title.toLowerCase() !== "no session planned"
? session.title
: getScheduledSessionTitle(dateValue) || "Session";
const totalMinutes = getTotalMinutes(session);
return `
    <div
      class="session-print-document"
      data-session-print-document
      data-session-print-paper="${escapeHtml(getState().printPaper)}"
      style="--session-print-width: ${escapeHtml(paper.width)}; --session-print-height: ${escapeHtml(paper.height)};"
    >
      <section class="session-print-page session-print-page-front">
        <header class="session-print-hero">
          <div class="session-print-title-panel">
            <span>Football Science · Coach Sheet</span>
            <h1>${escapeHtml(dayScheduleLabel)}</h1>
            <p>${escapeHtml(frontDateLine || dateLabel)} · ${escapeHtml(sessionTitle)} · ${totalMinutes || "-"} min</p>
          </div>
          ${getState().printSections.overview ? renderSessionPlannerPrintPeriodizationCard(dateValue) : ""}
          ${getState().printSections.medical ? renderSessionPlannerPrintMedicalCard(dateValue) : ""}
        </header>
        <main class="session-print-front-layout">
          ${
            getState().printSections.blocks
              ? `
<aside class="session-print-card session-print-flow-card">
${renderSessionPlannerPrintBlockFlow(session)}
</aside>
`
              : ""
          }
          <section class="session-print-feature-blocks">
            ${getState().printSections.details ? renderSessionPlannerPrintFeaturedBlocks(blocks) : `<p class="session-print-empty">Details disabled for this print.</p>`}
          </section>
        </main>
      </section>
      <section class="session-print-page session-print-page-back session-print-page-feature-back">
        <section class="session-print-feature-blocks">
          ${getState().printSections.details ? renderSessionPlannerPrintFeaturedBlocks(blocks, 2) : `<p class="session-print-empty">Details disabled for this print.</p>`}
        </section>
      </section>
    </div>
  `;
}
function renderSessionPlannerPrintOverlay(session) {
if (!getState().printOverlayOpen) {
return "";
}
return `
    <div class="session-library-overlay session-print-overlay" data-session-print-overlay>
      <section class="session-library-modal session-print-modal" role="dialog" aria-modal="true" aria-label="Print session">
        <header class="session-library-modal-head session-print-modal-head">
          <div>
            <span>Print session</span>
            <h2>Coach sheet</h2>
            <p>Two fixed landscape pages for one sheet: front and back.</p>
          </div>
          <button type="button" class="session-library-close-button" data-session-close-print aria-label="Close print preview">Close</button>
        </header>
        <div class="session-print-controls">
          ${renderSessionPlannerPrintPaperSelect()}
          ${renderSessionPlannerPrintSectionToggles()}
          <button type="button" class="session-print-primary-button" data-session-print-now>Print</button>
        </div>
        <div class="session-print-preview-scroll">
          ${renderSessionPlannerPrintDocument(session)}
        </div>
      </section>
    </div>
  `;
}

  return {
    getPaperOption: getSessionPlannerPrintPaperOption,
    getFieldValue: getSessionPlannerPrintFieldValue,
    getMultiValue: getSessionPlannerPrintMultiValue,
    getBlocks: getSessionPlannerPrintBlocks,
    renderPaperSelect: renderSessionPlannerPrintPaperSelect,
    renderSectionToggles: renderSessionPlannerPrintSectionToggles,
    renderMetaItem: renderSessionPlannerPrintMetaItem,
    renderPeriodizationCard: renderSessionPlannerPrintPeriodizationCard,
    renderMedicalCard: renderSessionPlannerPrintMedicalCard,
    renderMaterialCard: renderSessionPlannerPrintMaterialCard,
    renderBlockFlow: renderSessionPlannerPrintBlockFlow,
    getPlayerColor: getSessionPlannerPrintPlayerColor,
    renderPlayerBoardMini: renderSessionPlannerPrintPlayerBoardMini,
    renderVisual: renderSessionPlannerPrintVisual,
    renderBlockCopyItems: renderSessionPlannerPrintBlockCopyItems,
    renderFeatureNote: renderSessionPlannerPrintFeatureNote,
    renderFeatureBlock: renderSessionPlannerPrintFeatureBlock,
    renderFeaturedBlocks: renderSessionPlannerPrintFeaturedBlocks,
    renderBlockDetail: renderSessionPlannerPrintBlockDetail,
    renderNotes: renderSessionPlannerPrintNotes,
    renderDocument: renderSessionPlannerPrintDocument,
    renderOverlay: renderSessionPlannerPrintOverlay,
  };
}
