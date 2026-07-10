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
