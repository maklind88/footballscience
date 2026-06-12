export function createMedicalRuntimeOperationsService(deps = {}) {
  const {
    addMedicalRecord = () => null,
    buildMedicalCoachHandoverText = () => "",
    canEditMedicalTeam = () => false,
    canViewPrivateMedicalDetails = () => false,
    commitMedicalClinicalState = () => {},
    compareMedicalPlayers = () => 0,
    ensureMedicalState = () => ({}),
    formatDateValue = (date) => new Date(date).toISOString().slice(0, 10),
    getActiveMedicalPlayers = () => [],
    getActiveMedicalPlayersForDate = () => [],
    getBulkRecommendationOpen = () => false,
    getBulkSelectedPlayerIds = () => new Set(),
    getCurrentPlatformUser = () => null,
    getLatestMedicalRecord = () => null,
    getMedicalCoachHandoverItems = () => [],
    getMedicalDataSafetyCounts = () => ({}),
    getMedicalDailyStats = () => ({}),
    getMedicalPlayerSquadAvailabilityBlockReason = () => "",
    getMedicalRecommendationActivityContext = () => ({ isRecommendable: true, type: "" }),
    getMedicalRecommendationBlockReason = () => "",
    getMedicalRecordStatus = () => ({ key: "not-set" }),
    getMedicalRtpPhaseForRecommendation = () => "",
    getMedicalRtpPhaseOption = () => ({ label: "" }),
    getMedicalState = () => null,
    getMedicalStatusForParticipation = () => "not-set",
    getPlayerProfileRosterLabel = () => "",
    getRosterSearchQuery = () => "",
    getStatusFilter = () => "all",
    isMedicalDateValue = () => false,
    isMedicalItemArchived = () => false,
    isMedicalPlayerBlockedBySquadAvailability = () => false,
    medicalActualParticipationFallback = "not-logged",
    medicalRtpPhaseOptions = [],
    medicalTeamStorageKey = "",
    navigatorRef = globalThis.navigator || {},
    normalizeMedicalGovernancePolicy = (value) => value || {},
    normalizeMedicalParticipation = (value, fallback = 100) => (Number.isFinite(Number(value)) ? Number(value) : fallback),
    renderMedicalTeamWorkspace = () => {},
    setBulkRecommendationOpen = () => {},
    setBulkSelectedPlayerIds = () => {},
    updateMedicalDatabaseSyncStatus = () => {},
    win = globalThis,
    writeMedicalState = () => {},
  } = deps;

  function readState() {
    ensureMedicalState();
    return getMedicalState();
  }

  function recordMedicalAuditEvent(event = {}) {
    const auditBridge = win.footballScienceAudit;
    if (!getCurrentPlatformUser() || !auditBridge?.record) {
      return Promise.resolve({ ok: false });
    }
    return auditBridge.record(event).catch(() => ({ ok: false }));
  }

  function getMedicalDatabasePlayer(playerId) {
    const medicalState = readState();
    return medicalState.players.find((player) => player.id === playerId) ?? null;
  }

  function buildMedicalDatabaseStateSummary() {
    const medicalState = readState();
    const stats = getMedicalDailyStats(medicalState.selectedDate);
    const archiveCounts = getMedicalDataSafetyCounts(medicalState);
    return {
      selectedDate: medicalState.selectedDate,
      rosterVersion: medicalState.rosterVersion,
      playerCount: getActiveMedicalPlayers().length,
      archivedPlayerCount: archiveCounts.archivedPlayers,
      recordCount: medicalState.records.length,
      injuryPlanCount: medicalState.injuryPlans.length,
      archivedRecordCount: archiveCounts.archivedRecords,
      archivedPlanCount: archiveCounts.archivedPlans,
      lastClinicalChangeAt: medicalState.dataSafety?.lastClinicalChangeAt || "",
      fullCount: stats.fullCount,
      modifiedCount: stats.modifiedCount,
      unavailableCount: stats.unavailableCount,
      unloggedCount: stats.unloggedCount,
      coachSharedItems:
        medicalState.records.filter((record) => !isMedicalItemArchived(record) && record.shareWithCoach).length +
        medicalState.injuryPlans.filter((plan) => !isMedicalItemArchived(plan) && plan.shareWithCoach).length,
    };
  }

  function getMedicalDatabaseIdempotencyKey(eventType, payload = {}) {
    const playerId = payload.playerId || payload.record?.playerId || payload.plan?.playerId || payload.player?.id || "";
    const entityId =
      payload.record?.id ||
      payload.plan?.id ||
      payload.player?.id ||
      payload.recordId ||
      payload.planId ||
      payload.policy?.updatedAt ||
      payload.updatedAt ||
      Date.now();
    return [eventType, playerId, entityId].filter(Boolean).join(":");
  }

  function recordMedicalDatabaseSyncEvent(eventType, payload = {}) {
    const databaseBridge = win.footballScienceMedicalDatabase;
    if (!getCurrentPlatformUser() || !canViewPrivateMedicalDetails() || !databaseBridge?.record) {
      return Promise.resolve({ ok: false });
    }
    const legacyPlayerId = payload.playerId || payload.record?.playerId || payload.plan?.playerId || payload.player?.id || "";
    const player = payload.player || getMedicalDatabasePlayer(legacyPlayerId);
    const payloadCopy = { ...payload };
    delete payloadCopy.idempotencyKey;
    return databaseBridge
      .record({
        action: "recordSyncEvent",
        eventType,
        legacyPlayerId,
        idempotencyKey: payload.idempotencyKey || getMedicalDatabaseIdempotencyKey(eventType, payload),
        payload: {
          schema: "footballscience-medical-room-event-v1",
          sourceKey: medicalTeamStorageKey,
          eventType,
          selectedDate: getMedicalState()?.selectedDate || "",
          player: player
            ? {
              id: player.id,
              name: player.name,
              number: player.number,
              position: player.position,
              photoUrl: player.photoUrl,
              updatedAt: player.updatedAt,
            }
            : null,
          stateSummary: buildMedicalDatabaseStateSummary(),
          ...payloadCopy,
        },
      })
      .then((result) => {
        updateMedicalDatabaseSyncStatus(eventType, result);
        return result;
      })
      .catch(() => {
        const result = { ok: false };
        updateMedicalDatabaseSyncStatus(eventType, result);
        return result;
      });
  }

  function copyMedicalCoachHandoverToClipboard() {
    const medicalState = getMedicalState();
    const text = buildMedicalCoachHandoverText(medicalState.selectedDate);
    if (!navigatorRef.clipboard?.writeText) {
      renderMedicalTeamWorkspace("Clipboard is not available in this browser.");
      return;
    }
    navigatorRef.clipboard
      .writeText(text)
      .then(() => {
        void recordMedicalAuditEvent({
          action: "medical.handover.copied",
          summary: "Copied coach-safe medical handover",
          details: {
            date: medicalState.selectedDate,
            itemCount: getMedicalCoachHandoverItems(medicalState.selectedDate).length,
          },
        });
        renderMedicalTeamWorkspace("Coach-safe handover copied.");
      })
      .catch(() => renderMedicalTeamWorkspace("Coach-safe handover could not be copied."));
  }

  function getFilteredMedicalPlayers() {
    const medicalState = readState();
    const query = getRosterSearchQuery().trim().toLowerCase();
    const medicalStatusFilter = getStatusFilter();
    return getActiveMedicalPlayersForDate(medicalState.selectedDate).filter((player) => {
      const record = getLatestMedicalRecord(player.id, medicalState.selectedDate);
      const status = getMedicalRecordStatus(record);
      const matchesSearch = !query || `${player.name} ${player.number} ${player.position} ${getPlayerProfileRosterLabel(player)}`.toLowerCase().includes(query);
      const matchesStatus =
        medicalStatusFilter === "all" ||
        (medicalStatusFilter === "not-set" && !record) ||
        status.key === medicalStatusFilter;
      return matchesSearch && matchesStatus;
    });
  }

  function getMedicalValidBulkSelection() {
    const medicalState = readState();
    const validIds = new Set(
      getActiveMedicalPlayersForDate(medicalState.selectedDate)
        .filter((player) => !isMedicalPlayerBlockedBySquadAvailability(player))
        .map((player) => player.id)
    );
    const nextSelectedIds = new Set(
      Array.from(getBulkSelectedPlayerIds()).filter((playerId) => validIds.has(playerId))
    );
    setBulkSelectedPlayerIds(nextSelectedIds);
    return nextSelectedIds;
  }

  function getMedicalBulkSelectedPlayers() {
    const medicalState = getMedicalState();
    const selectedIds = getMedicalValidBulkSelection();
    return getActiveMedicalPlayersForDate(medicalState.selectedDate).filter((player) => selectedIds.has(player.id)).sort(compareMedicalPlayers);
  }

  function getMedicalBulkRecommendationEligiblePlayers(players = getFilteredMedicalPlayers()) {
    return players.filter((player) => !isMedicalPlayerBlockedBySquadAvailability(player));
  }

  function toggleMedicalBulkPlayer(playerId) {
    const medicalState = getMedicalState();
    const selectedIds = getMedicalValidBulkSelection();
    const player = getActiveMedicalPlayersForDate(medicalState.selectedDate).find((candidate) => candidate.id === playerId);
    if (isMedicalPlayerBlockedBySquadAvailability(player)) {
      selectedIds.delete(playerId);
      setBulkSelectedPlayerIds(selectedIds);
      renderMedicalTeamWorkspace(getMedicalPlayerSquadAvailabilityBlockReason(player));
      return;
    }
    if (selectedIds.has(playerId)) {
      selectedIds.delete(playerId);
    } else if (getActiveMedicalPlayers().some((player) => player.id === playerId)) {
      selectedIds.add(playerId);
    }
    setBulkSelectedPlayerIds(selectedIds);
    setBulkRecommendationOpen(selectedIds.size > 0);
    renderMedicalTeamWorkspace();
  }

  function setMedicalBulkSelection(playerIds = [], dateValue = getMedicalState().selectedDate) {
    const validIds = new Set(
      getActiveMedicalPlayersForDate(dateValue)
        .filter((player) => !isMedicalPlayerBlockedBySquadAvailability(player))
        .map((player) => player.id)
    );
    setBulkSelectedPlayerIds(new Set(playerIds.filter((playerId) => validIds.has(playerId))));
    renderMedicalTeamWorkspace();
  }

  function setMedicalBulkNotSetSelection(dateValue = formatDateValue(new Date()), players = getFilteredMedicalPlayers()) {
    const bulkDate = isMedicalDateValue(dateValue) ? dateValue : formatDateValue(new Date());
    const activityContext = getMedicalRecommendationActivityContext(bulkDate);
    setBulkRecommendationOpen(true);
    if (!activityContext.isRecommendable) {
      setBulkSelectedPlayerIds(new Set());
      renderMedicalTeamWorkspace(activityContext.blockReason);
      return;
    }
    setMedicalBulkSelection(
      players
        .filter((player) => !isMedicalPlayerBlockedBySquadAvailability(player))
        .filter((player) => !getLatestMedicalRecord(player.id, bulkDate))
        .map((player) => player.id),
      bulkDate
    );
  }

  function applyMedicalQuickRecommendation(playerId, participationValue) {
    const medicalState = readState();
    const player = medicalState.players.find((candidate) => candidate.id === playerId);
    if (!player) {
      return { player: null, record: null, blockReason: "Player could not be found." };
    }
    const dateValue = medicalState.selectedDate;
    const participation = normalizeMedicalParticipation(participationValue, 75);
    const status = getMedicalStatusForParticipation(participation);
    const blockReason = getMedicalRecommendationBlockReason(player.id, participation, dateValue);
    if (blockReason) {
      return { player, record: null, blockReason };
    }
    const record = addMedicalRecord({
      playerId: player.id,
      date: dateValue,
      status,
      participation,
      actualParticipation: medicalActualParticipationFallback,
      comment: "",
      coachNote: "",
      shareWithCoach: false,
      rtpPhase: getMedicalRtpPhaseForRecommendation(
        status,
        participation,
        getMedicalRecommendationActivityContext(dateValue).type
      ),
    });
    return { player, record, blockReason: "" };
  }

  function applyMedicalBulkRecommendation(values = {}) {
    const medicalState = readState();
    const selectedPlayers = getMedicalBulkSelectedPlayers();
    const dateValue = isMedicalDateValue(values.date) ? values.date : medicalState.selectedDate;
    const participation = normalizeMedicalParticipation(values.participation, 75);
    const status = getMedicalStatusForParticipation(participation);
    const activityContext = getMedicalRecommendationActivityContext(dateValue);
    if (!activityContext.isRecommendable) {
      return {
        savedCount: 0,
        records: [],
        blockedCount: selectedPlayers.length,
        blockedNames: selectedPlayers.map((player) => player.name),
        blockReason: activityContext.blockReason,
      };
    }
    const rtpPhase = medicalRtpPhaseOptions.some((phase) => phase.key === values.rtpPhase)
      ? values.rtpPhase
      : getMedicalRtpPhaseForRecommendation(status, participation, activityContext.type);
    const blockedPlayers = [];
    const savedRecords = [];
    let savedCount = 0;
    selectedPlayers.forEach((player) => {
      const blockReason = getMedicalRecommendationBlockReason(player.id, participation, dateValue);
      if (blockReason) {
        blockedPlayers.push(player);
        return;
      }
      const record = addMedicalRecord({
        playerId: player.id,
        date: dateValue,
        status,
        participation,
        actualParticipation: medicalActualParticipationFallback,
        comment: values.comment,
        coachNote: values.coachNote,
        shareWithCoach: values.shareWithCoach,
        rtpPhase,
      }, { skipDataSafety: true });
      if (record) {
        savedCount += 1;
        savedRecords.push(record);
      }
    });
    medicalState.selectedDate = dateValue;
    setBulkSelectedPlayerIds(new Set());
    setBulkRecommendationOpen(false);
    if (savedCount) {
      commitMedicalClinicalState("bulk-recommendation-saved", `${savedCount} bulk recommendations saved for ${dateValue}.`);
    } else {
      writeMedicalState();
    }
    return {
      savedCount,
      records: savedRecords,
      blockedCount: blockedPlayers.length,
      blockedNames: blockedPlayers.map((player) => player.name),
    };
  }

  function updateMedicalBulkActivityControls(form) {
    if (!form) {
      return;
    }
    const dateValue = form.querySelector("[data-medical-bulk-date]")?.value;
    const participationControl = form.querySelector("[data-medical-bulk-participation]");
    const phasePreview = form.querySelector("[data-medical-bulk-rtp-preview]");
    const activityLabel = form.querySelector("[data-medical-bulk-activity-label]");
    const selectNotSetButton = form.querySelector("[data-medical-bulk-select-not-set]");
    const submitButton = form.querySelector('button[type="submit"]');
    const activityContext = getMedicalRecommendationActivityContext(dateValue);
    const canRecommend = canEditMedicalTeam() && activityContext.isRecommendable;
    const participation = normalizeMedicalParticipation(participationControl?.value, 75);
    const phaseKey = getMedicalRtpPhaseForRecommendation(
      getMedicalStatusForParticipation(participation),
      participation,
      activityContext.type
    );
    if (participationControl) {
      participationControl.disabled = !canRecommend;
    }
    if (phasePreview) {
      phasePreview.value = getMedicalRtpPhaseOption(phaseKey).label;
    }
    if (activityLabel) {
      activityLabel.textContent = activityContext.isRecommendable
        ? `${activityContext.activityLabel} / ${activityContext.scheduleLabel}`
        : activityContext.blockReason;
      activityLabel.classList.toggle("is-locked", !activityContext.isRecommendable);
    }
    if (selectNotSetButton) {
      selectNotSetButton.disabled = !canRecommend || !getMedicalBulkRecommendationEligiblePlayers(getFilteredMedicalPlayers()).length;
    }
    if (submitButton) {
      submitButton.disabled = !canRecommend || !getMedicalBulkSelectedPlayers().length;
    }
  }

  function updateMedicalGovernancePolicy(values = {}) {
    if (!canViewPrivateMedicalDetails()) {
      return false;
    }
    const medicalState = getMedicalState();
    const now = new Date().toISOString();
    medicalState.policy = normalizeMedicalGovernancePolicy({
      ...medicalState.policy,
      retentionMonths: values.retentionMonths,
      reviewCadenceDays: values.reviewCadenceDays,
      consentRequired: values.consentRequired,
      policyOwner: values.policyOwner,
      incidentContact: values.incidentContact,
      lastReviewed: values.lastReviewed,
      updatedAt: now,
      updatedBy: getCurrentPlatformUser()?.id || "",
    });
    writeMedicalState();
    return true;
  }

  return {
    applyMedicalBulkRecommendation,
    applyMedicalQuickRecommendation,
    buildMedicalDatabaseStateSummary,
    copyMedicalCoachHandoverToClipboard,
    getFilteredMedicalPlayers,
    getMedicalBulkRecommendationEligiblePlayers,
    getMedicalBulkSelectedPlayers,
    getMedicalDatabaseIdempotencyKey,
    getMedicalDatabasePlayer,
    getMedicalValidBulkSelection,
    recordMedicalAuditEvent,
    recordMedicalDatabaseSyncEvent,
    setMedicalBulkNotSetSelection,
    setMedicalBulkSelection,
    toggleMedicalBulkPlayer,
    updateMedicalBulkActivityControls,
    updateMedicalGovernancePolicy,
  };
}
