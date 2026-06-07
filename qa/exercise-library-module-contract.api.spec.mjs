import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import {
  createExerciseLibraryActions,
  createExerciseLibraryRenderer,
  createExerciseLibraryReviewHelpers,
  createExerciseLibraryRuntimeFacade,
  createExerciseLibraryRuntimeController,
  createExerciseLibrarySelectors,
  createExerciseLibraryStateAdapter,
  exerciseLibraryModuleId,
  sessionPlannerDefaultExerciseLibrary,
  sessionPlannerExerciseLibraryBackupSchema,
  sessionPlannerExerciseLibraryFoldersBackupSchema,
  sessionPlannerExerciseLibraryFoldersStorageKey,
  sessionPlannerExerciseLibraryStorageKey,
  sessionPlannerExerciseLibraryVersionLimit,
  sessionPlannerLibrarySortOptions,
} from "../src/modules/exercise-library/index.mjs";
import { moduleMigrationStatuses, moduleStandardRegistry } from "../src/core/index.mjs";
import { platformModuleImplementationStages } from "../src/core/platform-readiness-contracts.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function readProjectFile(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function createTestAdapter() {
  let idCounter = 0;
  return createExerciseLibraryStateAdapter({
    createStableId: (prefix = "item") => `${prefix}-${++idCounter}`,
    getNow: () => "2026-05-01T10:00:00.000Z",
    getUserId: () => "coach-1",
    normalizeReviewNotes: (notes = [], legacyNotes = "") => {
      const normalizedNotes = Array.isArray(notes) ? notes.filter(Boolean) : [];
      return legacyNotes ? [...normalizedNotes, { id: "legacy", notes: legacyNotes }] : normalizedNotes;
    },
  });
}

test("Exercise Library extraction owns the first state module file slots", () => {
  [
    "src/modules/exercise-library/index.mjs",
    "src/modules/exercise-library/exercise-library-actions.mjs",
    "src/modules/exercise-library/exercise-library-renderer.mjs",
    "src/modules/exercise-library/exercise-library-review-helpers.mjs",
    "src/modules/exercise-library/exercise-library-runtime-facade.mjs",
    "src/modules/exercise-library/exercise-library-runtime-controller.mjs",
    "src/modules/exercise-library/exercise-library-selectors.mjs",
    "src/modules/exercise-library/exercise-library-state.mjs",
  ].forEach((path) => {
    expect(existsSync(resolve(root, path)), `${path} should exist`).toBe(true);
  });

  expect(exerciseLibraryModuleId).toBe("exercise-library");
  expect(sessionPlannerExerciseLibraryStorageKey).toBe("football-session-exercise-library-v1");
  expect(sessionPlannerExerciseLibraryFoldersStorageKey).toBe("football-session-exercise-library-folders-v1");
  expect(sessionPlannerExerciseLibraryVersionLimit).toBe(8);
});

test("Exercise Library selectors own seed exercises, filters, and sort order", () => {
  const selectors = createExerciseLibrarySelectors({
    normalizeTimestamp: (value) => value || "",
    sortOptions: sessionPlannerLibrarySortOptions,
  });

  expect(sessionPlannerDefaultExerciseLibrary.map((exercise) => exercise.id)).toEqual([
    "possession-block-defending-high-press",
    "build-up-positional-rhythm",
    "finishing-from-cutback-zone",
  ]);
  expect(selectors.normalizeMultiValue("Build Up; Press\nFinish")).toEqual(["Build Up", "Press", "Finish"]);
  expect(selectors.formatMultiValue(["Build Up", " Press "])).toBe("Build Up, Press");
  expect(selectors.normalizeFilterValues(["all", "Build Up", "Build Up", " "])).toEqual(["Build Up"]);
  expect(selectors.exerciseMatchesFilterValue("Build Up, Press", ["Press"])).toBe(true);
  expect(selectors.exerciseMatchesFilterValue("Build Up", ["Final Third"])).toBe(false);
  expect(selectors.normalizeSortMode("phase")).toBe("phase");
  expect(selectors.normalizeSortMode("unknown")).toBe("updated");

  const exercises = [
    { title: "Zulu", phase: "Out of Possession", subPhase: "Press", createdAt: "2026-05-01", updatedAt: "2026-05-03" },
    { title: "Alpha", phase: "In Possession", subPhase: "Build Up", createdAt: "2026-05-02", updatedAt: "2026-05-02" },
    { title: "Middle", phase: "In Possession", subPhase: "Final Third", createdAt: "2026-05-03", updatedAt: "2026-05-01" },
  ];

  expect([...exercises].sort((a, b) => selectors.compareExercises(a, b, "title")).map((exercise) => exercise.title)).toEqual([
    "Alpha",
    "Middle",
    "Zulu",
  ]);
  expect([...exercises].sort((a, b) => selectors.compareExercises(a, b, "created"))[0].title).toBe("Middle");
  expect([...exercises].sort((a, b) => selectors.compareExercises(a, b, "updated"))[0].title).toBe("Zulu");
  expect([...exercises].sort((a, b) => selectors.compareExercises(a, b, "phase")).map((exercise) => exercise.title)).toEqual([
    "Alpha",
    "Middle",
    "Zulu",
  ]);
});

test("Exercise Library runtime facade preserves legacy app method names", () => {
  const calls = [];
  const facade = createExerciseLibraryRuntimeFacade({
    getRuntime: () => ({
      createSessionPlannerLibraryExercise: (...args) => {
        calls.push(["create", ...args]);
        return { id: "exercise-1" };
      },
      getSessionPlannerActiveExerciseLibrary: () => [{ id: "active" }],
      normalizeSessionPlannerLibraryTitle: (value) => String(value || "").trim(),
    }),
  });

  expect(facade.createSessionPlannerLibraryExercise({ title: "Press" })).toEqual({ id: "exercise-1" });
  expect(facade.getSessionPlannerActiveExerciseLibrary()).toEqual([{ id: "active" }]);
  expect(facade.normalizeSessionPlannerLibraryTitle("  rondo  ")).toBe("rondo");
  expect(calls).toEqual([["create", { title: "Press" }]]);
  expect(() => facade.writeSessionPlannerExerciseLibrary([])).toThrow("Exercise Library runtime is missing method");
});

test("Exercise Library review helpers own session block to library exercise mapping", () => {
  const helpers = createExerciseLibraryReviewHelpers({
    cloneTacticalElement: (element) => ({ ...element, cloned: true }),
    createLibraryExercise: (source) => ({ ...source, normalized: true }),
    createReviewNoteId: (sessionDate, blockId) => `note-${sessionDate}-${blockId}`,
    createStableId: () => "exercise-new",
    getExerciseById: () => ({
      id: "source-exercise",
      reviewNotes: [
        { id: "note-2026-05-01-block-1", notes: "Current note" },
        { id: "older-note", notes: "Older note" },
      ],
      postSessionNotes: "Legacy note",
    }),
    getLibraryUserId: () => "coach-1",
    getNow: () => "2026-05-01T10:00:00.000Z",
    getSelectedDate: () => "2026-05-01",
    normalizePlayerBoardColors: () => ({ team: "#123456" }),
    normalizePlayerBoardCustomPeople: () => [{ id: "guest-1" }],
    normalizePlayerBoardPositions: () => ({ p1: { x: 10, y: 20 } }),
    normalizeReviewNote: (note) => ({ ...note, normalized: true }),
    normalizeReviewNotes: (notes, legacyNotes) => [...notes, { id: "legacy", notes: legacyNotes }],
    normalizeTacticalActiveFrameId: (value) => value || "frame-1",
    normalizeTacticalFrames: () => [{ id: "frame-1" }],
    normalizeTacticalPitchMode: () => "half",
  });

  const block = {
    id: "block-1",
    libraryExerciseId: "source-exercise",
    title: "Pressing Wave",
    focus: "Press",
    postSessionNotes: "Worked well",
    tacticalElements: [{ id: "line-1" }],
  };

  expect(helpers.createReviewNoteFromBlock(block)).toMatchObject({
    id: "note-2026-05-01-block-1",
    notes: "Worked well",
    normalized: true,
    updatedBy: "coach-1",
  });
  expect(helpers.getExerciseReviewNotesForBlock(block).map((note) => note.id)).toEqual(["older-note", "legacy"]);

  const exercise = helpers.buildLibraryExerciseFromBlock(block);
  expect(exercise).toMatchObject({
    id: "exercise-new",
    label: "Library Exercise",
    normalized: true,
    postSessionNotes: "",
    reviewNotes: [{ id: "note-2026-05-01-block-1" }],
    source: "session",
    title: "Pressing Wave",
  });
  expect(exercise.tacticalElements).toEqual([{ id: "line-1", cloned: true }]);
  expect(exercise.playerBoardPositions).toEqual({ p1: { x: 10, y: 20 } });
});

test("Exercise Library actions archive, restore, and move folder membership without deleting exercises", () => {
  const adapter = createTestAdapter();
  let exercises = adapter.normalizeExercises([
    { id: "ex-1", title: "Pressing Game" },
    { id: "ex-2", title: "Possession Game", archivedAt: "2026-05-01T08:00:00.000Z" },
  ]);
  let folders = adapter.normalizeFolders([
    { id: "folder-1", name: "Team Folder", visibility: "team", exerciseIds: ["ex-1"] },
  ]);
  const toasts = [];
  let uiState = { selectedFolderId: "folder-1", editExerciseId: "", archiveView: "active", filterOpen: "" };
  const actions = createExerciseLibraryActions({
    canEdit: () => true,
    confirm: () => true,
    showToast: (message, tone = "success") => toasts.push({ message, tone }),
    renderWorkspace: () => {},
    getNow: () => "2026-05-02T10:00:00.000Z",
    getUserId: () => "coach-1",
    createStableId: (prefix) => `${prefix}-new`,
    createFolder: (source) => adapter.createFolder(source),
    normalizeFolderVisibility: (value) => adapter.normalizeFolderVisibility(value),
    normalizeFolderExerciseIds: (value) => adapter.normalizeFolderExerciseIds(value),
    isFolderArchived: (folder) => adapter.isFolderArchived(folder),
    isExerciseArchived: (exercise) => adapter.isExerciseArchived(exercise),
    normalizeTitle: (value) => String(value || "").trim().toLowerCase(),
    cloneExercise: (exercise) => adapter.cloneExercise(exercise),
    createVersionSnapshot: (exercise, reason) => adapter.createVersionSnapshot(exercise, reason),
    appendVersion: (exercise, reason) => adapter.appendVersion(exercise, reason),
    normalizeVersions: (versions) => adapter.normalizeVersions(versions),
    getExercises: () => exercises,
    setExercises: (nextExercises) => {
      exercises = nextExercises;
    },
    writeExercises: (nextExercises) => ({ saved: true, backupSaved: true, exercises: adapter.normalizeExercises(nextExercises) }),
    getFolders: () => folders,
    setFolders: (nextFolders) => {
      folders = nextFolders;
    },
    writeFolders: (nextFolders) => ({ saved: true, backupSaved: true, folders: adapter.normalizeFolders(nextFolders) }),
    getExerciseById: (exerciseId) => exercises.find((exercise) => exercise.id === exerciseId) || null,
    getFolderById: (folderId) => folders.find((folder) => folder.id === folderId) || null,
    getUiState: () => uiState,
    setUiState: (nextState) => {
      uiState = { ...uiState, ...nextState };
    },
  });

  actions.archiveExercise("ex-1");
  expect(exercises).toHaveLength(2);
  expect(exercises.find((exercise) => exercise.id === "ex-1")?.archivedAt).toBe("2026-05-02T10:00:00.000Z");

  actions.restoreExercise("ex-1");
  expect(exercises).toHaveLength(2);
  expect(exercises.find((exercise) => exercise.id === "ex-1")?.archivedAt).toBe("");

  actions.restoreExercise("ex-2");
  expect(exercises).toHaveLength(2);
  expect(exercises.find((exercise) => exercise.id === "ex-2")?.archivedAt).toBe("");

  actions.addExerciseToFolder("ex-2", "folder-1");
  expect(folders.find((folder) => folder.id === "folder-1")?.exerciseIds).toEqual(["ex-1", "ex-2"]);
  expect(exercises.map((exercise) => exercise.id)).toEqual(["ex-1", "ex-2"]);

  actions.removeExerciseFromFolder("ex-1", "folder-1");
  expect(folders.find((folder) => folder.id === "folder-1")?.exerciseIds).toEqual(["ex-2"]);
  expect(exercises.map((exercise) => exercise.id)).toEqual(["ex-1", "ex-2"]);

  actions.duplicateExercise("ex-1");
  expect(exercises).toHaveLength(3);
  expect(exercises.find((exercise) => exercise.id === "ex-1")?.title).toBe("Pressing Game");
  expect(exercises.find((exercise) => exercise.id === "exercise-new")?.title).toBe("Pressing Game Copy");

  expect(toasts.some((toast) => toast.message.includes("Archived in library"))).toBe(true);
});

test("Exercise Library renderer owns overlay, folders, filters, and edit actions", () => {
  const renderer = createExerciseLibraryRenderer({
    escapeHtml: (value) => String(value ?? "").replaceAll("<", "&lt;").replaceAll(">", "&gt;"),
    normalizeTimestamp: (value) => value || "",
    normalizeTags: (value) => (Array.isArray(value) ? value : []),
    normalizeFolderExerciseIds: (value) => (Array.isArray(value) ? value : []),
    getReviewNotes: (exercise) => exercise.reviewNotes || [],
    getMultiValueSummary: (value, fallback) => value || fallback,
    canEdit: () => true,
    getState: () => ({
      isOpen: true,
      archiveView: "active",
      filterOpen: "phase",
      searchQuery: "press",
      selectedFolderId: "folder-1",
      sortMode: "title",
      getFilterValues: () => ["Pressing"],
      getArchiveCounts: () => ({ active: 1, archived: 1 }),
      normalizeSortMode: (value) => value,
      getFolderName: () => "Team Press",
      getFolderCount: () => 1,
      getVisibleFolders: () => [
        { id: "folder-1", name: "Team Press", visibility: "team", exerciseIds: ["ex-1"], source: "user" },
      ],
      getArchivedFolders: () => [],
      getCurrentUserId: () => "coach-1",
      isFolderArchived: () => false,
      isExerciseArchived: () => false,
      canRemoveFromSelectedFolder: () => true,
      getSelectedFolder: () => ({ id: "folder-1" }),
      getFilteredExercises: () => [
        {
          id: "ex-1",
          title: "Pressing Game",
          phase: "Pressing",
          subPhase: "High Press",
          minutes: 12,
          updatedAt: "2026-05-01T10:00:00.000Z",
          reviewNotes: [{ id: "note-1", notes: "Good load" }],
        },
      ],
      getEditExercise: () => null,
      getViewExercise: () => null,
      getOptionValues: () => ["Pressing"],
    }),
  });

  const markup = renderer.renderOverlay();
  expect(markup).toContain("Exercise Library");
  expect(markup).toContain("data-session-library-folder=\"folder-1\"");
  expect(markup).toContain("data-session-library-filter-option=\"phase\"");
  expect(markup).toContain("data-session-remove-library-exercise-from-folder=\"ex-1\"");
  expect(markup).toContain("Pressing Game");
});

test("Exercise Library state adapter normalizes without dropping saved or archived exercises", () => {
  const adapter = createTestAdapter();
  const exercises = adapter.normalizeExercises([
    {
      id: "same-id",
      title: "Pressing Game",
      tags: ["#Press", "press", "Counter press"],
      versions: new Array(12).fill(null).map((_, index) => ({ id: `v-${index}`, title: `Version ${index}` })),
    },
    {
      id: "same-id",
      title: "Archived Game",
      archivedAt: "2026-05-02T12:00:00.000Z",
    },
  ]);

  expect(exercises).toHaveLength(2);
  expect(new Set(exercises.map((exercise) => exercise.id)).size).toBe(2);
  expect(exercises[0].tags).toEqual(["Press", "Counter press"]);
  expect(exercises[0].versions).toHaveLength(sessionPlannerExerciseLibraryVersionLimit);
  expect(adapter.getArchiveCounts(exercises)).toEqual({ active: 1, archived: 1 });
  expect(adapter.getExercisesByArchiveState(exercises, "active").map((exercise) => exercise.title)).toEqual([
    "Pressing Game",
  ]);
  expect(adapter.getExercisesByArchiveState(exercises, "archived").map((exercise) => exercise.title)).toEqual([
    "Archived Game",
  ]);
});

test("Exercise Library parses main and backup payloads without seed overwrite semantics", () => {
  const adapter = createTestAdapter();
  const originalPayload = [
    {
      id: "saved-user-exercise",
      title: "Saved User Exercise",
      postSessionNotes: "Keep this review",
    },
  ];
  const backupPayload = {
    schema: sessionPlannerExerciseLibraryBackupSchema,
    exercises: originalPayload,
  };

  expect(adapter.parseExercisePayload(JSON.stringify(originalPayload))).toMatchObject([
    { id: "saved-user-exercise", title: "Saved User Exercise" },
  ]);
  expect(adapter.parseExercisePayload(JSON.stringify(backupPayload))).toMatchObject([
    { id: "saved-user-exercise", title: "Saved User Exercise" },
  ]);
  expect(adapter.parseExercisePayload(JSON.stringify({ exercises: [] }))).toBeNull();
  expect(adapter.parseExercisePayload("not-json")).toBeNull();
});

test("Exercise Library folder normalization keeps folder membership separate from exercise deletion", () => {
  const adapter = createTestAdapter();
  const folders = adapter.normalizeFolders([
    {
      id: "team-folder",
      name: "Team",
      visibility: "club",
      exerciseIds: ["ex-1", "ex-1", "", "ex-2"],
    },
    {
      id: "archived-folder",
      name: "Archive Folder",
      archivedAt: "2026-05-03T10:00:00.000Z",
      exerciseIds: ["ex-1"],
    },
  ]);

  expect(folders[0]).toMatchObject({
    id: "team-folder",
    visibility: "team",
    exerciseIds: ["ex-1", "ex-2"],
  });
  expect(adapter.isFolderArchived(folders[0])).toBe(false);
  expect(adapter.isFolderArchived(folders[1])).toBe(true);

  const folderBackup = {
    schema: sessionPlannerExerciseLibraryFoldersBackupSchema,
    folders,
  };
  expect(adapter.parseFoldersPayload(JSON.stringify(folderBackup))).toHaveLength(2);
});

test("Exercise Library runtime controller owns storage, filters, folders, and app-facing delegates", () => {
  const adapter = createTestAdapter();
  const selectors = createExerciseLibrarySelectors({ normalizeTimestamp: (value) => value || "" });
  const storage = new Map();
  let exercises = null;
  let folders = null;
  let uiState = {
    archiveView: "active",
    filterOpen: "",
    phaseFilter: "all",
    phaseFilters: [],
    searchQuery: "",
    selectedFolderId: "all",
    sortMode: "updated",
    subPhaseFilter: "all",
    subPhaseFilters: [],
  };
  const rendered = [];
  const toasts = [];
  const controller = createExerciseLibraryRuntimeController({
    stateAdapter: adapter,
    selectors,
    getActions: () => ({
      archiveFolder: (folderId) => {
        uiState.archivedFolder = folderId;
      },
    }),
    getRenderer: () => ({
      renderResults: (target) => {
        rendered.push(target);
      },
    }),
    getUi: () => ({ sessionPlannerWorkspace: "workspace-node" }),
    getUiState: () => uiState,
    setUiState: (patch) => {
      uiState = { ...uiState, ...patch };
    },
    getExerciseLibrary: () => exercises,
    setExerciseLibrary: (nextExercises) => {
      exercises = nextExercises;
    },
    getExerciseFolders: () => folders,
    setExerciseFolders: (nextFolders) => {
      folders = nextFolders;
    },
    win: {
      localStorage: {
        getItem: (key) => (storage.has(key) ? storage.get(key) : null),
        setItem: (key, value) => storage.set(key, value),
      },
      confirm: () => true,
    },
    exerciseLibraryStorageKey: sessionPlannerExerciseLibraryStorageKey,
    exerciseLibraryBackupStorageKey: "exercise-backup",
    exerciseLibraryFoldersStorageKey: sessionPlannerExerciseLibraryFoldersStorageKey,
    exerciseLibraryFoldersBackupStorageKey: "folders-backup",
    defaultExerciseLibrary: [{ id: "seed", title: "Seed Exercise" }],
    renderWorkspace: (options) => rendered.push(options),
    showToast: (message) => toasts.push(message),
    getLibraryUserId: () => "coach-1",
    periodizationOptionLibrary: { matchPhases: ["Pressing"], subPhases: ["High Press"] },
    getSelectedBlock: () => ({ phase: "" }),
    updateSelectedBlockField: () => {},
    getReviewNotes: () => [],
    canEdit: () => true,
  });

  storage.set(
    sessionPlannerExerciseLibraryStorageKey,
    JSON.stringify([{ id: "press", title: "Press Game", phase: "Pressing", subPhase: "High Press" }])
  );
  storage.set(
    sessionPlannerExerciseLibraryFoldersStorageKey,
    JSON.stringify([{ id: "folder-1", name: "Team Press", visibility: "team", exerciseIds: ["press"] }])
  );

  expect(controller.getSessionPlannerExerciseLibrary().map((exercise) => exercise.id)).toEqual(["press"]);
  expect(controller.getSessionPlannerExerciseLibraryFolders().map((folder) => folder.id)).toEqual(["folder-1"]);
  controller.toggleSessionPlannerLibraryFilterValue("phase", "Pressing");
  expect(controller.getSessionPlannerLibraryFilterValues("phase")).toEqual(["Pressing"]);
  expect(controller.getFilteredSessionPlannerExerciseLibrary().map((exercise) => exercise.id)).toEqual(["press"]);
  controller.selectSessionPlannerLibraryFolder("folder-1");
  expect(uiState.selectedFolderId).toBe("folder-1");
  controller.renderSessionPlannerLibraryResults();
  expect(rendered).toContain("workspace-node");
  controller.archiveSessionPlannerExerciseLibraryFolder("folder-1");
  expect(uiState.archivedFolder).toBe("folder-1");
  expect(toasts).toEqual([]);
});

test("Exercise Library app integration delegates runtime ownership to the module", () => {
  const app = readProjectFile("app.js");
  const packageJson = readProjectFile("package.json");
  const storageGuard = readProjectFile("scripts/verify-storage-key-policy.mjs");

  expect(app).toContain("./src/modules/exercise-library/index.mjs");
  expect(app).toContain("createExerciseLibraryActions");
  expect(app).toContain("createExerciseLibraryRuntimeFacade");
  expect(app).toContain("createExerciseLibraryRuntimeController");
  expect(app).toContain("createExerciseLibraryReviewHelpers");
  expect(app).toContain("createExerciseLibraryStateAdapter");
  expect(app).toContain("createExerciseLibrarySelectors");
  expect(app).toContain("createExerciseLibraryRenderer");
  expect(app).not.toContain("function callExerciseLibraryRuntime");
  expect(app).toContain("exerciseLibraryRenderer.renderOverlay()");
  expect(app).not.toContain("exerciseLibraryStateAdapter.createExercise(source)");
  expect(app).not.toContain("exerciseLibraryStateAdapter.createFolder(source)");
  expect(app).not.toContain("function buildSessionPlannerLibraryExerciseFromBlock");
  expect(app).not.toContain("function createSessionPlannerReviewNoteFromBlock");
  expect(app).not.toContain("exerciseLibraryStateAdapter.parseExercisePayload(rawLibrary)");
  expect(app).not.toContain("exerciseLibrarySelectors.compareExercises(a, b, sessionPlannerLibrarySortMode)");
  expect(app).not.toContain('const sessionPlannerExerciseLibraryStorageKey = "football-session-exercise-library-v1";');
  expect(app).not.toContain("const sessionPlannerDefaultExerciseLibrary = [");
  expect(packageJson).toContain("src/modules/exercise-library/exercise-library-runtime-controller.mjs");
  expect(packageJson).toContain("src/modules/exercise-library/exercise-library-runtime-facade.mjs");
  expect(packageJson).toContain("src/modules/exercise-library/exercise-library-review-helpers.mjs");
  expect(packageJson).toContain("qa/exercise-library-module-contract.api.spec.mjs");
  expect(storageGuard).toContain("src/modules/exercise-library/exercise-library-state.mjs");
});

test("Exercise Library is tracked as partial extraction while protected writes remain in app.js", () => {
  const contract = moduleStandardRegistry.require("exercise-library");

  expect(contract.migrationStatus).toBe(moduleMigrationStatuses.partialExtraction);
  expect(contract.currentFiles).toContain("src/modules/exercise-library/index.mjs");
  expect(contract.currentFiles).toContain("src/modules/exercise-library/exercise-library-actions.mjs");
  expect(contract.currentFiles).toContain("src/modules/exercise-library/exercise-library-renderer.mjs");
  expect(contract.currentFiles).toContain("src/modules/exercise-library/exercise-library-review-helpers.mjs");
  expect(contract.currentFiles).toContain("src/modules/exercise-library/exercise-library-runtime-facade.mjs");
  expect(contract.currentFiles).toContain("src/modules/exercise-library/exercise-library-runtime-controller.mjs");
  expect(contract.currentFiles).toContain("src/modules/exercise-library/exercise-library-state.mjs");
  expect(contract.testFiles).toContain("qa/exercise-library-module-contract.api.spec.mjs");
  expect(platformModuleImplementationStages["exercise-library"]).toBe("partial-extraction");
});
