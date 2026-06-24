export function createMedicalRuntimeWriteService(deps = {}) {
  const {
    addCalendarDays = (date, days) => new Date(date.getTime() + Number(days || 0) * 86400000),
    cloneMedicalState = (state) => state,
    commitMedicalClinicalState = () => {},
    ensureMedicalState = () => ({}),
    formatDateValue = (date) => new Date(date).toISOString().slice(0, 10),
    getActiveMedicalPlayers = () => [],
    getCurrentMedicalActorId = () => "",
    getCurrentPlatformUser = () => null,
    getMedicalClearanceValues = () => ({}),
    getMedicalLoadGateValues = () => ({}),
    getMedicalRecommendationActivityContext = () => ({ isRecommendable: true, type: "" }),
    getMedicalRemovedSquadPlayerIdSet = () => new Set(),
    getMedicalRtpPhaseOption = () => ({ key: "", label: "", status: "", participation: 0 }),
    loadMedicalPlayerRtpCoachStatus = () => null,
    getMedicalState = () => null,
    getMedicalStatusForParticipation = () => "not-set",
    isDateValue = () => false,
    isMedicalItemArchived = () => false,
    isMedicalPlayerBlockedBySquadAvailability = () => false,
    isMedicalPlayerRemovedFromSquad = () => false,
    medicalStatusOptions = [],
    normalizeMedicalInjuryPlan = (value) => value || null,
    normalizeMedicalParticipation = (value, fallback = 100) => (Number.isFinite(Number(value)) ? Number(value) : fallback),
    normalizeMedicalPlayer = (value) => value || null,
    normalizeMedicalRecord = (value) => value || null,
    parseDateValue = (value) => new Date(value),
    renderMedicalTeamWorkspace = () => {},
    setMedicalPlayerModalOpen = () => {},
    setMedicalPlayerModalTab = () => {},
    setMedicalState = () => {},
    writeMedicalState = () => {},
  } = deps;

  function readState() {
    ensureMedicalState();
    return getMedicalState();
  }

  function replaceState(nextState) {
    setMedicalState(nextState);
    return getMedicalState();
  }

  function upsertMedicalPlayers(players) {
    const medicalState = readState();
    const removedPlayerIdSet = getMedicalRemovedSquadPlayerIdSet();
    const existingById = new Map(
      medicalState.players
        .filter((player) => player && player.id)
        .map((player) => [String(player.id), player])
    );
    const existingBySignature = new Map(
      medicalState.players.map((player) => [`${player.number}|${player.name}`.toLowerCase(), player])
    );
    const nextPlayers = [...medicalState.players];
    players.forEach((player) => {
      const signature = `${String(player.number || "").trim()}|${String(player.name || "").trim().toLowerCase()}`;
      const playerId = String(player.id || "").trim();
      const existingPlayer = existingById.get(playerId) || existingBySignature.get(signature);
      if (isMedicalPlayerRemovedFromSquad(player, removedPlayerIdSet)) {
        if (existingPlayer && !isMedicalItemArchived(existingPlayer)) {
          const archivedAt = new Date().toISOString();
          Object.assign(existingPlayer, {
            ...existingPlayer,
            updatedAt: archivedAt,
            archivedAt,
            archivedBy: getCurrentMedicalActorId(),
            archiveReason: "Removed from Squad Room",
          });
        }
        return;
      }
      if (existingPlayer) {
        Object.assign(existingPlayer, {
          ...existingPlayer,
          ...player,
          id: existingPlayer.id || player.id,
          archivedAt: "",
          archivedBy: "",
          archiveReason: "",
          updatedAt: new Date().toISOString(),
        });
      } else {
        nextPlayers.push(player);
        if (playerId) {
          existingById.set(playerId, player);
        }
        existingBySignature.set(signature, player);
      }
    });
    replaceState(cloneMedicalState({
      ...medicalState,
      players: nextPlayers,
      selectedPlayerId: medicalState.selectedPlayerId || nextPlayers[0]?.id || "",
    }));
    writeMedicalState();
  }

  function addMedicalRecord(values, options = {}) {
    const medicalState = readState();
    const playerId = values.playerId;
    const player = medicalState.players.find((candidate) => candidate.id === playerId);
    if (!player || !isDateValue(values.date)) {
      return null;
    }
    if (isMedicalPlayerBlockedBySquadAvailability(player)) {
      return null;
    }
    const participation = normalizeMedicalParticipation(values.participation);
    const status = medicalStatusOptions.some((option) => option.key === values.status)
      ? values.status
      : getMedicalStatusForParticipation(participation);
    const activityContext = getMedicalRecommendationActivityContext(values.date);
    if (!activityContext.isRecommendable) {
      return null;
    }
    const record = normalizeMedicalRecord({
      playerId,
      date: values.date,
      status,
      participation,
      actualParticipation: values.actualParticipation,
      comment: values.comment,
      coachNote: values.coachNote,
      shareWithCoach: values.shareWithCoach,
      rtpPhase: values.rtpPhase,
      createdBy: getCurrentPlatformUser()?.id || "",
    });
    if (!record) {
      return null;
    }
    medicalState.records = [record, ...medicalState.records];
    medicalState.selectedDate = record.date;
    medicalState.selectedPlayerId = playerId;
    if (options.skipDataSafety) {
      writeMedicalState();
    } else {
      commitMedicalClinicalState("recommendation-saved", `${player.name}: ${record.participation}% recommendation saved.`);
    }
    return record;
  }

  function updateMedicalPlayerProfile(values) {
    const medicalState = readState();
    const playerId = values.playerId;
    const playerIndex = medicalState.players.findIndex((player) => player.id === playerId);
    if (playerIndex < 0) {
      return false;
    }
    const nextPlayer = normalizeMedicalPlayer({
      ...medicalState.players[playerIndex],
      number: values.number,
      name: values.name,
      position: values.position,
      photoUrl: values.photoUrl,
      updatedAt: new Date().toISOString(),
    });
    if (!nextPlayer) {
      return false;
    }
    const nextPlayers = [...medicalState.players];
    nextPlayers[playerIndex] = nextPlayer;
    replaceState(cloneMedicalState({
      ...medicalState,
      players: nextPlayers,
      selectedPlayerId: nextPlayer.id,
    }));
    commitMedicalClinicalState("player-profile-saved", `${nextPlayer.name} profile saved.`);
    return true;
  }

  function removeMedicalPlayer(playerId) {
    const medicalState = readState();
    const playerIndex = medicalState.players.findIndex((player) => player.id === playerId);
    if (playerIndex < 0) {
      return null;
    }
    const archivedAt = new Date().toISOString();
    const archivedPlayer = normalizeMedicalPlayer({
      ...medicalState.players[playerIndex],
      updatedAt: archivedAt,
      archivedAt,
      archivedBy: getCurrentMedicalActorId(),
      archiveReason: "Manual archive from Medical Room",
    });
    if (!archivedPlayer) {
      return null;
    }
    const nextPlayers = [...medicalState.players];
    nextPlayers[playerIndex] = archivedPlayer;
    medicalState.players = nextPlayers;
    medicalState.records = medicalState.records.map((record) =>
      record.playerId === playerId && !isMedicalItemArchived(record)
        ? normalizeMedicalRecord({
          ...record,
          updatedAt: archivedAt,
          archivedAt,
          archivedBy: getCurrentMedicalActorId(),
          archiveReason: "Player archived from Medical Room",
        }) || record
        : record
    );
    medicalState.injuryPlans = medicalState.injuryPlans.map((plan) =>
      plan.playerId === playerId && !isMedicalItemArchived(plan)
        ? normalizeMedicalInjuryPlan({
          ...plan,
          updatedAt: archivedAt,
          archivedAt,
          archivedBy: getCurrentMedicalActorId(),
          archiveReason: "Player archived from Medical Room",
        }) || plan
        : plan
    );
    medicalState.selectedPlayerId = getActiveMedicalPlayers()[0]?.id || "";
    commitMedicalClinicalState("player-archived", `${archivedPlayer.name} archived with protected medical history.`);
    return archivedPlayer;
  }

  function removeMedicalRecord(recordId) {
    const medicalState = readState();
    const recordIndex = medicalState.records.findIndex((record) => record.id === recordId);
    if (recordIndex < 0) {
      return null;
    }
    const currentRecord = medicalState.records[recordIndex];
    if (isMedicalItemArchived(currentRecord)) {
      return currentRecord;
    }
    const archivedAt = new Date().toISOString();
    const archivedRecord = normalizeMedicalRecord({
      ...currentRecord,
      updatedAt: archivedAt,
      archivedAt,
      archivedBy: getCurrentMedicalActorId(),
      archiveReason: "Manual archive from Medical Room",
    });
    if (!archivedRecord) {
      return null;
    }
    const nextRecords = [...medicalState.records];
    nextRecords[recordIndex] = archivedRecord;
    medicalState.records = nextRecords;
    commitMedicalClinicalState("record-archived", "Medical log entry archived and kept in protected history.");
    return archivedRecord;
  }

  function addMedicalInjuryPlan(values) {
    const medicalState = readState();
    const player = medicalState.players.find((candidate) => candidate.id === values.playerId);
    if (!player) {
      return null;
    }
    const plan = normalizeMedicalInjuryPlan({
      ...values,
      clearance: getMedicalClearanceValues(values),
      gates: getMedicalLoadGateValues(values),
      createdBy: getCurrentPlatformUser()?.id || "",
    });
    if (!plan) {
      return null;
    }
    medicalState.injuryPlans = [plan, ...medicalState.injuryPlans];
    medicalState.selectedDate = plan.startDate;
    medicalState.selectedPlayerId = plan.playerId;
    commitMedicalClinicalState("availability-plan-created", `${player.name}: availability plan created.`);
    return plan;
  }

  function updateMedicalInjuryPlan(values) {
    const medicalState = readState();
    const planIndex = medicalState.injuryPlans.findIndex((plan) => plan.id === values.planId);
    if (planIndex < 0) {
      return null;
    }
    const currentPlan = medicalState.injuryPlans[planIndex];
    if (isMedicalItemArchived(currentPlan)) {
      return null;
    }
    const player = medicalState.players.find((candidate) => candidate.id === currentPlan.playerId);
    const nextPlan = normalizeMedicalInjuryPlan({
      ...currentPlan,
      ...values,
      id: currentPlan.id,
      playerId: currentPlan.playerId,
      clearance: currentPlan.clearance,
      gates: currentPlan.gates,
      createdAt: currentPlan.createdAt,
      createdBy: currentPlan.createdBy,
      updatedAt: new Date().toISOString(),
    });
    if (!nextPlan) {
      return null;
    }
    const nextPlans = [...medicalState.injuryPlans];
    nextPlans[planIndex] = nextPlan;
    medicalState.injuryPlans = nextPlans;
    medicalState.selectedDate = nextPlan.startDate;
    medicalState.selectedPlayerId = nextPlan.playerId;
    commitMedicalClinicalState("availability-plan-updated", `${player?.name || "Player"}: availability plan updated.`);
    return nextPlan;
  }

  function updateMedicalPlanClearance(values) {
    const medicalState = readState();
    const planIndex = medicalState.injuryPlans.findIndex((plan) => plan.id === values.planId);
    if (planIndex < 0) {
      return false;
    }
    const currentPlan = medicalState.injuryPlans[planIndex];
    const phase = getMedicalRtpPhaseOption(values.rtpPhase || currentPlan.rtpPhase);
    const nextPlan = normalizeMedicalInjuryPlan({
      ...currentPlan,
      status: phase.status,
      participation: phase.participation,
      rtpPhase: phase.key,
      phase: currentPlan.rtpPhase === phase.key ? currentPlan.phase : phase.label,
      clearance: getMedicalClearanceValues(values),
      gates: getMedicalLoadGateValues(values),
      updatedAt: new Date().toISOString(),
    });
    if (!nextPlan) {
      return false;
    }
    const nextPlans = [...medicalState.injuryPlans];
    nextPlans[planIndex] = nextPlan;
    medicalState.injuryPlans = nextPlans;
    medicalState.selectedPlayerId = nextPlan.playerId;
    commitMedicalClinicalState("clearance-saved", "Clearance checklist saved.");
    return nextPlan;
  }

  function removeMedicalInjuryPlan(planId) {
    const medicalState = readState();
    const planIndex = medicalState.injuryPlans.findIndex((plan) => plan.id === planId);
    if (planIndex < 0) {
      return null;
    }
    const currentPlan = medicalState.injuryPlans[planIndex];
    if (isMedicalItemArchived(currentPlan)) {
      return currentPlan;
    }
    const archivedAt = new Date().toISOString();
    const archivedPlan = normalizeMedicalInjuryPlan({
      ...currentPlan,
      updatedAt: archivedAt,
      archivedAt,
      archivedBy: getCurrentMedicalActorId(),
      archiveReason: "Manual archive from Medical Room",
    });
    if (!archivedPlan) {
      return null;
    }
    const nextPlans = [...medicalState.injuryPlans];
    nextPlans[planIndex] = archivedPlan;
    medicalState.injuryPlans = nextPlans;
    commitMedicalClinicalState("availability-plan-archived", "Availability plan archived and kept in protected history.");
    return archivedPlan;
  }

  function openMedicalPlayerModal(playerId) {
    const medicalState = readState();
    if (!medicalState.players.some((player) => player.id === playerId)) {
      return;
    }
    medicalState.selectedPlayerId = playerId;
    setMedicalPlayerModalOpen(true);
    setMedicalPlayerModalTab("availability");
    writeMedicalState();
    renderMedicalTeamWorkspace();

    const statusLoad = loadMedicalPlayerRtpCoachStatus(playerId);
    if (statusLoad && typeof statusLoad.finally === "function") {
      statusLoad.finally(() => renderMedicalTeamWorkspace());
    }
  }

  function closeMedicalPlayerModal(message = "") {
    setMedicalPlayerModalOpen(false);
    setMedicalPlayerModalTab("availability");
    renderMedicalTeamWorkspace(message);
  }

  function setMedicalSelectedDate(dateValue) {
    if (!isDateValue(dateValue)) {
      return;
    }
    const medicalState = readState();
    medicalState.selectedDate = dateValue;
    writeMedicalState();
    renderMedicalTeamWorkspace();
  }

  function shiftMedicalSelectedDate(deltaDays) {
    const medicalState = readState();
    const currentDate = parseDateValue(medicalState.selectedDate);
    setMedicalSelectedDate(formatDateValue(addCalendarDays(currentDate, deltaDays)));
  }

  return {
    addMedicalInjuryPlan,
    addMedicalRecord,
    closeMedicalPlayerModal,
    openMedicalPlayerModal,
    removeMedicalInjuryPlan,
    removeMedicalPlayer,
    removeMedicalRecord,
    setMedicalSelectedDate,
    shiftMedicalSelectedDate,
    updateMedicalInjuryPlan,
    updateMedicalPlanClearance,
    updateMedicalPlayerProfile,
    upsertMedicalPlayers,
  };
}
