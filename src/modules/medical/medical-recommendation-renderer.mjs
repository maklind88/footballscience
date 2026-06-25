const defaultEscapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

export function createMedicalRecommendationRenderer({
  escapeHtml = defaultEscapeHtml,
  canEditMedicalTeam,
  formatMedicalDateLabel,
  getMedicalPlayerInjuryPlans,
  getMedicalPlayerRestrictedLogRecords,
  getMedicalRecordStatus,
  getMedicalRtpPhaseOption,
  getMedicalStatusForParticipation,
  getMedicalStatusOption,
  getSelectedDate,
  isMedicalInjuryPlanActive,
  isMedicalItemArchived,
  isMedicalPlanCleared,
  medicalActualParticipationFallback = "not-logged",
  medicalInjuryPlanStatusOptions = [],
  medicalParticipationOptions = [],
  normalizeMedicalActualParticipation,
} = {}) {
  const renderLog = (player) => {
    const records = player ? getMedicalPlayerRestrictedLogRecords(player.id) : [];
    if (!records.length) {
      return `<div class="medical-log-empty">No restricted recommendations yet.</div>`;
    }
    return records
      .map((record) => {
        const status = getMedicalRecordStatus(record);
        const actualText =
          record.actualParticipation === medicalActualParticipationFallback
            ? "Actual not logged"
            : `Actual ${record.actualParticipation}%`;
        return `
<article class="medical-log-item">
<div class="medical-log-main">
<span class="medical-status-chip medical-tone-${escapeHtml(status.tone)}">${escapeHtml(status.label)}</span>
<strong>${escapeHtml(formatMedicalDateLabel(record.date, "long"))}</strong>
<small>${record.participation}% recommended / ${escapeHtml(actualText)}</small>
${record.comment ? `<p>${escapeHtml(record.comment)}</p>` : ""}
</div>
${canEditMedicalTeam() ? `<button type="button" class="medical-log-delete" data-medical-delete-record="${escapeHtml(record.id)}" aria-label="Archive log entry">Archive</button>` : ""}
</article>
`;
      })
      .join("");
  };

  const renderRecommendationPresets = (selectedParticipation, canEdit = canEditMedicalTeam()) => {
    const labels = {
      0: "Out",
      10: "Return",
      25: "Rehab",
      50: "Controlled",
      75: "Modified",
      100: "Full",
    };
    return `
<div class="medical-preset-grid" role="group" aria-label="Recommended participation">
${medicalParticipationOptions
  .map((participation) => {
    const statusKey = getMedicalStatusForParticipation(participation);
    return `
<button
type="button"
class="medical-preset-button${participation === selectedParticipation ? " is-selected" : ""}"
data-medical-recommendation-preset
data-medical-participation="${participation}"
data-medical-status="${escapeHtml(statusKey)}"
${canEdit ? "" : "disabled"}
>
<strong>${participation}%</strong>
<span>${escapeHtml(labels[participation] ?? getMedicalStatusOption(statusKey).label)}</span>
</button>
`;
  })
  .join("")}
</div>
`;
  };

  const renderActualPresets = (selectedValue, canEdit = canEditMedicalTeam()) => {
    const normalizedValue = normalizeMedicalActualParticipation(selectedValue);
    const values = [medicalActualParticipationFallback, ...medicalParticipationOptions];
    return `
<div class="medical-actual-grid" role="group" aria-label="Actual participation">
${values
  .map((value) => {
    const isFallback = value === medicalActualParticipationFallback;
    const isSelected = normalizedValue === value;
    return `
<button
type="button"
class="medical-actual-button${isSelected ? " is-selected" : ""}"
data-medical-actual-value="${escapeHtml(value)}"
${canEdit ? "" : "disabled"}
>
${isFallback ? "Not logged" : `${value}%`}
</button>
`;
  })
  .join("")}
</div>
`;
  };

  const renderInjuryPlanStatusOptions = (selectedStatus = "unavailable") => {
    const currentStatus = medicalInjuryPlanStatusOptions.some((status) => status.key === selectedStatus)
      ? selectedStatus
      : "unavailable";
    return medicalInjuryPlanStatusOptions
      .map(
        (status) =>
          `<option value="${escapeHtml(status.key)}"${status.key === currentStatus ? " selected" : ""}>${escapeHtml(status.label)}</option>`
      )
      .join("");
  };

  const getRtpProgramItems = (items = [], limit = 2) => (Array.isArray(items) ? items.filter(Boolean).slice(0, limit) : []);

  const renderPlanProgramLine = (label, items = []) =>
    items.length ? `<small><strong>${escapeHtml(label)}:</strong> ${escapeHtml(items.join(" / "))}</small>` : "";

  const renderPlanRtpProgramMini = (plan = {}) => {
    const gateCriteria = getRtpProgramItems(plan.rtpProgramGateCriteria, 2);
    const nextSteps = getRtpProgramItems(plan.rtpProgramNextSteps, 2);
    const holdRules = getRtpProgramItems(plan.rtpProgramHoldRules, 1);
    const hasProgram = Boolean(plan.rtpLibraryProfileName || gateCriteria.length || nextSteps.length || holdRules.length);
    if (!hasProgram) {
      return "";
    }
    return `
<section class="medical-rtp-plan-source">
<span>RTP Library source</span>
<strong>${escapeHtml(plan.rtpLibraryProfileName || "Medical starter")}</strong>
${plan.rtpLibraryEvidenceLevel ? `<small>Evidence: ${escapeHtml(plan.rtpLibraryEvidenceLevel)}</small>` : ""}
${renderPlanProgramLine("Gate criteria", gateCriteria)}
${renderPlanProgramLine("Next step", nextSteps)}
${renderPlanProgramLine("Hold", holdRules)}
</section>
`;
  };

  const renderInjuryPlanList = (player) => {
    const plans = player ? getMedicalPlayerInjuryPlans(player.id) : [];
    if (!plans.length) {
      return `<div class="medical-log-empty">No active availability plan.</div>`;
    }
    return plans
      .map((plan) => {
        const status = getMedicalStatusOption(plan.status);
        const isActive = isMedicalInjuryPlanActive(plan, getSelectedDate());
        const phase = getMedicalRtpPhaseOption(plan.rtpPhase);
        const isCleared = isMedicalPlanCleared(plan);
        return `
<article class="medical-plan-item${isActive ? " is-active" : ""}">
<div>
<span class="medical-status-chip medical-tone-${escapeHtml(status.tone)}">${escapeHtml(isActive ? "Active" : status.label)}</span>
<strong>${escapeHtml(plan.injuryType)}</strong>
<small>${escapeHtml(formatMedicalDateLabel(plan.startDate))} - ${escapeHtml(formatMedicalDateLabel(plan.endDate))} / ${plan.participation}%</small>
<small>${escapeHtml(phase.label)} / ${isCleared ? "cleared gates" : "clearance pending"}</small>
${plan.bodyArea || plan.reviewDate ? `<small>${escapeHtml([plan.bodyArea, plan.reviewDate ? `Review ${formatMedicalDateLabel(plan.reviewDate)}` : ""].filter(Boolean).join(" / "))}</small>` : ""}
${renderPlanRtpProgramMini(plan)}
${plan.comment ? `<p>${escapeHtml(plan.comment)}</p>` : ""}
</div>
${
  canEditMedicalTeam()
    ? `<div class="medical-plan-actions">
<button type="button" class="medical-plan-edit" data-medical-edit-injury-plan="${escapeHtml(plan.id)}" aria-label="Edit availability plan">Edit</button>
<button type="button" class="medical-log-delete" data-medical-delete-injury-plan="${escapeHtml(plan.id)}" aria-label="Archive injury plan">Archive</button>
</div>`
    : ""
}
</article>
`;
      })
      .join("");
  };

  const renderPlanListCard = (player) => {
    const activeCount = getMedicalPlayerInjuryPlans(player.id).length;
    const archivedCount = getMedicalPlayerInjuryPlans(player.id, { includeArchived: true }).filter(isMedicalItemArchived).length;
    return `
<article class="medical-side-card medical-plan-list-card">
<div class="medical-card-headline">
<h2>Availability Plans</h2>
<span>${activeCount}${archivedCount ? ` / ${archivedCount} archived` : ""}</span>
</div>
<div class="medical-plan-list">${renderInjuryPlanList(player)}</div>
</article>
`;
  };

  const renderLogCard = (player) => {
    const activeCount = getMedicalPlayerRestrictedLogRecords(player.id).length;
    const archivedCount = getMedicalPlayerRestrictedLogRecords(player.id, { includeArchived: true }).filter(isMedicalItemArchived).length;
    return `
<article class="medical-side-card medical-log-card">
<div class="medical-card-headline">
<h2>Medical Log</h2>
<span>${activeCount}${archivedCount ? ` / ${archivedCount} archived` : ""}</span>
</div>
<div class="medical-log-list">${renderLog(player)}</div>
</article>
`;
  };

  return {
    renderActualPresets,
    renderInjuryPlanList,
    renderInjuryPlanStatusOptions,
    renderLog,
    renderLogCard,
    renderPlanListCard,
    renderRecommendationPresets,
  };
}
