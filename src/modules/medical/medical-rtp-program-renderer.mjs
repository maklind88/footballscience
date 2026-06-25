import { getMedicalRtpTrackerSummary } from "./medical-rtp-tracker-helpers.mjs";

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
  const hasRtpProgramStarter = (plan = {}) =>
    Boolean(
      plan.rtpLibraryProfileId ||
        getRtpProgramItems(plan.rtpProgramPhases, 1).length ||
        getRtpProgramItems(plan.rtpProgramGateCriteria, 1).length ||
        getRtpProgramItems(plan.rtpProgramNextSteps, 1).length ||
        getRtpProgramItems(plan.rtpProgramHoldRules, 1).length
    );

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
