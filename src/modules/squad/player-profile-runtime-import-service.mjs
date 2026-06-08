const defaultNow = () => new Date().toISOString();

export function createPlayerProfileRuntimeImportService(options = {}) {
  const getNow = typeof options.getNow === "function" ? options.getNow : defaultNow;
  const getUndoHistory = typeof options.getPlayerProfileImportUndoHistoryState === "function" ? options.getPlayerProfileImportUndoHistoryState : () => [];
  const setUndoHistory = typeof options.setPlayerProfileImportUndoHistoryState === "function" ? options.setPlayerProfileImportUndoHistoryState : () => {};
  const getLastSnapshot = typeof options.getPlayerProfileLastImportSnapshot === "function" ? options.getPlayerProfileLastImportSnapshot : () => null;
  const setLastSnapshot = typeof options.setPlayerProfileLastImportSnapshot === "function" ? options.setPlayerProfileLastImportSnapshot : () => {};
  const getPendingPlan = typeof options.getPendingPlayerProfileImportPlan === "function" ? options.getPendingPlayerProfileImportPlan : () => null;
  const setPendingPlan = typeof options.setPendingPlayerProfileImportPlan === "function" ? options.setPendingPlayerProfileImportPlan : () => {};
  const getPlayerProfilesState = typeof options.getPlayerProfilesState === "function" ? options.getPlayerProfilesState : () => null;
  const setPlayerProfilesState = typeof options.setPlayerProfilesState === "function" ? options.setPlayerProfilesState : () => {};
  const getMedicalState = typeof options.getMedicalState === "function" ? options.getMedicalState : () => null;
  const setMedicalState = typeof options.setMedicalState === "function" ? options.setMedicalState : () => {};

  function buildPlayerProfileImportFeedback(result = {}) {
    return options.buildPlayerProfileImportFeedbackMessage(result, { undoState: getPlayerProfileImportUndoState() });
  }

  function createPlayerProfileImportUndoSnapshot(plan = {}) {
    options.ensurePlayerProfilesState();
    options.ensureMedicalState();
    return {
      createdAt: getNow(),
      playerProfilesState: options.clonePlayerProfilesState(getPlayerProfilesState()),
      medicalState: options.cloneMedicalState(getMedicalState()),
      preApplyChangeLogId: options.getRecentPlayerProfileChangeLog(1)[0]?.id || "",
      plan: {
        importedCount: Number(plan.importedCount) || 0,
        createdCount: Number(plan.createdCount) || 0,
        updatedCount: Number(plan.updatedCount) || 0,
        sourceRows: Number(plan.sourceRows) || 0,
      },
      undoChangeLogId: "",
    };
  }

  function clearPlayerProfileImportUndoSnapshots() {
    setUndoHistory([]);
    setLastSnapshot(null);
  }

  function registerPlayerProfileImportUndoSnapshot(snapshot = {}) {
    if (!snapshot || typeof snapshot !== "object") {
      return;
    }
    const history = [
      { ...snapshot },
      ...(Array.isArray(getUndoHistory()) ? getUndoHistory() : []),
    ].slice(0, options.playerProfileImportUndoHistoryLimit);
    setUndoHistory(history);
    setLastSnapshot(history[0] || null);
  }

  function getPlayerProfileImportUndoHistory(limit = options.playerProfileImportUndoHistoryLimit) {
    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : options.playerProfileImportUndoHistoryLimit;
    const history = Array.isArray(getUndoHistory()) ? getUndoHistory() : [];
    return history.slice(0, safeLimit);
  }

  function getPlayerProfileImportUndoState() {
    if (!options.canEditPlayerProfiles()) {
      return {
        canUndo: false,
        reason: "Undo is disabled because your role is read-only.",
        summary: "",
        title: "Undo is disabled in read-only mode.",
        label: "Undo import",
      };
    }
    const latestSnapshot = getUndoHistory()[0] || getLastSnapshot();
    if (!latestSnapshot) {
      return {
        canUndo: false,
        reason: "No player profile import can be undone right now.",
        summary: "",
        title: "No import available to undo.",
        label: "Undo import",
      };
    }
    const expectedChangeLogHead = latestSnapshot?.undoChangeLogId || "";
    const currentChangeLogHead = options.getRecentPlayerProfileChangeLog(1)[0]?.id || "";
    if (expectedChangeLogHead && currentChangeLogHead && expectedChangeLogHead !== currentChangeLogHead) {
      return {
        canUndo: false,
        reason: "Undo blocked because newer player profile changes were made after this import.",
        summary: "",
        title: "Undo is no longer safe. Newer profile changes were made after the import.",
        label: "Undo import",
      };
    }
    const importedCount = Number(latestSnapshot?.plan?.importedCount) || 0;
    const createdCount = Number(latestSnapshot?.plan?.createdCount) || 0;
    const updatedCount = Number(latestSnapshot?.plan?.updatedCount) || 0;
    const appliedBy = String(latestSnapshot?.appliedBy || latestSnapshot?.actor || "Unknown");
    const importedAt = latestSnapshot?.createdAt || "";
    const appliedAt = latestSnapshot?.appliedAt || importedAt;
    const appliedAtLabel = appliedAt ? new Date(appliedAt).toLocaleString() : "";
    const appliedAgo = appliedAt ? options.getPlayerProfileImportUndoRelativeTimeLabel(appliedAt) : "";
    return {
      canUndo: true,
      title: `Undo last import (${importedCount} records, ${createdCount} added, ${updatedCount} updated).`
        + ` Applied by ${appliedBy}${appliedAtLabel ? ` • ${appliedAtLabel}` : ""}`,
      label: importedCount ? `Undo import (${importedCount})` : "Undo import",
      reason: "",
      summary: `Undo is available for ${importedCount} records (${createdCount} created, ${updatedCount} updated). Applied by ${appliedBy}${
        appliedAtLabel ? ` at ${appliedAtLabel}` : ""
      }${appliedAgo ? ` (${appliedAgo})` : ""}`,
    };
  }

  function applyPlayerProfileImportUndo() {
    if (!options.canEditPlayerProfiles()) {
      return { status: "warning", lines: ["Your role cannot undo player profile imports."] };
    }
    const history = getUndoHistory();
    if (!history.length || !getLastSnapshot()) {
      clearPlayerProfileImportUndoSnapshots();
      return { status: "warning", lines: ["No import undo state was available."] };
    }
    const topSnapshot = history[0];
    if (!topSnapshot?.playerProfilesState) {
      clearPlayerProfileImportUndoSnapshots();
      return { status: "warning", lines: ["No valid import undo snapshot was available."] };
    }
    const undoState = getPlayerProfileImportUndoState();
    if (!undoState.canUndo) {
      return { status: "warning", lines: [undoState.reason || "The last import cannot be undone at this time."] };
    }
    const currentChangeLogHead = options.getRecentPlayerProfileChangeLog(1)[0]?.id || "";
    const expectedChangeLogHead = topSnapshot.undoChangeLogId || "";
    if (expectedChangeLogHead && currentChangeLogHead && currentChangeLogHead !== expectedChangeLogHead) {
      return {
        status: "warning",
        lines: [
          "Import cannot be undone because newer player profile changes were made after the import.",
          "Re-import or revert manually from history.",
        ],
      };
    }
    setPlayerProfilesState(options.clonePlayerProfilesState(topSnapshot.playerProfilesState));
    setMedicalState(options.cloneMedicalState(topSnapshot.medicalState || {}));
    const nextHistory = history.slice(1);
    setUndoHistory(nextHistory);
    setLastSnapshot(nextHistory[0] || null);
    const restoredCount = Number(topSnapshot?.plan?.importedCount) || 0;
    options.writePlayerProfilesState();
    options.writeMedicalState();
    return {
      status: "success",
      lines: [`Last player profile import was undone${restoredCount ? ` (${restoredCount} record${restoredCount === 1 ? "" : "s"})` : ""}.`],
    };
  }

  function importSquadDataFoundationPayload(payload = {}, importOptions = {}) {
    if (!options.canEditPlayerProfiles()) {
      return {
        ok: false,
        status: "warning",
        importedCount: 0,
        createdCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        errors: [{ row: 0, message: "Your role cannot apply player profile imports." }],
        warnings: [],
        rows: [],
        canApply: false,
      };
    }
    const applyChanges = importOptions.apply !== false;
    const basePlan = importOptions.plan || options.buildPlayerProfileImportPlan(payload, importOptions);
    if (!basePlan || typeof basePlan !== "object") {
      return {
        ok: false,
        status: "error",
        importedCount: 0,
        createdCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        errors: [{ row: 0, message: "Unable to build import plan." }],
        warnings: [],
        rows: [],
        canApply: false,
      };
    }
    if (!applyChanges || !basePlan.canApply) {
      return { ...basePlan, ok: basePlan.ok, status: basePlan.status };
    }
    const preApplyChangeLogId = options.getRecentPlayerProfileChangeLog(1)[0]?.id || "";
    if (importOptions.playerProfilesImportLogHeadId && importOptions.playerProfilesImportLogHeadId !== preApplyChangeLogId) {
      return {
        ok: false,
        status: "warning",
        importedCount: 0,
        createdCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        errors: [{ row: 0, message: "Import preview is stale. Please re-run the import file and apply again." }],
        warnings: [],
        rows: [],
        sourceRows: 0,
        duplicateRowsCount: 0,
        canApply: false,
      };
    }
    const preApplySnapshot = createPlayerProfileImportUndoSnapshot(basePlan);
    const state = getPlayerProfilesState();
    const importedCount = basePlan.importedCount || 0;
    const importedPlayerIds = new Set(
      (basePlan.profilesForMedicalSync || []).map((player) => String(player?.id || "").trim()).filter(Boolean)
    );
    if (importedPlayerIds.size) {
      state.removedPlayerIds = options.normalizePlayerProfileRemovedIds(state.removedPlayerIds)
        .filter((removedPlayerId) => !importedPlayerIds.has(removedPlayerId));
    }
    state.players = [...(Array.isArray(basePlan.nextPlayers) ? basePlan.nextPlayers : state.players)].sort(options.comparePlayerProfiles);
    if (!state.selectedPlayerId && state.players[0]) {
      state.selectedPlayerId = state.players[0].id;
    }
    setPlayerProfilesState(state);
    if (importedCount) {
      options.recordPlayerProfileChange(
        "squad-import",
        null,
        Array.from({ length: importedCount }, (_, index) => ({
          field: `Player ${index + 1}`,
          from: "Import file",
          to: "Squad profile",
        }))
      );
      const latestLog = options.getRecentPlayerProfileChangeLog(1)[0];
      preApplySnapshot.undoChangeLogId = latestLog?.id || "";
      preApplySnapshot.appliedBy = latestLog?.actor || options.getCurrentSquadActorLabel();
      preApplySnapshot.appliedAt = latestLog?.createdAt || getNow();
      preApplySnapshot.actor = preApplySnapshot.appliedBy;
      registerPlayerProfileImportUndoSnapshot(preApplySnapshot);
    }
    options.writePlayerProfilesState();
    options.syncMedicalPlayersFromPlayerProfiles(basePlan.profilesForMedicalSync || []);
    options.writeMedicalState();
    return {
      ok: basePlan.ok !== false,
      status: basePlan.errors && basePlan.errors.length ? "warning" : "success",
      importedCount: basePlan.importedCount || 0,
      createdCount: basePlan.createdCount || 0,
      updatedCount: basePlan.updatedCount || 0,
      skippedCount: basePlan.skippedCount || 0,
      errors: basePlan.errors || [],
      warnings: basePlan.warnings || [],
      rows: basePlan.rows || [],
      sourceRows: basePlan.sourceRows || 0,
      duplicateRowsCount: basePlan.duplicateRowsCount || 0,
      canApply: false,
    };
  }

  function importSquadDataFoundationFile(file) {
    if (!options.canEditPlayerProfiles()) {
      options.renderPlayerProfilesWorkspace({ status: "warning", lines: ["Your role cannot import player profile changes."] });
      return;
    }
    if (!file) {
      return;
    }
    const FileReaderCtor = options.FileReaderCtor;
    const reader = new FileReaderCtor();
    reader.onload = () => {
      try {
        const payload = JSON.parse(String(reader.result || "{}"));
        const preview = importSquadDataFoundationPayload(payload, { apply: false });
        if (!preview.canApply) {
          setPendingPlan(null);
          options.renderPlayerProfilesWorkspace(buildPlayerProfileImportFeedback(preview));
          return;
        }
        const preApplyChangeLogId = options.getRecentPlayerProfileChangeLog(1)[0]?.id || "";
        setPendingPlan({ ...preview, playerProfilesImportLogHeadId: preApplyChangeLogId });
        const previewMessage = options.buildPlayerProfileImportPreviewMessage(preview, { maxRows: 20 });
        options.renderPlayerProfilesWorkspace({
          status: previewMessage.status || "success",
          lines: [...previewMessage.lines, "Review changes then choose Apply or Cancel."],
          items: [],
        });
      } catch {
        setPendingPlan(null);
        options.renderPlayerProfilesWorkspace(
          buildPlayerProfileImportFeedback({
            ok: false,
            status: "error",
            errors: [{ row: 0, message: "Import failed. Please use a valid Squad JSON export." }],
          })
        );
      }
    };
    reader.readAsText(file);
  }

  function renderPendingPlayerProfileImport() {
    const pendingPlan = getPendingPlan();
    if (!pendingPlan) {
      return "";
    }
    const preview = options.buildPlayerProfileImportPreviewMessage(pendingPlan, { maxRows: 20 });
    return options.renderPendingPlayerProfileImport(pendingPlan, preview, options.canEditPlayerProfiles());
  }

  return {
    applyPlayerProfileImportUndo,
    buildPlayerProfileImportFeedback,
    clearPlayerProfileImportUndoSnapshots,
    createPlayerProfileImportUndoSnapshot,
    getPlayerProfileImportUndoHistory,
    getPlayerProfileImportUndoState,
    importSquadDataFoundationFile,
    importSquadDataFoundationPayload,
    registerPlayerProfileImportUndoSnapshot,
    renderPendingPlayerProfileImport,
  };
}
