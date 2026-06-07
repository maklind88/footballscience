function defaultEscapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function createMedicalOptionRenderers(options = {}) {
  const escapeHtml = typeof options.escapeHtml === "function" ? options.escapeHtml : defaultEscapeHtml;
  const medicalParticipationOptions = Array.isArray(options.medicalParticipationOptions)
    ? options.medicalParticipationOptions
    : [];
  const medicalStatusOptions = Array.isArray(options.medicalStatusOptions) ? options.medicalStatusOptions : [];
  const medicalRtpPhaseOptions = Array.isArray(options.medicalRtpPhaseOptions) ? options.medicalRtpPhaseOptions : [];
  const medicalGateOptions = Array.isArray(options.medicalGateOptions) ? options.medicalGateOptions : [];
  const medicalActualParticipationFallback = options.medicalActualParticipationFallback || "not-logged";
  const normalizeMedicalParticipation =
    typeof options.normalizeMedicalParticipation === "function" ? options.normalizeMedicalParticipation : (value) => value;
  const normalizeMedicalActualParticipation =
    typeof options.normalizeMedicalActualParticipation === "function"
      ? options.normalizeMedicalActualParticipation
      : (value) => value;
  const getMedicalStatusOption =
    typeof options.getMedicalStatusOption === "function" ? options.getMedicalStatusOption : () => medicalStatusOptions[0] || {};
  const getMedicalStatusOptionForDate =
    typeof options.getMedicalStatusOptionForDate === "function"
      ? options.getMedicalStatusOptionForDate
      : (status) => getMedicalStatusOption(status);
  const getMedicalRtpPhaseOption =
    typeof options.getMedicalRtpPhaseOption === "function" ? options.getMedicalRtpPhaseOption : () => medicalRtpPhaseOptions[0] || {};
  const getMedicalGateOption =
    typeof options.getMedicalGateOption === "function" ? options.getMedicalGateOption : () => medicalGateOptions[0] || {};
  const getSelectedDate = typeof options.getSelectedDate === "function" ? options.getSelectedDate : () => undefined;

  function renderMedicalParticipationOptions(selectedValue) {
    const selectedParticipation = normalizeMedicalParticipation(selectedValue);
    return medicalParticipationOptions
      .map(
        (participation) =>
          `<option value="${participation}"${participation === selectedParticipation ? " selected" : ""}>${participation}%</option>`
      )
      .join("");
  }

  function renderMedicalActualParticipationOptions(selectedValue) {
    const normalizedValue = normalizeMedicalActualParticipation(selectedValue);
    return [
      `<option value="${medicalActualParticipationFallback}"${normalizedValue === medicalActualParticipationFallback ? " selected" : ""}>Not logged</option>`,
      ...medicalParticipationOptions.map(
        (participation) =>
          `<option value="${participation}"${participation === normalizedValue ? " selected" : ""}>${participation}%</option>`
      ),
    ].join("");
  }

  function renderMedicalStatusOptions(selectedStatus, dateValue = getSelectedDate()) {
    const currentStatus = getMedicalStatusOption(selectedStatus).key;
    return medicalStatusOptions
      .map(
        (status) =>
          `<option value="${escapeHtml(status.key)}"${status.key === currentStatus ? " selected" : ""}>${escapeHtml(getMedicalStatusOptionForDate(status.key, dateValue).label)}</option>`
      )
      .join("");
  }

  function renderMedicalRtpPhaseOptions(selectedPhase) {
    const currentPhase = getMedicalRtpPhaseOption(selectedPhase).key;
    return medicalRtpPhaseOptions
      .map(
        (phase) =>
          `<option value="${escapeHtml(phase.key)}"${phase.key === currentPhase ? " selected" : ""}>${escapeHtml(phase.label)}</option>`
      )
      .join("");
  }

  function renderMedicalDurationUnitOptions(selectedUnit) {
    const currentUnit = ["days", "weeks", "months"].includes(selectedUnit) ? selectedUnit : "weeks";
    return [
      ["weeks", "Weeks"],
      ["months", "Months"],
      ["days", "Days"],
    ]
      .map(
        ([unit, label]) =>
          `<option value="${escapeHtml(unit)}"${unit === currentUnit ? " selected" : ""}>${escapeHtml(label)}</option>`
      )
      .join("");
  }

  function renderMedicalGateOptions(selectedGate) {
    const currentGate = getMedicalGateOption(selectedGate).key;
    return medicalGateOptions
      .map(
        (option) =>
          `<option value="${escapeHtml(option.key)}"${option.key === currentGate ? " selected" : ""}>${escapeHtml(option.label)}</option>`
      )
      .join("");
  }

  return {
    renderMedicalActualParticipationOptions,
    renderMedicalDurationUnitOptions,
    renderMedicalGateOptions,
    renderMedicalParticipationOptions,
    renderMedicalRtpPhaseOptions,
    renderMedicalStatusOptions,
  };
}
