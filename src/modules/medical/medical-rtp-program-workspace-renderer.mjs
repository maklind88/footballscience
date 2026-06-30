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
  renderExerciseCatalog = () => "",
  renderRtpCaseProgramCards = () => "",
} = {}) {
  const renderWorkflow = () => `
<section class="medical-rtp-program-workflow" aria-label="RTP program workflow">
<span><strong>1</strong> Active Medical case</span>
<span><strong>2</strong> Apply Library guide</span>
<span><strong>3</strong> Save Medical Plan</span>
<span><strong>4</strong> Player Profile sync</span>
</section>
`;

  const renderProgramBuilderBrief = () => `
<section class="medical-rtp-program-builder-brief" aria-label="RTP Program Builder guidance">
<div>
<span>How it works</span>
<strong>Programs are activated from a player's Medical Plan</strong>
<small>RTP Library provides the guide, Exercise Bank provides starters, and the saved Medical Plan is the player-specific source that appears on the Player Profile.</small>
</div>
<div class="medical-rtp-program-builder-rules">
<span>Medical-owned</span>
<span>Player-specific only after save</span>
<span>Coach-safe summary separate</span>
</div>
</section>
`;

  const renderActivationState = (cases = [], needingStarter = 0, withStarter = 0) => {
    const hasCases = cases.length > 0;
    return `
<section class="medical-rtp-program-activation" aria-label="Start RTP program workflow">
<header>
<div>
<span>Start RTP Program</span>
<strong>${hasCases ? "Convert an active Medical case into a player RTP program" : "Create an active Medical case first"}</strong>
<small>${hasCases ? "Choose a guide, review the Medical Plan draft, then save it. That saved plan is what syncs to the player's profile." : "Programs are not standalone library items. Start with the player and case so notes, restrictions, gates and privacy stay attached to the right player."}</small>
</div>
<b>${escapeHtml(withStarter)}/${escapeHtml(cases.length)} active</b>
</header>
<div class="medical-rtp-program-sync-path">
<span><strong>Source</strong>RTP Library guide</span>
<span><strong>Build</strong>Medical Plan draft</span>
<span><strong>Save</strong>Player-specific RTP program</span>
<span><strong>Visible</strong>Player Profile / Medical Plan</span>
</div>
${
  hasCases
    ? `<div class="medical-rtp-program-activation-status ${needingStarter ? "needs-action" : "is-ready"}">
<strong>${needingStarter ? `${needingStarter} case${needingStarter === 1 ? " needs" : "s need"} a starter` : "All active RTP cases have a starter"}</strong>
<small>${needingStarter ? "Use the cards below to apply a guide and open the player's Medical Plan draft." : "Use Active player RTP programs below to track gates, hold rules and next exposure."}</small>
</div>`
    : `<div class="medical-rtp-program-activation-status needs-action">
<strong>No active case to convert</strong>
<small>Open Active Cases or a player's Medical Plan, create the case, then return here to apply the RTP guide.</small>
<button type="button" data-medical-ops-tab="cases">Open Active Cases</button>
</div>`
}
</section>
`;
  };

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
<strong>Medical-owned RTP workflow</strong>
<small>Start from an active case, apply a Library guide, save the Medical Plan, then follow the program from the player's profile.</small>
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
${renderActivationState(cases, needingStarter, withStarter)}
${renderCaseRtpStarterLinker(summary)}
${renderRtpCaseProgramCards(summary)}
${renderExerciseCatalog()}
</div>
`;
  };

  return {
    renderRtpProgramsWorkspace,
  };
}
