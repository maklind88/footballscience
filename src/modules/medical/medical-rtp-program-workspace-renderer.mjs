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

const getCases = (summary = {}) => (Array.isArray(summary.activeCases) ? summary.activeCases : []);

const countCasesWithStarter = (cases = []) => cases.filter(({ plan }) => hasMedicalRtpProgramStarter(plan)).length;

const countTrackedPrograms = (cases = []) =>
  cases.filter(({ plan }) => hasMedicalRtpProgramStarter(plan) && getMedicalRtpTrackerSummary(plan).total > 0).length;

export function createMedicalRtpProgramWorkspaceRenderer({
  escapeHtml = defaultEscapeHtml,
  renderCaseRtpStarterLinker = () => "",
  renderOpsStat = () => "",
  renderRtpCaseProgramCards = () => "",
} = {}) {
  const renderWorkflow = () => `
<section class="medical-rtp-program-workflow" aria-label="RTP program workflow">
<span><strong>1</strong> Active case</span>
<span><strong>2</strong> RTP guide</span>
<span><strong>3</strong> Medical Plan</span>
<span><strong>4</strong> Tracker gates</span>
</section>
`;

  const renderProgramBuilderBrief = () => `
<section class="medical-rtp-program-builder-brief" aria-label="RTP Program Builder guidance">
<div>
<span>Program Builder v1</span>
<strong>Build player-specific RTP programs from neutral Library guides</strong>
<small>Library content stays club-neutral. The saved program, notes, gates and deviations belong to the player's Medical Plan.</small>
</div>
<div class="medical-rtp-program-builder-rules">
<span>Medical-owned</span>
<span>Coach sharing off by default</span>
<span>Performance bridge ready</span>
</div>
</section>
`;

  const renderRtpProgramsWorkspace = (summary = {}) => {
    const cases = getCases(summary);
    const withStarter = countCasesWithStarter(cases);
    const needingStarter = Math.max(0, cases.length - withStarter);
    const trackedPrograms = countTrackedPrograms(cases);
    const actionSummary = getMedicalRtpActionQueueSummary(cases, { limit: Number.POSITIVE_INFINITY });
    return `
<div class="medical-rtp-programs-workspace">
<header class="medical-rtp-programs-header">
<div>
<span>RTP Programs</span>
<strong>Medical-owned player programs</strong>
<small>Use RTP Library as the knowledge source, then individualize and track the player program in Medical Plan.</small>
</div>
<b>${escapeHtml(withStarter)}/${escapeHtml(cases.length)} with starter</b>
</header>
<div class="medical-ops-stats medical-rtp-programs-stats">
${renderOpsStat("Program starters", String(withStarter), "Medical Plans using RTP Library", withStarter ? "clear" : "neutral")}
${renderOpsStat("Need starter", String(needingStarter), "active cases without a guide", needingStarter ? "medium" : "clear")}
${renderOpsStat("Tracked programs", String(trackedPrograms), "gates / next steps / hold rules", trackedPrograms ? "low" : "neutral")}
${renderOpsStat("Action queue", String(actionSummary.total), "hold / review / exposure", actionSummary.hold ? "high" : actionSummary.total ? "medium" : "clear")}
</div>
${renderProgramBuilderBrief()}
${renderWorkflow()}
${renderCaseRtpStarterLinker(summary)}
${renderRtpCaseProgramCards(summary)}
</div>
`;
  };

  return {
    renderRtpProgramsWorkspace,
  };
}
