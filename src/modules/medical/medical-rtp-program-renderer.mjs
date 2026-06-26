import {
  getMedicalRtpActionQueueSummary,
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

const getRtpProgramItems = (items = [], limit = 3) => (Array.isArray(items) ? items.filter(Boolean).slice(0, limit) : []);

export function createMedicalRtpProgramRenderer({
  escapeHtml = defaultEscapeHtml,
  getMedicalRtpPhaseOption,
  medicalClearanceRoles = [],
  medicalLoadGateOptions = [],
} = {}) {
  const hasRtpProgramStarter = hasMedicalRtpProgramStarter;

  const renderRtpProgramSection = (title, items = []) => `
<section>
<h4>${escapeHtml(title)}</h4>
${
  items.length
    ? `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
    : `<p>Not set yet</p>`
}
</section>
`;

  const renderRtpTrackerSummary = (plan = {}) => {
    const summary = getMedicalRtpTrackerSummary(plan);
    if (!summary.total) {
      return renderRtpProgramSection("Tracker", ["No tracker items set yet"]);
    }
    return `
<section class="medical-rtp-case-tracker medical-rtp-tracker-${escapeHtml(summary.tone)}">
<h4>Tracker</h4>
<div>
<span>${escapeHtml(summary.completionLabel)}</span>
<small>${escapeHtml(summary.nextDecision)}</small>
</div>
</section>
`;
  };

  const renderRtpProgramFocusStrip = (plan = {}) => `
<div class="medical-rtp-case-focus-strip" aria-label="RTP program focus">
<span>
<strong>Load focus</strong>
${escapeHtml(getRtpProgramItems(plan.rtpProgramLoadText, 1)[0] || "Set load focus in Medical Plan")}
</span>
<span>
<strong>Risk watch</strong>
${escapeHtml(getRtpProgramItems(plan.rtpProgramRiskFactors, 1)[0] || "Set player-specific risk factors")}
</span>
<span>
<strong>Warning point</strong>
${escapeHtml(getRtpProgramItems(plan.rtpProgramWarningPoints, 1)[0] || "Set hold triggers")}
</span>
</div>
`;

  const renderRtpActionMetric = (label, value, tone = "neutral") => `
<span class="medical-rtp-action-metric medical-rtp-action-${escapeHtml(tone)}">
<strong>${escapeHtml(value)}</strong>
<small>${escapeHtml(label)}</small>
</span>
`;

  const renderRtpActionQueue = (activeCases = []) => {
    const summary = getMedicalRtpActionQueueSummary(activeCases);
    return `
<section class="medical-rtp-action-queue" aria-label="RTP medical action queue">
<header>
<div>
<span>RTP Action Queue</span>
<strong>What Medical should handle next</strong>
<small>Prioritized by hold rules, reviews and tracker status.</small>
</div>
<b>${summary.total ? `${summary.total} action${summary.total === 1 ? "" : "s"}` : "No actions"}</b>
</header>
<div class="medical-rtp-action-metrics" aria-label="RTP action queue summary">
${renderRtpActionMetric("Hold", summary.hold, summary.hold ? "high" : "neutral")}
${renderRtpActionMetric("Review", summary.review, summary.review ? "medium" : "neutral")}
${renderRtpActionMetric("Next exposure", summary.exposure, summary.exposure ? "medium" : "neutral")}
${renderRtpActionMetric("Ready", summary.ready, summary.ready ? "clear" : "neutral")}
</div>
${
  summary.items.length
    ? `<div class="medical-rtp-action-list">
${summary.items
  .map(
    (item) => `
<button
type="button"
data-medical-edit-injury-plan="${escapeHtml(item.planId)}"
data-medical-rtp-focus="${escapeHtml(item.key)}"
data-medical-rtp-focus-group="${escapeHtml(item.focusGroupKey)}"
data-medical-rtp-focus-index="${escapeHtml(item.focusIndex)}"
class="medical-rtp-action-row medical-rtp-action-${escapeHtml(item.tone)}"
aria-label="Open Medical Plan RTP focus for ${escapeHtml(item.playerName)}"
>
<span>
<strong>${escapeHtml(item.playerName)}</strong>
<small>${escapeHtml(item.identity)}</small>
</span>
<span>
<strong>${escapeHtml(item.label)}</strong>
<small>${escapeHtml(item.detail)}</small>
</span>
<b>${escapeHtml(item.action)}</b>
</button>
`
  )
  .join("")}
</div>`
    : `<div class="medical-empty-inline">No RTP action queue items. Active RTP programs are tracking normally.</div>`
}
</section>
`;
  };

  const renderRtpCaseProgramCards = (summary = {}) => {
    const activeCases = Array.isArray(summary.activeCases) ? summary.activeCases : [];
    const rtpCases = activeCases.filter(({ plan }) => hasRtpProgramStarter(plan)).slice(0, 6);
    return `
<section class="medical-rtp-case-workspace" aria-label="Medical RTP program workspace">
<header>
<div>
<span>RTP Programs</span>
<strong>Medical-owned player programs from the RTP Library</strong>
</div>
<small>${rtpCases.length}/${activeCases.length} active cases have a structured starter</small>
</header>
${renderRtpActionQueue(activeCases)}
${
  rtpCases.length
    ? `<div class="medical-rtp-case-board">
${rtpCases
  .map(({ player, plan, severity, review, clearance }) => {
    const phase = getMedicalRtpPhaseOption(plan.rtpPhase);
    const trackerSummary = getMedicalRtpTrackerSummary(plan);
    return `
<article class="medical-rtp-case-card medical-ops-tone-${escapeHtml(severity.tone)}">
<header>
<div>
<span>${escapeHtml(player.position || "Position")} / ${escapeHtml(severity.label)}</span>
<strong>${escapeHtml(player.name)}</strong>
</div>
<b>${escapeHtml(phase.label)}</b>
</header>
<div class="medical-rtp-case-meta">
<span><strong>Case</strong>${escapeHtml([plan.injuryType, plan.bodyArea].filter(Boolean).join(" / "))}</span>
<span><strong>Source</strong>${escapeHtml(plan.rtpLibraryProfileName || "RTP Library starter")}</span>
<span><strong>Evidence</strong>${escapeHtml(plan.rtpLibraryEvidenceLevel || "Not set")}</span>
<span><strong>Clearance</strong>${clearance.signOffCount}/${medicalClearanceRoles.length} sign-off / ${clearance.gatePassCount}/${medicalLoadGateOptions.length} gates</span>
<span><strong>Tracker</strong>${escapeHtml(trackerSummary.completionLabel)}</span>
</div>
${renderRtpProgramFocusStrip(plan)}
<div class="medical-rtp-case-sections">
${renderRtpTrackerSummary(plan)}
${renderRtpProgramSection("Next step", getRtpProgramItems(plan.rtpProgramNextSteps, 2))}
${renderRtpProgramSection("Gate criteria", getRtpProgramItems(plan.rtpProgramGateCriteria, 3))}
${renderRtpProgramSection("Hold rules", getRtpProgramItems(plan.rtpProgramHoldRules, 2))}
</div>
<footer>
<small>${escapeHtml(review.label)}</small>
<button type="button" data-medical-edit-injury-plan="${escapeHtml(plan.id)}">Open Medical Plan</button>
</footer>
</article>
`;
  })
  .join("")}
</div>`
    : `<div class="medical-empty-inline">No active case is currently using an RTP Library starter.</div>`
}
</section>
`;
  };

  return {
    hasRtpProgramStarter,
    renderRtpCaseProgramCards,
  };
}
