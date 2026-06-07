function defaultClamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return min;
  }
  return Math.min(max, Math.max(min, number));
}

function defaultFormatMultiValue(value) {
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  return String(value || "");
}

function defaultNormalizeTacticalPitchMode(value) {
  return String(value || "full").trim() || "full";
}

export function createSessionPlannerBlockHelpers(options = {}) {
  const blockFieldUpdatedAtKey = options.blockFieldUpdatedAtKey || "fieldUpdatedAt";
  const blockMergeFields = Array.isArray(options.blockMergeFields) ? options.blockMergeFields : [];
  const blockMergeFieldSet = options.blockMergeFieldSet instanceof Set
    ? options.blockMergeFieldSet
    : new Set(blockMergeFields);
  const clamp = typeof options.clamp === "function" ? options.clamp : defaultClamp;
  const createStableId = typeof options.createStableId === "function"
    ? options.createStableId
    : (prefix = "item") => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const cloneTacticalElement = typeof options.cloneTacticalElement === "function"
    ? options.cloneTacticalElement
    : (element = {}) => ({ ...element });
  const formatMultiValue = typeof options.formatMultiValue === "function" ? options.formatMultiValue : defaultFormatMultiValue;
  const getCurrentUserId = typeof options.getCurrentUserId === "function" ? options.getCurrentUserId : () => "";
  const normalizePlayerBoardColors = typeof options.normalizePlayerBoardColors === "function"
    ? options.normalizePlayerBoardColors
    : () => ({});
  const normalizePlayerBoardCustomPeople = typeof options.normalizePlayerBoardCustomPeople === "function"
    ? options.normalizePlayerBoardCustomPeople
    : () => [];
  const normalizePlayerBoardPositions = typeof options.normalizePlayerBoardPositions === "function"
    ? options.normalizePlayerBoardPositions
    : () => ({});
  const normalizeTacticalActiveFrameId = typeof options.normalizeTacticalActiveFrameId === "function"
    ? options.normalizeTacticalActiveFrameId
    : (activeFrameId = "", frames = []) => (frames.some((frame) => frame.id === activeFrameId) ? activeFrameId : frames[0]?.id || "");
  const normalizeTacticalFrames = typeof options.normalizeTacticalFrames === "function"
    ? options.normalizeTacticalFrames
    : () => [];
  const normalizeTacticalPitchMode = typeof options.normalizeTacticalPitchMode === "function"
    ? options.normalizeTacticalPitchMode
    : defaultNormalizeTacticalPitchMode;

  function parseSessionPlannerTimestampMs(value) {
    const timestamp = typeof value === "number" ? value : new Date(value || 0).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
  }

  function normalizeSessionPlannerTimestamp(value) {
    const timestamp = parseSessionPlannerTimestampMs(value);
    return timestamp ? new Date(timestamp).toISOString() : "";
  }

  function getSessionPlannerLibraryNow() {
    return new Date().toISOString();
  }

  function getSessionPlannerLibraryUserId() {
    return getCurrentUserId();
  }

  function createSessionPlannerReviewNoteId(dateValue = "", blockId = "") {
    return `review-${String(dateValue || "date").trim()}-${String(blockId || "block").trim()}`;
  }

  function normalizeSessionPlannerExerciseReviewNote(note = {}) {
    if (!note || typeof note !== "object" || Array.isArray(note)) {
      return null;
    }
    const notes = String(note.notes ?? note.note ?? note.text ?? "").trim();
    if (!notes) {
      return null;
    }
    const sessionDate = String(note.sessionDate || note.date || "").trim();
    const blockId = String(note.blockId || "").trim();
    const updatedAt = normalizeSessionPlannerTimestamp(note.updatedAt) || getSessionPlannerLibraryNow();
    const createdAt = normalizeSessionPlannerTimestamp(note.createdAt) || updatedAt;
    return {
      id: String(note.id || createSessionPlannerReviewNoteId(sessionDate, blockId)).trim(),
      sessionDate,
      blockId,
      blockTitle: String(note.blockTitle || note.exerciseTitle || "").trim(),
      notes,
      createdAt,
      updatedAt,
      updatedBy: String(note.updatedBy || note.createdBy || "").trim(),
    };
  }

  function normalizeSessionPlannerExerciseReviewNotes(sourceNotes = [], legacyNotes = "") {
    const notes = Array.isArray(sourceNotes)
      ? sourceNotes
        .map(normalizeSessionPlannerExerciseReviewNote)
        .filter(Boolean)
      : [];
    const legacyNoteText = String(legacyNotes || "").trim();
    if (legacyNoteText) {
      notes.push(
        normalizeSessionPlannerExerciseReviewNote({
          id: "review-legacy-note",
          notes: legacyNoteText,
          blockTitle: "Legacy review note",
        })
      );
    }
    const usedIds = new Set();
    return notes
      .map((note) => {
        let noteId = note.id || createSessionPlannerReviewNoteId(note.sessionDate, note.blockId);
        while (usedIds.has(noteId)) {
          noteId = `${noteId}-${usedIds.size + 1}`;
        }
        usedIds.add(noteId);
        return { ...note, id: noteId };
      })
      .sort((first, second) => parseSessionPlannerTimestampMs(second.updatedAt) - parseSessionPlannerTimestampMs(first.updatedAt));
  }

  function normalizeSessionPlannerBlockFieldMeta(source = {}) {
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      return {};
    }
    return Object.entries(source).reduce((normalizedMeta, [field, timestampValue]) => {
      if (!blockMergeFieldSet.has(field)) {
        return normalizedMeta;
      }
      const timestamp = normalizeSessionPlannerTimestamp(timestampValue);
      if (timestamp) {
        normalizedMeta[field] = timestamp;
      }
      return normalizedMeta;
    }, {});
  }

  function createSessionPlannerInitialBlockFieldMeta(overrides = {}, timestamp = new Date().toISOString()) {
    const meta = normalizeSessionPlannerBlockFieldMeta(overrides[blockFieldUpdatedAtKey]);
    if (Object.keys(meta).length || overrides.id) {
      return meta;
    }
    return blockMergeFields.reduce((initialMeta, field) => {
      initialMeta[field] = timestamp;
      return initialMeta;
    }, {});
  }

  function createSessionPlannerBlock(overrides = {}) {
    const hasTacticalContent = Array.isArray(overrides.tacticalElements) && overrides.tacticalElements.length > 0;
    const hasUploadedVisual = Boolean(overrides.visualImage);
    const isUntouchedNewExercise =
      String(overrides.title || "").trim().toLowerCase() === "new exercise" &&
      !hasTacticalContent &&
      !hasUploadedVisual;
    const now = new Date().toISOString();
    const createdAt = normalizeSessionPlannerTimestamp(overrides.createdAt) || now;
    const updatedAt = normalizeSessionPlannerTimestamp(overrides.updatedAt) || (overrides.id ? "" : now);
    const tacticalFrames = normalizeTacticalFrames(overrides.tacticalFrames);
    const tacticalElements = Array.isArray(overrides.tacticalElements)
      ? overrides.tacticalElements.map(cloneTacticalElement)
      : [];
    return {
      id: overrides.id || createStableId("session-block"),
      label: overrides.label || "Block",
      createdAt,
      updatedAt,
      [blockFieldUpdatedAtKey]: createSessionPlannerInitialBlockFieldMeta(overrides, updatedAt || createdAt),
      title: overrides.title || "",
      focus: overrides.focus || "",
      phase: formatMultiValue(overrides.phase),
      subPhase: formatMultiValue(overrides.subPhase),
      minutes: Number.isFinite(Number(overrides.minutes)) ? Number(overrides.minutes) : 0,
      time: overrides.time || "",
      intensity: Number.isFinite(Number(overrides.intensity)) ? clamp(Number(overrides.intensity), 1, 5) : 3,
      pitchSize: overrides.pitchSize || "",
      material: overrides.material || "",
      objective: overrides.objective || "",
      why: overrides.why || "",
      organization: overrides.organization || "",
      principles: overrides.principles || "",
      libraryExerciseId: String(overrides.libraryExerciseId || overrides.sourceExerciseId || "").trim(),
      postSessionNotes: String(overrides.postSessionNotes || "").trim(),
      diagram: isUntouchedNewExercise ? "empty" : overrides.diagram || "empty",
      tacticalPitchMode: normalizeTacticalPitchMode(overrides.tacticalPitchMode),
      tacticalFrames,
      tacticalActiveFrameId: normalizeTacticalActiveFrameId(overrides.tacticalActiveFrameId, tacticalFrames),
      playerBoardLayoutMode: overrides.playerBoardLayoutMode === "manual" ? "manual" : "auto",
      visualImage: overrides.visualImage || "",
      playerBoardPositions: normalizePlayerBoardPositions(overrides.playerBoardPositions),
      playerBoardColors: normalizePlayerBoardColors(overrides.playerBoardColors),
      playerBoardCustomPeople: normalizePlayerBoardCustomPeople(overrides.playerBoardCustomPeople),
      tacticalElements,
    };
  }

  return {
    createBlock: createSessionPlannerBlock,
    createInitialBlockFieldMeta: createSessionPlannerInitialBlockFieldMeta,
    createReviewNoteId: createSessionPlannerReviewNoteId,
    getLibraryNow: getSessionPlannerLibraryNow,
    getLibraryUserId: getSessionPlannerLibraryUserId,
    normalizeBlockFieldMeta: normalizeSessionPlannerBlockFieldMeta,
    normalizeReviewNote: normalizeSessionPlannerExerciseReviewNote,
    normalizeReviewNotes: normalizeSessionPlannerExerciseReviewNotes,
    normalizeTimestamp: normalizeSessionPlannerTimestamp,
    parseTimestampMs: parseSessionPlannerTimestampMs,
  };
}
