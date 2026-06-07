export function createExerciseLibraryReviewHelpers(deps = {}) {
  const {
    cloneTacticalElement = (element) => ({ ...element }),
    createLibraryExercise = (source) => source,
    createReviewNoteId = () => "",
    createStableId = (prefix = "exercise") => `${prefix}-${Date.now()}`,
    getExerciseById = () => null,
    getLibraryUserId = () => "",
    getNow = () => new Date().toISOString(),
    getSelectedDate = () => "",
    normalizePlayerBoardColors = (source) => source || {},
    normalizePlayerBoardCustomPeople = (source) => (Array.isArray(source) ? source : []),
    normalizePlayerBoardPositions = (source) => source || {},
    normalizeReviewNote = (source) => source,
    normalizeReviewNotes = (notes = [], legacyNotes = "") => (Array.isArray(notes) ? notes : []),
    normalizeTacticalActiveFrameId = (value) => String(value || ""),
    normalizeTacticalFrames = (source) => (Array.isArray(source) ? source : []),
    normalizeTacticalPitchMode = (value) => value || "full",
  } = deps;

  function createReviewNoteFromBlock(block = {}, options = {}) {
    const notes = String(block.postSessionNotes || "").trim();
    if (!notes) {
      return null;
    }
    const sessionDate = String(options.sessionDate || getSelectedDate() || "").trim();
    const blockId = String(block.id || "").trim();
    const existingNote = options.existingNote || null;
    const now = getNow();
    return normalizeReviewNote({
      id: existingNote?.id || createReviewNoteId(sessionDate, blockId),
      sessionDate,
      blockId,
      blockTitle: String(block.title || block.label || "Exercise").trim(),
      notes,
      createdAt: existingNote?.createdAt || now,
      updatedAt: now,
      updatedBy: getLibraryUserId(),
    });
  }

  function getExerciseReviewNotes(exercise = {}) {
    return normalizeReviewNotes(exercise.reviewNotes, exercise.postSessionNotes);
  }

  function getExerciseReviewNotesForBlock(block = {}, options = {}) {
    const exercise = getExerciseById(block.libraryExerciseId);
    if (!exercise) {
      return [];
    }
    const currentNoteId = createReviewNoteId(
      String(options.sessionDate || getSelectedDate() || "").trim(),
      String(block.id || "").trim()
    );
    return getExerciseReviewNotes(exercise).filter((note) => note.id !== currentNoteId);
  }

  function buildLibraryExerciseFromBlock(block = {}) {
    const now = getNow();
    const currentUserId = getLibraryUserId();
    const reviewNote = createReviewNoteFromBlock(block);
    return createLibraryExercise({
      ...block,
      id: createStableId("exercise"),
      label: "Library Exercise",
      createdAt: now,
      updatedAt: now,
      createdBy: currentUserId,
      updatedBy: currentUserId,
      archivedAt: "",
      archivedBy: "",
      source: "session",
      title: String(block.title || "").trim() || "Untitled Exercise",
      focus: String(block.focus || "").trim(),
      phase: block.phase || "",
      subPhase: block.subPhase || "",
      tags: [],
      minutes: block.minutes,
      time: block.time || "",
      intensity: block.intensity,
      pitchSize: block.pitchSize || "",
      material: block.material || "",
      objective: block.objective || "",
      why: block.why || "",
      organization: block.organization || "",
      principles: block.principles || "",
      postSessionNotes: "",
      reviewNotes: reviewNote ? [reviewNote] : [],
      diagram: block.diagram || "empty",
      tacticalPitchMode: normalizeTacticalPitchMode(block.tacticalPitchMode),
      playerBoardLayoutMode: block.playerBoardLayoutMode === "manual" ? "manual" : "auto",
      visualImage: block.visualImage || "",
      playerBoardPositions: normalizePlayerBoardPositions(block.playerBoardPositions),
      playerBoardColors: normalizePlayerBoardColors(block.playerBoardColors),
      playerBoardCustomPeople: normalizePlayerBoardCustomPeople(block.playerBoardCustomPeople),
      tacticalFrames: normalizeTacticalFrames(block.tacticalFrames),
      tacticalActiveFrameId: normalizeTacticalActiveFrameId(block.tacticalActiveFrameId),
      tacticalElements: Array.isArray(block.tacticalElements) ? block.tacticalElements.map(cloneTacticalElement) : [],
    });
  }

  return Object.freeze({
    buildLibraryExerciseFromBlock,
    createReviewNoteFromBlock,
    getExerciseReviewNotes,
    getExerciseReviewNotesForBlock,
  });
}
