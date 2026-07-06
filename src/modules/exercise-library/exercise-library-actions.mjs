function defaultNoop() {}

function defaultWriteExercises(exercises = []) {
  return { saved: true, backupSaved: true, exercises };
}

function defaultWriteFolders(folders = []) {
  return { saved: true, backupSaved: true, folders };
}

function defaultCreateFolder(source = {}) {
  return { ...source };
}

function defaultCloneExercise(exercise = {}) {
  return JSON.parse(JSON.stringify(exercise || {}));
}

function defaultNormalizeTitle(title = "") {
  return String(title || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function defaultNormalizeMultiValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  return String(value || "")
    .split(/[,;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function defaultFormatMultiValue(value) {
  return defaultNormalizeMultiValue(value).join(", ");
}

function defaultNormalizeTags(value) {
  return defaultNormalizeMultiValue(value);
}

function defaultClamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function defaultGetUiState() {
  return {
    selectedFolderId: "all",
    editExerciseId: "",
    archiveView: "active",
    filterOpen: "",
    pendingSave: null,
  };
}

export function createExerciseLibraryActions(options = {}) {
  const canEdit = typeof options.canEdit === "function" ? options.canEdit : () => false;
  const confirmAction = typeof options.confirm === "function" ? options.confirm : () => true;
  const showToast = typeof options.showToast === "function" ? options.showToast : defaultNoop;
  const renderWorkspace = typeof options.renderWorkspace === "function" ? options.renderWorkspace : defaultNoop;
  const renderResults = typeof options.renderResults === "function" ? options.renderResults : defaultNoop;
  const getNow = typeof options.getNow === "function" ? options.getNow : () => new Date().toISOString();
  const getUserId = typeof options.getUserId === "function" ? options.getUserId : () => "";
  const createStableId =
    typeof options.createStableId === "function" ? options.createStableId : (prefix = "item") => `${prefix}-${Date.now()}`;
  const createFolder = typeof options.createFolder === "function" ? options.createFolder : defaultCreateFolder;
  const normalizeFolderVisibility =
    typeof options.normalizeFolderVisibility === "function" ? options.normalizeFolderVisibility : (value) => value || "team";
  const normalizeFolderExerciseIds =
    typeof options.normalizeFolderExerciseIds === "function" ? options.normalizeFolderExerciseIds : defaultNormalizeMultiValue;
  const isFolderArchived = typeof options.isFolderArchived === "function" ? options.isFolderArchived : () => false;
  const isExerciseArchived = typeof options.isExerciseArchived === "function" ? options.isExerciseArchived : () => false;
  const normalizeTitle = typeof options.normalizeTitle === "function" ? options.normalizeTitle : defaultNormalizeTitle;
  const normalizeMultiValue =
    typeof options.normalizeMultiValue === "function" ? options.normalizeMultiValue : defaultNormalizeMultiValue;
  const formatMultiValue = typeof options.formatMultiValue === "function" ? options.formatMultiValue : defaultFormatMultiValue;
  const normalizeTags = typeof options.normalizeTags === "function" ? options.normalizeTags : defaultNormalizeTags;
  const clamp = typeof options.clamp === "function" ? options.clamp : defaultClamp;
  const cloneExercise = typeof options.cloneExercise === "function" ? options.cloneExercise : defaultCloneExercise;
  const createVersionSnapshot =
    typeof options.createVersionSnapshot === "function" ? options.createVersionSnapshot : (exercise) => cloneExercise(exercise);
  const appendVersion =
    typeof options.appendVersion === "function" ? options.appendVersion : (exercise) => [createVersionSnapshot(exercise)];
  const normalizeVersions =
    typeof options.normalizeVersions === "function" ? options.normalizeVersions : (versions = []) => (Array.isArray(versions) ? versions : []);
  const getExercises = typeof options.getExercises === "function" ? options.getExercises : () => [];
  const setExercises = typeof options.setExercises === "function" ? options.setExercises : defaultNoop;
  const writeExercises = typeof options.writeExercises === "function" ? options.writeExercises : defaultWriteExercises;
  const getFolders = typeof options.getFolders === "function" ? options.getFolders : () => [];
  const setFolders = typeof options.setFolders === "function" ? options.setFolders : defaultNoop;
  const writeFolders = typeof options.writeFolders === "function" ? options.writeFolders : defaultWriteFolders;
  const getExerciseById = typeof options.getExerciseById === "function" ? options.getExerciseById : () => null;
  const getFolderById = typeof options.getFolderById === "function" ? options.getFolderById : () => null;
  const getUniqueFolderName =
    typeof options.getUniqueFolderName === "function" ? options.getUniqueFolderName : (name = "Untitled Folder") => name;
  const getEditFields = typeof options.getEditFields === "function" ? options.getEditFields : () => ({});
  const syncSelectedBlockFields =
    typeof options.syncSelectedBlockFields === "function" ? options.syncSelectedBlockFields : defaultNoop;
  const getSelectedBlock = typeof options.getSelectedBlock === "function" ? options.getSelectedBlock : () => null;
  const buildExerciseFromBlock = typeof options.buildExerciseFromBlock === "function" ? options.buildExerciseFromBlock : () => null;
  const getUiState = typeof options.getUiState === "function" ? options.getUiState : defaultGetUiState;
  const setUiState = typeof options.setUiState === "function" ? options.setUiState : defaultNoop;

  function rerenderWorkspace() {
    renderWorkspace({ preserveDateStripScroll: true });
  }

  function getUniqueTitle(baseTitle = "Untitled Exercise", excludeExerciseId = "") {
    const cleanBaseTitle = String(baseTitle || "Untitled Exercise").trim() || "Untitled Exercise";
    const existingTitles = new Set(
      getExercises()
        .filter((exercise) => exercise.id !== excludeExerciseId)
        .map((exercise) => normalizeTitle(exercise.title))
        .filter(Boolean)
    );
    let candidate = cleanBaseTitle;
    let suffix = 2;
    while (existingTitles.has(normalizeTitle(candidate))) {
      candidate = `${cleanBaseTitle} ${suffix}`;
      suffix += 1;
    }
    return candidate;
  }

  function findExerciseIndexByTitle(title = "", options = {}) {
    const normalizedTitle = normalizeTitle(title);
    if (!normalizedTitle) {
      return -1;
    }
    const includeArchived = options.includeArchived ?? false;
    return getExercises().findIndex(
      (item) => (includeArchived || !isExerciseArchived(item)) && normalizeTitle(item.title) === normalizedTitle
    );
  }

  function startFolderEdit(folderId) {
    if (!canEdit()) {
      return;
    }
    const folder = getFolderById(folderId);
    if (!folder || isFolderArchived(folder)) {
      return;
    }
    setUiState({ editingFolderId: folder.id });
    rerenderWorkspace();
  }

  function cancelFolderEdit() {
    setUiState({ editingFolderId: "" });
    rerenderWorkspace();
  }

  function createFolderFromForm(form) {
    if (!canEdit() || !form) {
      return;
    }
    const nameField = form.querySelector("[data-session-library-folder-name]");
    const visibilityField = form.querySelector("[data-session-library-folder-visibility]");
    const folderName = String(nameField?.value || "").trim().replace(/\s+/g, " ");
    if (!folderName) {
      showToast("Add a folder name first.", "warning");
      return;
    }
    const folders = getFolders();
    const folderNameExists = folders.some(
      (folder) => !isFolderArchived(folder) && normalizeTitle(folder.name) === normalizeTitle(folderName)
    );
    if (folderNameExists) {
      showToast("A folder with that name already exists.", "warning");
      return;
    }
    const now = getNow();
    const currentUserId = getUserId();
    const newFolder = createFolder({
      id: createStableId("folder"),
      name: folderName,
      visibility: normalizeFolderVisibility(visibilityField?.value),
      exerciseIds: [],
      createdAt: now,
      createdBy: currentUserId,
      updatedAt: now,
      updatedBy: currentUserId,
      source: "user",
    });
    const writeResult = writeFolders([newFolder, ...folders]);
    if (!writeResult.saved) {
      showToast("The folder could not be saved. No exercises were changed.", "error");
      return;
    }
    setFolders(writeResult.folders);
    setUiState({
      selectedFolderId: newFolder.id,
      editExerciseId: "",
    });
    rerenderWorkspace();
    showToast(
      writeResult.backupSaved
        ? `Created folder: "${newFolder.name}".`
        : `Created folder: "${newFolder.name}". Backup could not be updated.`,
      writeResult.backupSaved ? "success" : "warning"
    );
  }

  function updateFolderFromForm(form) {
    if (!canEdit() || !form) {
      return;
    }
    const folder = getFolderById(form.dataset.sessionLibraryFolderEditForm);
    if (!folder || isFolderArchived(folder)) {
      return;
    }
    const nameField = form.querySelector("[data-session-library-folder-edit-name]");
    const visibilityField = form.querySelector("[data-session-library-folder-edit-visibility]");
    const folderName = String(nameField?.value || "").trim().replace(/\s+/g, " ");
    if (!folderName) {
      showToast("Folder name cannot be empty.", "warning");
      return;
    }
    const folderNameExists = getFolders().some(
      (item) => item.id !== folder.id && !isFolderArchived(item) && normalizeTitle(item.name) === normalizeTitle(folderName)
    );
    if (folderNameExists) {
      showToast("A folder with that name already exists.", "warning");
      return;
    }
    const now = getNow();
    const currentUserId = getUserId();
    const nextFolder = createFolder({
      ...folder,
      name: folderName,
      visibility: normalizeFolderVisibility(visibilityField?.value),
      updatedAt: now,
      updatedBy: currentUserId,
    });
    const writeResult = writeFolders(getFolders().map((item) => (item.id === folder.id ? nextFolder : item)));
    if (!writeResult.saved) {
      showToast("The folder could not be updated. Exercises were not changed.", "error");
      return;
    }
    setFolders(writeResult.folders);
    setUiState({
      selectedFolderId: nextFolder.id,
      editingFolderId: "",
    });
    rerenderWorkspace();
    showToast(
      writeResult.backupSaved
        ? `Updated folder: "${nextFolder.name}".`
        : `Updated folder: "${nextFolder.name}". Backup could not be updated.`,
      writeResult.backupSaved ? "success" : "warning"
    );
  }

  async function archiveFolder(folderId) {
    if (!canEdit()) {
      return;
    }
    const folder = getFolderById(folderId);
    if (!folder || isFolderArchived(folder)) {
      return;
    }
    const shouldArchive = await Promise.resolve(confirmAction({
      eyebrow: "Exercise Library",
      title: "Archive folder?",
      message: `Archive folder "${folder.name}"?\n\nExercises inside it will stay in the library and remain available from All Exercises.`,
      confirmLabel: "Archive",
      tone: "warning",
    }));
    if (!shouldArchive) {
      return;
    }
    const now = getNow();
    const currentUserId = getUserId();
    const writeResult = writeFolders(
      getFolders().map((item) =>
        item.id === folder.id
          ? {
              ...item,
              archivedAt: now,
              archivedBy: currentUserId,
              updatedAt: now,
              updatedBy: currentUserId,
            }
          : item
      )
    );
    if (!writeResult.saved) {
      showToast("The folder could not be archived. Exercises were not changed.", "error");
      return;
    }
    const uiState = getUiState();
    setFolders(writeResult.folders);
    setUiState({
      selectedFolderId: uiState.selectedFolderId === folder.id ? "all" : uiState.selectedFolderId,
      editExerciseId: "",
      editingFolderId: "",
    });
    rerenderWorkspace();
    showToast(`Archived folder: "${folder.name}". Exercises stayed saved.`);
  }

  function restoreFolder(folderId) {
    if (!canEdit()) {
      return;
    }
    const folder = getFolderById(folderId);
    if (!folder || !isFolderArchived(folder)) {
      return;
    }
    const now = getNow();
    const currentUserId = getUserId();
    const restoredName = getUniqueFolderName(folder.name, folder.id);
    const writeResult = writeFolders(
      getFolders().map((item) =>
        item.id === folder.id
          ? {
              ...item,
              name: restoredName,
              archivedAt: "",
              archivedBy: "",
              updatedAt: now,
              updatedBy: currentUserId,
            }
          : item
      )
    );
    if (!writeResult.saved) {
      showToast("The folder could not be restored. Exercises were not changed.", "error");
      return;
    }
    setFolders(writeResult.folders);
    setUiState({
      selectedFolderId: folder.id,
      editExerciseId: "",
      editingFolderId: "",
    });
    rerenderWorkspace();
    showToast(
      writeResult.backupSaved
        ? `Restored folder: "${restoredName}".`
        : `Restored folder: "${restoredName}". Backup could not be updated.`,
      writeResult.backupSaved ? "success" : "warning"
    );
  }

  function addExerciseToFolder(exerciseId, folderId) {
    if (!canEdit()) {
      return;
    }
    const exercise = getExerciseById(exerciseId);
    const folder = getFolderById(folderId);
    if (!exercise || !folder || isFolderArchived(folder)) {
      return;
    }
    if (isExerciseArchived(exercise)) {
      showToast("Restore the exercise before placing it in a folder.", "warning");
      return;
    }
    const existingExerciseIds = normalizeFolderExerciseIds(folder.exerciseIds);
    if (existingExerciseIds.includes(exercise.id)) {
      setUiState({ selectedFolderId: folder.id });
      rerenderWorkspace();
      showToast(`"${exercise.title || "Exercise"}" is already in "${folder.name}".`, "warning");
      return;
    }
    const now = getNow();
    const currentUserId = getUserId();
    const writeResult = writeFolders(
      getFolders().map((item) =>
        item.id === folder.id
          ? {
              ...item,
              exerciseIds: [...existingExerciseIds, exercise.id],
              updatedAt: now,
              updatedBy: currentUserId,
            }
          : item
      )
    );
    if (!writeResult.saved) {
      showToast("The folder could not be updated. The exercise stayed unchanged.", "error");
      return;
    }
    setFolders(writeResult.folders);
    setUiState({
      selectedFolderId: folder.id,
      editExerciseId: "",
    });
    rerenderWorkspace();
    showToast(
      writeResult.backupSaved
        ? `Added "${exercise.title || "Exercise"}" to "${folder.name}".`
        : `Added "${exercise.title || "Exercise"}" to "${folder.name}". Backup could not be updated.`,
      writeResult.backupSaved ? "success" : "warning"
    );
  }

  function removeExerciseFromFolder(exerciseId, folderId = getUiState().selectedFolderId) {
    if (!canEdit()) {
      return;
    }
    const exercise = getExerciseById(exerciseId);
    const folder = getFolderById(folderId);
    if (!exercise || !folder || isFolderArchived(folder)) {
      return;
    }
    const existingExerciseIds = normalizeFolderExerciseIds(folder.exerciseIds);
    if (!existingExerciseIds.includes(exercise.id)) {
      showToast(`"${exercise.title || "Exercise"}" is not in "${folder.name}".`, "warning");
      return;
    }
    const now = getNow();
    const currentUserId = getUserId();
    const writeResult = writeFolders(
      getFolders().map((item) =>
        item.id === folder.id
          ? {
              ...item,
              exerciseIds: existingExerciseIds.filter((itemExerciseId) => itemExerciseId !== exercise.id),
              updatedAt: now,
              updatedBy: currentUserId,
            }
          : item
      )
    );
    if (!writeResult.saved) {
      showToast("The folder could not be updated. The exercise stayed in place.", "error");
      return;
    }
    setFolders(writeResult.folders);
    setUiState({ editExerciseId: "" });
    rerenderWorkspace();
    showToast(
      writeResult.backupSaved
        ? `Removed "${exercise.title || "Exercise"}" from "${folder.name}".`
        : `Removed "${exercise.title || "Exercise"}" from "${folder.name}". Backup could not be updated.`,
      writeResult.backupSaved ? "success" : "warning"
    );
  }

  function getExerciseEditSnapshot(source = {}) {
    return {
      title: String(source.title || "").trim() || "Untitled Exercise",
      focus: String(source.focus || "").trim(),
      phase: formatMultiValue(source.phase),
      subPhase: formatMultiValue(source.subPhase),
      tags: normalizeTags(source.tags),
      minutes: Number.isFinite(Number(source.minutes)) ? Math.max(0, Number(source.minutes)) : 0,
      time: String(source.time || "").trim(),
      intensity: Number.isFinite(Number(source.intensity)) ? clamp(Number(source.intensity), 1, 5) : 3,
      pitchSize: String(source.pitchSize || "").trim(),
      material: String(source.material || "").trim(),
      objective: String(source.objective || "").trim(),
      why: String(source.why || "").trim(),
      organization: String(source.organization || "").trim(),
      principles: String(source.principles || "").trim(),
    };
  }

  function getExerciseComparableSnapshot(exercise = {}) {
    return getExerciseEditSnapshot({
      title: exercise.title,
      focus: exercise.focus,
      phase: exercise.phase,
      subPhase: exercise.subPhase,
      tags: exercise.tags,
      minutes: exercise.minutes,
      time: exercise.time,
      intensity: exercise.intensity,
      pitchSize: exercise.pitchSize,
      material: exercise.material,
      objective: exercise.objective,
      why: exercise.why,
      organization: exercise.organization,
      principles: exercise.principles,
    });
  }

  function hasExerciseEditChanges(exercise = {}, editFields = getEditFields()) {
    return JSON.stringify(getExerciseComparableSnapshot(exercise)) !== JSON.stringify(getExerciseEditSnapshot(editFields));
  }

  function duplicateExercise(exerciseId) {
    if (!canEdit()) {
      return;
    }
    const exercise = getExerciseById(exerciseId);
    if (!exercise) {
      return;
    }
    if (isExerciseArchived(exercise)) {
      showToast("Restore the exercise before duplicating it.", "warning");
      return;
    }
    const now = getNow();
    const currentUserId = getUserId();
    const duplicateTitle = getUniqueTitle(`${exercise.title || "Untitled Exercise"} Copy`);
    const duplicate = cloneExercise({
      ...exercise,
      id: createStableId("exercise"),
      title: duplicateTitle,
      createdAt: now,
      createdBy: currentUserId,
      updatedAt: now,
      updatedBy: currentUserId,
      archivedAt: "",
      archivedBy: "",
      source: "duplicate",
      versions: [createVersionSnapshot(exercise, "Duplicated from original")],
    });
    const library = getExercises().map(cloneExercise);
    const writeResult = writeExercises([duplicate, ...library]);
    if (!writeResult.saved) {
      showToast("The duplicate could not be saved. The library was not changed.", "error");
      return;
    }
    setExercises(writeResult.exercises);
    setUiState({
      editExerciseId: "",
      archiveView: "active",
      filterOpen: "",
    });
    rerenderWorkspace();
    showToast(
      writeResult.backupSaved
        ? `Duplicated and saved: "${duplicate.title}".`
        : `Duplicated and saved: "${duplicate.title}". Backup could not be updated.`,
      writeResult.backupSaved ? "success" : "warning"
    );
  }

  function updateExerciseFromEdit(exerciseId) {
    if (!canEdit()) {
      return;
    }
    const exercise = getExerciseById(exerciseId);
    if (!exercise || isExerciseArchived(exercise)) {
      return;
    }
    const editFields = getEditFields();
    const nextSnapshot = getExerciseEditSnapshot(editFields);
    const nextTitle = nextSnapshot.title || "Untitled Exercise";
    const titleConflict = getExercises().some(
      (item) => item.id !== exercise.id && normalizeTitle(item.title) === normalizeTitle(nextTitle)
    );
    if (titleConflict) {
      showToast("Another library exercise already uses that title.", "warning");
      return;
    }
    if (!hasExerciseEditChanges(exercise, editFields)) {
      setUiState({ editExerciseId: "" });
      renderResults();
      showToast("No library changes to save.", "warning");
      return;
    }
    const now = getNow();
    const currentUserId = getUserId();
    const nextExercise = cloneExercise({
      ...exercise,
      ...nextSnapshot,
      updatedAt: now,
      updatedBy: currentUserId,
      versions: appendVersion(exercise, "Edited"),
    });
    const writeResult = writeExercises(getExercises().map((item) => (item.id === exercise.id ? nextExercise : item)));
    if (!writeResult.saved) {
      showToast("The edit could not be saved. The original exercise stayed intact.", "error");
      return;
    }
    setExercises(writeResult.exercises);
    setUiState({ editExerciseId: "" });
    rerenderWorkspace();
    showToast(
      writeResult.backupSaved
        ? `Updated in library: "${nextExercise.title}".`
        : `Updated in library: "${nextExercise.title}". Backup could not be updated.`,
      writeResult.backupSaved ? "success" : "warning"
    );
  }

  function saveExerciseEditAsCopy(exerciseId) {
    if (!canEdit()) {
      return;
    }
    const exercise = getExerciseById(exerciseId);
    if (!exercise || isExerciseArchived(exercise)) {
      return;
    }
    const nextSnapshot = getExerciseEditSnapshot(getEditFields());
    const requestedTitle = nextSnapshot.title || exercise.title || "Untitled Exercise";
    const copyTitle = getUniqueTitle(
      normalizeTitle(requestedTitle) === normalizeTitle(exercise.title) ? `${requestedTitle} Copy` : requestedTitle
    );
    const now = getNow();
    const currentUserId = getUserId();
    const copiedExercise = cloneExercise({
      ...exercise,
      ...nextSnapshot,
      id: createStableId("exercise"),
      title: copyTitle,
      createdAt: now,
      createdBy: currentUserId,
      updatedAt: now,
      updatedBy: currentUserId,
      archivedAt: "",
      archivedBy: "",
      source: "edited-copy",
      versions: [createVersionSnapshot(exercise, "Copied before edit")],
    });
    const writeResult = writeExercises([copiedExercise, ...getExercises()]);
    if (!writeResult.saved) {
      showToast("The copy could not be saved. The original exercise stayed intact.", "error");
      return;
    }
    setExercises(writeResult.exercises);
    setUiState({
      editExerciseId: "",
      archiveView: "active",
    });
    rerenderWorkspace();
    showToast(
      writeResult.backupSaved
        ? `Saved copy: "${copiedExercise.title}".`
        : `Saved copy: "${copiedExercise.title}". Backup could not be updated.`,
      writeResult.backupSaved ? "success" : "warning"
    );
  }

  function commitExercise(exercise, mode = "new", existingExerciseId = "") {
    if (!exercise) {
      return false;
    }
    const library = getExercises().map(cloneExercise);
    const now = getNow();
    const currentUserId = getUserId();
    const replaceIndex =
      mode === "replace"
        ? library.findIndex((item) =>
            existingExerciseId
              ? item.id === existingExerciseId
              : normalizeTitle(item.title) === normalizeTitle(exercise.title)
          )
        : -1;
    let toastMessage = `Saved to library: "${exercise.title || "Untitled Exercise"}".`;
    if (replaceIndex >= 0) {
      const existingExercise = library[replaceIndex];
      exercise.id = library[replaceIndex].id;
      library[replaceIndex] = cloneExercise({
        ...exercise,
        createdAt: existingExercise.createdAt || exercise.createdAt || now,
        createdBy: existingExercise.createdBy || exercise.createdBy || currentUserId,
        updatedAt: now,
        updatedBy: currentUserId,
        archivedAt: "",
        archivedBy: "",
        source: existingExercise.source || exercise.source || "session",
        versions: appendVersion(existingExercise, "Replaced from session"),
      });
      toastMessage = `Updated in library: "${exercise.title || "Untitled Exercise"}".`;
    } else {
      const nextExerciseTitle =
        mode === "duplicate" ? getUniqueTitle(`${exercise.title || "Untitled Exercise"} Copy`, existingExerciseId) : exercise.title;
      library.unshift(
        cloneExercise({
          ...exercise,
          title: nextExerciseTitle,
          createdAt: exercise.createdAt || now,
          createdBy: exercise.createdBy || currentUserId,
          updatedAt: now,
          updatedBy: currentUserId,
          archivedAt: "",
          archivedBy: "",
          source: exercise.source || "session",
          versions:
            mode === "duplicate"
              ? [createVersionSnapshot(exercise, "Duplicated from session")]
              : normalizeVersions(exercise.versions),
        })
      );
      if (mode === "duplicate") {
        toastMessage = `Duplicated and saved: "${nextExerciseTitle || "Untitled Exercise"}".`;
      }
    }
    const writeResult = writeExercises(library);
    if (!writeResult.saved) {
      showToast("The library could not be saved. Nothing was overwritten.", "error");
      return false;
    }
    setExercises(writeResult.exercises);
    setUiState({
      phaseFilters: normalizeMultiValue(exercise.phase),
      subPhaseFilters: normalizeMultiValue(exercise.subPhase),
      searchQuery: "",
      open: true,
      editExerciseId: "",
      filterOpen: "",
      pendingSave: null,
    });
    rerenderWorkspace();
    showToast(
      writeResult.backupSaved ? toastMessage : `${toastMessage} Backup could not be updated.`,
      writeResult.backupSaved ? "success" : "warning"
    );
    return true;
  }

  function queueSaveConflict(exercise, existingExercise) {
    setUiState({
      pendingSave: {
        exercise: cloneExercise(exercise),
        existingExerciseId: existingExercise.id,
        existingTitle: existingExercise.title || exercise.title || "Untitled Exercise",
      },
      open: false,
    });
    rerenderWorkspace();
  }

  function resolveSaveConflict(action) {
    const pendingSave = getUiState().pendingSave;
    if (!pendingSave) {
      return;
    }
    const { exercise, existingExerciseId } = pendingSave;
    if (action === "replace" || action === "duplicate") {
      commitExercise(cloneExercise(exercise), action, existingExerciseId);
      return;
    }
    setUiState({ pendingSave: null });
    rerenderWorkspace();
  }

  function saveSelectedExercise() {
    if (!canEdit()) {
      return;
    }
    syncSelectedBlockFields();
    const block = getSelectedBlock();
    if (!block) {
      return;
    }
    const exercise = buildExerciseFromBlock(block);
    const existingIndex = findExerciseIndexByTitle(exercise.title);
    if (existingIndex >= 0) {
      queueSaveConflict(exercise, getExercises()[existingIndex]);
      return;
    }
    commitExercise(exercise, "new");
  }

  async function archiveExercise(exerciseId) {
    if (!canEdit()) {
      return;
    }
    const library = getExercises();
    const exercise = library.find((item) => item.id === exerciseId);
    if (!exercise) {
      return;
    }
    if (isExerciseArchived(exercise)) {
      showToast(`"${exercise.title || "Exercise"}" is already archived.`, "warning");
      return;
    }
    const shouldArchive = await Promise.resolve(confirmAction({
      eyebrow: "Exercise Library",
      title: "Archive exercise?",
      message: `Archive "${exercise.title || "this exercise"}" from the library?\n\nIt will stay saved and can be restored from Archive.`,
      confirmLabel: "Archive",
      tone: "warning",
    }));
    if (!shouldArchive) {
      return;
    }
    const now = getNow();
    const currentUserId = getUserId();
    const writeResult = writeExercises(
      library.map((item) =>
        item.id === exerciseId
          ? {
              ...item,
              archivedAt: now,
              archivedBy: currentUserId,
              updatedAt: now,
              updatedBy: currentUserId,
            }
          : item
      )
    );
    if (!writeResult.saved) {
      showToast("The library could not be updated. The exercise stayed active.", "error");
      return;
    }
    setExercises(writeResult.exercises);
    rerenderWorkspace();
    showToast(`Archived in library: "${exercise.title || "Exercise"}".`);
  }

  function restoreExercise(exerciseId) {
    if (!canEdit()) {
      return;
    }
    const library = getExercises();
    const exercise = library.find((item) => item.id === exerciseId);
    if (!exercise) {
      return;
    }
    if (!isExerciseArchived(exercise)) {
      showToast(`"${exercise.title || "Exercise"}" is already active.`, "warning");
      return;
    }
    const now = getNow();
    const currentUserId = getUserId();
    const writeResult = writeExercises(
      library.map((item) =>
        item.id === exerciseId
          ? {
              ...item,
              archivedAt: "",
              archivedBy: "",
              updatedAt: now,
              updatedBy: currentUserId,
            }
          : item
      )
    );
    if (!writeResult.saved) {
      showToast("The exercise could not be restored. It stayed archived.", "error");
      return;
    }
    setExercises(writeResult.exercises);
    rerenderWorkspace();
    showToast(`Restored to library: "${exercise.title || "Exercise"}".`);
  }

  return Object.freeze({
    addExerciseToFolder,
    archiveExercise,
    archiveFolder,
    cancelFolderEdit,
    commitExercise,
    createFolderFromForm,
    duplicateExercise,
    findExerciseIndexByTitle,
    getExerciseComparableSnapshot,
    getExerciseEditSnapshot,
    getUniqueTitle,
    hasExerciseEditChanges,
    removeExerciseFromFolder,
    resolveSaveConflict,
    restoreExercise,
    restoreFolder,
    saveExerciseEditAsCopy,
    saveSelectedExercise,
    queueSaveConflict,
    startFolderEdit,
    updateExerciseFromEdit,
    updateFolderFromForm,
  });
}
