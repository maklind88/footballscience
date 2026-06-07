import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import {
  createExerciseLibraryActions,
  createExerciseLibraryRenderer,
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

test("Exercise Library app integration delegates state ownership to the module", () => {
  const app = readProjectFile("app.js");
  const packageJson = readProjectFile("package.json");
  const storageGuard = readProjectFile("scripts/verify-storage-key-policy.mjs");

  expect(app).toContain("./src/modules/exercise-library/index.mjs");
  expect(app).toContain("createExerciseLibraryActions");
  expect(app).toContain("createExerciseLibraryStateAdapter");
  expect(app).toContain("createExerciseLibrarySelectors");
  expect(app).toContain("createExerciseLibraryRenderer");
  expect(app).toContain("exerciseLibraryActions.archiveExercise(exerciseId)");
  expect(app).toContain("exerciseLibraryActions.createFolderFromForm(form)");
  expect(app).toContain("exerciseLibraryRenderer.renderOverlay()");
  expect(app).toContain("exerciseLibraryRenderer.renderResults(ui.sessionPlannerWorkspace)");
  expect(app).toContain("exerciseLibraryStateAdapter.createExercise(source)");
  expect(app).toContain("exerciseLibraryStateAdapter.createFolder(source)");
  expect(app).toContain("exerciseLibraryStateAdapter.parseExercisePayload(rawLibrary)");
  expect(app).toContain("exerciseLibrarySelectors.compareExercises(a, b, sessionPlannerLibrarySortMode)");
  expect(app).not.toContain('const sessionPlannerExerciseLibraryStorageKey = "football-session-exercise-library-v1";');
  expect(app).not.toContain("const sessionPlannerDefaultExerciseLibrary = [");
  expect(packageJson).toContain("qa/exercise-library-module-contract.api.spec.mjs");
  expect(storageGuard).toContain("src/modules/exercise-library/exercise-library-state.mjs");
});

test("Exercise Library is tracked as partial extraction while protected writes remain in app.js", () => {
  const contract = moduleStandardRegistry.require("exercise-library");

  expect(contract.migrationStatus).toBe(moduleMigrationStatuses.partialExtraction);
  expect(contract.currentFiles).toContain("src/modules/exercise-library/index.mjs");
  expect(contract.currentFiles).toContain("src/modules/exercise-library/exercise-library-actions.mjs");
  expect(contract.currentFiles).toContain("src/modules/exercise-library/exercise-library-renderer.mjs");
  expect(contract.currentFiles).toContain("src/modules/exercise-library/exercise-library-state.mjs");
  expect(contract.testFiles).toContain("qa/exercise-library-module-contract.api.spec.mjs");
  expect(platformModuleImplementationStages["exercise-library"]).toBe("partial-extraction");
});
