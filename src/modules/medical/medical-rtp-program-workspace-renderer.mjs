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
data-medical-edit-injury-plan="${escapeHtml(plan.id)}"
aria-label="Open ${escapeHtml(player.name)} medical program"
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
${items[0]?.plan?.id ? `<button type="button" data-medical-edit-injury-plan="${escapeHtml(items[0].plan.id)}">Edit</button>` : ""}
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
</div>
`;
  };

  return {
    renderRtpProgramsWorkspace,
  };
}
