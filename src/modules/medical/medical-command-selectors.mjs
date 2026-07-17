function defaultCompareMedicalPlayers(first = {}, second = {}) {
  return String(first.name || "").localeCompare(String(second.name || ""));
}

function defaultFormatDateValue(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function defaultParseDateValue(dateValue) {
  return new Date(dateValue);
}

function getMedicalRecordComparisonValue(record) {
  if (!record) {
    return "not-set";
  }
  return `${record.participation}|${record.status}|${record.rtpPhase ?? ""}`;
}

export function createMedicalCommandSelectors({
  addCalendarDays = (date, days) => {
    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + days);
    return nextDate;
  },
  compareMedicalPlayers = defaultCompareMedicalPlayers,
  ensureMedicalState = () => {},
  formatDateValue = defaultFormatDateValue,
  formatMedicalDateLabel = (value) => value || "Not set",
  getActiveMedicalPlayers = () => [],
  getLatestMedicalRecord = () => null,
  getMedicalAvailabilityItems = () => [],
  getMedicalCoachComment = () => "",
  getMedicalMonthToDateDates = () => [],
  getMedicalRecordStatus = (record) => ({ key: record?.status || "not-set", label: record?.status || "Not set" }),
  getMedicalReviewAlerts = () => [],
  getMedicalPastWindowDates = () => [],
  getNow = () => new Date(),
  getSelectedDate = () => "",
  medicalActualParticipationFallback = "not-logged",
  medicalPositionOrder = {},
  normalizeMedicalPlayerPosition = (position) => position || "Other",
  parseDateValue = defaultParseDateValue,
} = {}) {
  function getMedicalActualParticipation(record = {}) {
    const sourceRecord = record && typeof record === "object" ? record : {};
    const hasActual = Object.prototype.hasOwnProperty.call(sourceRecord, "actualParticipation");
    if (!record) {
      return null;
    }
    if (hasActual && sourceRecord.actualParticipation === medicalActualParticipationFallback) {
      return null;
    }
    const value = hasActual ? sourceRecord.actualParticipation : sourceRecord.participation;
    const participation = Number(value);
    return Number.isFinite(participation) ? Math.max(0, Math.min(100, Math.round(participation))) : null;
  }

  function getMedicalDailyStats(dateValue = getSelectedDate()) {
    ensureMedicalState();
    const availabilityItems = getMedicalAvailabilityItems(dateValue);
    const loggedItems = availabilityItems.filter((item) => item.record);
    const loggedCount = loggedItems.length;
    const fullCount = loggedItems.filter((item) => item.participation === 100).length;
    const modifiedCount = loggedItems.filter((item) => item.participation > 0 && item.participation < 100).length;
    const unavailableCount = loggedItems.filter((item) => item.participation === 0).length;
    const unloggedCount = availabilityItems.filter((item) => !item.record).length;
    const averageParticipation = loggedItems.length
      ? Math.round(loggedItems.reduce((sum, item) => sum + item.participation, 0) / loggedItems.length)
      : null;
    return {
      fullCount,
      modifiedCount,
      unavailableCount,
      unloggedCount,
      averageParticipation,
      loggedCount,
    };
  }

  function getMedicalParticipationAverageForDates(dateValues = []) {
    ensureMedicalState();
    const activePlayers = getActiveMedicalPlayers();
    const records = [];
    dateValues.forEach((dateValue) => {
      activePlayers.forEach((player) => {
        const record = getLatestMedicalRecord(player.id, dateValue);
        const actualParticipation = getMedicalActualParticipation(record);
        if (record && actualParticipation !== null) {
          records.push({ ...record, actualParticipationValue: actualParticipation });
        }
      });
    });
    return {
      averageParticipation: records.length
        ? Math.round(records.reduce((sum, record) => sum + record.actualParticipationValue, 0) / records.length)
        : null,
      loggedCount: records.length,
      slotCount: Math.max(0, dateValues.length * activePlayers.length),
    };
  }

  function getMedicalWindowAverage() {
    ensureMedicalState();
    return getMedicalParticipationAverageForDates(getMedicalPastWindowDates()).averageParticipation;
  }

  function getMedicalMonthAverageStats() {
    return getMedicalParticipationAverageForDates(getMedicalMonthToDateDates(getNow()));
  }

  function getMedicalAttentionPlayers(dateValue = getSelectedDate()) {
    ensureMedicalState();
    return getActiveMedicalPlayers()
      .map((player) => {
        const record = getLatestMedicalRecord(player.id, dateValue);
        const status = getMedicalRecordStatus(record);
        const priority = !record ? 0 : record.participation === 0 ? 1 : record.participation < 100 ? 2 : 3;
        return { player, record, status, priority };
      })
      .filter((item) => item.priority < 3)
      .sort((first, second) => {
        if (first.priority !== second.priority) {
          return first.priority - second.priority;
        }
        const firstParticipation = first.record?.participation ?? -1;
        const secondParticipation = second.record?.participation ?? -1;
        if (firstParticipation !== secondParticipation) {
          return firstParticipation - secondParticipation;
        }
        return compareMedicalPlayers(first.player, second.player);
      });
  }

  function getMedicalPositionSummaries(dateValue = getSelectedDate()) {
    ensureMedicalState();
    const summaries = new Map();
    getActiveMedicalPlayers().forEach((player) => {
      const position = normalizeMedicalPlayerPosition(player.position, player);
      const currentSummary = summaries.get(position) ?? {
        position,
        players: 0,
        logged: 0,
        full: 0,
        modified: 0,
        unavailable: 0,
        totalParticipation: 0,
      };
      const record = getLatestMedicalRecord(player.id, dateValue);
      currentSummary.players += 1;
      if (record) {
        currentSummary.logged += 1;
        currentSummary.totalParticipation += record.participation;
        if (record.participation === 100) {
          currentSummary.full += 1;
        } else if (record.participation === 0) {
          currentSummary.unavailable += 1;
        } else {
          currentSummary.modified += 1;
        }
      }
      summaries.set(position, currentSummary);
    });
    return Array.from(summaries.values())
      .map((summary) => ({
        ...summary,
        average: summary.logged ? Math.round(summary.totalParticipation / summary.logged) : null,
      }))
      .sort((first, second) => {
        const positionComparison = (medicalPositionOrder[first.position] ?? 99) - (medicalPositionOrder[second.position] ?? 99);
        return positionComparison || first.position.localeCompare(second.position);
      });
  }

  function getMedicalDailyHuddle(dateValue = getSelectedDate()) {
    ensureMedicalState();
    const availabilityItems = getMedicalAvailabilityItems(dateValue);
    const previousDate = formatDateValue(addCalendarDays(parseDateValue(dateValue), -1));
    const changes = availabilityItems
      .map((item) => {
        const previousRecord = getLatestMedicalRecord(item.player.id, previousDate);
        if (getMedicalRecordComparisonValue(previousRecord) === getMedicalRecordComparisonValue(item.record)) {
          return null;
        }
        return {
          ...item,
          previousRecord,
          previousParticipation: previousRecord ? previousRecord.participation : null,
          previousStatus: getMedicalRecordStatus(previousRecord),
        };
      })
      .filter(Boolean)
      .sort((first, second) => {
        const firstDelta = Math.abs((first.participation ?? -1) - (first.previousParticipation ?? -1));
        const secondDelta = Math.abs((second.participation ?? -1) - (second.previousParticipation ?? -1));
        if (firstDelta !== secondDelta) {
          return secondDelta - firstDelta;
        }
        return compareMedicalPlayers(first.player, second.player);
      });
    const restricted = availabilityItems
      .filter((item) => item.record && item.participation < 100)
      .sort((first, second) => {
        if (first.participation !== second.participation) {
          return first.participation - second.participation;
        }
        return compareMedicalPlayers(first.player, second.player);
      });
    const needsRecommendation = availabilityItems.filter((item) => !item.record);
    const coachHandover = availabilityItems.filter((item) => getMedicalCoachComment(item.record));
    return {
      availabilityItems,
      changes,
      restricted,
      needsRecommendation,
      coachHandover,
      reviewAlerts: getMedicalReviewAlerts(dateValue),
    };
  }

  function getMedicalCoachHandoverItems(dateValue = getSelectedDate()) {
    ensureMedicalState();
    return getMedicalAvailabilityItems(dateValue)
      .filter((item) => item.record && (item.participation < 100 || getMedicalCoachComment(item.record)))
      .sort((first, second) => {
        if (first.participation !== second.participation) {
          return first.participation - second.participation;
        }
        const firstHasNote = Boolean(getMedicalCoachComment(first.record));
        const secondHasNote = Boolean(getMedicalCoachComment(second.record));
        if (firstHasNote !== secondHasNote) {
          return Number(secondHasNote) - Number(firstHasNote);
        }
        return compareMedicalPlayers(first.player, second.player);
      });
  }

  function buildMedicalCoachHandoverText(dateValue = getSelectedDate()) {
    const dateLabel = formatMedicalDateLabel(dateValue, "long");
    const lines = [`Medical coach-safe handover - ${dateLabel}`];
    const items = getMedicalCoachHandoverItems(dateValue);
    if (!items.length) {
      lines.push("No managed players or coach-approved notes for this date.");
      return lines.join("\n");
    }
    items.forEach((item) => {
      const coachNote = getMedicalCoachComment(item.record);
      const noteText = coachNote ? ` - ${coachNote}` : "";
      lines.push(`${item.player.name}: ${item.participation}% / ${item.status.label}${noteText}`);
    });
    return lines.join("\n");
  }

  return {
    buildMedicalCoachHandoverText,
    getMedicalAttentionPlayers,
    getMedicalCoachHandoverItems,
    getMedicalDailyHuddle,
    getMedicalDailyStats,
    getMedicalMonthAverageStats,
    getMedicalParticipationAverageForDates,
    getMedicalPositionSummaries,
    getMedicalWindowAverage,
  };
}
