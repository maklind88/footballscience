const defaultEscapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

export function createMedicalPlayerModalRenderer({
  escapeHtml = defaultEscapeHtml,
  canEditMedicalTeam,
  formatMedicalDateLabel,
  getLatestMedicalRecord,
  getMedicalCoachComment,
  getMedicalPlayerSquadAvailabilityBlockReason,
  getMedicalRecommendationActivityContext,
  getMedicalRecordStatus,
  getMedicalRtpPhaseForRecommendation,
  getMedicalRtpPhaseOption,
  getMedicalStatusForParticipation,
  getMedicalStatusOption,
  getMedicalStatusOptionForDate,
  getMedicalWindowDates,
  getMedicalPlayerRestrictedLogRecords,
  getPlayerModalOpen,
  getPlayerModalTab,
  getSelectedDate,
  getSelectedMedicalPlayer,
  medicalActualParticipationFallback = "not-logged",
  medicalPlayerModalTabOptions = [],
  normalizeMedicalPlayerModalTab,
  renderMedicalActualPresets,
  renderMedicalClearanceChecklist,
  renderMedicalInjuryPlanForm,
  renderMedicalLogCard,
  renderMedicalLog,
  renderMedicalNewPlayerCard,
  renderMedicalPlanListCard,
  renderMedicalRtpProgramCard = () => "",
  renderMedicalActualParticipationOptions,
  renderMedicalParticipationOptions,
  renderMedicalPlayerAvatar,
  renderMedicalPlayerProfileSummary,
  renderMedicalRecommendationPresets,
  renderMedicalRtpPhaseOptions,
  getMedicalPlayerRtpCoachStatus = () => null,
  renderMedicalStatusOptions,
} = {}) {
  const renderCoachSafeModal = (player, record, status) => {
    const coachComment = getMedicalCoachComment(record);
    const phase = record ? getMedicalRtpPhaseOption(record.rtpPhase) : null;
    return `
<div class="medical-modal-layer" role="presentation">
<button type="button" class="medical-modal-backdrop" data-medical-close-modal aria-label="Close recommendation"></button>
<section class="medical-modal-card medical-coach-modal" role="dialog" aria-modal="true" aria-labelledby="medicalModalTitle">
<header class="medical-modal-header">
<div class="medical-modal-player">
${renderMedicalPlayerAvatar(player, "medical-modal-avatar")}
<div>
<p class="placeholder-tag">Coach Availability</p>
<h2 id="medicalModalTitle">${escapeHtml(player.name)}</h2>
<span>${player.number ? `#${escapeHtml(player.number)} / ` : ""}${escapeHtml(player.position || "Position")}</span>
</div>
</div>
<div class="medical-modal-current medical-tone-${escapeHtml(status.tone)}">
<strong>${record ? `${record.participation}%` : "Not set"}</strong>
<span>${escapeHtml(status.label)}</span>
</div>
<button type="button" class="medical-modal-close" data-medical-close-modal aria-label="Close recommendation"><span aria-hidden="true"></span></button>
</header>
<div class="medical-coach-safe-body">
<article class="medical-modal-main-card">
<div class="medical-card-headline">
<h2>Approved Share</h2>
<span>${escapeHtml(formatMedicalDateLabel(getSelectedDate()))}</span>
</div>
<div class="medical-coach-safe-grid">
<div><span>Availability</span><strong>${record ? `${record.participation}%` : "Not set"}</strong></div>
<div><span>Status</span><strong>${escapeHtml(status.label)}</strong></div>
<div><span>RTP</span><strong>${escapeHtml(phase?.label ?? "Not set")}</strong></div>
</div>
${coachComment ? `<p class="medical-coach-note">${escapeHtml(coachComment)}</p>` : `<p class="medical-empty-inline">No coach-approved comment for this player.</p>`}
</article>
<article class="medical-modal-main-card">
<div class="medical-card-headline">
<h2>Next 7 Days</h2>
<span>Availability</span>
</div>
<div class="medical-coach-window">
${getMedicalWindowDates()
  .map((dateValue) => {
    const windowRecord = getLatestMedicalRecord(player.id, dateValue);
    const windowStatus = getMedicalRecordStatus(windowRecord);
    return `
<div class="medical-coach-day medical-tone-${escapeHtml(windowStatus.tone)}">
<span>${escapeHtml(formatMedicalDateLabel(dateValue))}</span>
<strong>${windowRecord ? `${windowRecord.participation}%` : "--"}</strong>
</div>
`;
  })
  .join("")}
</div>
</article>
</div>
</section>
</div>
`;
  };

  const renderCoachSafeRtpCard = (player) => {
    if (!player) {
      return ``;
    }
    const statusPayload = getMedicalPlayerRtpCoachStatus(player.id);
    const statusCard = statusPayload?.statusCard;
    if (!statusCard) {
      return `
<article class="medical-side-card">
<div class="medical-card-headline">
<h2>RTP Status</h2>
<span>Coach-safe summary</span>
</div>
<div class="medical-empty-inline">No coach-safe RTP status is available for this player yet.</div>
</article>
`;
    }
    return `
<article class="medical-side-card">
<div class="medical-card-headline">
<h2>RTP Status</h2>
<span>Coach-safe summary</span>
</div>
<div class="medical-coach-safe-grid">
<div><span>Train today</span><strong>${escapeHtml(String(statusCard.canTrainToday || "unknown"))}</strong></div>
<div><span>Play next match</span><strong>${escapeHtml(String(statusCard.canPlayNextMatch || "unknown"))}</strong></div>
<div><span>Risk</span><strong>${escapeHtml(String(statusCard.riskLevel || "unknown"))}</strong></div>
<div><span>Minutes guidance</span><strong>${escapeHtml(String(statusCard.minutesGuidanceBand || "unknown"))}</strong></div>
<div><span>Position readiness</span><strong>${escapeHtml(String(statusCard.positionReadinessBand || "unknown"))}</strong></div>
<div><span>Next decision</span><strong>${escapeHtml(String(statusCard.nextDecisionPoint || "Next decision point to be posted after latest activity."))}</strong></div>
</div>
</article>
`;
  };

  const renderPlayerModalTabs = (activeTab = getPlayerModalTab()) => {
    const normalizedTab = normalizeMedicalPlayerModalTab(activeTab);
    return `
<nav class="medical-modal-tabs" role="tablist" aria-label="Player medical tabs">
${medicalPlayerModalTabOptions
  .map(
    (tab) => `
<button
type="button"
role="tab"
id="medicalModalTab${escapeHtml(tab.key)}"
class="medical-modal-tab${normalizedTab === tab.key ? " is-active" : ""}"
data-medical-modal-tab="${escapeHtml(tab.key)}"
aria-selected="${normalizedTab === tab.key ? "true" : "false"}"
aria-controls="medicalModalPanel"
>${escapeHtml(tab.label)}</button>
`
  )
  .join("")}
</nav>
`;
  };

  const renderRecommendationModalCard = (context) => {
    const {
      activityContext,
      canEdit,
      canRecommend,
      formActual,
      formParticipation,
      formRtpPhase,
      formStatus,
      formStatusLabel,
      player,
      record,
      squadBlockReason,
    } = context;
    const lockMessage =
      squadBlockReason ||
      (!activityContext.isRecommendable
        ? `${activityContext.blockReason} Select a training or match day to add a recommendation.`
        : "");
    return `
<article class="medical-modal-main-card">
<div class="medical-card-headline">
<h2>${escapeHtml(activityContext.recommendationLabel)}</h2>
<span data-medical-recommendation-preview>${formParticipation}% / ${escapeHtml(formStatusLabel)}</span>
</div>
${lockMessage ? `<div class="medical-activity-lock">${escapeHtml(lockMessage)}</div>` : ""}
<form id="medicalRecommendationForm" class="medical-profile-form medical-recommendation-form" data-medical-recommendation-form>
<input type="hidden" name="playerId" value="${escapeHtml(player.id)}" />
<input type="hidden" name="status" id="medicalRecommendationStatus" value="${escapeHtml(formStatus)}" />
<input type="hidden" name="participation" id="medicalRecommendationParticipation" value="${escapeHtml(formParticipation)}" />
<input type="hidden" name="actualParticipation" id="medicalActualParticipation" value="${escapeHtml(formActual)}" />
<div class="medical-form-grid">
<label>
<span>Date</span>
<input name="date" type="date" value="${escapeHtml(getSelectedDate())}" ${canEdit ? "" : "disabled"} />
</label>
<label>
<span>RTP phase</span>
<select name="rtpPhase" id="medicalRecommendationRtpPhase" ${canRecommend ? "" : "disabled"}>
${renderMedicalRtpPhaseOptions(formRtpPhase)}
</select>
</label>
</div>
${renderMedicalRecommendationPresets(formParticipation, canRecommend)}
<div class="medical-form-block">
<span>Actual participation</span>
${renderMedicalActualPresets(formActual, canRecommend)}
</div>
<label>
<span>Internal medical note</span>
<textarea name="comment" rows="4" ${canRecommend ? "" : "disabled"}>${escapeHtml(record?.comment ?? "")}</textarea>
</label>
<label>
<span>Coach-safe comment</span>
<textarea name="coachNote" rows="2" ${canRecommend ? "" : "disabled"}>${escapeHtml(record?.coachNote ?? "")}</textarea>
</label>
<label class="medical-inline-check">
<input type="checkbox" name="shareWithCoach" ${record?.shareWithCoach ? "checked" : ""} ${canRecommend ? "" : "disabled"} />
<span>Approved to share with coaching staff</span>
</label>
<div class="medical-form-actions">
<button type="submit" ${canRecommend ? "" : "disabled"}>Save status</button>
<button type="button" class="secondary medical-secondary-button" data-medical-close-modal>Close</button>
</div>
</form>
</article>
`;
  };

  const renderPlayerModalBody = (context, options = {}) => {
    const activeTab = normalizeMedicalPlayerModalTab(getPlayerModalTab());
    const activeTabLabel = medicalPlayerModalTabOptions.find((tab) => tab.key === activeTab)?.label ?? "Availability";
    const { player, canEdit } = context;
    if (activeTab === "profile") {
      return `
<div id="medicalModalPanel" class="medical-modal-body medical-modal-body-profile" role="tabpanel" aria-label="${escapeHtml(activeTabLabel)}">
<div class="medical-modal-main">
${renderMedicalPlayerProfileSummary(player)}
${renderMedicalRtpProgramCard(player)}
</div>
<aside class="medical-modal-side">
${renderMedicalLogCard(player)}
</aside>
</div>
`;
    }
    if (activeTab === "plan") {
      return `
<div id="medicalModalPanel" class="medical-modal-body medical-modal-body-plan" role="tabpanel" aria-label="${escapeHtml(activeTabLabel)}">
<div class="medical-modal-main">
${renderMedicalInjuryPlanForm(player, canEdit, options)}
</div>
<aside class="medical-modal-side">
${renderMedicalRtpProgramCard(player)}
${renderMedicalClearanceChecklist(player, canEdit)}
${renderMedicalPlanListCard(player)}
</aside>
</div>
`;
    }
    return `
<div id="medicalModalPanel" class="medical-modal-body medical-modal-body-availability" role="tabpanel" aria-label="${escapeHtml(activeTabLabel)}">
<div class="medical-modal-main medical-modal-main-wide">
${renderRecommendationModalCard(context)}
</div>
</div>
`;
  };

  const renderPlayerModal = (options = {}) => {
    if (!getPlayerModalOpen()) {
      return "";
    }
    const player = getSelectedMedicalPlayer();
    if (!player) {
      return "";
    }
    const selectedDate = getSelectedDate();
    const canEdit = canEditMedicalTeam();
    const activityContext = getMedicalRecommendationActivityContext(selectedDate);
    const squadBlockReason = getMedicalPlayerSquadAvailabilityBlockReason(player);
    const canRecommend = canEdit && activityContext.isRecommendable && !squadBlockReason;
    const record = getLatestMedicalRecord(player.id, selectedDate);
    const status = getMedicalRecordStatus(record);
    const formParticipation = record?.participation ?? 100;
    const formStatus = record?.status ?? getMedicalStatusForParticipation(formParticipation);
    const formActual = record?.actualParticipation ?? medicalActualParticipationFallback;
    const formRtpPhase = record?.rtpPhase ?? getMedicalRtpPhaseForRecommendation(formStatus, formParticipation, activityContext.type);
    const formStatusLabel = getMedicalStatusOptionForDate(formStatus, selectedDate, formRtpPhase).label;
    if (!canEdit) {
      return renderCoachSafeModal(player, record, status);
    }
    return `
<div class="medical-modal-layer" role="presentation">
<button type="button" class="medical-modal-backdrop" data-medical-close-modal aria-label="Close recommendation"></button>
<section class="medical-modal-card" role="dialog" aria-modal="true" aria-labelledby="medicalModalTitle">
<header class="medical-modal-header">
<div class="medical-modal-player">
${renderMedicalPlayerAvatar(player, "medical-modal-avatar")}
<div>
<p class="placeholder-tag">Player Medical</p>
<h2 id="medicalModalTitle">${escapeHtml(player.name)}</h2>
<span>${player.number ? `#${escapeHtml(player.number)} / ` : ""}${escapeHtml(player.position || "Position")}</span>
</div>
</div>
<div class="medical-modal-current medical-tone-${escapeHtml(status.tone)}">
<strong>${record ? `${record.participation}%` : "Not set"}</strong>
<span>${escapeHtml(status.label)}</span>
</div>
<button type="button" class="medical-modal-close" data-medical-close-modal aria-label="Close recommendation"><span aria-hidden="true"></span></button>
</header>
${renderPlayerModalTabs(getPlayerModalTab())}
${renderPlayerModalBody({
  player,
  canEdit,
  canRecommend,
  activityContext,
  record,
  formParticipation,
  formStatus,
  formActual,
  formRtpPhase,
  formStatusLabel,
  squadBlockReason,
}, options)}
</section>
</div>
`;
  };

  const renderSelectedPanel = () => {
    const player = getSelectedMedicalPlayer();
    const canEdit = canEditMedicalTeam();
    const selectedDate = getSelectedDate();
    if (!player) {
      return `
<aside class="medical-detail-panel">
${renderMedicalNewPlayerCard()}
</aside>
`;
    }
    const record = getLatestMedicalRecord(player.id, selectedDate);
    const status = getMedicalRecordStatus(record);
    const formStatus = record?.status ?? status.key;
    const formParticipation = record?.participation ?? getMedicalStatusOption(formStatus).defaultParticipation ?? 100;
    return `
<aside class="medical-detail-panel">
<article class="medical-selected-card">
<div class="medical-selected-head">
${renderMedicalPlayerAvatar(player, "medical-selected-avatar")}
<div>
<p class="placeholder-tag">Player Medical</p>
<h2>${escapeHtml(player.name)}</h2>
<span>${player.number ? `#${escapeHtml(player.number)} / ` : ""}${escapeHtml(player.position || "Position")}</span>
</div>
</div>
<div class="medical-selected-status medical-tone-${escapeHtml(status.tone)}">
<strong>${record ? `${record.participation}%` : "Not set"}</strong>
<span>${escapeHtml(status.label)}</span>
</div>
</article>
<article class="medical-side-card">
<div class="medical-card-headline">
<h2>Recommendation</h2>
<span>${escapeHtml(formatMedicalDateLabel(selectedDate))}</span>
</div>
<form id="medicalSidebarRecommendationForm" class="medical-profile-form" data-medical-recommendation-form>
<input type="hidden" name="playerId" value="${escapeHtml(player.id)}" />
<div class="medical-form-grid">
<label>
<span>Date</span>
<input name="date" type="date" value="${escapeHtml(selectedDate)}" ${canEdit ? "" : "disabled"} />
</label>
<label>
<span>Status</span>
<select name="status" id="medicalRecommendationStatus" ${canEdit ? "" : "disabled"}>
${renderMedicalStatusOptions(formStatus, selectedDate)}
</select>
</label>
<label>
<span>Recommended</span>
<select name="participation" id="medicalRecommendationParticipation" ${canEdit ? "" : "disabled"}>
${renderMedicalParticipationOptions(formParticipation)}
</select>
</label>
<label>
<span>Actual</span>
<select name="actualParticipation" ${canEdit ? "" : "disabled"}>
${renderMedicalActualParticipationOptions(record?.actualParticipation)}
</select>
</label>
</div>
<label>
<span>Internal medical note</span>
<textarea name="comment" rows="4" ${canEdit ? "" : "disabled"}>${escapeHtml(record?.comment ?? "")}</textarea>
</label>
<button type="submit" ${canEdit ? "" : "disabled"}>Save status</button>
</form>
</article>
<article class="medical-side-card">
<div class="medical-card-headline">
<h2>Player Profile</h2>
<span>IDP-ready</span>
</div>
<form id="medicalPlayerProfileForm" class="medical-profile-form">
<input type="hidden" name="playerId" value="${escapeHtml(player.id)}" />
<div class="medical-form-grid">
<label>
<span>Number</span>
<input name="number" value="${escapeHtml(player.number)}" ${canEdit ? "" : "disabled"} />
</label>
<label>
<span>Name</span>
<input name="name" value="${escapeHtml(player.name)}" required ${canEdit ? "" : "disabled"} />
</label>
<label>
<span>Position</span>
<input name="position" value="${escapeHtml(player.position)}" ${canEdit ? "" : "disabled"} />
</label>
<label>
<span>Image URL</span>
<input name="photoUrl" type="url" value="${escapeHtml(player.photoUrl)}" ${canEdit ? "" : "disabled"} />
</label>
</div>
<div class="medical-form-actions">
<button type="submit" ${canEdit ? "" : "disabled"}>Save profile</button>
<button type="button" class="medical-danger-button" data-medical-remove-player="${escapeHtml(player.id)}" ${canEdit ? "" : "disabled"}>Remove</button>
</div>
</form>
</article>
${renderCoachSafeRtpCard(player)}
${renderMedicalRtpProgramCard(player)}
<article class="medical-side-card medical-log-card">
<div class="medical-card-headline">
<h2>Medical Log</h2>
<span>${getMedicalPlayerRestrictedLogRecords(player.id).length}</span>
</div>
<div class="medical-log-list">${renderMedicalLog(player)}</div>
</article>
${renderMedicalNewPlayerCard()}
</aside>
`;
  };

  return {
    renderCoachSafeModal,
    renderPlayerModal,
    renderPlayerModalBody,
    renderPlayerModalTabs,
    renderRecommendationModalCard,
    renderSelectedPanel,
  };
}
