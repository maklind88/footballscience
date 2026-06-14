const defaultEscapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

export function createMedicalRosterHelpers({
  escapeHtml = defaultEscapeHtml,
  canEditMedicalTeam = () => false,
  getBulkRecommendationEligiblePlayers = (players = []) => players,
  getBulkSelectedPlayers = () => [],
  getMedicalRecommendationActivityContext = () => ({ isRecommendable: false, blockReason: "", type: "", activityLabel: "", scheduleLabel: "" }),
  getMedicalRtpPhaseForRecommendation = () => "",
  getMedicalRtpPhaseOption = (key) => ({ key, label: key || "Not set" }),
  getMedicalStatusForParticipation = () => "modified",
  getSelectedDate = () => "",
  isBulkRecommendationOpen = () => false,
  normalizeMedicalPlayer = (player = {}) => player,
  renderMedicalParticipationOptions = () => "",
} = {}) {
  const parseRosterCsvLine = (line = "") => {
    const rawLine = String(line ?? "");
    const parts = [];
    let part = "";
    let inQuotes = false;
    for (let index = 0; index < rawLine.length; index += 1) {
      const char = rawLine[index];
      const nextChar = rawLine[index + 1];
      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          part += '"';
          index += 1;
          continue;
        }
        inQuotes = !inQuotes;
        continue;
      }
      if (char === "," && !inQuotes) {
        parts.push(part.trim());
        part = "";
        continue;
      }
      part += char;
    }
    parts.push(part.trim());
    return parts
      .map((item) => item.replace(/^"|"$/g, "").trim())
      .filter(Boolean);
  };

  const parseRosterLineParts = (line = "") => {
    const rawLine = String(line ?? "").trim();
    if (!rawLine) {
      return [];
    }
    if (rawLine.includes("\t")) {
      return rawLine.split("\t").map((part) => part.trim()).filter(Boolean);
    }
    if (rawLine.includes("|")) {
      return rawLine.split("|").map((part) => part.trim()).filter(Boolean);
    }
    if (rawLine.includes(";")) {
      return rawLine.split(";").map((part) => part.trim()).filter(Boolean);
    }
    return parseRosterCsvLine(rawLine);
  };

  const parseRosterLine = (line) => {
    const cleanLine = String(line ?? "").trim();
    if (!cleanLine) {
      return null;
    }
    const delimitedParts = parseRosterLineParts(cleanLine);
    if (delimitedParts.length >= 2) {
      const photoUrl = delimitedParts.find((part) => /^https?:\/\//i.test(part)) || "";
      const compactedParts = delimitedParts
        .filter((part) => part !== photoUrl)
        .map((part) => part.trim())
        .filter(Boolean);
      const numberIndex = compactedParts.findIndex((part) => /^\#?\d{1,3}$/.test(part));
      if (numberIndex >= 0) {
        const number = compactedParts[numberIndex].replace("#", "");
        const numberIsFirst = numberIndex === 0;
        const hasCommaName = compactedParts.length > 3;
        const name = numberIsFirst
          ? hasCommaName
            ? compactedParts.slice(1, compactedParts.length - 1).join(", ")
            : compactedParts[1] || ""
          : compactedParts.slice(0, numberIndex).join(", ");
        const position = numberIsFirst
          ? hasCommaName
            ? compactedParts[compactedParts.length - 1]
            : compactedParts[2] || ""
          : compactedParts[numberIndex + 1] || "";
        return normalizeMedicalPlayer({ number, name, position, photoUrl });
      }
      return normalizeMedicalPlayer({
        name: compactedParts[0],
        position: compactedParts[1] || "",
        photoUrl,
      });
    }
    const numberMatch = cleanLine.match(/^\#?(\d{1,3})\s+(.+)$/);
    if (numberMatch) {
      return normalizeMedicalPlayer({
        number: numberMatch[1],
        name: numberMatch[2],
      });
    }
    return normalizeMedicalPlayer({ name: cleanLine });
  };

  const parseRosterText = (text) => {
    const rawLines = String(text ?? "").split(/\r?\n/);
    const parsed = {
      players: [],
      skippedLines: [],
    };
    rawLines.forEach((line, index) => {
      const trimmedLine = String(line ?? "").trim();
      if (!trimmedLine) {
        return;
      }
      const player = parseRosterLine(trimmedLine);
      if (player) {
        parsed.players.push(player);
        return;
      }
      parsed.skippedLines.push({
        line: index + 1,
        value: trimmedLine,
      });
    });
    return parsed;
  };

  const renderBulkUpdatePanel = (players = []) => {
    const canEdit = canEditMedicalTeam();
    const selectedPlayers = getBulkSelectedPlayers();
    const selectedCount = selectedPlayers.length;
    const defaultDate = getSelectedDate();
    const activityContext = getMedicalRecommendationActivityContext(defaultDate);
    const canRecommend = canEdit && activityContext.isRecommendable;
    const eligiblePlayers = getBulkRecommendationEligiblePlayers(players);
    const defaultParticipation = 75;
    const defaultStatus = getMedicalStatusForParticipation(defaultParticipation);
    const defaultRtpPhase = getMedicalRtpPhaseForRecommendation(defaultStatus, defaultParticipation, activityContext.type);
    const defaultPhaseLabel = getMedicalRtpPhaseOption(defaultRtpPhase).label;
    const isOpen = isBulkRecommendationOpen();
    return `
<section class="medical-bulk-panel${isOpen ? " is-open" : ""}" aria-label="Bulk medical recommendation">
<button type="button" class="medical-bulk-summary" data-medical-bulk-menu-toggle aria-expanded="${isOpen ? "true" : "false"}" ${canEdit ? "" : "disabled"}>
<span>Bulk Recommendation</span>
<strong>${selectedCount} selected</strong>
<small>${players.length} visible</small>
</button>
${isOpen ? `
<div class="medical-bulk-actions">
<button type="button" data-medical-bulk-clear ${canEdit && selectedCount ? "" : "disabled"}>Clear</button>
</div>
<form id="medicalBulkRecommendationForm" class="medical-bulk-form" data-medical-bulk-recommendation-form>
<label class="medical-bulk-date-field">
<span>Date</span>
<input name="date" type="date" value="${escapeHtml(defaultDate)}" data-medical-bulk-date ${canEdit ? "" : "disabled"} />
</label>
<label class="medical-bulk-select-field">
<span>Select</span>
<input type="button" value="Select Not Set" data-medical-bulk-select-not-set ${canRecommend && eligiblePlayers.length ? "" : "disabled"} />
</label>
<label class="medical-bulk-recommend-field">
<span>Recommend</span>
<select name="participation" data-medical-bulk-participation ${canRecommend ? "" : "disabled"}>
${renderMedicalParticipationOptions(defaultParticipation)}
</select>
</label>
<label class="medical-bulk-rtp-field">
<span>RTP phase</span>
<input type="text" value="${escapeHtml(defaultPhaseLabel)}" data-medical-bulk-rtp-preview disabled />
</label>
<small class="medical-bulk-activity-label${activityContext.isRecommendable ? "" : " is-locked"}" data-medical-bulk-activity-label>${escapeHtml(activityContext.isRecommendable ? `${activityContext.activityLabel} / ${activityContext.scheduleLabel}` : activityContext.blockReason)}</small>
<button type="submit" ${canRecommend && selectedCount ? "" : "disabled"}>Apply Selected</button>
</form>
` : ""}
</section>
`;
  };

  return {
    parseRosterCsvLine,
    parseRosterLine,
    parseRosterLineParts,
    parseRosterText,
    renderBulkUpdatePanel,
  };
}
