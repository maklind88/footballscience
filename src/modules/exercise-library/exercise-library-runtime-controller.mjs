import { confirmPlatformAction } from "../../core/platform-confirm-dialog.mjs";

function defaultNoop() {}

function createSafeStorageResult(kind, items, error = null) {
  const key = kind === "folders" ? "folders" : "exercises";
  return {
    saved: false,
    backupSaved: false,
    [key]: items,
    error,
  };
}

export function createExerciseLibraryRuntimeController(options = {}) {
  const stateAdapter = options.stateAdapter;
  const selectors = options.selectors;
  const getActions = typeof options.getActions === "function" ? options.getActions : () => null;
  const getRenderer = typeof options.getRenderer === "function" ? options.getRenderer : () => null;
  const getUi = typeof options.getUi === "function" ? options.getUi : () => ({});
  const getUiState = typeof options.getUiState === "function" ? options.getUiState : () => ({});
  const setUiState = typeof options.setUiState === "function" ? options.setUiState : defaultNoop;
  const getExerciseLibrary = typeof options.getExerciseLibrary === "function" ? options.getExerciseLibrary : () => null;
  const setExerciseLibrary = typeof options.setExerciseLibrary === "function" ? options.setExerciseLibrary : defaultNoop;
  const getExerciseFolders = typeof options.getExerciseFolders === "function" ? options.getExerciseFolders : () => null;
  const setExerciseFolders = typeof options.setExerciseFolders === "function" ? options.setExerciseFolders : defaultNoop;
  const win = options.win || globalThis;
  const logEvent = typeof options.logEvent === "function" ? options.logEvent : defaultNoop;
  const saveDataSafetySnapshot =
    typeof options.saveDataSafetySnapshot === "function" ? options.saveDataSafetySnapshot : null;
  const openDataSafetyDatabase =
    typeof options.openDataSafetyDatabase === "function" ? options.openDataSafetyDatabase : null;
  const renderWorkspace = typeof options.renderWorkspace === "function" ? options.renderWorkspace : defaultNoop;
  const showToast = typeof options.showToast === "function" ? options.showToast : defaultNoop;
  const getActiveWorkspaceId = typeof options.getActiveWorkspaceId === "function" ? options.getActiveWorkspaceId : () => "";
  const getLibraryUserId = typeof options.getLibraryUserId === "function" ? options.getLibraryUserId : () => "";
  const getSelectedBlock = typeof options.getSelectedBlock === "function" ? options.getSelectedBlock : () => null;
  const updateSelectedBlockField =
    typeof options.updateSelectedBlockField === "function" ? options.updateSelectedBlockField : defaultNoop;
  const getReviewNotes = typeof options.getReviewNotes === "function" ? options.getReviewNotes : () => [];
  const canEdit = typeof options.canEdit === "function" ? options.canEdit : () => false;
  const periodizationOptionLibrary = options.periodizationOptionLibrary || {};
  const sessionPlannerMultiSelectFields = options.sessionPlannerMultiSelectFields || new Set();
  const setMultiSelectOpenField =
    typeof options.setMultiSelectOpenField === "function" ? options.setMultiSelectOpenField : defaultNoop;
  const storageKeys = {
    exercises: options.exerciseLibraryStorageKey,
    exercisesBackup: options.exerciseLibraryBackupStorageKey,
    folders: options.exerciseLibraryFoldersStorageKey,
    foldersBackup: options.exerciseLibraryFoldersBackupStorageKey,
  };
  let snapshotRecoveryQueued = false;

  function actions() {
    return getActions() || {};
  }

  function renderer() {
    return getRenderer() || {};
  }

  function state() {
    return {
      archiveView: "active",
      editExerciseId: "",
      filterOpen: "",
      phaseFilter: "all",
      phaseFilters: [],
      searchQuery: "",
      selectedFolderId: "all",
      sortMode: "updated",
      subPhaseFilter: "all",
      subPhaseFilters: [],
      viewExerciseId: "",
      ...getUiState(),
    };
  }

  function createSessionPlannerLibraryExercise(source = {}) {
    return stateAdapter.createExercise(source);
  }

  function cloneSessionPlannerLibraryExercise(exercise = {}) {
    return stateAdapter.cloneExercise(exercise);
  }

  function normalizeSessionPlannerExerciseLibraryList(sourceLibrary = []) {
    return stateAdapter.normalizeExercises(sourceLibrary);
  }

  function normalizeSessionPlannerLibraryVersions(sourceVersions = []) {
    return stateAdapter.normalizeVersions(sourceVersions);
  }

  function createSessionPlannerLibraryVersionSnapshot(exercise = {}, reason = "Updated") {
    return stateAdapter.createVersionSnapshot(exercise, reason);
  }

  function appendSessionPlannerLibraryVersion(exercise = {}, reason = "Updated") {
    return stateAdapter.appendVersion(exercise, reason);
  }

  function isSessionPlannerLibraryExerciseArchived(exercise = {}) {
    return stateAdapter.isExerciseArchived(exercise);
  }

  function getSessionPlannerLibraryExercisesByArchiveState(archiveView = state().archiveView) {
    return stateAdapter.getExercisesByArchiveState(getSessionPlannerExerciseLibrary(), archiveView);
  }

  function getSessionPlannerActiveExerciseLibrary() {
    return getSessionPlannerLibraryExercisesByArchiveState("active");
  }

  function getSessionPlannerLibraryArchiveCounts() {
    return stateAdapter.getArchiveCounts(getSessionPlannerExerciseLibrary());
  }

  function parseSessionPlannerExerciseLibraryPayload(rawLibrary) {
    return stateAdapter.parseExercisePayload(rawLibrary);
  }

  function readSessionPlannerExerciseLibraryFromStorage(storageKey) {
    try {
      const rawLibrary = win.localStorage.getItem(storageKey);
      if (rawLibrary === null) return null;
      const exercises = parseSessionPlannerExerciseLibraryPayload(rawLibrary);
      return exercises ? { storageKey, exercises } : null;
    } catch {
      return null;
    }
  }

  function createSessionPlannerExerciseLibraryBackupEnvelope(exercises = []) {
    return stateAdapter.createExerciseBackupEnvelope(exercises);
  }

  function writeSessionPlannerExerciseLibraryToStorage(exercises = []) {
    const normalizedLibrary = normalizeSessionPlannerExerciseLibraryList(exercises);
    try {
      win.localStorage.setItem(storageKeys.exercises, JSON.stringify(normalizedLibrary));
    } catch (error) {
      logEvent(error?.message || "Exercise library could not be saved centrally.");
      return createSafeStorageResult("exercises", normalizedLibrary, error);
    }
    let backupSaved = true;
    try {
      win.localStorage.setItem(
        storageKeys.exercisesBackup,
        JSON.stringify(createSessionPlannerExerciseLibraryBackupEnvelope(normalizedLibrary))
      );
    } catch (error) {
      backupSaved = false;
      logEvent(error?.message || "Exercise library backup could not be saved centrally.");
    }
    saveDataSafetySnapshot?.("exercise-library-save");
    return { saved: true, backupSaved, exercises: normalizedLibrary, error: null };
  }

  async function findSessionPlannerExerciseLibraryInSnapshots() {
    if (!openDataSafetyDatabase || !options.dataSafetySnapshotStoreName) return null;
    try {
      const database = await openDataSafetyDatabase();
      const snapshots = await new Promise((resolve, reject) => {
        const transaction = database.transaction(options.dataSafetySnapshotStoreName, "readonly");
        const request = transaction.objectStore(options.dataSafetySnapshotStoreName).getAll();
        request.onsuccess = () => resolve(Array.from(request.result || []));
        request.onerror = () => reject(request.error);
      });
      const orderedSnapshots = snapshots.sort((a, b) =>
        String(b?.createdAt || b?.id || "").localeCompare(String(a?.createdAt || a?.id || ""))
      );
      for (const snapshot of orderedSnapshots) {
        const storage = snapshot?.storage && typeof snapshot.storage === "object" ? snapshot.storage : {};
        const candidates = [storage[storageKeys.exercises], storage[storageKeys.exercisesBackup]];
        for (const rawLibrary of candidates) {
          const exercises = parseSessionPlannerExerciseLibraryPayload(rawLibrary);
          if (exercises) return exercises;
        }
      }
    } catch {
      return null;
    }
    return null;
  }

  function queueSessionPlannerExerciseLibrarySnapshotRecovery() {
    if (snapshotRecoveryQueued) return;
    snapshotRecoveryQueued = true;
    findSessionPlannerExerciseLibraryInSnapshots().then((recoveredExercises) => {
      snapshotRecoveryQueued = false;
      if (!recoveredExercises || readSessionPlannerExerciseLibraryFromStorage(storageKeys.exercises)) return;
      const writeResult = writeSessionPlannerExerciseLibraryToStorage(recoveredExercises);
      if (!writeResult.saved) return;
      setExerciseLibrary(writeResult.exercises);
      if (getActiveWorkspaceId() === "session-planner") {
        renderWorkspace({ preserveDateStripScroll: true });
        showToast("Exercise Library restored from local backup.");
      }
    });
  }

  function readSessionPlannerExerciseLibrary() {
    const mainLibrary = readSessionPlannerExerciseLibraryFromStorage(storageKeys.exercises);
    if (mainLibrary) return mainLibrary.exercises;
    const backupLibrary = readSessionPlannerExerciseLibraryFromStorage(storageKeys.exercisesBackup);
    if (backupLibrary) {
      writeSessionPlannerExerciseLibraryToStorage(backupLibrary.exercises);
      return backupLibrary.exercises;
    }
    queueSessionPlannerExerciseLibrarySnapshotRecovery();
    return normalizeSessionPlannerExerciseLibraryList(options.defaultExerciseLibrary || []);
  }

  function getSessionPlannerExerciseLibrary() {
    const currentLibrary = getExerciseLibrary();
    if (Array.isArray(currentLibrary)) return currentLibrary;
    const nextLibrary = readSessionPlannerExerciseLibrary();
    setExerciseLibrary(nextLibrary);
    return nextLibrary;
  }

  function normalizeSessionPlannerLibraryFolderVisibility(value) {
    return stateAdapter.normalizeFolderVisibility(value);
  }

  function normalizeSessionPlannerLibraryFolderExerciseIds(sourceIds = []) {
    return stateAdapter.normalizeFolderExerciseIds(sourceIds);
  }

  function createSessionPlannerLibraryFolder(source = {}) {
    return stateAdapter.createFolder(source);
  }

  function createSessionPlannerDefaultExerciseLibraryFolders() {
    return stateAdapter.createDefaultFolders();
  }

  function normalizeSessionPlannerExerciseLibraryFolders(sourceFolders = []) {
    return stateAdapter.normalizeFolders(sourceFolders);
  }

  function isSessionPlannerLibraryFolderArchived(folder = {}) {
    return stateAdapter.isFolderArchived(folder);
  }

  function parseSessionPlannerExerciseLibraryFoldersPayload(rawFolders) {
    return stateAdapter.parseFoldersPayload(rawFolders);
  }

  function readSessionPlannerExerciseLibraryFoldersFromStorage(storageKey) {
    try {
      const rawFolders = win.localStorage.getItem(storageKey);
      if (rawFolders === null) return null;
      const folders = parseSessionPlannerExerciseLibraryFoldersPayload(rawFolders);
      return folders ? { storageKey, folders } : null;
    } catch {
      return null;
    }
  }

  function createSessionPlannerExerciseLibraryFoldersBackupEnvelope(folders = []) {
    return stateAdapter.createFoldersBackupEnvelope(folders);
  }

  function writeSessionPlannerExerciseLibraryFoldersToStorage(folders = []) {
    const normalizedFolders = normalizeSessionPlannerExerciseLibraryFolders(folders);
    try {
      win.localStorage.setItem(storageKeys.folders, JSON.stringify(normalizedFolders));
    } catch (error) {
      logEvent(error?.message || "Exercise library folders could not be saved centrally.");
      return createSafeStorageResult("folders", normalizedFolders, error);
    }
    let backupSaved = true;
    try {
      win.localStorage.setItem(
        storageKeys.foldersBackup,
        JSON.stringify(createSessionPlannerExerciseLibraryFoldersBackupEnvelope(normalizedFolders))
      );
    } catch (error) {
      backupSaved = false;
      logEvent(error?.message || "Exercise library folders backup could not be saved centrally.");
    }
    saveDataSafetySnapshot?.("exercise-library-folders-save");
    return { saved: true, backupSaved, folders: normalizedFolders, error: null };
  }

  function readSessionPlannerExerciseLibraryFolders() {
    const mainFolders = readSessionPlannerExerciseLibraryFoldersFromStorage(storageKeys.folders);
    if (mainFolders) return mainFolders.folders;
    const backupFolders = readSessionPlannerExerciseLibraryFoldersFromStorage(storageKeys.foldersBackup);
    if (backupFolders) {
      writeSessionPlannerExerciseLibraryFoldersToStorage(backupFolders.folders);
      return backupFolders.folders;
    }
    return normalizeSessionPlannerExerciseLibraryFolders(createSessionPlannerDefaultExerciseLibraryFolders());
  }

  function getSessionPlannerExerciseLibraryFolders() {
    const currentFolders = getExerciseFolders();
    if (Array.isArray(currentFolders)) return currentFolders;
    const nextFolders = readSessionPlannerExerciseLibraryFolders();
    setExerciseFolders(nextFolders);
    return nextFolders;
  }

  function writeSessionPlannerExerciseLibrary() {
    const currentLibrary = getExerciseLibrary();
    if (!Array.isArray(currentLibrary)) return false;
    const result = writeSessionPlannerExerciseLibraryToStorage(currentLibrary);
    if (result.saved) setExerciseLibrary(result.exercises);
    return result.saved;
  }

  function normalizeSessionPlannerMultiValue(value) {
    return selectors.normalizeMultiValue(value);
  }

  function formatSessionPlannerMultiValue(value) {
    return selectors.formatMultiValue(value);
  }

  function normalizeSessionPlannerLibraryTags(value) {
    return stateAdapter.normalizeTags(value);
  }

  function formatSessionPlannerLibraryTags(value) {
    return normalizeSessionPlannerLibraryTags(value).join(", ");
  }

  function getSessionPlannerMultiValueSummary(value, fallback) {
    return selectors.getMultiValueSummary(value, fallback);
  }

  function getSessionPlannerMultiSelectFieldConfig(field) {
    const configs = {
      phase: { label: "Phase", listOptions: periodizationOptionLibrary.matchPhases },
      subPhase: { label: "Sub Phase", listOptions: periodizationOptionLibrary.subPhases },
    };
    return configs[field] ?? null;
  }

  function refreshSessionPlannerMultiSelectFields(fields = []) {
    const block = getSelectedBlock();
    const fieldList = Array.from(new Set((Array.isArray(fields) ? fields : [fields]).filter(Boolean)));
    if (!block || !fieldList.length) return;
    let refreshedAnyField = false;
    fieldList.forEach((field) => {
      const config = getSessionPlannerMultiSelectFieldConfig(field);
      const fieldElement = getUi().sessionPlannerWorkspace?.querySelector(`[data-session-multiselect="${field}"]`);
      if (!config || !fieldElement) return;
      fieldElement.outerHTML = options.sessionPlannerRenderer.renderMultiSelectField(block, field, config.label, {
        long: false,
        listOptions: config.listOptions,
      });
      refreshedAnyField = true;
    });
    if (!refreshedAnyField) renderWorkspace({ preserveDateStripScroll: true });
  }

  function toggleSessionPlannerMultiSelectValue(field, value) {
    if (!sessionPlannerMultiSelectFields.has(field) || !value) return;
    const block = getSelectedBlock();
    if (!block) return;
    const values = normalizeSessionPlannerMultiValue(block[field]);
    const nextValues = values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
    updateSelectedBlockField(field, nextValues.join(", "));
    setMultiSelectOpenField(field);
    refreshSessionPlannerMultiSelectFields([field]);
  }

  function clearSessionPlannerMultiSelectValue(field) {
    if (!sessionPlannerMultiSelectFields.has(field)) return;
    updateSelectedBlockField(field, "");
    setMultiSelectOpenField(field);
    refreshSessionPlannerMultiSelectFields([field]);
  }

  function normalizeSessionPlannerLibraryFilterValues(value) {
    return selectors.normalizeFilterValues(value);
  }

  function getSessionPlannerLibraryFilterValues(filterKey) {
    const current = state();
    if (filterKey === "phase") {
      return normalizeSessionPlannerLibraryFilterValues(
        current.phaseFilters.length ? current.phaseFilters : current.phaseFilter
      );
    }
    if (filterKey === "subPhase") {
      return normalizeSessionPlannerLibraryFilterValues(
        current.subPhaseFilters.length ? current.subPhaseFilters : current.subPhaseFilter
      );
    }
    return [];
  }

  function setSessionPlannerLibraryFilterValues(filterKey, values = []) {
    const normalizedValues = normalizeSessionPlannerLibraryFilterValues(values);
    if (filterKey === "phase") {
      setUiState({ phaseFilters: normalizedValues, phaseFilter: normalizedValues[0] || "all" });
    }
    if (filterKey === "subPhase") {
      setUiState({ subPhaseFilters: normalizedValues, subPhaseFilter: normalizedValues[0] || "all" });
    }
  }

  function toggleSessionPlannerLibraryFilterOpen(filterKey) {
    setUiState({ filterOpen: state().filterOpen === filterKey ? "" : filterKey });
    renderWorkspace({ preserveDateStripScroll: true });
  }

  function toggleSessionPlannerLibraryFilterValue(filterKey, value) {
    const cleanValue = String(value || "").trim();
    if (!cleanValue) return;
    const currentValues = getSessionPlannerLibraryFilterValues(filterKey);
    const nextValues = currentValues.includes(cleanValue)
      ? currentValues.filter((item) => item !== cleanValue)
      : [...currentValues, cleanValue];
    setSessionPlannerLibraryFilterValues(filterKey, nextValues);
    setUiState({ filterOpen: filterKey, editExerciseId: "" });
    renderWorkspace({ preserveDateStripScroll: true });
  }

  function clearSessionPlannerLibraryFilter(filterKey) {
    setSessionPlannerLibraryFilterValues(filterKey, []);
    setUiState({ filterOpen: filterKey, editExerciseId: "" });
    renderWorkspace({ preserveDateStripScroll: true });
  }

  function exerciseMatchesSessionPlannerLibraryFilterValue(exerciseValue, selectedValues = []) {
    return selectors.exerciseMatchesFilterValue(exerciseValue, selectedValues);
  }

  function getSessionPlannerVisibleLibraryFolders() {
    return getSessionPlannerExerciseLibraryFolders()
      .filter((folder) => !isSessionPlannerLibraryFolderArchived(folder))
      .sort((a, b) => a.visibility.localeCompare(b.visibility) || a.name.localeCompare(b.name));
  }

  function getSessionPlannerArchivedLibraryFolders() {
    return getSessionPlannerExerciseLibraryFolders()
      .filter((folder) => isSessionPlannerLibraryFolderArchived(folder))
      .sort((a, b) => String(b.archivedAt || "").localeCompare(String(a.archivedAt || "")) || a.name.localeCompare(b.name));
  }

  function getSessionPlannerLibraryFolderById(folderId) {
    const targetId = String(folderId || "").trim();
    if (!targetId) return null;
    return getSessionPlannerExerciseLibraryFolders().find((folder) => folder.id === targetId) || null;
  }

  function getSessionPlannerLibraryFolderExerciseIdSet(folderId = state().selectedFolderId) {
    const targetFolderId = String(folderId || "all");
    const currentUserId = getLibraryUserId();
    const visibleFolders = getSessionPlannerVisibleLibraryFolders();
    if (targetFolderId === "all") return null;
    if (targetFolderId === "team") {
      return new Set(
        visibleFolders
          .filter((folder) => folder.visibility === "team")
          .flatMap((folder) => normalizeSessionPlannerLibraryFolderExerciseIds(folder.exerciseIds))
      );
    }
    if (targetFolderId === "mine") {
      return new Set(
        visibleFolders
          .filter((folder) => folder.visibility === "personal" && (!folder.createdBy || folder.createdBy === currentUserId))
          .flatMap((folder) => normalizeSessionPlannerLibraryFolderExerciseIds(folder.exerciseIds))
      );
    }
    return new Set(normalizeSessionPlannerLibraryFolderExerciseIds(getSessionPlannerLibraryFolderById(targetFolderId)?.exerciseIds));
  }

  function exerciseMatchesSessionPlannerLibraryFolder(exercise = {}) {
    const folderExerciseIds = getSessionPlannerLibraryFolderExerciseIdSet();
    return !folderExerciseIds || folderExerciseIds.has(exercise.id);
  }

  function getSessionPlannerLibraryFolderCount(folderId, archiveView = state().archiveView) {
    const folderExerciseIds = getSessionPlannerLibraryFolderExerciseIdSet(folderId);
    return getSessionPlannerLibraryExercisesByArchiveState(archiveView).filter(
      (exercise) => !folderExerciseIds || folderExerciseIds.has(exercise.id)
    ).length;
  }

  function getSessionPlannerLibraryFolderName(folderId = state().selectedFolderId) {
    if (folderId === "all") return "All Exercises";
    if (folderId === "team") return "Team";
    if (folderId === "mine") return "Mine";
    return getSessionPlannerLibraryFolderById(folderId)?.name || "Folder";
  }

  function normalizeSessionPlannerLibraryTitle(title = "") {
    return String(title || "").trim().replace(/\s+/g, " ").toLowerCase();
  }

  function getUniqueSessionPlannerLibraryFolderName(baseName = "Untitled Folder", excludeFolderId = "") {
    const cleanBaseName = String(baseName || "Untitled Folder").trim().replace(/\s+/g, " ") || "Untitled Folder";
    const existingFolderNames = new Set(
      getSessionPlannerExerciseLibraryFolders()
        .filter((folder) => folder.id !== excludeFolderId && !isSessionPlannerLibraryFolderArchived(folder))
        .map((folder) => normalizeSessionPlannerLibraryTitle(folder.name))
        .filter(Boolean)
    );
    let candidate = cleanBaseName;
    let suffix = 2;
    while (existingFolderNames.has(normalizeSessionPlannerLibraryTitle(candidate))) {
      candidate = `${cleanBaseName} ${suffix}`;
      suffix += 1;
    }
    return candidate;
  }

  function selectSessionPlannerLibraryFolder(folderId = "all") {
    const normalizedFolderId = String(folderId || "all").trim() || "all";
    const isVirtualFolder = ["all", "team", "mine"].includes(normalizedFolderId);
    const targetFolder = getSessionPlannerLibraryFolderById(normalizedFolderId);
    setUiState({
      selectedFolderId: isVirtualFolder || (targetFolder && !isSessionPlannerLibraryFolderArchived(targetFolder))
        ? normalizedFolderId
        : "all",
      editExerciseId: "",
      editingFolderId: "",
      filterOpen: "",
    });
    renderWorkspace({ preserveDateStripScroll: true });
  }

  function getSessionPlannerLibraryOptionValues(key) {
    const values = getSessionPlannerLibraryExercisesByArchiveState()
      .flatMap((exercise) => normalizeSessionPlannerMultiValue(exercise[key]))
      .filter(Boolean);
    return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
  }

  function normalizeSessionPlannerLibrarySortMode(value) {
    return selectors.normalizeSortMode(value);
  }

  function compareSessionPlannerLibraryExercises(a = {}, b = {}) {
    return selectors.compareExercises(a, b, state().sortMode);
  }

  function getFilteredSessionPlannerExerciseLibrary() {
    const current = state();
    const phaseFilters = getSessionPlannerLibraryFilterValues("phase");
    const subPhaseFilters = getSessionPlannerLibraryFilterValues("subPhase");
    const searchQuery = String(current.searchQuery || "").trim().toLowerCase();
    return getSessionPlannerLibraryExercisesByArchiveState()
      .filter((exercise) => {
        const searchableText = [
          exercise.title,
          exercise.focus,
          exercise.objective,
          exercise.phase,
          exercise.subPhase,
          formatSessionPlannerLibraryTags(exercise.tags),
          getReviewNotes(exercise).map((note) => note.notes).join(" "),
        ].filter(Boolean).join(" ").toLowerCase();
        return exerciseMatchesSessionPlannerLibraryFolder(exercise)
          && exerciseMatchesSessionPlannerLibraryFilterValue(exercise.phase, phaseFilters)
          && exerciseMatchesSessionPlannerLibraryFilterValue(exercise.subPhase, subPhaseFilters)
          && (!searchQuery || searchableText.includes(searchQuery));
      })
      .sort(compareSessionPlannerLibraryExercises);
  }

  function updateSessionPlannerLibraryFilter(filterKey, value) {
    setSessionPlannerLibraryFilterValues(filterKey, normalizeSessionPlannerLibraryFilterValues(value));
    setUiState({ editExerciseId: "" });
    renderWorkspace({ preserveDateStripScroll: true });
  }

  function updateSessionPlannerLibraryArchiveView(value) {
    setUiState({ archiveView: value === "archived" ? "archived" : "active", filterOpen: "", editExerciseId: "" });
    renderWorkspace({ preserveDateStripScroll: true });
  }

  function updateSessionPlannerLibrarySortMode(value) {
    setUiState({
      sortMode: normalizeSessionPlannerLibrarySortMode(value),
      filterOpen: "",
      editExerciseId: "",
      viewExerciseId: "",
    });
    renderWorkspace({ preserveDateStripScroll: true });
  }

  function renderSessionPlannerLibraryResults() {
    renderer().renderResults?.(getUi().sessionPlannerWorkspace);
  }

  function updateSessionPlannerLibrarySearch(value) {
    setUiState({ searchQuery: String(value || ""), editExerciseId: "", viewExerciseId: "" });
    renderSessionPlannerLibraryResults();
  }

  function getSessionPlannerLibraryExerciseById(exerciseId) {
    const targetId = String(exerciseId || "").trim();
    if (!targetId) return null;
    return getSessionPlannerExerciseLibrary().find((exercise) => exercise.id === targetId) || null;
  }

  function getSessionPlannerLibraryEditExercise() {
    const currentId = state().editExerciseId;
    if (!currentId) return null;
    const exercise = getSessionPlannerLibraryExerciseById(currentId);
    if (!exercise || isSessionPlannerLibraryExerciseArchived(exercise)) {
      setUiState({ editExerciseId: "" });
      return null;
    }
    return exercise;
  }

  function getSessionPlannerLibraryViewExercise() {
    const currentId = state().viewExerciseId;
    if (!currentId) return null;
    const exercise = getSessionPlannerLibraryExerciseById(currentId);
    if (!exercise) {
      setUiState({ viewExerciseId: "" });
      return null;
    }
    return exercise;
  }

  function startSessionPlannerLibraryExerciseView(exerciseId) {
    const exercise = getSessionPlannerLibraryExerciseById(exerciseId);
    if (!exercise) return;
    setUiState({ viewExerciseId: exercise.id, editExerciseId: "", filterOpen: "" });
    renderWorkspace({ preserveDateStripScroll: true });
  }

  function closeSessionPlannerLibraryExerciseView() {
    setUiState({ viewExerciseId: "" });
    renderWorkspace({ preserveDateStripScroll: true });
  }

  function startSessionPlannerLibraryExerciseEdit(exerciseId) {
    if (!canEdit()) return;
    const exercise = getSessionPlannerLibraryExerciseById(exerciseId);
    if (!exercise) return;
    if (isSessionPlannerLibraryExerciseArchived(exercise)) {
      showToast("Restore the exercise before editing it.", "warning");
      return;
    }
    setUiState({ editExerciseId: exercise.id, viewExerciseId: "", filterOpen: "" });
    renderWorkspace({ preserveDateStripScroll: true });
  }

  async function cancelSessionPlannerLibraryExerciseEdit() {
    const exercise = getSessionPlannerLibraryExerciseById(state().editExerciseId);
    if (
      exercise &&
      hasSessionPlannerLibraryExerciseEditChanges(exercise) &&
      !(await confirmPlatformAction({
        eyebrow: "Exercise Library",
        title: "Discard edits?",
        message: "Discard unsaved exercise edits?",
        confirmLabel: "Discard",
        tone: "warning",
        win,
      }))
    ) {
      return;
    }
    setUiState({ editExerciseId: "", viewExerciseId: "" });
    renderSessionPlannerLibraryResults();
  }

  function getSessionPlannerLibraryExerciseEditFields() {
    const fields = {};
    getUi().sessionPlannerWorkspace?.querySelectorAll("[data-session-library-edit-field]").forEach((field) => {
      const key = field.dataset.sessionLibraryEditField;
      if (key) fields[key] = field.value ?? "";
    });
    return fields;
  }

  function hasSessionPlannerLibraryExerciseEditChanges(exercise = {}, editFields = getSessionPlannerLibraryExerciseEditFields()) {
    return actions().hasExerciseEditChanges?.(exercise, editFields);
  }

  return {
    addSessionPlannerExerciseToLibraryFolder: (exerciseId, folderId) => actions().addExerciseToFolder?.(exerciseId, folderId),
    appendSessionPlannerLibraryVersion,
    archiveSessionPlannerExerciseLibraryFolder: (folderId) => actions().archiveFolder?.(folderId),
    cancelSessionPlannerExerciseLibraryFolderEdit: () => actions().cancelFolderEdit?.(),
    cancelSessionPlannerLibraryExerciseEdit,
    clearSessionPlannerLibraryFilter,
    clearSessionPlannerMultiSelectValue,
    cloneSessionPlannerLibraryExercise,
    closeSessionPlannerLibraryExerciseView,
    compareSessionPlannerLibraryExercises,
    createSessionPlannerDefaultExerciseLibraryFolders,
    createSessionPlannerExerciseLibraryBackupEnvelope,
    createSessionPlannerExerciseLibraryFoldersBackupEnvelope,
    createSessionPlannerExerciseLibraryFolderFromForm: (form) => actions().createFolderFromForm?.(form),
    createSessionPlannerLibraryExercise,
    createSessionPlannerLibraryFolder,
    createSessionPlannerLibraryVersionSnapshot,
    duplicateSessionPlannerLibraryExercise: (exerciseId) => actions().duplicateExercise?.(exerciseId),
    exerciseMatchesSessionPlannerLibraryFilterValue,
    exerciseMatchesSessionPlannerLibraryFolder,
    findSessionPlannerExerciseLibraryInSnapshots,
    formatSessionPlannerLibraryTags,
    formatSessionPlannerMultiValue,
    getFilteredSessionPlannerExerciseLibrary,
    getSessionPlannerActiveExerciseLibrary,
    getSessionPlannerArchivedLibraryFolders,
    getSessionPlannerExerciseLibrary,
    getSessionPlannerExerciseLibraryFolders,
    getSessionPlannerLibraryArchiveCounts,
    getSessionPlannerLibraryEditExercise,
    getSessionPlannerLibraryExerciseById,
    getSessionPlannerLibraryExerciseEditFields,
    getSessionPlannerLibraryExercisesByArchiveState,
    getSessionPlannerLibraryFilterValues,
    getSessionPlannerLibraryFolderById,
    getSessionPlannerLibraryFolderCount,
    getSessionPlannerLibraryFolderExerciseIdSet,
    getSessionPlannerLibraryFolderName,
    getSessionPlannerLibraryOptionValues,
    getSessionPlannerLibraryViewExercise,
    getSessionPlannerMultiSelectFieldConfig,
    getSessionPlannerMultiValueSummary,
    getSessionPlannerVisibleLibraryFolders,
    getUniqueSessionPlannerLibraryFolderName,
    hasSessionPlannerLibraryExerciseEditChanges,
    isSessionPlannerLibraryExerciseArchived,
    isSessionPlannerLibraryFolderArchived,
    normalizeSessionPlannerExerciseLibraryFolders,
    normalizeSessionPlannerExerciseLibraryList,
    normalizeSessionPlannerLibraryFilterValues,
    normalizeSessionPlannerLibraryFolderExerciseIds,
    normalizeSessionPlannerLibraryFolderVisibility,
    normalizeSessionPlannerLibrarySortMode,
    normalizeSessionPlannerLibraryTags,
    normalizeSessionPlannerLibraryTitle,
    normalizeSessionPlannerLibraryVersions,
    normalizeSessionPlannerMultiValue,
    parseSessionPlannerExerciseLibraryFoldersPayload,
    parseSessionPlannerExerciseLibraryPayload,
    queueSessionPlannerExerciseLibrarySnapshotRecovery,
    readSessionPlannerExerciseLibrary,
    readSessionPlannerExerciseLibraryFolders,
    readSessionPlannerExerciseLibraryFoldersFromStorage,
    readSessionPlannerExerciseLibraryFromStorage,
    refreshSessionPlannerMultiSelectFields,
    removeSessionPlannerExerciseFromLibraryFolder: (exerciseId, folderId = state().selectedFolderId) =>
      actions().removeExerciseFromFolder?.(exerciseId, folderId),
    renderSessionPlannerLibraryResults,
    restoreSessionPlannerExerciseLibraryFolder: (folderId) => actions().restoreFolder?.(folderId),
    saveSessionPlannerLibraryExerciseEditAsCopy: (exerciseId) => actions().saveExerciseEditAsCopy?.(exerciseId),
    selectSessionPlannerLibraryFolder,
    setSessionPlannerLibraryFilterValues,
    startSessionPlannerExerciseLibraryFolderEdit: (folderId) => actions().startFolderEdit?.(folderId),
    startSessionPlannerLibraryExerciseEdit,
    startSessionPlannerLibraryExerciseView,
    toggleSessionPlannerLibraryFilterOpen,
    toggleSessionPlannerLibraryFilterValue,
    toggleSessionPlannerMultiSelectValue,
    updateSessionPlannerExerciseLibraryFolderFromForm: (form) => actions().updateFolderFromForm?.(form),
    updateSessionPlannerLibraryArchiveView,
    updateSessionPlannerLibraryExerciseFromEdit: (exerciseId) => actions().updateExerciseFromEdit?.(exerciseId),
    updateSessionPlannerLibraryFilter,
    updateSessionPlannerLibrarySearch,
    updateSessionPlannerLibrarySortMode,
    writeSessionPlannerExerciseLibrary,
    writeSessionPlannerExerciseLibraryFoldersToStorage,
    writeSessionPlannerExerciseLibraryToStorage,
  };
}
