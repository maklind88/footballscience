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
  const items = signals
    .map((signal) => {
      const plan = signal.activePlan || null;
      return {
        player: signal.player || {},
        plan,
        signal,
        hasProgramStarter: hasMedicalRtpProgramStarter(plan),
        tracker: plan ? getMedicalRtpTrackerSummary(plan) : null,
      };
    });
  const playerIds = new Set(items.map((item) => String(item.player?.id || "")).filter(Boolean));
  (Array.isArray(summary.activeCases) ? summary.activeCases : []).forEach(({ player = {}, plan = {} } = {}) => {
    const playerId = String(player.id || "");
    if (!playerId || !plan?.id || playerIds.has(playerId)) return;
    playerIds.add(playerId);
    items.push({
      player,
      plan,
      signal: { player, activePlan: plan, primaryActionDriver: plan.injuryType || "Active RTP case" },
      hasProgramStarter: hasMedicalRtpProgramStarter(plan),
      tracker: getMedicalRtpTrackerSummary(plan),
    });
  });
  return items.sort((first, second) => {
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

export function createMedicalRtpProgramWorkspaceRenderer({
  escapeHtml = defaultEscapeHtml,
  formatMedicalDateLabel = defaultFormatMedicalDateLabel,
  getMedicalRtpPhaseOption = defaultGetMedicalRtpPhaseOption,
} = {}) {
  const renderProgramAction = ({ player, plan }) => {
    if (plan?.id) {
      return `<button type="button" class="medical-program-row-action" data-medical-open-program-detail="${escapeHtml(plan.id)}">Open</button>`;
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
aria-label="Open ${escapeHtml(player.name)} RTP Player Board"
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
<article class="medical-program-board-card" data-medical-board-card ${selectedPlanId ? "" : "hidden"}>
<header class="medical-program-detail-head">
<button type="button" class="medical-program-detail-back" data-medical-programs-back>Player Programs</button>
<div>
<span>Medical RTP program</span>
${renderNameOptions()}
</div>
<div class="medical-board-edit-actions">
${renderEditButtons()}
</div>
</header>
${items.map((item, index) => renderIndividualRehabProgram(item, selectedPlanId, index)).join("")}
<details class="medical-program-secondary-tool">
<summary>
<span><strong>Field Board</strong><small>Draw and document the next football exposure</small></span>
<b>Open tool</b>
</summary>
<div class="medical-board-surface${items.length ? "" : " medical-board-surface-empty"}" aria-label="RTP Player Board">
<svg class="medical-board-pitch" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
${renderTacticalBoardPitchSvgLines("full-wide", { escapeHtml, className: "medical-board-pitch-lines", ariaLabel: "RTP field board pitch" })}
</svg>
${items.length ? items.map((item, index) => renderBoardView(item, selectedPlanId, index)).join("") : `<div class="medical-board-empty">No player program is active on the board. Use Create program in the player list to start one.</div>`}
</div>
</details>
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

  const renderRehabProgramExercise = (exercise = {}, plan = {}, index = 0) => {
    const dose = String(exercise.dose || exercise.data || "").trim();
    const detail = String(exercise.detail || "").trim();
    return `
<article class="medical-rehab-program-row">
${renderRehabIllustration(exercise)}
<div class="medical-rehab-program-exercise">
<span>${index + 1}</span>
<strong>${escapeHtml(exercise.title)}</strong>
<small>${escapeHtml([exercise.phase || "Rehab", getRehabFocusArea(exercise.focusArea, exercise.focus, plan.bodyArea).label].join(" / "))}</small>
<button type="button" class="medical-rehab-program-remove" data-medical-remove-board-exercise="${escapeHtml(plan.id)}:${escapeHtml(exercise.id)}" aria-label="Remove ${escapeHtml(exercise.title)}">Remove</button>
</div>
<div class="medical-rehab-program-dose">${escapeHtml(dose || "Dose not set")}</div>
<div class="medical-rehab-program-note">${escapeHtml(detail || "Add clinical coaching note.")}</div>
</article>
`;
  };

  const getProgramPhaseIndex = (plan = {}) => {
    const phaseValue = normalizeFocusText(plan.rtpPhase);
    if (/(match|performance)/u.test(phaseValue)) return 3;
    if (/(full|team-training)/u.test(phaseValue)) return 2;
    if (/(modified|field|running|on-field)/u.test(phaseValue)) return 1;
    if (/(medical|restriction|rehab)/u.test(phaseValue)) return 0;
    const phaseLabel = normalizeFocusText(getMedicalRtpPhaseOption(plan.rtpPhase).label);
    if (/(match|return to performance)/u.test(phaseLabel)) return 3;
    if (/(full|team training|return to train)/u.test(phaseLabel)) return 2;
    if (/(modified|field|running|on-field)/u.test(phaseLabel)) return 1;
    return 0;
  };

  const renderProgramPhaseRail = (plan = {}) => {
    const currentIndex = getProgramPhaseIndex(plan);
    const phases = ["Rehab", "Modified", "Full training", "Match return"];
    return `
<ol class="medical-program-phase-rail" aria-label="Current RTP phase">
${phases.map((phase, index) => `
<li class="${index < currentIndex ? "is-complete" : index === currentIndex ? "is-current" : ""}"${index === currentIndex ? ' aria-current="step"' : ""}>
<span>${index < currentIndex ? "Passed" : index === currentIndex ? "Current" : index + 1}</span>
<strong>${phase}</strong>
</li>
`).join("")}
</ol>
`;
  };

  const renderProgramDecisionPanel = (plan = {}, tracker = {}) => {
    const gateItems = tracker.items.filter((item) => item.groupKey === "gateCriteria");
    const holdItems = tracker.items.filter((item) => item.groupKey === "holdRules");
    const nextItems = tracker.items.filter((item) => item.groupKey === "nextSteps");
    const renderDecisionList = (items, emptyLabel) => items.length
      ? `<ul>${items.slice(0, 4).map((item) => `<li class="is-${escapeHtml(item.status)}"><span>${escapeHtml(item.statusOption.label)}</span>${escapeHtml(item.item)}</li>`).join("")}</ul>`
      : `<p>${escapeHtml(emptyLabel)}</p>`;
    return `
<aside class="medical-program-decision-panel" aria-label="Clinical program decisions">
<section>
<span>Next most important action</span>
<strong>${escapeHtml(tracker.nextDecision)}</strong>
<small>${escapeHtml(tracker.completionLabel)}</small>
</section>
<section>
<span>Gate criteria</span>
${renderDecisionList(gateItems, "No gate criteria recorded.")}
</section>
<section>
<span>Hold rules</span>
${renderDecisionList(holdItems, "No hold rules recorded.")}
</section>
<section>
<span>Next exposure</span>
${renderDecisionList(nextItems, "No next exposure recorded.")}
</section>
</aside>
`;
  };

  const renderIndividualRehabProgram = (item = {}, selectedPlanId = "", index = 0) => {
    const { player = {}, plan = {} } = item;
    const isSelected = selectedPlanId ? plan.id === selectedPlanId : index === 0;
    const exercises = getMedicalBoardExercises(plan);
    const phaseLabel = getMedicalRtpPhaseOption(plan.rtpPhase).label;
    const defaultFocusKey = getRehabFocusArea(plan.bodyArea, plan.injuryType).key;
    const tracker = getMedicalRtpTrackerSummary(plan);
    return `
<section class="medical-rehab-program-panel" data-medical-rehab-program-panel="${escapeHtml(plan.id)}" ${isSelected ? "" : "hidden"}>
<header class="medical-rehab-program-header">
<div>
<span>Current player program</span>
<strong>${escapeHtml(player.name || "Player")}</strong>
<small>${escapeHtml([plan.injuryType, plan.bodyArea, phaseLabel].filter(Boolean).join(" / "))}</small>
</div>
<b>${exercises.length} exercise${exercises.length === 1 ? "" : "s"}</b>
</header>
${renderProgramPhaseRail(plan)}
<div class="medical-program-current-grid">
<div class="medical-program-exercise-plan">
<header>
<div>
<span>Current exercise plan</span>
<strong>${exercises.length ? `${exercises.length} planned item${exercises.length === 1 ? "" : "s"}` : "No exercises added"}</strong>
</div>
</header>
<div class="medical-rehab-program-table" aria-label="${escapeHtml(player.name || "Player")} individual rehab program">
<div class="medical-rehab-program-columns" aria-hidden="true">
<span>Exercise</span>
<span>Dose</span>
<span>Medical note</span>
</div>
${exercises.length
    ? exercises.map((exercise, exerciseIndex) => renderRehabProgramExercise(exercise, plan, exerciseIndex)).join("")
    : `<div class="medical-rehab-program-empty">No exercises are assigned yet. Add the first item when the clinical plan is ready.</div>`}
</div>
<details class="medical-program-add-exercise">
<summary>Add exercise</summary>
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
</details>
</div>
${renderProgramDecisionPanel(plan, tracker)}
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
<section class="medical-board-editor-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(player.name || "Player")} RTP Player Board" tabindex="-1">
<header class="medical-board-editor-header">
<div class="medical-board-editor-player">
<span class="medical-program-avatar">${escapeHtml(getPlayerInitials(player.name))}</span>
<div>
<span>RTP Player Board</span>
<h3>${escapeHtml(player.name || "Player")}</h3>
<small>${escapeHtml([player.position, plan.injuryType, `${participation}%`, phaseLabel].filter(Boolean).join(" / "))}</small>
</div>
</div>
<div class="medical-board-editor-actions">
<button type="button" data-medical-edit-injury-plan="${escapeHtml(plan.id)}">Open Medical Plan</button>
<button type="button" data-medical-close-board-editor aria-label="Close RTP Player Board">Close</button>
</div>
</header>
<div class="medical-board-editor-layout">
<aside class="medical-board-editor-tools" aria-label="RTP Player Board tools">
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
    const activeItems = playerItems.filter((item) => item.plan);
    const inactiveItems = playerItems.filter((item) => !item.plan);
    const boardItems = getBoardItems(summary);
    const requestedSelectedPlanId = String(summary.selectedMedicalBoardPlanId || "");
    const selectedPlanId = boardItems.some((item) => item.plan?.id === requestedSelectedPlanId)
      ? requestedSelectedPlanId
      : "";
    const activePrograms = activeItems.length;
    const programView = selectedPlanId ? "detail" : "list";
    return `
<div class="medical-rtp-programs-workspace medical-programs-workspace">
<section class="medical-programs-layout medical-programs-layout-${escapeHtml(programView)}" data-medical-programs-layout data-medical-program-view="${escapeHtml(programView)}" aria-label="Medical programs workspace">
<article class="medical-program-list-panel" data-medical-program-list-panel ${selectedPlanId ? "hidden" : ""}>
<header>
<div>
<span>Rehab programs</span>
<strong>Player programs</strong>
</div>
<small>${activePrograms} active</small>
</header>
<div class="medical-program-player-list medical-program-active-list">
${activeItems.length
    ? activeItems.map((item) => renderPlayerProgramRow(item, selectedPlanId)).join("")
    : `<div class="medical-program-empty"><strong>No active programs</strong><span>Create a program when a player needs structured rehabilitation.</span></div>`}
</div>
${inactiveItems.length ? `
<details class="medical-program-squad-starters">
<summary>
<span><strong>Create program</strong><small>Select a squad player</small></span>
<b>${inactiveItems.length}</b>
</summary>
<div class="medical-program-player-list">
${inactiveItems.map((item) => renderPlayerProgramRow(item, selectedPlanId)).join("")}
</div>
</details>
` : ""}
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
