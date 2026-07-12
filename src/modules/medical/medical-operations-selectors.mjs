function defaultCompareMedicalPlayers(first = {}, second = {}) {
  return String(first.name || "").localeCompare(String(second.name || ""));
}

function defaultFormatDateValue(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function defaultParseDateValue(dateValue) {
  return new Date(dateValue);
}

function defaultStatus(record) {
  return record ? { key: record.status || "modified", label: record.status || "Modified" } : { key: "not-set", label: "Not set" };
}

function planOverlapsWindow(plan, startDate, endDate) {
  return Boolean(plan && plan.startDate <= endDate && plan.endDate >= startDate);
}

function isRestrictedParticipation(value) {
  const participation = Number(value);
  return Number.isFinite(participation) && participation < 100;
}

function getMedicalHistorySortTimeValue(value) {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function getLatestMedicalRecommendationHistoryEvents(events = []) {
  const latestRecommendationByPlayerDate = new Map();
  const retainedEvents = [];
  events.forEach((event) => {
    if (event.type !== "Recommendation" || !event.player?.id || !event.date) {
      retainedEvents.push(event);
      return;
    }
    const key = `${event.player.id}:${event.date}`;
    const current = latestRecommendationByPlayerDate.get(key);
    if (!current || getMedicalHistorySortTimeValue(event.sortTime) >= getMedicalHistorySortTimeValue(current.sortTime)) {
      latestRecommendationByPlayerDate.set(key, event);
    }
  });
  return [...latestRecommendationByPlayerDate.values(), ...retainedEvents];
}

function isMedicalRegularSquadPlayer(player = {}) {
  return player.countsInSquad !== false && String(player.rosterType || "squad").trim() === "squad";
}

export function createMedicalOperationsSelectors({
  compareMedicalPlayers = defaultCompareMedicalPlayers,
  ensureMedicalState = () => {},
  formatDateValue = defaultFormatDateValue,
  getActiveMedicalInjuryPlan = () => null,
  getLatestMedicalRecord = () => null,
  getMedicalAvailabilityItems = () => [],
  getMedicalPlanClearanceSummary = () => ({ isCleared: false, gateFailCount: 0, gateMonitorCount: 0 }),
  getMedicalPlanDaysRemaining = () => 0,
  getMedicalPlanElapsedDays = () => 0,
  getMedicalPlanReviewState = () => ({ severity: 0, label: "No review date" }),
  getMedicalPlanSeverity = () => ({ key: "light", weight: 1, tone: "clear", label: "Light" }),
  getMedicalPlanTotalDays = () => 0,
  getMedicalPlayerInjuryPlans = () => [],
  getMedicalRecordStatus = defaultStatus,
  getMedicalRtpPhaseOption = () => ({ label: "Not set" }),
  getMedicalState = () => ({ players: [], records: [], injuryPlans: [] }),
  getMedicalTodayValue = () => formatDateValue(new Date()),
  getMedicalTrailingRecommendationSummary = () => ({
    records: [],
    modifiedDays: 0,
    unavailableDays: 0,
    exceededCount: 0,
    average: null,
  }),
  getSelectedDate = () => "",
  isMedicalDateValue = () => true,
  isMedicalInjuryPlanActive = () => false,
  isMedicalItemArchived = () => false,
  medicalActualParticipationFallback = "not-logged",
  parseDateValue = defaultParseDateValue,
} = {}) {
  function getState() {
    return getMedicalState() ?? { players: [], records: [], injuryPlans: [] };
  }

  function getClinicalDateValue() {
    const todayValue = getMedicalTodayValue();
    return isMedicalDateValue(todayValue) ? todayValue : formatDateValue(new Date());
  }

  function getMedicalSeasonWindow(dateValue = getSelectedDate()) {
    const selected = isMedicalDateValue(dateValue) ? parseDateValue(dateValue) : new Date();
    const yearStart = new Date(selected.getFullYear(), 0, 1);
    return {
      startDate: formatDateValue(yearStart),
      endDate: formatDateValue(selected),
    };
  }

  function getMedicalSeasonPlans(dateValue = getSelectedDate()) {
    ensureMedicalState();
    const state = getState();
    const { startDate, endDate } = getMedicalSeasonWindow(dateValue);
    return state.injuryPlans.filter((plan) => !isMedicalItemArchived(plan) && planOverlapsWindow(plan, startDate, endDate));
  }

  function getMedicalActiveCaseItems(dateValue = getClinicalDateValue()) {
    ensureMedicalState();
    const state = getState();
    return state.injuryPlans
      .filter((plan) => isMedicalInjuryPlanActive(plan, dateValue))
      .map((plan) => ({
        plan,
        player: state.players.find((player) => player.id === plan.playerId) ?? null,
        severity: getMedicalPlanSeverity(plan),
        clearance: getMedicalPlanClearanceSummary(plan),
        daysRemaining: getMedicalPlanDaysRemaining(plan, dateValue),
        elapsedDays: getMedicalPlanElapsedDays(plan, dateValue),
        review: getMedicalPlanReviewState(plan, dateValue),
      }))
      .filter((item) => item.player)
      .sort((first, second) => {
        if (first.severity.weight !== second.severity.weight) {
          return second.severity.weight - first.severity.weight;
        }
        if (first.review.severity !== second.review.severity) {
          return second.review.severity - first.review.severity;
        }
        return first.plan.endDate.localeCompare(second.plan.endDate);
      });
  }

  function getMedicalHistoryEvents(limit = 40) {
    ensureMedicalState();
    const state = getState();
    const playerById = new Map(state.players.map((player) => [player.id, player]));
    const recommendationEvents = state.records
      .filter((record) => isRestrictedParticipation(record.participation))
      .map((record) => {
        const player = playerById.get(record.playerId) ?? null;
        const archived = isMedicalItemArchived(record);
        return {
          id: record.id,
          date: record.date,
          sortTime: archived ? record.archivedAt : record.updatedAt || record.createdAt || `${record.date}T00:00:00.000Z`,
          player,
          type: archived ? "Recommendation archived" : "Recommendation",
          title: `${record.participation}% / ${getMedicalRecordStatus(record).label}`,
          detail: archived
            ? record.archiveReason || "Kept in protected clinical archive"
            : record.actualParticipation === medicalActualParticipationFallback
              ? getMedicalRtpPhaseOption(record.rtpPhase).label
              : `Actual ${record.actualParticipation}%`,
          coachShared: record.shareWithCoach,
        };
      });
    const caseEvents = state.injuryPlans
      .filter((plan) => isRestrictedParticipation(plan.participation))
      .map((plan) => {
        const player = playerById.get(plan.playerId) ?? null;
        const archived = isMedicalItemArchived(plan);
        return {
          id: plan.id,
          date: plan.startDate,
          sortTime: archived ? plan.archivedAt : plan.updatedAt || plan.createdAt || `${plan.startDate}T00:00:00.000Z`,
          player,
          type: archived ? "Case archived" : "Case opened",
          title: plan.injuryType,
          detail: archived
            ? plan.archiveReason || "Kept in protected clinical archive"
            : `${getMedicalRtpPhaseOption(plan.rtpPhase).label} / ${plan.participation}% / ${getMedicalPlanTotalDays(plan)} days`,
          coachShared: plan.shareWithCoach,
        };
      });
    return getLatestMedicalRecommendationHistoryEvents([...recommendationEvents, ...caseEvents])
      .filter((event) => event.player)
      .sort((first, second) => {
        const dateComparison = second.date.localeCompare(first.date);
        if (dateComparison !== 0) {
          return dateComparison;
        }
        return getMedicalHistorySortTimeValue(second.sortTime) - getMedicalHistorySortTimeValue(first.sortTime);
      })
      .slice(0, limit);
  }

  function getMedicalSeasonSummary(dateValue = getClinicalDateValue()) {
    const state = getState();
    const plans = getMedicalSeasonPlans(dateValue);
    const summary = {
      plans,
      major: 0,
      moderate: 0,
      minor: 0,
      light: 0,
      activeCount: 0,
      returnedCount: 0,
      managedDays: 0,
      unavailableDays: 0,
      playerDays: new Map(),
    };
    plans.forEach((plan) => {
      const severity = getMedicalPlanSeverity(plan);
      summary[severity.key] += 1;
      if (isMedicalInjuryPlanActive(plan, dateValue)) {
        summary.activeCount += 1;
      }
      if (plan.endDate < dateValue) {
        summary.returnedCount += 1;
      }
      const elapsedDays = getMedicalPlanElapsedDays(plan, dateValue);
      summary.managedDays += elapsedDays;
      if (plan.participation === 0) {
        summary.unavailableDays += elapsedDays;
      }
      summary.playerDays.set(plan.playerId, (summary.playerDays.get(plan.playerId) ?? 0) + elapsedDays);
    });
    summary.topPlayerDays = Array.from(summary.playerDays.entries())
      .map(([playerId, days]) => ({
        player: state.players.find((player) => player.id === playerId) ?? null,
        days,
      }))
      .filter((item) => item.player)
      .sort((first, second) => second.days - first.days)
      .slice(0, 5);
    return summary;
  }

  function getMedicalPlayerRiskSignal(player, dateValue = getClinicalDateValue()) {
    const record = getLatestMedicalRecord(player.id, dateValue);
    const status = getMedicalRecordStatus(record);
    const activePlan = getActiveMedicalInjuryPlan(player.id, dateValue);
    const playerPlans = getMedicalPlayerInjuryPlans(player.id);
    const trailing = getMedicalTrailingRecommendationSummary(player.id, dateValue);
    const drivers = [];
    const actionDrivers = [];
    const isPlanManagedRecord = Boolean(activePlan && record?.injuryPlanId === activePlan.id);
    if (record?.participation === 0) {
      if (activePlan || isPlanManagedRecord) {
        drivers.push({ label: `${activePlan?.injuryType || "Active medical plan"} controls availability`, severity: 2 });
      } else {
        const driver = { label: "0% without active plan", severity: 3 };
        drivers.push(driver);
        actionDrivers.push(driver);
      }
    } else if (record && record.participation < 100) {
      drivers.push({ label: `${record.participation}% recommendation`, severity: 2 });
      if (!activePlan) {
        actionDrivers.push({ label: `${record.participation}% without active plan`, severity: 2 });
      }
    }
    if (record && record.actualParticipation !== medicalActualParticipationFallback && Number(record.actualParticipation) > record.participation) {
      const driver = { label: "Actual exceeded recommendation", severity: 3 };
      drivers.push(driver);
      actionDrivers.push(driver);
    }
    if (activePlan) {
      drivers.push({ label: activePlan.injuryType, severity: activePlan.participation === 0 ? 2 : 1 });
      const review = getMedicalPlanReviewState(activePlan, dateValue);
      if (review.severity) {
        const driver = { label: review.label, severity: review.severity };
        drivers.push(driver);
        actionDrivers.push(driver);
      }
      const clearance = getMedicalPlanClearanceSummary(activePlan);
      if (!clearance.isCleared && activePlan.participation >= 100) {
        const driver = { label: "Clearance incomplete", severity: 3 };
        drivers.push(driver);
        actionDrivers.push(driver);
      } else if (!clearance.isCleared) {
        drivers.push({ label: "Clearance pending", severity: 1 });
      }
      if (clearance.gateFailCount) {
        const driver = { label: `${clearance.gateFailCount} failed load gate${clearance.gateFailCount === 1 ? "" : "s"}`, severity: activePlan.participation >= 75 ? 3 : 1 };
        drivers.push(driver);
        if (activePlan.participation >= 75) {
          actionDrivers.push(driver);
        }
      }
      if (clearance.gateMonitorCount) {
        drivers.push({ label: `${clearance.gateMonitorCount} monitored load gate${clearance.gateMonitorCount === 1 ? "" : "s"}`, severity: 1 });
      }
    }
    if (trailing.exceededCount) {
      const driver = { label: `${trailing.exceededCount} actual > recommendation`, severity: 3 };
      drivers.push(driver);
      actionDrivers.push(driver);
    }
    if (trailing.unavailableDays >= 3) {
      drivers.push({ label: `${trailing.unavailableDays}/7 unavailable days`, severity: 2 });
    } else if (trailing.modifiedDays >= 3) {
      drivers.push({ label: `${trailing.modifiedDays}/7 managed days`, severity: 1 });
    }
    if (playerPlans.length >= 2) {
      drivers.push({ label: `${playerPlans.length} medical cases`, severity: 1 });
    }
    const highestSeverity = drivers.reduce((highest, driver) => Math.max(highest, driver.severity), 0);
    const actionSeverity = actionDrivers.reduce((highest, driver) => Math.max(highest, driver.severity), 0);
    const score = Math.min(100, drivers.reduce((sum, driver) => sum + driver.severity * 18, 0));
    const tone = highestSeverity >= 3 ? "high" : highestSeverity === 2 ? "medium" : highestSeverity === 1 ? "low" : "clear";
    const actionTone = actionSeverity >= 3 ? "high" : actionSeverity === 2 ? "medium" : actionSeverity === 1 ? "low" : "clear";
    const label = actionSeverity >= 3 ? "Action required" : actionSeverity === 2 ? "Review soon" : activePlan ? "Active case" : tone === "medium" ? "Monitor" : tone === "low" ? "Watch" : "Clear";
    const actionLabel = actionSeverity >= 3 ? "Action required" : actionSeverity === 2 ? "Review soon" : actionSeverity === 1 ? "Watch" : "No action";
    return {
      player,
      record,
      status,
      activePlan,
      trailing,
      drivers,
      actionDrivers,
      highestSeverity,
      actionSeverity,
      score,
      tone,
      actionTone,
      label,
      actionLabel,
      primaryDriver: drivers[0]?.label || "No medical signal",
      primaryActionDriver: actionDrivers[0]?.label || "No action required",
    };
  }

  function getMedicalRiskSignals(dateValue = getClinicalDateValue()) {
    ensureMedicalState();
    const state = getState();
    return state.players
      .filter((player) => !isMedicalItemArchived(player) && isMedicalRegularSquadPlayer(player))
      .map((player) => getMedicalPlayerRiskSignal(player, dateValue))
      .sort((first, second) => {
        if (first.actionSeverity !== second.actionSeverity) {
          return second.actionSeverity - first.actionSeverity;
        }
        if (first.highestSeverity !== second.highestSeverity) {
          return second.highestSeverity - first.highestSeverity;
        }
        if (first.score !== second.score) {
          return second.score - first.score;
        }
        const firstParticipation = first.record?.participation ?? -1;
        const secondParticipation = second.record?.participation ?? -1;
        if (firstParticipation !== secondParticipation) {
          return firstParticipation - secondParticipation;
        }
        return compareMedicalPlayers(first.player, second.player);
      });
  }

  function getMedicalOperationsSummary(dateValue = getSelectedDate()) {
    const state = getState();
    const clinicalDate = getClinicalDateValue();
    const selectedDate = isMedicalDateValue(dateValue) ? dateValue : getSelectedDate();
    const signals = getMedicalRiskSignals(clinicalDate);
    const actionSignals = signals.filter((signal) => signal.actionSeverity > 0);
    const activeCases = getMedicalActiveCaseItems(clinicalDate);
    const clearanceBlockers = activeCases.filter((item) => item.plan.participation >= 100 && !item.clearance.isCleared);
    const actionRequired = actionSignals.length;
    const actualMissing = getMedicalAvailabilityItems(clinicalDate).filter(
      (item) => isMedicalRegularSquadPlayer(item.player) && item.record && item.record.participation > 0 && item.record.actualParticipation === medicalActualParticipationFallback
    ).length;
    return {
      signals,
      actionSignals,
      activeCases,
      clearanceBlockers,
      actionRequired,
      actualMissing,
      season: getMedicalSeasonSummary(clinicalDate),
      selectedDate,
      clinicalDate,
      selectedMedicalBoardPlanId: state.selectedMedicalBoardPlanId || "",
    };
  }

  return {
    getMedicalActiveCaseItems,
    getMedicalHistoryEvents,
    getMedicalOperationsSummary,
    getMedicalPlayerRiskSignal,
    getMedicalRiskSignals,
    getMedicalSeasonPlans,
    getMedicalSeasonSummary,
  };
}
