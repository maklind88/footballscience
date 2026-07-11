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

const rehabProgramFocusAreas = Object.freeze([
  { key: "posterior-thigh", label: "Posterior thigh", aliases: ["hamstring", "posterior thigh", "baklar", "baksida"] },
  { key: "anterior-thigh", label: "Anterior thigh", aliases: ["quad", "quadriceps", "front thigh", "framsida"] },
  { key: "groin", label: "Groin / adductor", aliases: ["groin", "adductor", "adduktor", "ljumske"] },
  { key: "hip", label: "Hip / glute", aliases: ["hip", "glute", "hoft", "sate"] },
  { key: "knee", label: "Knee", aliases: ["knee", "acl", "mcl", "meniscus", "patella", "kna"] },
  { key: "calf", label: "Calf", aliases: ["calf", "soleus", "gastrocnemius", "vad"] },
  { key: "ankle", label: "Ankle", aliases: ["ankle", "achilles", "foot", "fot", "hal"] },
  { key: "trunk", label: "Trunk / core", aliases: ["trunk", "core", "back", "lumbar", "rygg"] },
  { key: "shoulder", label: "Shoulder", aliases: ["shoulder", "arm", "skuldra"] },
  { key: "general", label: "General", aliases: ["general", "whole body", "capacity"] },
]);

const normalizeFocusText = (value = "") => String(value || "").trim().toLowerCase();

const getRehabFocusArea = (...values) => {
  const text = normalizeFocusText(values.filter(Boolean).join(" "));
  const fallback = rehabProgramFocusAreas[rehabProgramFocusAreas.length - 1];
  if (!text) return fallback;
  return (
    rehabProgramFocusAreas.find((area) => (
      area.key === text ||
      normalizeFocusText(area.label) === text ||
      area.aliases.some((alias) => text.includes(normalizeFocusText(alias)))
    )) || fallback
  );
};

const renderRehabFocusOptions = (selectedKey = "") =>
  rehabProgramFocusAreas
    .map((area) => `<option value="${area.key}"${area.key === selectedKey ? " selected" : ""}>${area.label}</option>`)
    .join("");

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

  const renderPlayerProgramRow = (item, selectedPlanId = "") => {
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
    const boardAttrs = plan?.id
      ? `data-medical-select-board-plan="${escapeHtml(plan.id)}" aria-selected="${plan.id === selectedPlanId ? "true" : "false"}"`
      : "";
    return `
<article class="medical-program-player-row medical-program-player-row-${escapeHtml(tone)}${plan?.id === selectedPlanId ? " is-board-selected" : ""}" ${boardAttrs}>
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

  const renderBoardPlayer = ({ player = {}, plan = {} } = {}) => {
    const participation = Number(plan?.participation ?? 0);
    const tone = getParticipationTone(participation);
    const phaseLabel = getMedicalRtpPhaseOption(plan?.rtpPhase).label;
    return `
<button
type="button"
class="medical-board-player medical-board-player-${escapeHtml(tone)}"
style="--medical-board-x: 50%; --medical-board-y: 50%;"
data-medical-open-board-plan="${escapeHtml(plan.id)}"
aria-label="Open ${escapeHtml(player.name)} RTP Field Board"
>
<span class="medical-board-player-dot">${escapeHtml(getPlayerInitials(player.name))}</span>
<span class="medical-board-player-label">
<strong>${escapeHtml(player.name)}</strong>
<small>${escapeHtml(`${participation}% / ${phaseLabel}`)}</small>
</span>
</button>
`;
  };

  const renderMedicalBoardPreviewElement = (element = {}, markerId = "medical-board-preview-arrow") => {
    if (!["arrow", "run", "zone", "dashed-zone", "ellipse"].includes(element.type)) return "";
    return renderTacticalBoardSvgElement(
      {
        lineWidth: 1.35,
        lineStyle: element.type === "zone" ? "solid" : "dashed",
        ...element,
        type: element.type === "zone" ? "dashed-zone" : element.type,
      },
      markerId,
      { escapeHtml, classPrefix: "medical-board-shape" }
    );
  };

  const renderMedicalBoardPreviewMarker = (element = {}) => {
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

  const renderBoardView = (item, selectedPlanId = "", index = 0) => {
    const { player = {}, plan = {} } = item;
    const isSelected = selectedPlanId ? plan.id === selectedPlanId : index === 0;
    const markerId = `medical-board-preview-arrow-${String(plan.id).replace(/[^a-z0-9_-]/giu, "-")}`;
    const elements = getMedicalBoardElements(plan);
    const svgElements = elements.map((element) => renderMedicalBoardPreviewElement(element, markerId)).join("");
    const htmlMarkers = elements.map(renderMedicalBoardPreviewMarker).join("");
    return `
<div class="medical-board-plan-view" data-medical-board-plan-view="${escapeHtml(plan.id)}" ${isSelected ? "" : "hidden"}>
<svg class="medical-board-plan-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
<defs>${renderTacticalBoardArrowMarkerDef(markerId, { escapeHtml })}</defs>
<g class="medical-board-tactical-layer">${svgElements}</g>
</svg>
<div class="medical-board-player-layer">
<div class="medical-board-html-markers">${htmlMarkers}</div>
${renderBoardPlayer({ player, plan })}
</div>
</div>
`;
  };

  const renderMedicalBoard = (items, selectedPlanId = "") => {
    const renderNameOptions = () =>
      items.length
        ? items.map(({ player, plan }, index) => {
          const isSelected = selectedPlanId ? plan.id === selectedPlanId : index === 0;
          return `
<strong data-medical-board-name-option="${escapeHtml(plan.id)}" ${isSelected ? "" : "hidden"}>${escapeHtml(player.name || "Player")}</strong>
<small data-medical-board-meta-option="${escapeHtml(plan.id)}" ${isSelected ? "" : "hidden"}>${escapeHtml([player.position, plan.injuryType, `${Number(plan.participation ?? 0)}%`, getMedicalRtpPhaseOption(plan.rtpPhase).label].filter(Boolean).join(" / "))}</small>
`;
        }
        )
        .join("")
        : `<strong>Select a player</strong><small>Open a medical program from the list</small>`;
    const renderEditButtons = () =>
      items.map(({ plan }, index) => {
        const isSelected = selectedPlanId ? plan.id === selectedPlanId : index === 0;
        return `
<button type="button" data-medical-board-edit-button="${escapeHtml(plan.id)}" data-medical-open-board-plan="${escapeHtml(plan.id)}" ${isSelected ? "" : "hidden"}>Edit</button>
`;
      }).join("");
    return `
<article class="medical-program-board-card" data-medical-board-card>
<header>
<div>
<span>RTP Field Board</span>
${renderNameOptions()}
</div>
<div class="medical-board-edit-actions">${renderEditButtons()}</div>
</header>
<div class="medical-board-surface" aria-label="RTP Field Board">
<svg class="medical-board-pitch" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
${renderTacticalBoardPitchSvgLines("full-wide", { escapeHtml, className: "medical-board-pitch-lines", ariaLabel: "RTP field board pitch" })}
</svg>
${items.length ? items.map((item, index) => renderBoardView(item, selectedPlanId, index)).join("") : `<div class="medical-board-empty">No player program is active on the board.</div>`}
</div>
${items.length ? items.map((item, index) => renderIndividualRehabProgram(item, selectedPlanId, index)).join("") : ""}
</article>
`;
  };

  const renderRehabIllustration = (exercise = {}) => {
    const focusArea = getRehabFocusArea(exercise.focusArea, exercise.focus, exercise.detail).key;
    return `
<div class="medical-rehab-illustration" aria-hidden="true">
<span class="medical-rehab-illustration-mat"></span>
<span class="medical-rehab-figure-line medical-rehab-figure-line-torso"></span>
<span class="medical-rehab-figure-line medical-rehab-figure-line-arm"></span>
<span class="medical-rehab-figure-line medical-rehab-figure-line-leg-one"></span>
<span class="medical-rehab-figure-line medical-rehab-figure-line-leg-two"></span>
<span class="medical-rehab-figure-dot"></span>
<span class="medical-rehab-illustration-focus medical-rehab-illustration-focus-${escapeHtml(focusArea)}"></span>
</div>
`;
  };

  const renderRehabFocusMap = (exercise = {}, plan = {}) => {
    const focusArea = getRehabFocusArea(exercise.focusArea, exercise.focus, plan.bodyArea, plan.injuryType);
    const active = (key) => (focusArea.key === key || (focusArea.key === "general" && key === "trunk") ? " is-active" : "");
    return `
<figure class="medical-rehab-focus-map" aria-label="Training focus: ${escapeHtml(focusArea.label)}">
<svg viewBox="0 0 164 122" role="img" aria-hidden="true" focusable="false">
<g class="medical-rehab-body medical-rehab-body-front">
<circle cx="38" cy="18" r="8"></circle>
<path d="M29 31h18l4 30H25z"></path>
<path d="M25 35 13 68"></path>
<path d="M51 35 63 68"></path>
<path d="M32 61 27 108"></path>
<path d="M44 61 49 108"></path>
<ellipse class="medical-rehab-zone${active("shoulder")}" cx="50" cy="35" rx="8" ry="7"></ellipse>
<ellipse class="medical-rehab-zone${active("trunk")}" cx="38" cy="48" rx="14" ry="18"></ellipse>
<ellipse class="medical-rehab-zone${active("groin")}" cx="38" cy="66" rx="11" ry="7"></ellipse>
<ellipse class="medical-rehab-zone${active("anterior-thigh")}" cx="30" cy="79" rx="6" ry="16"></ellipse>
<ellipse class="medical-rehab-zone${active("anterior-thigh")}" cx="46" cy="79" rx="6" ry="16"></ellipse>
<ellipse class="medical-rehab-zone${active("knee")}" cx="29" cy="96" rx="6" ry="6"></ellipse>
<ellipse class="medical-rehab-zone${active("knee")}" cx="47" cy="96" rx="6" ry="6"></ellipse>
<ellipse class="medical-rehab-zone${active("calf")}" cx="27" cy="108" rx="5" ry="10"></ellipse>
<ellipse class="medical-rehab-zone${active("calf")}" cx="49" cy="108" rx="5" ry="10"></ellipse>
<ellipse class="medical-rehab-zone${active("ankle")}" cx="26" cy="116" rx="6" ry="4"></ellipse>
<ellipse class="medical-rehab-zone${active("ankle")}" cx="50" cy="116" rx="6" ry="4"></ellipse>
</g>
<g class="medical-rehab-body medical-rehab-body-back">
<circle cx="125" cy="18" r="8"></circle>
<path d="M116 31h18l4 30h-26z"></path>
<path d="M112 35 100 68"></path>
<path d="M138 35 150 68"></path>
<path d="M119 61 114 108"></path>
<path d="M131 61 136 108"></path>
<ellipse class="medical-rehab-zone${active("shoulder")}" cx="114" cy="35" rx="8" ry="7"></ellipse>
<ellipse class="medical-rehab-zone${active("trunk")}" cx="125" cy="48" rx="14" ry="18"></ellipse>
<ellipse class="medical-rehab-zone${active("hip")}" cx="125" cy="64" rx="15" ry="9"></ellipse>
<ellipse class="medical-rehab-zone${active("posterior-thigh")}" cx="117" cy="80" rx="6" ry="17"></ellipse>
<ellipse class="medical-rehab-zone${active("posterior-thigh")}" cx="133" cy="80" rx="6" ry="17"></ellipse>
<ellipse class="medical-rehab-zone${active("knee")}" cx="116" cy="96" rx="6" ry="6"></ellipse>
<ellipse class="medical-rehab-zone${active("knee")}" cx="134" cy="96" rx="6" ry="6"></ellipse>
<ellipse class="medical-rehab-zone${active("calf")}" cx="114" cy="108" rx="5" ry="10"></ellipse>
<ellipse class="medical-rehab-zone${active("calf")}" cx="136" cy="108" rx="5" ry="10"></ellipse>
<ellipse class="medical-rehab-zone${active("ankle")}" cx="113" cy="116" rx="6" ry="4"></ellipse>
<ellipse class="medical-rehab-zone${active("ankle")}" cx="137" cy="116" rx="6" ry="4"></ellipse>
</g>
</svg>
<figcaption>${escapeHtml(focusArea.label)}</figcaption>
</figure>
`;
  };

  const renderRehabProgramExercise = (exercise = {}, plan = {}, index = 0) => {
    const dose = String(exercise.dose || exercise.data || "").trim();
    const detail = String(exercise.detail || "").trim();
    return `
<article class="medical-rehab-program-row">
<div class="medical-rehab-program-exercise">
<span>${index + 1}</span>
<strong>${escapeHtml(exercise.title)}</strong>
<small>${escapeHtml(exercise.phase || "Rehab")}</small>
<button type="button" class="medical-rehab-program-remove" data-medical-remove-board-exercise="${escapeHtml(plan.id)}:${escapeHtml(exercise.id)}" aria-label="Remove ${escapeHtml(exercise.title)}">Remove</button>
</div>
${renderRehabIllustration(exercise)}
${renderRehabFocusMap(exercise, plan)}
<div class="medical-rehab-program-dose">${escapeHtml(dose || "Dose not set")}</div>
<div class="medical-rehab-program-note">${escapeHtml(detail || "Add clinical coaching note.")}</div>
</article>
`;
  };

  const renderIndividualRehabProgram = (item = {}, selectedPlanId = "", index = 0) => {
    const { player = {}, plan = {} } = item;
    const isSelected = selectedPlanId ? plan.id === selectedPlanId : index === 0;
    const exercises = getMedicalBoardExercises(plan);
    const phaseLabel = getMedicalRtpPhaseOption(plan.rtpPhase).label;
    const defaultFocusKey = getRehabFocusArea(plan.bodyArea, plan.injuryType).key;
    return `
<section class="medical-rehab-program-panel" data-medical-rehab-program-panel="${escapeHtml(plan.id)}" ${isSelected ? "" : "hidden"}>
<header class="medical-rehab-program-header">
<div>
<span>Individual Rehab Program</span>
<strong>${escapeHtml(player.name || "Player")}</strong>
<small>${escapeHtml([plan.injuryType, plan.bodyArea, phaseLabel].filter(Boolean).join(" / "))}</small>
</div>
<b>${exercises.length} exercise${exercises.length === 1 ? "" : "s"}</b>
</header>
<form class="medical-rehab-program-form medical-board-exercise-form" data-medical-board-exercise-form="${escapeHtml(plan.id)}">
<label>
<span>Exercise</span>
<input name="title" placeholder="e.g. Foam roll: anterior thigh" autocomplete="off" />
</label>
<label>
<span>Phase</span>
<select name="phase">
<option value="Medical restriction">Medical restriction</option>
<option value="Rehab" selected>Rehab</option>
<option value="Strength">Strength</option>
<option value="Modified team">Modified team</option>
<option value="Field exposure">Field exposure</option>
<option value="Match return">Match return</option>
</select>
</label>
<label>
<span>Dose</span>
<input name="dose" placeholder="2 sets x 10 reps" autocomplete="off" />
</label>
<label>
<span>Focus area</span>
<select name="focusArea">${renderRehabFocusOptions(defaultFocusKey)}</select>
</label>
<label class="medical-rehab-program-note-field">
<span>Comment</span>
<textarea name="detail" rows="2" placeholder="Clinical cue, pain response, tempo or hold rule"></textarea>
</label>
<button type="submit">Add exercise</button>
</form>
<div class="medical-rehab-program-table" aria-label="${escapeHtml(player.name || "Player")} individual rehab program">
<div class="medical-rehab-program-columns" aria-hidden="true">
<span>Exercise</span>
<span>Illustration</span>
<span>Training focus</span>
<span>Dose</span>
<span>Comment</span>
</div>
${exercises.length
    ? exercises.map((exercise, exerciseIndex) => renderRehabProgramExercise(exercise, plan, exerciseIndex)).join("")
    : `<div class="medical-rehab-program-empty">No individual rehab exercises yet. Add the first exercise for this injury plan.</div>`}
</div>
</section>
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
<section class="medical-board-editor-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(player.name || "Player")} RTP Field Board" tabindex="-1">
<header class="medical-board-editor-header">
<div class="medical-board-editor-player">
<span class="medical-program-avatar">${escapeHtml(getPlayerInitials(player.name))}</span>
<div>
<span>RTP Field Board</span>
<h3>${escapeHtml(player.name || "Player")}</h3>
<small>${escapeHtml([player.position, plan.injuryType, `${participation}%`, phaseLabel].filter(Boolean).join(" / "))}</small>
</div>
</div>
<div class="medical-board-editor-actions">
<button type="button" data-medical-edit-injury-plan="${escapeHtml(plan.id)}">Open Medical Plan</button>
<button type="button" data-medical-close-board-editor aria-label="Close RTP Field Board">Close</button>
</div>
</header>
<div class="medical-board-editor-layout">
<aside class="medical-board-editor-tools" aria-label="RTP Field Board tools">
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
<select name="phase">
<option value="Medical restriction">Medical restriction</option>
<option value="Rehab" selected>Rehab</option>
<option value="Strength">Strength</option>
<option value="Modified team">Modified team</option>
<option value="Field exposure">Field exposure</option>
<option value="Match return">Match return</option>
</select>
<input name="dose" placeholder="Dose, sets, reps or time" autocomplete="off" />
<select name="focusArea">${renderRehabFocusOptions(getRehabFocusArea(plan.bodyArea, plan.injuryType).key)}</select>
<textarea name="detail" rows="3" placeholder="Clinical cue, pain response or coaching point"></textarea>
<button type="submit">Add exercise</button>
</form>
</aside>
<div class="medical-board-editor-stage">
<div class="medical-board-editor-surface" data-medical-board-canvas="${escapeHtml(plan.id)}" aria-label="${escapeHtml(player.name || "Player")} board canvas">
<svg class="medical-board-editor-pitch" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
<defs>${renderTacticalBoardArrowMarkerDef(markerId, { escapeHtml })}</defs>
${renderTacticalBoardPitchSvgLines("full-wide", { escapeHtml, className: "medical-board-editor-pitch-lines", ariaLabel: "RTP field board pitch" })}
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
    const requestedSelectedPlanId = String(summary.selectedMedicalBoardPlanId || "");
    const selectedPlanId = boardItems.some((item) => item.plan?.id === requestedSelectedPlanId)
      ? requestedSelectedPlanId
      : boardItems[0]?.plan?.id || "";
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
${playerItems.length ? playerItems.map((item) => renderPlayerProgramRow(item, selectedPlanId)).join("") : `<div class="medical-program-empty">No squad players available.</div>`}
</div>
</article>
${renderMedicalBoard(boardItems, selectedPlanId)}
</section>
${renderMedicalBoardEditorOverlays(boardItems)}
</div>
`;
  };

  return {
    renderRtpProgramsWorkspace,
  };
}
