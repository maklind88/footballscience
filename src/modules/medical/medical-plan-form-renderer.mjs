const defaultEscapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

export function createMedicalPlanFormRenderer({
  escapeHtml = defaultEscapeHtml,
  getActiveMedicalInjuryPlan,
  getMedicalInjuryPlanDraft,
  getMedicalPlayerInjuryPlans,
  getSelectedDate,
  isMedicalPlanCleared,
  medicalClearanceRoles = [],
  medicalInjuryDurationPresets = [],
  medicalLoadGateOptions = [],
  normalizeMedicalClearance,
  normalizeMedicalLoadGates,
  renderMedicalDurationUnitOptions,
  renderMedicalGateOptions,
  renderMedicalInjuryPlanStatusOptions,
  renderMedicalParticipationOptions,
  renderMedicalRtpPhaseOptions,
} = {}) {
  const getProgramText = (value = []) => (Array.isArray(value) ? value.join("\n") : String(value ?? ""));

  const renderProgramField = ({ name, label, items = [], placeholder = "", rows = 3, isWide = false, canEdit = true }) => `
<label class="medical-rtp-program-field${isWide ? " is-wide" : ""}">
<span>${escapeHtml(label)}</span>
<textarea name="${escapeHtml(name)}" rows="${rows}" placeholder="${escapeHtml(placeholder)}" ${canEdit ? "" : "disabled"}>${escapeHtml(getProgramText(items))}</textarea>
<small>One item per line. Medical-only unless separately summarized as coach-safe.</small>
</label>
`;

  const renderRtpProgramBuilder = (draft = {}, canEdit = true) => {
    const hasProgram = [
      draft.rtpProgramPhases,
      draft.rtpProgramLoadText,
      draft.rtpProgramGateCriteria,
      draft.rtpProgramNextSteps,
      draft.rtpProgramHoldRules,
    ].some((items) => Array.isArray(items) && items.length);
    return `
<section class="medical-rtp-program-blueprint medical-rtp-program-editor" aria-label="Medical RTP program builder">
<header>
<div>
<span>Player RTP program builder</span>
<strong>${hasProgram ? "Edit and individualize this Medical-owned RTP program" : "Build the player program from an RTP Library starter"}</strong>
</div>
<small>Medical-owned / not coach-visible by default</small>
</header>
<div class="medical-rtp-program-case-link">
<span><strong>Medical case</strong>${escapeHtml(draft.planId || "New case draft")}</span>
<span><strong>RTP source</strong>${escapeHtml(draft.rtpLibraryProfileName || "No RTP Library starter applied")}</span>
<span><strong>Evidence</strong>${escapeHtml(draft.rtpLibraryEvidenceLevel || "Not set")}</span>
</div>
<div class="medical-rtp-program-editor-grid">
${renderProgramField({
  name: "rtpProgramPhases",
  label: "RTP phases",
  items: draft.rtpProgramPhases,
  placeholder: "Rehab: restore pain-free range...\nModified: controlled football exposure...\nFull: complete position-specific actions...",
  rows: 5,
  isWide: true,
  canEdit,
})}
${renderProgramField({
  name: "rtpProgramLoadText",
  label: "Running / sprint / COD / GPS",
  items: draft.rtpProgramLoadText,
  placeholder: "Running: progress tempo volume...\nSprint: expose 90-100 percent before match...\nGPS: compare to positional baseline...",
  rows: 5,
  isWide: true,
  canEdit,
})}
${renderProgramField({
  name: "rtpProgramRiskFactors",
  label: "Risk factors",
  items: draft.rtpProgramRiskFactors,
  placeholder: "Previous injury\nFixture congestion\nSprint exposure gap",
  canEdit,
})}
${renderProgramField({
  name: "rtpProgramWarningPoints",
  label: "Warning points",
  items: draft.rtpProgramWarningPoints,
  placeholder: "Pain during acceleration\nNext-day symptom increase",
  canEdit,
})}
${renderProgramField({
  name: "rtpProgramGateCriteria",
  label: "Gate criteria",
  items: draft.rtpProgramGateCriteria,
  placeholder: "Pain-free maximal contraction\nRepeated sprint exposure completed",
  canEdit,
})}
${renderProgramField({
  name: "rtpProgramNextSteps",
  label: "Next step",
  items: draft.rtpProgramNextSteps,
  placeholder: "Controlled acceleration session\nPosition-specific sprint exposure",
  canEdit,
})}
${renderProgramField({
  name: "rtpProgramHoldRules",
  label: "Hold rules",
  items: draft.rtpProgramHoldRules,
  placeholder: "Hold if pain increases\nHold if next-day response is worse",
  canEdit,
})}
</div>
</section>
`;
  };

  const renderInjuryPlanForm = (player, canEdit) => {
    const draft = getMedicalInjuryPlanDraft(player.id);
    const isEditing = Boolean(draft.planId);
    const hasRtpLibraryStarter = Boolean(draft.rtpLibraryProfileId);
    return `
<article class="medical-modal-main-card medical-injury-plan-card">
<div class="medical-card-headline">
<h2>${isEditing ? "Edit Availability Plan" : "Availability Plan"}</h2>
<span>${isEditing ? "Updates the active restriction and automatic availability" : "Auto-applies across date range, no daily entry needed"}</span>
</div>
<form id="medicalInjuryPlanForm" class="medical-profile-form">
<input type="hidden" name="planId" value="${escapeHtml(draft.planId)}" />
<input type="hidden" name="playerId" value="${escapeHtml(player.id)}" />
<input type="hidden" name="rtpLibraryProfileId" value="${escapeHtml(draft.rtpLibraryProfileId)}" />
<input type="hidden" name="rtpLibraryProfileName" value="${escapeHtml(draft.rtpLibraryProfileName)}" />
<input type="hidden" name="rtpLibraryEvidenceLevel" value="${escapeHtml(draft.rtpLibraryEvidenceLevel)}" />
<input type="hidden" name="rtpLibrarySummary" value="${escapeHtml(draft.rtpLibrarySummary)}" />
${hasRtpLibraryStarter ? `
<section class="medical-rtp-plan-starter">
<div>
<span>RTP Library starter</span>
<strong>${escapeHtml(draft.rtpLibraryProfileName)}</strong>
<small>${escapeHtml(draft.rtpLibraryEvidenceLevel)} evidence level</small>
</div>
<p>${escapeHtml(draft.rtpLibrarySummary)}</p>
</section>
` : ""}
${renderRtpProgramBuilder(draft, canEdit)}
<div class="medical-form-grid medical-plan-form-grid">
<label>
<span>Injury / reason</span>
<input name="injuryType" list="medicalInjuryTypes" value="${escapeHtml(draft.injuryType)}" placeholder="ACL injury" required ${canEdit ? "" : "disabled"} />
</label>
<label>
<span>Body area</span>
<input name="bodyArea" value="${escapeHtml(draft.bodyArea)}" placeholder="Knee" ${canEdit ? "" : "disabled"} />
</label>
<label>
<span>Start</span>
<input name="startDate" type="date" value="${escapeHtml(draft.startDate)}" ${canEdit ? "" : "disabled"} />
</label>
<label>
<span>Duration</span>
<div class="medical-duration-fields">
<input name="duration" type="number" min="1" value="${escapeHtml(draft.duration)}" ${canEdit ? "" : "disabled"} />
<select name="durationUnit" ${canEdit ? "" : "disabled"}>
${renderMedicalDurationUnitOptions(draft.durationUnit)}
</select>
</div>
</label>
<label>
<span>Status</span>
<select name="status" ${canEdit ? "" : "disabled"}>
${renderMedicalInjuryPlanStatusOptions(draft.status)}
</select>
</label>
<label>
<span>RTP phase</span>
<select name="rtpPhase" data-medical-plan-rtp-phase ${canEdit ? "" : "disabled"}>
${renderMedicalRtpPhaseOptions(draft.rtpPhase)}
</select>
</label>
<label>
<span>Recommended</span>
<select name="participation" data-medical-plan-participation ${canEdit ? "" : "disabled"}>
${renderMedicalParticipationOptions(draft.participation)}
</select>
</label>
<label>
<span>Review date</span>
<input name="reviewDate" type="date" value="${escapeHtml(draft.reviewDate)}" ${canEdit ? "" : "disabled"} />
</label>
<label>
<span>Treatment note</span>
<input name="phase" value="${escapeHtml(draft.phase)}" placeholder="Week 1-4 protected rehab" ${canEdit ? "" : "disabled"} />
</label>
</div>
<div class="medical-duration-presets" aria-label="Duration presets">
${medicalInjuryDurationPresets
  .map(
    (preset) => `
<button
type="button"
data-medical-duration-preset
data-medical-duration="${preset.duration}"
data-medical-duration-unit="${escapeHtml(preset.unit)}"
class="${draft.duration === preset.duration && draft.durationUnit === preset.unit ? "is-selected" : ""}"
${canEdit ? "" : "disabled"}
>${escapeHtml(preset.label)}</button>
`
  )
  .join("")}
</div>
<label>
<span>Internal clinical note</span>
<textarea name="comment" rows="3" ${canEdit ? "" : "disabled"}>${escapeHtml(draft.comment)}</textarea>
</label>
<label>
<span>Coach-safe comment</span>
<textarea name="coachNote" rows="2" placeholder="Shared note for coaches" ${canEdit ? "" : "disabled"}>${escapeHtml(draft.coachNote)}</textarea>
</label>
<label class="medical-inline-check">
<input type="checkbox" name="shareWithCoach" ${draft.shareWithCoach ? "checked" : ""} ${canEdit ? "" : "disabled"} />
<span>Approved to share with coaching staff</span>
</label>
<div class="medical-form-actions">
<button type="submit" ${canEdit ? "" : "disabled"}>${isEditing ? "Update plan" : "Create plan"}</button>
${isEditing ? `<button type="button" class="secondary medical-secondary-button" data-medical-cancel-injury-plan-edit ${canEdit ? "" : "disabled"}>Cancel edit</button>` : ""}
</div>
</form>
<datalist id="medicalInjuryTypes">
<option value="ACL injury"></option>
<option value="Hamstring injury"></option>
<option value="Adductor injury"></option>
<option value="Ankle sprain"></option>
<option value="Concussion protocol"></option>
<option value="Illness"></option>
<option value="Load management"></option>
</datalist>
</article>
`;
  };

  const renderClearanceChecklist = (player, canEdit) => {
    const plan = getActiveMedicalInjuryPlan(player.id, getSelectedDate()) ?? getMedicalPlayerInjuryPlans(player.id)[0] ?? null;
    if (!plan) {
      return `
<article class="medical-side-card medical-clearance-card">
<div class="medical-card-headline">
<h2>Clearance Checklist</h2>
<span>No plan</span>
</div>
<div class="medical-empty-inline">Create an availability plan before collecting sign-off and load gates.</div>
</article>
`;
    }
    const clearance = normalizeMedicalClearance(plan.clearance);
    const gates = normalizeMedicalLoadGates(plan.gates);
    const cleared = isMedicalPlanCleared(plan);
    return `
<article class="medical-side-card medical-clearance-card">
<div class="medical-card-headline">
<h2>Clearance Checklist</h2>
<span class="${cleared ? "is-cleared" : "is-pending"}">${cleared ? "Cleared" : "Pending"}</span>
</div>
<form id="medicalClearanceForm" class="medical-profile-form">
<input type="hidden" name="planId" value="${escapeHtml(plan.id)}" />
<label>
<span>RTP phase</span>
<select name="rtpPhase" ${canEdit ? "" : "disabled"}>
${renderMedicalRtpPhaseOptions(plan.rtpPhase)}
</select>
</label>
<div class="medical-check-grid">
${medicalClearanceRoles
  .map(
    (role) => `
<label class="medical-check-row">
<input type="checkbox" name="clearance.${escapeHtml(role.key)}" ${clearance[role.key] ? "checked" : ""} ${canEdit ? "" : "disabled"} />
<span>${escapeHtml(role.label)} sign-off</span>
</label>
`
  )
  .join("")}
</div>
<div class="medical-gate-grid">
${medicalLoadGateOptions
  .map(
    (gate) => `
<label>
<span>${escapeHtml(gate.label)}</span>
<select name="gates.${escapeHtml(gate.key)}" ${canEdit ? "" : "disabled"}>
${renderMedicalGateOptions(gates[gate.key])}
</select>
</label>
`
  )
  .join("")}
</div>
<button type="submit" ${canEdit ? "" : "disabled"}>Save clearance</button>
</form>
</article>
`;
  };

  return {
    renderClearanceChecklist,
    renderInjuryPlanForm,
  };
}
