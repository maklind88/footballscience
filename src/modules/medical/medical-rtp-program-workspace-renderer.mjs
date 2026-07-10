import { hasMedicalRtpProgramStarter } from "./medical-rtp-tracker-helpers.mjs";

const defaultEscapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const getCases = (summary = {}) => (Array.isArray(summary.activeCases) ? summary.activeCases : []);

const countCasesWithStarter = (cases = []) => cases.filter(({ plan }) => hasMedicalRtpProgramStarter(plan)).length;

export function createMedicalRtpProgramWorkspaceRenderer({
  escapeHtml = defaultEscapeHtml,
  renderCaseRtpStarterLinker = () => "",
  renderExerciseCatalog = () => "",
  renderRtpCaseProgramCards = () => "",
} = {}) {
  const renderActivationState = (cases = [], needingStarter = 0, withStarter = 0) => {
    const hasCases = cases.length > 0;
    return `
<section class="medical-rtp-program-activation" aria-label="Start RTP program workflow">
<header>
<div>
<span>Program workflow</span>
<strong>${hasCases ? "Convert an active Medical case into a player RTP program" : "Start with a player case"}</strong>
<small>${hasCases ? "Apply a Library guide, review the Medical Plan draft, then save. The saved Medical Plan is the player-specific source that syncs to the Player Profile." : "Programs are not standalone library items. Create the player case first so notes, restrictions, gates and privacy stay attached to the right player."}</small>
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

  const renderExerciseDrawer = () => `
<details class="medical-rtp-exercise-drawer">
<summary>
<div>
<span>Exercise Bank</span>
<strong>Open only when building or editing a Medical Plan</strong>
<small>Exercise content supports the player program, but it should not dominate the program workflow.</small>
</div>
<b>Open bank</b>
</summary>
${renderExerciseCatalog()}
</details>
`;

  const renderRtpProgramsWorkspace = (summary = {}) => {
    const cases = getCases(summary);
    const withStarter = countCasesWithStarter(cases);
    const needingStarter = Math.max(0, cases.length - withStarter);
    return `
<div class="medical-rtp-programs-workspace">
<header class="medical-rtp-programs-header">
<div>
<span>RTP Programs</span>
<strong>Medical-owned RTP command center</strong>
<small>One flow: player case, Library guide, Medical Plan, Player Profile. No separate program source of truth.</small>
</div>
<b>${escapeHtml(withStarter)}/${escapeHtml(cases.length)} with starter</b>
</header>
${renderActivationState(cases, needingStarter, withStarter)}
${renderCaseRtpStarterLinker(summary)}
${renderRtpCaseProgramCards(summary)}
${renderExerciseDrawer()}
</div>
`;
  };

  return {
    renderRtpProgramsWorkspace,
  };
}
