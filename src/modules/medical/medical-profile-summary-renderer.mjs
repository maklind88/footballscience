const defaultEscapeHtml = (value = "") =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

export function createMedicalProfileSummaryRenderer(options = {}) {
  const escapeHtml = typeof options.escapeHtml === "function" ? options.escapeHtml : defaultEscapeHtml;
  const formatMedicalDateLabel = typeof options.formatMedicalDateLabel === "function" ? options.formatMedicalDateLabel : (value) => value || "Not set";
  const clearanceRoleCount = Number.isFinite(options.clearanceRoleCount) ? options.clearanceRoleCount : 0;
  const loadGateCount = Number.isFinite(options.loadGateCount) ? options.loadGateCount : 0;

  function render(summary = {}) {
    const activePlanLabel = summary.activePlan
      ? [summary.activePlan.injuryType, summary.activePlan.bodyArea].filter(Boolean).join(" / ")
      : "No active plan";
    const reviewLabel = summary.primaryPlan?.reviewDate
      ? formatMedicalDateLabel(summary.primaryPlan.reviewDate)
      : "Not set";
    const latestLogLabel = summary.latestManualRecord
      ? `${formatMedicalDateLabel(summary.latestManualRecord.date)} / ${summary.latestManualRecord.participation}%`
      : "No manual log";
    return `
<article class="medical-side-card medical-profile-summary-card">
<div class="medical-card-headline">
<h2>Medical Profile</h2>
<span>${summary.currentRecord ? `${summary.currentRecord.participation}%` : "Not set"}</span>
</div>
<div class="medical-profile-summary-grid">
<div>
<span>Current</span>
<strong>${escapeHtml(summary.status?.label)}</strong>
</div>
<div>
<span>RTP phase</span>
<strong>${escapeHtml(summary.phaseLabel)}</strong>
</div>
<div>
<span>Active plan</span>
<strong>${escapeHtml(activePlanLabel)}</strong>
</div>
<div>
<span>Review</span>
<strong>${escapeHtml(reviewLabel)}</strong>
</div>
<div>
<span>7-day average</span>
<strong>${summary.windowAverage === null ? "-" : `${summary.windowAverage}%`}</strong>
</div>
<div>
<span>Log entries</span>
<strong>${summary.manualLogCount}</strong>
</div>
<div>
<span>Clearance</span>
<strong>${summary.primaryPlan ? `${summary.signOffCount}/${clearanceRoleCount}` : "-"}</strong>
</div>
<div>
<span>Load gates</span>
<strong>${summary.primaryPlan ? `${summary.gatePassCount}/${loadGateCount}` : "-"}</strong>
</div>
</div>
<div class="medical-profile-summary-foot">
<span>${escapeHtml(latestLogLabel)}</span>
<strong>${summary.activeDays ? `${summary.activeDays} days managed` : summary.cleared ? "Cleared" : "No active restriction"}</strong>
</div>
${
summary.coachNote
? `<p class="medical-profile-summary-note">${escapeHtml(summary.coachNote)}</p>`
: ""
}
</article>
`;
  }

  return { render };
}
