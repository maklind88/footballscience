const defaultEscapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

export function createMedicalRtpProgramResourcesRenderer({ escapeHtml = defaultEscapeHtml } = {}) {
  const renderExerciseBankOverlay = () => `
<div class="medical-rtp-exercise-overlay" data-medical-rtp-exercise-overlay hidden aria-hidden="true">
<section class="medical-rtp-exercise-overlay-panel" role="dialog" aria-modal="true" aria-labelledby="medical-rtp-exercise-bank-title" tabindex="-1">
<header class="medical-rtp-exercise-overlay-header">
<div>
<span>Programs resource</span>
<strong id="medical-rtp-exercise-bank-title">RTP Exercise Bank</strong>
<small>Club-neutral starters. Medical selects, individualizes and saves exercises inside the player's Medical Plan.</small>
</div>
<button type="button" class="medical-rtp-exercise-close-button" data-medical-rtp-exercise-close>Close</button>
</header>
<div class="medical-rtp-exercise-overlay-body" data-medical-rtp-exercise-overlay-body>
<div class="medical-empty-inline">Exercise Bank loads when opened.</div>
</div>
</section>
</div>
`;

  const render = (programMarkup = "", exerciseCount = 0) => `
<div class="medical-programs-resource-surface">
<div class="medical-programs-resource-bar" aria-label="RTP program resources">
<span>
<strong>Exercise Bank</strong>
<small>${escapeHtml(String(exerciseCount))} club-neutral exercises linked to RTP guides</small>
</span>
<button type="button" class="medical-rtp-exercise-open-button" data-medical-rtp-exercise-open>Browse exercises</button>
</div>
${programMarkup}
</div>
${renderExerciseBankOverlay()}
`;

  return { render };
}
