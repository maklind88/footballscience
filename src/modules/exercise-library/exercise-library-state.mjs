export const exerciseLibraryModuleId = "exercise-library";
export const sessionPlannerExerciseLibraryStorageKey = "football-session-exercise-library-v1";
export const sessionPlannerExerciseLibraryBackupStorageKey = "football-session-exercise-library-backup-v1";
export const sessionPlannerExerciseLibraryBackupSchema = "football-session-exercise-library-backup-v1";
export const sessionPlannerExerciseLibraryFoldersStorageKey = "football-session-exercise-library-folders-v1";
export const sessionPlannerExerciseLibraryFoldersBackupStorageKey = "football-session-exercise-library-folders-backup-v1";
export const sessionPlannerExerciseLibraryFoldersBackupSchema = "football-session-exercise-library-folders-backup-v1";
export const sessionPlannerExerciseLibraryVersionLimit = 8;
export const sessionPlannerLibrarySortOptions = Object.freeze([
  Object.freeze({ value: "updated", label: "Recently updated" }),
  Object.freeze({ value: "created", label: "Newest created" }),
  Object.freeze({ value: "title", label: "Title A-Z" }),
  Object.freeze({ value: "phase", label: "Phase" }),
]);

function defaultClamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function defaultNormalizeTimestamp(value) {
  const timestamp = typeof value === "number" ? value : new Date(value || 0).getTime();
  return Number.isFinite(timestamp) && timestamp ? new Date(timestamp).toISOString() : "";
}

function defaultCreateStableId(prefix = "item") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function defaultNormalizeMultiValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  return String(value || "")
    .split(/[,;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function defaultFormatMultiValue(value) {
  return defaultNormalizeMultiValue(value).join(", ");
}

function defaultCreateBlock(source = {}) {
  return {
    id: String(source.id || "").trim() || defaultCreateStableId("exercise"),
    label: String(source.label || "Library Exercise").trim() || "Library Exercise",
    title: String(source.title || "Untitled Exercise").trim() || "Untitled Exercise",
    focus: String(source.focus || "").trim(),
    phase: defaultFormatMultiValue(source.phase),
    subPhase: defaultFormatMultiValue(source.subPhase),
    minutes: Number.isFinite(Number(source.minutes)) ? Math.max(0, Number(source.minutes)) : 0,
    time: String(source.time || "").trim(),
    intensity: Number.isFinite(Number(source.intensity)) ? defaultClamp(Number(source.intensity), 1, 5) : 3,
    pitchSize: String(source.pitchSize || "").trim(),
    material: String(source.material || "").trim(),
    objective: String(source.objective || "").trim(),
    why: String(source.why || "").trim(),
    organization: String(source.organization || "").trim(),
    principles: String(source.principles || "").trim(),
    diagram: String(source.diagram || "").trim() || "empty",
    createdAt: defaultNormalizeTimestamp(source.createdAt) || new Date().toISOString(),
    updatedAt: defaultNormalizeTimestamp(source.updatedAt) || defaultNormalizeTimestamp(source.createdAt) || "",
  };
}

function freezeList(list = []) {
  return Object.freeze(Array.isArray(list) ? [...list] : []);
}

export function normalizeExerciseLibraryMultiValue(value) {
  return defaultNormalizeMultiValue(value);
}

export function normalizeExerciseLibraryTags(value) {
  const seenTags = new Set();
  return normalizeExerciseLibraryMultiValue(value)
    .map((tag) => String(tag || "").replace(/^#+/, "").trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .filter((tag) => {
      const normalizedTag = tag.toLowerCase();
      if (seenTags.has(normalizedTag)) {
        return false;
      }
      seenTags.add(normalizedTag);
      return true;
    })
    .slice(0, 24);
}

export function createExerciseLibraryStateAdapter(options = {}) {
  const createBlock = typeof options.createBlock === "function" ? options.createBlock : defaultCreateBlock;
  const createStableId = typeof options.createStableId === "function" ? options.createStableId : defaultCreateStableId;
  const normalizeTimestamp =
    typeof options.normalizeTimestamp === "function" ? options.normalizeTimestamp : defaultNormalizeTimestamp;
  const getNow = typeof options.getNow === "function" ? options.getNow : () => new Date().toISOString();
  const getUserId = typeof options.getUserId === "function" ? options.getUserId : () => "";
  const normalizeMultiValue =
    typeof options.normalizeMultiValue === "function" ? options.normalizeMultiValue : defaultNormalizeMultiValue;
  const formatMultiValue =
    typeof options.formatMultiValue === "function" ? options.formatMultiValue : defaultFormatMultiValue;
  const clamp = typeof options.clamp === "function" ? options.clamp : defaultClamp;
  const normalizeTacticalPitchMode =
    typeof options.normalizeTacticalPitchMode === "function" ? options.normalizeTacticalPitchMode : () => "full";
  const normalizeReviewNotes =
    typeof options.normalizeReviewNotes === "function" ? options.normalizeReviewNotes : () => [];
  const cloneTacticalElement =
    typeof options.cloneTacticalElement === "function" ? options.cloneTacticalElement : (element) => ({ ...element });
  const normalizeTacticalFrames =
    typeof options.normalizeTacticalFrames === "function" ? options.normalizeTacticalFrames : () => [];
  const normalizeTacticalActiveFrameId =
    typeof options.normalizeTacticalActiveFrameId === "function"
      ? options.normalizeTacticalActiveFrameId
      : () => "";
  const normalizePlayerBoardPositions =
    typeof options.normalizePlayerBoardPositions === "function" ? options.normalizePlayerBoardPositions : () => ({});
  const normalizePlayerBoardColors =
    typeof options.normalizePlayerBoardColors === "function" ? options.normalizePlayerBoardColors : () => ({});
  const normalizePlayerBoardCustomPeople =
    typeof options.normalizePlayerBoardCustomPeople === "function"
      ? options.normalizePlayerBoardCustomPeople
      : () => [];
  const versionLimit = Number.isInteger(options.versionLimit) && options.versionLimit > 0
    ? options.versionLimit
    : sessionPlannerExerciseLibraryVersionLimit;

  function normalizeTags(value) {
    const seenTags = new Set();
    return normalizeMultiValue(value)
      .map((tag) => String(tag || "").replace(/^#+/, "").trim().replace(/\s+/g, " "))
      .filter(Boolean)
      .filter((tag) => {
        const normalizedTag = tag.toLowerCase();
        if (seenTags.has(normalizedTag)) {
          return false;
        }
        seenTags.add(normalizedTag);
        return true;
      })
      .slice(0, 24);
  }

  function normalizeVersions(sourceVersions = []) {
    if (!Array.isArray(sourceVersions)) {
      return [];
    }
    return sourceVersions
      .filter((version) => version && typeof version === "object" && !Array.isArray(version))
      .map((version) => ({
        id: String(version.id || "").trim() || createStableId("version"),
        createdAt: normalizeTimestamp(version.createdAt) || getNow(),
        createdBy: String(version.createdBy || "").trim(),
        reason: String(version.reason || "Updated").trim() || "Updated",
        title: String(version.title || "").trim(),
        focus: String(version.focus || "").trim(),
        phase: formatMultiValue(version.phase),
        subPhase: formatMultiValue(version.subPhase),
        tags: normalizeTags(version.tags),
        minutes: Number.isFinite(Number(version.minutes)) ? Math.max(0, Number(version.minutes)) : 0,
        time: String(version.time || "").trim(),
        intensity: Number.isFinite(Number(version.intensity)) ? clamp(Number(version.intensity), 1, 5) : 3,
        pitchSize: String(version.pitchSize || "").trim(),
        material: String(version.material || "").trim(),
        objective: String(version.objective || "").trim(),
        why: String(version.why || "").trim(),
        organization: String(version.organization || "").trim(),
        principles: String(version.principles || "").trim(),
        diagram: String(version.diagram || "").trim() || "empty",
        tacticalPitchMode: normalizeTacticalPitchMode(version.tacticalPitchMode),
        playerBoardLayoutMode: version.playerBoardLayoutMode === "manual" ? "manual" : "auto",
      }))
      .slice(0, versionLimit);
  }

  function createVersionSnapshot(exercise = {}, reason = "Updated") {
    return {
      id: createStableId("version"),
      createdAt: getNow(),
      createdBy: getUserId(),
      reason: String(reason || "Updated").trim() || "Updated",
      title: String(exercise.title || "").trim(),
      focus: String(exercise.focus || "").trim(),
      phase: formatMultiValue(exercise.phase),
      subPhase: formatMultiValue(exercise.subPhase),
      tags: normalizeTags(exercise.tags),
      minutes: Number.isFinite(Number(exercise.minutes)) ? Math.max(0, Number(exercise.minutes)) : 0,
      time: String(exercise.time || "").trim(),
      intensity: Number.isFinite(Number(exercise.intensity)) ? clamp(Number(exercise.intensity), 1, 5) : 3,
      pitchSize: String(exercise.pitchSize || "").trim(),
      material: String(exercise.material || "").trim(),
      objective: String(exercise.objective || "").trim(),
      why: String(exercise.why || "").trim(),
      organization: String(exercise.organization || "").trim(),
      principles: String(exercise.principles || "").trim(),
      diagram: String(exercise.diagram || "").trim() || "empty",
      tacticalPitchMode: normalizeTacticalPitchMode(exercise.tacticalPitchMode),
      playerBoardLayoutMode: exercise.playerBoardLayoutMode === "manual" ? "manual" : "auto",
    };
  }

  function appendVersion(exercise = {}, reason = "Updated") {
    return [createVersionSnapshot(exercise, reason), ...normalizeVersions(exercise.versions)].slice(0, versionLimit);
  }

  function createExercise(source = {}) {
    const now = getNow();
    const createdAt = normalizeTimestamp(source.createdAt) || now;
    const updatedAt = normalizeTimestamp(source.updatedAt) || createdAt;
    const archivedAt = normalizeTimestamp(source.archivedAt);
    const createdBy = String(source.createdBy || "").trim();
    const updatedBy = String(source.updatedBy || createdBy || "").trim();
    return {
      ...createBlock({
        ...source,
        id: source.id || createStableId("exercise"),
        label: source.label || "Library Exercise",
        title: source.title || "Untitled Exercise",
        createdAt,
        updatedAt,
      }),
      archivedAt,
      archivedBy: archivedAt ? String(source.archivedBy || "").trim() : "",
      createdBy,
      updatedBy,
      source: String(source.source || "").trim() || "library",
      tags: normalizeTags(source.tags),
      versions: normalizeVersions(source.versions),
      reviewNotes: normalizeReviewNotes(source.reviewNotes, source.postSessionNotes),
    };
  }

  function cloneExercise(exercise = {}) {
    return createExercise({
      ...exercise,
      playerBoardPositions: normalizePlayerBoardPositions(exercise.playerBoardPositions),
      playerBoardColors: normalizePlayerBoardColors(exercise.playerBoardColors),
      playerBoardCustomPeople: normalizePlayerBoardCustomPeople(exercise.playerBoardCustomPeople),
      tacticalFrames: normalizeTacticalFrames(exercise.tacticalFrames),
      tacticalActiveFrameId: exercise.tacticalActiveFrameId || "",
      reviewNotes: normalizeReviewNotes(exercise.reviewNotes, exercise.postSessionNotes),
      tacticalElements: Array.isArray(exercise.tacticalElements)
        ? exercise.tacticalElements.map(cloneTacticalElement)
        : [],
    });
  }

  function normalizeExercises(sourceLibrary = []) {
    if (!Array.isArray(sourceLibrary)) {
      return [];
    }
    const usedIds = new Set();
    return sourceLibrary
      .filter((exercise) => exercise && typeof exercise === "object" && !Array.isArray(exercise))
      .map((exercise) => {
        const clonedExercise = cloneExercise(exercise);
        let exerciseId = String(clonedExercise.id || "").trim() || createStableId("exercise");
        while (usedIds.has(exerciseId)) {
          exerciseId = createStableId("exercise");
        }
        usedIds.add(exerciseId);
        return {
          ...clonedExercise,
          id: exerciseId,
        };
      });
  }

  function isExerciseArchived(exercise = {}) {
    return Boolean(normalizeTimestamp(exercise.archivedAt));
  }

  function getExercisesByArchiveState(exercises = [], archiveView = "active") {
    const view = archiveView === "archived" ? "archived" : "active";
    return normalizeExercises(exercises).filter((exercise) =>
      view === "archived" ? isExerciseArchived(exercise) : !isExerciseArchived(exercise)
    );
  }

  function getArchiveCounts(exercises = []) {
    return normalizeExercises(exercises).reduce(
      (counts, exercise) => {
        if (isExerciseArchived(exercise)) {
          counts.archived += 1;
        } else {
          counts.active += 1;
        }
        return counts;
      },
      { active: 0, archived: 0 }
    );
  }

  function parseExercisePayload(rawLibrary) {
    if (!rawLibrary) {
      return null;
    }
    try {
      const parsedLibrary = JSON.parse(rawLibrary);
      const sourceLibrary = Array.isArray(parsedLibrary)
        ? parsedLibrary
        : parsedLibrary?.schema === sessionPlannerExerciseLibraryBackupSchema && Array.isArray(parsedLibrary.exercises)
          ? parsedLibrary.exercises
          : null;
      return Array.isArray(sourceLibrary) ? normalizeExercises(sourceLibrary) : null;
    } catch {
      return null;
    }
  }

  function createExerciseBackupEnvelope(exercises = []) {
    const normalizedExercises = normalizeExercises(exercises);
    return {
      schema: sessionPlannerExerciseLibraryBackupSchema,
      savedAt: getNow(),
      count: normalizedExercises.length,
      exercises: normalizedExercises,
    };
  }

  function normalizeFolderVisibility(value) {
    return value === "personal" ? "personal" : "team";
  }

  function normalizeFolderExerciseIds(sourceIds = []) {
    if (!Array.isArray(sourceIds)) {
      return [];
    }
    return Array.from(new Set(sourceIds.map((exerciseId) => String(exerciseId || "").trim()).filter(Boolean)));
  }

  function createFolder(source = {}) {
    const now = getNow();
    const createdAt = normalizeTimestamp(source.createdAt) || now;
    const updatedAt = normalizeTimestamp(source.updatedAt) || createdAt;
    const archivedAt = normalizeTimestamp(source.archivedAt);
    const createdBy = String(source.createdBy || "").trim();
    const updatedBy = String(source.updatedBy || createdBy || "").trim();
    return {
      id: String(source.id || "").trim() || createStableId("folder"),
      name: String(source.name || "Untitled Folder").trim() || "Untitled Folder",
      visibility: normalizeFolderVisibility(source.visibility),
      exerciseIds: normalizeFolderExerciseIds(source.exerciseIds),
      createdAt,
      createdBy,
      updatedAt,
      updatedBy,
      archivedAt,
      archivedBy: archivedAt ? String(source.archivedBy || "").trim() : "",
      source: String(source.source || "").trim() || "library",
    };
  }

  function createDefaultFolders() {
    const now = getNow();
    return [
      createFolder({
        id: "team-exercises",
        name: "Team Exercises",
        visibility: "team",
        exerciseIds: [],
        createdAt: now,
        updatedAt: now,
        source: "default",
      }),
    ];
  }

  function normalizeFolders(sourceFolders = []) {
    if (!Array.isArray(sourceFolders)) {
      return [];
    }
    const usedIds = new Set();
    return sourceFolders
      .filter((folder) => folder && typeof folder === "object" && !Array.isArray(folder))
      .map((folder) => {
        const normalizedFolder = createFolder(folder);
        let folderId = String(normalizedFolder.id || "").trim() || createStableId("folder");
        while (usedIds.has(folderId)) {
          folderId = createStableId("folder");
        }
        usedIds.add(folderId);
        return {
          ...normalizedFolder,
          id: folderId,
        };
      });
  }

  function isFolderArchived(folder = {}) {
    return Boolean(normalizeTimestamp(folder.archivedAt));
  }

  function parseFoldersPayload(rawFolders) {
    if (!rawFolders) {
      return null;
    }
    try {
      const parsedFolders = JSON.parse(rawFolders);
      const sourceFolders = Array.isArray(parsedFolders)
        ? parsedFolders
        : parsedFolders?.schema === sessionPlannerExerciseLibraryFoldersBackupSchema &&
            Array.isArray(parsedFolders.folders)
          ? parsedFolders.folders
          : null;
      return Array.isArray(sourceFolders) ? normalizeFolders(sourceFolders) : null;
    } catch {
      return null;
    }
  }

  function createFoldersBackupEnvelope(folders = []) {
    const normalizedFolders = normalizeFolders(folders);
    return {
      schema: sessionPlannerExerciseLibraryFoldersBackupSchema,
      savedAt: getNow(),
      count: normalizedFolders.length,
      folders: normalizedFolders,
    };
  }

  return Object.freeze({
    moduleId: exerciseLibraryModuleId,
    storageKeys: freezeList([
      sessionPlannerExerciseLibraryStorageKey,
      sessionPlannerExerciseLibraryBackupStorageKey,
      sessionPlannerExerciseLibraryFoldersStorageKey,
      sessionPlannerExerciseLibraryFoldersBackupStorageKey,
    ]),
    sortOptions: freezeList(sessionPlannerLibrarySortOptions),
    normalizeTags,
    normalizeVersions,
    createVersionSnapshot,
    appendVersion,
    createExercise,
    cloneExercise,
    normalizeExercises,
    isExerciseArchived,
    getExercisesByArchiveState,
    getArchiveCounts,
    parseExercisePayload,
    createExerciseBackupEnvelope,
    normalizeFolderVisibility,
    normalizeFolderExerciseIds,
    createFolder,
    createDefaultFolders,
    normalizeFolders,
    isFolderArchived,
    parseFoldersPayload,
    createFoldersBackupEnvelope,
  });
}
