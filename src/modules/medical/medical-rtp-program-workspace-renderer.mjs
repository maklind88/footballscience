import {
  renderTacticalBoardArrowMarkerDef,
  renderTacticalBoardPitchSvgLines,
  renderTacticalBoardSvgElement,
} from "../tactical-board/index.mjs";
import {
  getMedicalRtpTrackerSummary,
  hasMedicalRtpProgramStarter,
} from "./medical-rtp-tracker-helpers.mjs";

const defaultEscapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const defaultFormatMedicalDateLabel = (value) => String(value || "-");
const defaultGetMedicalRtpPhaseOption = (value) => ({ label: String(value || "Not set") });

const normalizePositionBucket = (position = "") => {
  const text = String(position || "").trim().toLowerCase();
  if (/(goalkeeper|keeper|goalie|gk|mv|malvakt)/u.test(text)) return "goalkeeper";
  if (/(defender|centre back|center back|fullback|wingback|back|cb|rb|lb|rwb|lwb)/u.test(text)) return "defender";
  if (/(midfielder|midfield|cm|dm|am|winger|6|8|10)/u.test(text)) return "midfielder";
  if (/(forward|striker|attacker|fw|cf|wing|wide)/u.test(text)) return "forward";
  return "player";
};

const getParticipationTone = (participation) => {
  const value = Number(participation);
  if (!Number.isFinite(value)) return "neutral";
  if (value <= 0) return "unavailable";
  if (value < 100) return "modified";
  return "full";
};

const getPlayerInitials = (name = "") =>
  String(name || "")
    .trim()
    .split(/\s+/u)
    .slice(0, 2)
    .map((part) => part[0] || "")
    .join("")
    .toUpperCase() || "P";

const getProgramPlayerItems = (summary = {}) => {
  const signals = Array.isArray(summary.signals) ? summary.signals : [];
  return signals
    .map((signal) => {
      const plan = signal.activePlan || null;
      return {
        player: signal.player || {},
        plan,
        signal,
        hasProgramStarter: hasMedicalRtpProgramStarter(plan),
        tracker: plan ? getMedicalRtpTrackerSummary(plan) : null,
      };
    })
    .sort((first, second) => {
      const firstActive = first.plan ? 1 : 0;
      const secondActive = second.plan ? 1 : 0;
      if (firstActive !== secondActive) return secondActive - firstActive;
      const firstParticipation = Number(first.plan?.participation ?? 101);
      const secondParticipation = Number(second.plan?.participation ?? 101);
      if (firstParticipation !== secondParticipation) return firstParticipation - secondParticipation;
      return String(first.player.name || "").localeCompare(String(second.player.name || ""));
    });
};

const getBoardItems = (summary = {}) =>
  (Array.isArray(summary.activeCases) ? summary.activeCases : [])
    .filter(({ player, plan }) => player?.id && plan?.id)
    .sort((first, second) => {
      const firstParticipation = Number(first.plan?.participation ?? 101);
      const secondParticipation = Number(second.plan?.participation ?? 101);
      if (firstParticipation !== secondParticipation) return firstParticipation - secondParticipation;
      return String(first.player?.name || "").localeCompare(String(second.player?.name || ""));
    });

const getMedicalBoardElements = (plan = {}) =>
  (Array.isArray(plan?.medicalBoard?.elements) ? plan.medicalBoard.elements : []).filter(Boolean);

const getMedicalBoardExercises = (plan = {}) =>
  (Array.isArray(plan?.medicalBoard?.exercises) ? plan.medicalBoard.exercises : []).filter(Boolean);

const getBoardPlayerPosition = (player = {}, index = 0, groupCounts = {}, groupIndexes = {}) => {
  const bucket = normalizePositionBucket(player.position);
  const columns = {
    goalkeeper: 11,
    defender: 31,
    midfielder: 53,
    forward: 76,
    player: 50,
  };
  const count = Math.max(1, groupCounts[bucket] || 1);
  const localIndex = groupIndexes[bucket] || 0;
  groupIndexes[bucket] = localIndex + 1;
  const spacing = Math.min(68, count * 13);
  const startY = 50 - spacing / 2;
  const y = Math.max(11, Math.min(89, startY + (localIndex + 0.5) * (spacing / count)));
  const xJitter = count > 4 ? (localIndex % 2 === 0 ? -2.5 : 2.5) : 0;
  return {
    x: Math.max(6, Math.min(94, (columns[bucket] || 50) + xJitter + (index % 3) * 0.35)),
    y,
  };
};

export function createMedicalRtpProgramWorkspaceRenderer({
  escapeHtml = defaultEscapeHtml,
  formatMedicalDateLabel = defaultFormatMedicalDateLabel,
  getMedicalRtpPhaseOption = defaultGetMedicalRtpPhaseOption,
} = {}) {
  const renderProgramAction = ({ player, plan }) => {
    if (plan?.id) {
      return `<button type="button" class="medical-program-row-action" data-medical-edit-injury-plan="${escapeHtml(plan.id)}">Open program</button>`;
    }
    return `<button type="button" class="medical-program-row-action medical-program-row-action-secondary" data-medical-create-program="${escapeHtml(player.id)}">Create program</button>`;
  };

  const renderPlayerProgramRow = (item) => {
    const { player, plan, signal, tracker, hasProgramStarter } = item;
    const participation = Number(plan?.participation ?? signal.record?.participation ?? 100);
    const tone = plan ? getParticipationTone(participation) : "neutral";
    const phaseLabel = plan ? getMedicalRtpPhaseOption(plan.rtpPhase).label : "No active medical plan";
    const title = plan?.injuryType || signal.primaryDriver || signal.primaryActionDriver || "Available";
    const meta = plan
      ? [plan.bodyArea, `${Number.isFinite(participation) ? participation : 100}%`, phaseLabel].filter(Boolean).join(" / ")
      : [player.position || "Position", "No program"].filter(Boolean).join(" / ");
    const trackerLabel = tracker?.total ? tracker.completionLabel : hasProgramStarter ? "Starter saved" : plan ? "Needs starter" : "No plan";
    const windowLabel = plan
      ? `${formatMedicalDateLabel(plan.startDate)} - ${formatMedicalDateLabel(plan.endDate)}`
      : "Create only when clinically needed";
    return `
<article class="medical-program-player-row medical-program-player-row-${escapeHtml(tone)}">
<div class="medical-program-player-identity">
<span class="medical-program-avatar">${escapeHtml(getPlayerInitials(player.name))}</span>
<span>
<strong>${escapeHtml(player.name || "Player")}</strong>
<small>${escapeHtml(player.position || "Position")}</small>
</span>
</div>
<div class="medical-program-player-case">
<strong>${escapeHtml(title)}</strong>
<small>${escapeHtml(meta)}</small>
</div>
<div class="medical-program-player-window">
<strong>${escapeHtml(windowLabel)}</strong>
<small>${escapeHtml(trackerLabel)}</small>
</div>
${renderProgramAction(item)}
</article>
`;
  };

  const renderBoardPlayers = (items) => {
    const groupCounts = items.reduce((result, { player }) => {
      const bucket = normalizePositionBucket(player.position);
      result[bucket] = (result[bucket] || 0) + 1;
      return result;
    }, {});
    const groupIndexes = {};
    return items
      .slice(0, 18)
      .map(({ player, plan }, index) => {
        const position = getBoardPlayerPosition(player, index, groupCounts, groupIndexes);
        const participation = Number(plan?.participation ?? 0);
        const tone = getParticipationTone(participation);
        const phaseLabel = getMedicalRtpPhaseOption(plan?.rtpPhase).label;
        return `
<button
type="button"
class="medical-board-player medical-board-player-${escapeHtml(tone)}"
style="--medical-board-x: ${position.x}%; --medical-board-y: ${position.y}%;"
data-medical-open-board-plan="${escapeHtml(plan.id)}"
aria-label="Open ${escapeHtml(player.name)} Medical Board"
>
<span class="medical-board-player-dot">${escapeHtml(getPlayerInitials(player.name))}</span>
<span class="medical-board-player-label">
<strong>${escapeHtml(player.name)}</strong>
<small>${escapeHtml(`${participation}% / ${phaseLabel}`)}</small>
</span>
</button>
`;
      })
      .join("");
  };

  const renderMedicalBoard = (items) => {
    const markerId = "medical-board-arrow";
    const boardElements = [
      { id: "medical-board-rehab-zone", type: "dashed-zone", x: 7, y: 13, x2: 33, y2: 87, color: "#ef4444", lineWidth: 0.72, lineStyle: "dashed" },
      { id: "medical-board-modified-zone", type: "zone", x: 35, y: 18, x2: 65, y2: 82, color: "#f59e0b", lineWidth: 0.32 },
      { id: "medical-board-return-arrow", type: "arrow", x: 18, y: 50, x2: 83, y2: 50, color: "#0f766e", lineWidth: 1.05 },
    ];
    const fullyUnavailable = items.filter(({ plan }) => Number(plan?.participation) <= 0).length;
    const modified = items.filter(({ plan }) => Number(plan?.participation) > 0 && Number(plan?.participation) < 100).length;
    return `
<article class="medical-program-board-card">
<header>
<div>
<span>Medical Board</span>
<strong>${items.length ? `${items.length} active program${items.length === 1 ? "" : "s"}` : "No active programs"}</strong>
</div>
${items[0]?.plan?.id ? `<button type="button" data-medical-open-board-plan="${escapeHtml(items[0].plan.id)}">Edit</button>` : ""}
</header>
<div class="medical-board-surface" aria-label="Medical Board">
<svg class="medical-board-pitch" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
<defs>${renderTacticalBoardArrowMarkerDef(markerId, { escapeHtml })}</defs>
${renderTacticalBoardPitchSvgLines("full-wide", { escapeHtml, className: "medical-board-pitch-lines", ariaLabel: "Medical board pitch" })}
<g class="medical-board-tactical-layer">
${boardElements.map((element) => renderTacticalBoardSvgElement(element, markerId, { escapeHtml, classPrefix: "medical-board-shape" })).join("")}
</g>
</svg>
<div class="medical-board-player-layer">
${items.length ? renderBoardPlayers(items) : `<div class="medical-board-empty">No player program is active on the board.</div>`}
</div>
</div>
<footer>
<span><b>${fullyUnavailable}</b> unavailable</span>
<span><b>${modified}</b> modified</span>
<span><b>${items.length - fullyUnavailable - modified}</b> full / monitoring</span>
</footer>
</article>
`;
  };

  const renderMedicalBoardElement = (element = {}, markerId = "medical-board-editor-arrow") => {
    if (!["arrow", "run", "zone", "dashed-zone", "ellipse"].includes(element.type)) return "";
    return renderTacticalBoardSvgElement(
      {
        lineWidth: 1.35,
        lineStyle: element.type === "zone" ? "solid" : "dashed",
        ...element,
        type: element.type === "zone" ? "dashed-zone" : element.type,
      },
      markerId,
      { escapeHtml, classPrefix: "medical-board-editor-shape" }
    );
  };

  const renderMedicalBoardMarker = (element = {}) => {
    if (!["cone", "text"].includes(element.type)) return "";
    const label = element.label || (element.type === "cone" ? "Cone" : "Note");
    return `
<span
class="medical-board-editor-marker medical-board-editor-marker-${escapeHtml(element.type)}"
style="--medical-board-x: ${Number(element.x) || 50}%; --medical-board-y: ${Number(element.y) || 50}%; --medical-board-color: ${escapeHtml(element.color || "#0f766e")};"
>
${element.type === "cone" ? `<i aria-hidden="true"></i>` : ""}
<b>${escapeHtml(label)}</b>
</span>
`;
  };

  const renderMedicalBoardExerciseList = (plan = {}) => {
    const exercises = getMedicalBoardExercises(plan);
    if (!exercises.length) {
      return `<div class="medical-board-editor-empty">No player-specific board exercises yet.</div>`;
    }
    return exercises
      .map(
        (exercise) => `
<article class="medical-board-exercise-item">
<div>
<strong>${escapeHtml(exercise.title)}</strong>
<small>${escapeHtml([exercise.phase, exercise.detail].filter(Boolean).join(" / ") || "No detail")}</small>
</div>
<button type="button" data-medical-remove-board-exercise="${escapeHtml(plan.id)}:${escapeHtml(exercise.id)}" aria-label="Remove ${escapeHtml(exercise.title)}">Remove</button>
</article>
`
      )
      .join("");
  };

  const renderMedicalBoardEditorOverlay = ({ player = {}, plan = {} } = {}) => {
    if (!player?.id || !plan?.id) return "";
    const markerId = `medical-board-editor-arrow-${String(plan.id).replace(/[^a-z0-9_-]/giu, "-")}`;
    const participation = Number(plan.participation ?? 0);
    const phaseLabel = getMedicalRtpPhaseOption(plan.rtpPhase).label;
    const elements = getMedicalBoardElements(plan);
    const svgElements = elements.map((element) => renderMedicalBoardElement(element, markerId)).join("");
    const htmlMarkers = elements.map(renderMedicalBoardMarker).join("");
    return `
<div class="medical-board-editor-overlay" data-medical-board-editor-overlay="${escapeHtml(plan.id)}" hidden aria-hidden="true">
<section class="medical-board-editor-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(player.name || "Player")} Medical Board" tabindex="-1">
<header class="medical-board-editor-header">
<div class="medical-board-editor-player">
<span class="medical-program-avatar">${escapeHtml(getPlayerInitials(player.name))}</span>
<div>
<span>Medical Board</span>
<h3>${escapeHtml(player.name || "Player")}</h3>
<small>${escapeHtml([player.position, plan.injuryType, `${participation}%`, phaseLabel].filter(Boolean).join(" / "))}</small>
</div>
</div>
<div class="medical-board-editor-actions">
<button type="button" data-medical-edit-injury-plan="${escapeHtml(plan.id)}">Open Medical Plan</button>
<button type="button" data-medical-close-board-editor aria-label="Close Medical Board">Close</button>
</div>
</header>
<div class="medical-board-editor-layout">
<aside class="medical-board-editor-tools" aria-label="Medical Board tools">
<div>
<span>Draw</span>
<button type="button" class="is-active" data-medical-board-tool="arrow">Arrow</button>
<button type="button" data-medical-board-tool="run">Run</button>
<button type="button" data-medical-board-tool="zone">Zone</button>
<button type="button" data-medical-board-tool="cone">Cone</button>
<button type="button" data-medical-board-tool="text">Text</button>
</div>
<form class="medical-board-exercise-form" data-medical-board-exercise-form="${escapeHtml(plan.id)}">
<span>Create exercise</span>
<input name="title" placeholder="Exercise name" autocomplete="off" />
<input name="phase" placeholder="Phase / exposure" autocomplete="off" />
<textarea name="detail" rows="3" placeholder="Dose, area, constraint or coaching point"></textarea>
<button type="submit">Add exercise</button>
</form>
</aside>
<div class="medical-board-editor-stage">
<div class="medical-board-editor-surface" data-medical-board-canvas="${escapeHtml(plan.id)}" aria-label="${escapeHtml(player.name || "Player")} board canvas">
<svg class="medical-board-editor-pitch" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
<defs>${renderTacticalBoardArrowMarkerDef(markerId, { escapeHtml })}</defs>
${renderTacticalBoardPitchSvgLines("full-wide", { escapeHtml, className: "medical-board-editor-pitch-lines", ariaLabel: "Medical board pitch" })}
<g class="medical-board-editor-layer">${svgElements}</g>
</svg>
<div class="medical-board-editor-html-layer">${htmlMarkers}</div>
<button type="button" class="medical-board-editor-player-chip" data-medical-board-player-home style="--medical-board-x: 50%; --medical-board-y: 50%;">
<span>${escapeHtml(getPlayerInitials(player.name))}</span>
<strong>${escapeHtml(player.name || "Player")}</strong>
</button>
</div>
<div class="medical-board-editor-hint">
<span>${elements.length} board item${elements.length === 1 ? "" : "s"}</span>
<span>Medical Plan source</span>
</div>
</div>
<aside class="medical-board-editor-exercises" aria-label="Player board exercises">
<header>
<span>Player exercises</span>
<strong>${getMedicalBoardExercises(plan).length}</strong>
</header>
<div>${renderMedicalBoardExerciseList(plan)}</div>
</aside>
</div>
</section>
</div>
`;
  };

  const renderMedicalBoardEditorOverlays = (items = []) => items.map(renderMedicalBoardEditorOverlay).join("");

  const renderRtpProgramsWorkspace = (summary = {}) => {
    const playerItems = getProgramPlayerItems(summary);
    const boardItems = getBoardItems(summary);
    const activePrograms = playerItems.filter((item) => item.plan).length;
    const structuredPrograms = playerItems.filter((item) => item.hasProgramStarter).length;
    return `
<div class="medical-rtp-programs-workspace medical-programs-workspace">
<section class="medical-programs-layout" aria-label="Medical programs workspace">
<article class="medical-program-list-panel">
<header>
<div>
<span>Player programs</span>
<strong>${activePrograms} active / ${playerItems.length} squad players</strong>
</div>
<small>${structuredPrograms} structured</small>
</header>
<div class="medical-program-player-list">
${playerItems.length ? playerItems.map(renderPlayerProgramRow).join("") : `<div class="medical-program-empty">No squad players available.</div>`}
</div>
</article>
${renderMedicalBoard(boardItems)}
</section>
${renderMedicalBoardEditorOverlays(boardItems)}
</div>
`;
  };

  return {
    renderRtpProgramsWorkspace,
  };
}
