const defaultEscapeHtml = (value = "") =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const defaultParseScheduleDateValue = (value) => new Date(value);

export function createMedicalDisplayHelpers(options = {}) {
  const escapeHtml = typeof options.escapeHtml === "function" ? options.escapeHtml : defaultEscapeHtml;
  const parseScheduleDateValue =
    typeof options.parseScheduleDateValue === "function" ? options.parseScheduleDateValue : defaultParseScheduleDateValue;
  const getSelectedDate = typeof options.getSelectedDate === "function" ? options.getSelectedDate : () => "";
  const getPlayerProfileRosterLabel =
    typeof options.getPlayerProfileRosterLabel === "function" ? options.getPlayerProfileRosterLabel : () => "";
  const getPlayerProfileTemporaryWindowLabel =
    typeof options.getPlayerProfileTemporaryWindowLabel === "function"
      ? options.getPlayerProfileTemporaryWindowLabel
      : () => "";
  const getMedicalPlayerAvailabilityStatusOption =
    typeof options.getMedicalPlayerAvailabilityStatusOption === "function"
      ? options.getMedicalPlayerAvailabilityStatusOption
      : () => ({ key: "unknown", tone: "unknown", label: "Unknown" });
  const medicalOperationsTabOptions = Array.isArray(options.medicalOperationsTabOptions) ? options.medicalOperationsTabOptions : [];
  const medicalPlayerModalTabOptions = Array.isArray(options.medicalPlayerModalTabOptions) ? options.medicalPlayerModalTabOptions : [];
  const isMedicalPlayerBlockedBySquadAvailability =
    typeof options.isMedicalPlayerBlockedBySquadAvailability === "function"
      ? options.isMedicalPlayerBlockedBySquadAvailability
      : () => false;
  const isPlayerProfileTemporaryActiveOnDate =
    typeof options.isPlayerProfileTemporaryActiveOnDate === "function"
      ? options.isPlayerProfileTemporaryActiveOnDate
      : () => false;
  const isTemporaryPlayerProfile =
    typeof options.isTemporaryPlayerProfile === "function" ? options.isTemporaryPlayerProfile : () => false;

  function formatMedicalDateLabel(dateValue, variant = "short") {
    const date = parseScheduleDateValue(dateValue);
    const dateOptions =
      variant === "long"
        ? { weekday: "long", day: "numeric", month: "long" }
        : { weekday: "short", day: "numeric", month: "short" };
    return new Intl.DateTimeFormat("en-GB", dateOptions).format(date);
  }

  function getMedicalPlayerInitials(player) {
    const words = String(player?.name ?? "").trim().split(/\s+/).filter(Boolean);
    if (!words.length) {
      return "P";
    }
    return `${words[0][0] ?? ""}${words.length > 1 ? words[words.length - 1][0] ?? "" : ""}`.toUpperCase();
  }

  function renderMedicalPlayerAvatar(player, className = "medical-player-avatar") {
    if (player?.photoUrl) {
      return `
<span class="${className} has-photo">
<img src="${escapeHtml(player.photoUrl)}" alt="${escapeHtml(player.name)}" loading="lazy" />
</span>
`;
    }
    return `<span class="${className}">${escapeHtml(getMedicalPlayerInitials(player))}</span>`;
  }

  function renderMedicalTemporaryPlayerBadge(player = {}) {
    if (!isTemporaryPlayerProfile(player)) {
      return "";
    }
    const windowLabel = getPlayerProfileTemporaryWindowLabel(player);
    const isActiveToday = isPlayerProfileTemporaryActiveOnDate(player, getSelectedDate());
    const label = [getPlayerProfileRosterLabel(player), windowLabel].filter(Boolean).join(" / ");
    return `<span class="medical-temporary-badge${isActiveToday ? "" : " is-outside-window"}">${escapeHtml(label)}</span>`;
  }

  function renderMedicalSquadAvailabilityBadge(player = {}) {
    if (!isMedicalPlayerBlockedBySquadAvailability(player)) {
      return "";
    }
    const option = getMedicalPlayerAvailabilityStatusOption(player);
    return `<span class="medical-squad-availability-badge is-${escapeHtml(option.tone || option.key)}">${escapeHtml(option.label)}</span>`;
  }

  function renderMedicalMetric(label, value, meta = "", tone = "") {
    const toneClass = tone ? ` medical-metric-card-${escapeHtml(tone)}` : "";
    const noMetaClass = meta ? "" : " medical-metric-card-no-meta";
    return `
<article class="medical-metric-card${toneClass}${noMetaClass}">
<span>${escapeHtml(label)}</span>
<strong>${escapeHtml(value)}</strong>
${meta ? `<small>${escapeHtml(meta)}</small>` : ""}
</article>
`;
  }

  function normalizeMedicalOperationsTab(tabKey) {
    return medicalOperationsTabOptions.some((tab) => tab.key === tabKey) ? tabKey : "availability";
  }

  function normalizeMedicalPlayerModalTab(tabKey) {
    return medicalPlayerModalTabOptions.some((tab) => tab.key === tabKey) ? tabKey : "availability";
  }

  return {
    formatMedicalDateLabel,
    getMedicalPlayerInitials,
    normalizeMedicalOperationsTab,
    normalizeMedicalPlayerModalTab,
    renderMedicalMetric,
    renderMedicalPlayerAvatar,
    renderMedicalSquadAvailabilityBadge,
    renderMedicalTemporaryPlayerBadge,
  };
}
