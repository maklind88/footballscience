export function createMedicalRtpProgramWorkspaceRenderer({
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
    return `
<div class="medical-rtp-programs-workspace">
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
