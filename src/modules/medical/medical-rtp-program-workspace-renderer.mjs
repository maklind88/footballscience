export function createMedicalRtpProgramWorkspaceRenderer({
  renderExerciseCatalog = () => "",
} = {}) {
  const renderExerciseBankOverlay = () => `
<section class="medical-rtp-exercise-launcher" aria-label="Exercise Bank workflow">
<div class="medical-rtp-exercise-launcher-copy">
<span>Exercise Bank</span>
<strong>Clinical exercise catalogue for RTP programs</strong>
<small>Use the bank to search exercises and clinical gates. Player-specific work is saved from the player's Medical Plan.</small>
</div>
<div class="medical-rtp-exercise-launcher-flow" aria-label="How to place exercises with a player">
<span>1. Select active case</span>
<span>2. Apply RTP guide</span>
<span>3. Edit Medical Plan</span>
<span>4. Save player program</span>
</div>
<button type="button" class="medical-rtp-exercise-open-button" data-medical-rtp-exercise-open>
Open Exercise Bank
</button>
</section>
<div class="medical-rtp-exercise-overlay" data-medical-rtp-exercise-overlay hidden aria-hidden="true">
<section class="medical-rtp-exercise-overlay-panel" role="dialog" aria-modal="true" aria-label="RTP Exercise Bank" tabindex="-1">
<header class="medical-rtp-exercise-overlay-header">
<div>
<span>Exercise Bank</span>
<strong>Search first. Place through Medical Plan.</strong>
<small>This overlay is the clinical catalogue. To assign exercises to a player, open an active case, apply a Library guide, review the player's Medical Plan, then save.</small>
</div>
<button type="button" class="medical-rtp-exercise-close-button" data-medical-rtp-exercise-close aria-label="Close Exercise Bank">
Close
</button>
</header>
<div class="medical-rtp-exercise-overlay-flow" aria-label="Exercise assignment workflow">
<span><b>Find</b> Exercise, tissue, phase or demand</span>
<span><b>Match</b> Risk level and return-to-play phase</span>
<span><b>Open</b> Player Medical Plan</span>
<span><b>Save</b> Player-specific RTP program</span>
</div>
<div class="medical-rtp-exercise-overlay-body">
${renderExerciseCatalog()}
</div>
</section>
</div>
`;

  const renderRtpProgramsWorkspace = (summary = {}) => {
    return `
<div class="medical-rtp-programs-workspace">
${renderExerciseBankOverlay()}
</div>
`;
  };

  return {
    renderRtpProgramsWorkspace,
  };
}
