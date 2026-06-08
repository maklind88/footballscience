function defaultFormatDateValue(value = new Date()) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return String(value || "").slice(0, 10);
}

function defaultParseTimestampMs(value) {
  const timestamp = typeof value === "number" ? value : new Date(value || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function defaultCloneValue(value) {
  if (!value || typeof value !== "object") {
    return value;
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return Array.isArray(value) ? [...value] : { ...value };
  }
}

function defaultCreateBlock(overrides = {}) {
  return {
    id: overrides.id || "",
    createdAt: overrides.createdAt || "",
    updatedAt: overrides.updatedAt || "",
    ...overrides,
  };
}

function defaultCreateEmptySession(dateValue = defaultFormatDateValue()) {
  return {
    id: `session-${dateValue}`,
    date: dateValue,
    title: "Session",
    theme: "",
    selectedBlockId: "",
    blocks: [],
  };
}

function defaultNormalizeBlockFieldMeta(source = {}) {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return {};
  }
  return { ...source };
}

export function createSessionPlannerStateMergeHelpers(options = {}) {
  const blockDeletionTombstoneKey = options.blockDeletionTombstoneKey || "blockDeletionTombstones";
  const blockFieldUpdatedAtKey = options.blockFieldUpdatedAtKey || "fieldUpdatedAt";
  const blockMergeFields = Array.isArray(options.blockMergeFields) ? options.blockMergeFields : [];
  const blockMergeFieldSet = options.blockMergeFieldSet instanceof Set
    ? options.blockMergeFieldSet
    : new Set(blockMergeFields);
  const blockReductionGuardKey = options.blockReductionGuardKey || "blockReductionGuard";
  const blockReductionGuardMaxAgeMs = Number.isFinite(Number(options.blockReductionGuardMaxAgeMs))
    ? Number(options.blockReductionGuardMaxAgeMs)
    : 30 * 60 * 1000;
  const createBlock = typeof options.createBlock === "function" ? options.createBlock : defaultCreateBlock;
  const createEmptySession = typeof options.createEmptySession === "function" ? options.createEmptySession : defaultCreateEmptySession;
  const formatDateValue = typeof options.formatDateValue === "function" ? options.formatDateValue : defaultFormatDateValue;
  const getScheduledSessionTitleForDate = typeof options.getScheduledSessionTitleForDate === "function"
    ? options.getScheduledSessionTitleForDate
    : () => "";
  const getSessionPlannerState = typeof options.getSessionPlannerState === "function" ? options.getSessionPlannerState : () => null;
  const normalizeBlockFieldMeta = typeof options.normalizeBlockFieldMeta === "function"
    ? options.normalizeBlockFieldMeta
    : defaultNormalizeBlockFieldMeta;
  const parseTimestampMs = typeof options.parseTimestampMs === "function" ? options.parseTimestampMs : defaultParseTimestampMs;
  const shouldClearSessionForDate = typeof options.shouldClearSessionForDate === "function"
    ? options.shouldClearSessionForDate
    : () => false;

  function cloneSessionPlannerSession(session = {}) {
    const date = session.date || formatDateValue(new Date());
    const blocks = Array.isArray(session.blocks) ? session.blocks.map(createBlock) : [];
    const selectedBlockId = blocks.some((block) => block.id === session.selectedBlockId)
      ? session.selectedBlockId
      : blocks[0]?.id ?? "";
    const rawTitle = String(session.title ?? "").trim();
    const isLegacyEmptyTitle = rawTitle.toLowerCase() === "no session planned";
    const title = !isLegacyEmptyTitle && rawTitle
      ? rawTitle
      : getScheduledSessionTitleForDate(date) || (blocks.length ? "Training Session" : "Session");
    return {
      id: session.id || `session-${date}`,
      date,
      title,
      theme: session.theme || "",
      selectedBlockId,
      blocks,
    };
  }

  function createSessionPlannerDefaultState() {
    const selectedDate = formatDateValue(new Date());
    return {
      selectedDate,
      sessions: {
        [selectedDate]: createEmptySession(selectedDate),
      },
    };
  }

  function parseSessionPlannerBlockReductionGuardTime(value) {
    const timestamp = typeof value === "number" ? value : new Date(value || 0).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
  }

  function normalizeSessionPlannerBlockReductionGuard(source = {}) {
    const guard = source?.[blockReductionGuardKey];
    if (!guard || typeof guard !== "object" || Array.isArray(guard)) {
      return {};
    }
    const now = Date.now();
    return Object.entries(guard).reduce((normalizedGuard, [dateValue, timestampValue]) => {
      const timestamp = parseSessionPlannerBlockReductionGuardTime(timestampValue);
      if (timestamp && now - timestamp <= blockReductionGuardMaxAgeMs) {
        normalizedGuard[dateValue] = timestamp;
      }
      return normalizedGuard;
    }, {});
  }

  function canReduceSessionPlannerBlocksForDate(source, dateValue) {
    return Boolean(normalizeSessionPlannerBlockReductionGuard(source)[dateValue]);
  }

  function normalizeSessionPlannerBlockDeletionTombstones(source = {}) {
    const tombstones = source?.[blockDeletionTombstoneKey];
    if (!tombstones || typeof tombstones !== "object" || Array.isArray(tombstones)) {
      return {};
    }
    return Object.entries(tombstones).reduce((normalized, [dateValue, blockMap]) => {
      if (!blockMap || typeof blockMap !== "object" || Array.isArray(blockMap)) {
        return normalized;
      }
      const normalizedBlocks = Object.entries(blockMap).reduce((blocks, [blockId, timestampValue]) => {
        const cleanBlockId = String(blockId || "").trim();
        const timestamp = parseSessionPlannerBlockReductionGuardTime(timestampValue);
        if (cleanBlockId && timestamp) {
          blocks[cleanBlockId] = new Date(timestamp).toISOString();
        }
        return blocks;
      }, {});
      const cleanDate = String(dateValue || "").trim();
      if (cleanDate && Object.keys(normalizedBlocks).length) {
        normalized[cleanDate] = normalizedBlocks;
      }
      return normalized;
    }, {});
  }

  function markSessionPlannerBlockReductionAllowed(dateValue) {
    const state = getSessionPlannerState();
    if (!state || !dateValue) {
      return;
    }
    state[blockReductionGuardKey] = {
      ...normalizeSessionPlannerBlockReductionGuard(state),
      [dateValue]: Date.now(),
    };
  }

  function markSessionPlannerBlockDeleted(dateValue, blockId) {
    const cleanDate = String(dateValue || "").trim();
    const cleanBlockId = String(blockId || "").trim();
    const state = getSessionPlannerState();
    if (!state || !cleanDate || !cleanBlockId) {
      return;
    }
    const tombstones = normalizeSessionPlannerBlockDeletionTombstones(state);
    state[blockDeletionTombstoneKey] = {
      ...tombstones,
      [cleanDate]: {
        ...(tombstones[cleanDate] || {}),
        [cleanBlockId]: new Date().toISOString(),
      },
    };
    markSessionPlannerBlockReductionAllowed(cleanDate);
  }

  function applySessionPlannerBlockReductionGuard(targetState, sourceState) {
    const guard = normalizeSessionPlannerBlockReductionGuard(sourceState);
    if (Object.keys(guard).length) {
      targetState[blockReductionGuardKey] = guard;
    } else {
      delete targetState[blockReductionGuardKey];
    }
    return targetState;
  }

  function applySessionPlannerBlockDeletionTombstones(targetState, ...sourceStates) {
    const tombstones = sourceStates.reduce((merged, sourceState) => {
      const next = normalizeSessionPlannerBlockDeletionTombstones(sourceState);
      Object.entries(next).forEach(([dateValue, blockMap]) => {
        merged[dateValue] = {
          ...(merged[dateValue] || {}),
          ...blockMap,
        };
      });
      return merged;
    }, {});
    if (Object.keys(tombstones).length) {
      targetState[blockDeletionTombstoneKey] = tombstones;
    } else {
      delete targetState[blockDeletionTombstoneKey];
    }
    return targetState;
  }

  function getSessionPlannerDeletedBlockIds(source, dateValue) {
    return new Set(Object.keys(normalizeSessionPlannerBlockDeletionTombstones(source)[dateValue] || {}));
  }

  function cloneSessionPlannerBlockMergeValue(value) {
    return defaultCloneValue(value);
  }

  function isSessionPlannerBlockFieldEmptyValue(value) {
    if (value === null || value === undefined) {
      return true;
    }
    if (typeof value === "string") {
      return value.trim() === "";
    }
    if (Array.isArray(value)) {
      return value.length === 0;
    }
    if (typeof value === "object") {
      return Object.keys(value).length === 0;
    }
    return false;
  }

  function getSessionPlannerBlockFieldUpdatedAtMs(block = {}, field) {
    return parseTimestampMs(block?.[blockFieldUpdatedAtKey]?.[field]);
  }

  function markSessionPlannerBlockFieldsUpdated(block, fields = []) {
    if (!block) {
      return;
    }
    const validFields = fields.filter((field) => blockMergeFieldSet.has(field));
    if (!validFields.length) {
      return;
    }
    const timestamp = new Date().toISOString();
    block[blockFieldUpdatedAtKey] = {
      ...normalizeBlockFieldMeta(block[blockFieldUpdatedAtKey]),
    };
    validFields.forEach((field) => {
      block[blockFieldUpdatedAtKey][field] = timestamp;
    });
    block.updatedAt = timestamp;
  }

  function mergeSessionPlannerBlockForWrite(existingBlock, incomingBlock) {
    const existing = createBlock(existingBlock);
    const incoming = createBlock(incomingBlock);
    const merged = createBlock({
      ...incoming,
      id: incoming.id || existing.id,
      createdAt: incoming.createdAt || existing.createdAt,
    });
    const mergedMeta = {
      ...normalizeBlockFieldMeta(existing[blockFieldUpdatedAtKey]),
      ...normalizeBlockFieldMeta(incoming[blockFieldUpdatedAtKey]),
    };
    blockMergeFields.forEach((field) => {
      const existingTimestamp = getSessionPlannerBlockFieldUpdatedAtMs(existing, field);
      const incomingTimestamp = getSessionPlannerBlockFieldUpdatedAtMs(incoming, field);
      const existingValue = existing[field];
      const incomingValue = incoming[field];
      if (existingTimestamp && (!incomingTimestamp || existingTimestamp > incomingTimestamp)) {
        merged[field] = cloneSessionPlannerBlockMergeValue(existingValue);
        mergedMeta[field] = new Date(existingTimestamp).toISOString();
        return;
      }
      if (!existingTimestamp && !incomingTimestamp && isSessionPlannerBlockFieldEmptyValue(incomingValue) && !isSessionPlannerBlockFieldEmptyValue(existingValue)) {
        merged[field] = cloneSessionPlannerBlockMergeValue(existingValue);
        return;
      }
      merged[field] = cloneSessionPlannerBlockMergeValue(incomingValue);
      if (incomingTimestamp) {
        mergedMeta[field] = new Date(incomingTimestamp).toISOString();
      }
    });
    const newestFieldTimestamp = Object.values(mergedMeta).reduce(
      (latest, timestampValue) => Math.max(latest, parseTimestampMs(timestampValue)),
      0
    );
    const newestBlockTimestamp = Math.max(
      parseTimestampMs(existing.updatedAt),
      parseTimestampMs(incoming.updatedAt),
      newestFieldTimestamp
    );
    merged[blockFieldUpdatedAtKey] = mergedMeta;
    merged.updatedAt = newestBlockTimestamp ? new Date(newestBlockTimestamp).toISOString() : incoming.updatedAt || existing.updatedAt || "";
    return createBlock(merged);
  }

  function filterSessionPlannerDeletedBlocksForWrite(session, dateValue, deletedBlockIds = new Set()) {
    const filteredSession = cloneSessionPlannerSession({ ...session, date: session?.date || dateValue });
    if (!deletedBlockIds.size) {
      return filteredSession;
    }
    filteredSession.blocks = filteredSession.blocks.filter((block) => !deletedBlockIds.has(block.id));
    if (!filteredSession.blocks.some((block) => block.id === filteredSession.selectedBlockId)) {
      filteredSession.selectedBlockId = filteredSession.blocks[0]?.id ?? "";
    }
    return filteredSession;
  }

  function mergeSessionPlannerSessionForWrite(existingSession, incomingSession, dateValue, canReduceBlocks = false, deletedBlockIds = new Set()) {
    const existing = cloneSessionPlannerSession({ ...existingSession, date: existingSession?.date || dateValue });
    const incoming = cloneSessionPlannerSession({ ...incomingSession, date: incomingSession?.date || dateValue });
    const existingById = new Map(existing.blocks.map((block) => [block.id, block]));
    const incomingIds = new Set();
    const blocks = incoming.blocks.flatMap((incomingBlock) => {
      incomingIds.add(incomingBlock.id);
      if (deletedBlockIds.has(incomingBlock.id)) {
        return [];
      }
      const existingBlock = existingById.get(incomingBlock.id);
      return [existingBlock ? mergeSessionPlannerBlockForWrite(existingBlock, incomingBlock) : createBlock(incomingBlock)];
    });
    if (!canReduceBlocks) {
      existing.blocks.forEach((existingBlock) => {
        if (!incomingIds.has(existingBlock.id) && !deletedBlockIds.has(existingBlock.id)) {
          blocks.push(createBlock(existingBlock));
        }
      });
    }
    const selectedBlockId = blocks.some((block) => block.id === incoming.selectedBlockId)
      ? incoming.selectedBlockId
      : blocks.some((block) => block.id === existing.selectedBlockId)
        ? existing.selectedBlockId
        : blocks[0]?.id ?? "";
    return {
      ...existing,
      ...incoming,
      title: isSessionPlannerBlockFieldEmptyValue(incoming.title) && !isSessionPlannerBlockFieldEmptyValue(existing.title)
        ? existing.title
        : incoming.title,
      theme: isSessionPlannerBlockFieldEmptyValue(incoming.theme) && !isSessionPlannerBlockFieldEmptyValue(existing.theme)
        ? existing.theme
        : incoming.theme,
      date: incoming.date || existing.date || dateValue,
      selectedBlockId,
      blocks,
    };
  }

  function cloneSessionPlannerState(source = createSessionPlannerDefaultState()) {
    const fallback = createSessionPlannerDefaultState();
    const selectedDate = source.selectedDate || fallback.selectedDate;
    const sessions = {};
    Object.entries(source.sessions ?? {}).forEach(([dateValue, session]) => {
      const clonedSession = cloneSessionPlannerSession({ ...session, date: session.date || dateValue });
      sessions[dateValue] = shouldClearSessionForDate(dateValue, clonedSession)
        ? createEmptySession(dateValue)
        : clonedSession;
    });
    if (!Object.keys(sessions).length) {
      sessions[fallback.selectedDate] = fallback.sessions[fallback.selectedDate];
    }
    return applySessionPlannerBlockDeletionTombstones(applySessionPlannerBlockReductionGuard({
      selectedDate,
      sessions,
    }, source), source);
  }

  function mergeSessionPlannerStateForWrite(existingState, incomingState) {
    const existing = cloneSessionPlannerState(existingState);
    const incoming = cloneSessionPlannerState(incomingState);
    const merged = {
      ...incoming,
      sessions: {},
    };
    applySessionPlannerBlockDeletionTombstones(merged, existing, incoming);
    const sessionDates = new Set([
      ...Object.keys(existing.sessions || {}),
      ...Object.keys(incoming.sessions || {}),
    ]);
    sessionDates.forEach((dateValue) => {
      const existingSession = existing.sessions?.[dateValue];
      const incomingSession = incoming.sessions?.[dateValue];
      if (existingSession && incomingSession) {
        merged.sessions[dateValue] = mergeSessionPlannerSessionForWrite(
          existingSession,
          incomingSession,
          dateValue,
          canReduceSessionPlannerBlocksForDate(incoming, dateValue),
          getSessionPlannerDeletedBlockIds(merged, dateValue)
        );
        return;
      }
      const deletedBlockIds = getSessionPlannerDeletedBlockIds(merged, dateValue);
      if (existingSession) {
        merged.sessions[dateValue] = filterSessionPlannerDeletedBlocksForWrite(existingSession, dateValue, deletedBlockIds);
        return;
      }
      if (incomingSession) {
        merged.sessions[dateValue] = filterSessionPlannerDeletedBlocksForWrite(incomingSession, dateValue, deletedBlockIds);
      }
    });
    return applySessionPlannerBlockDeletionTombstones(applySessionPlannerBlockReductionGuard(merged, incoming), existing, incoming);
  }

  function mergeSessionPlannerStateFromBackup(currentState, backupState) {
    const current = cloneSessionPlannerState(currentState);
    const backup = cloneSessionPlannerState(backupState);
    const merged = {
      ...current,
      sessions: {
        ...current.sessions,
      },
    };
    let recoveredSessions = 0;
    Object.entries(backup.sessions || {}).forEach(([dateValue, backupSession]) => {
      const currentSession = merged.sessions?.[dateValue];
      const currentBlockCount = Array.isArray(currentSession?.blocks) ? currentSession.blocks.length : 0;
      const backupSessionWithoutDeletedBlocks = filterSessionPlannerDeletedBlocksForWrite(
        backupSession,
        dateValue,
        getSessionPlannerDeletedBlockIds(current, dateValue)
      );
      const backupBlockCount = Array.isArray(backupSessionWithoutDeletedBlocks?.blocks) ? backupSessionWithoutDeletedBlocks.blocks.length : 0;
      if (
        backupBlockCount > currentBlockCount &&
        !canReduceSessionPlannerBlocksForDate(current, dateValue)
      ) {
        merged.sessions[dateValue] = backupSessionWithoutDeletedBlocks;
        recoveredSessions += 1;
      }
    });
    return {
      state: applySessionPlannerBlockDeletionTombstones(applySessionPlannerBlockReductionGuard(merged, current), current, backup),
      recoveredSessions,
    };
  }

  return {
    cloneSessionPlannerSession,
    createSessionPlannerDefaultState,
    parseSessionPlannerBlockReductionGuardTime,
    normalizeSessionPlannerBlockReductionGuard,
    canReduceSessionPlannerBlocksForDate,
    normalizeSessionPlannerBlockDeletionTombstones,
    markSessionPlannerBlockReductionAllowed,
    markSessionPlannerBlockDeleted,
    applySessionPlannerBlockReductionGuard,
    applySessionPlannerBlockDeletionTombstones,
    getSessionPlannerDeletedBlockIds,
    cloneSessionPlannerBlockMergeValue,
    isSessionPlannerBlockFieldEmptyValue,
    getSessionPlannerBlockFieldUpdatedAtMs,
    markSessionPlannerBlockFieldsUpdated,
    mergeSessionPlannerBlockForWrite,
    filterSessionPlannerDeletedBlocksForWrite,
    mergeSessionPlannerSessionForWrite,
    cloneSessionPlannerState,
    mergeSessionPlannerStateForWrite,
    mergeSessionPlannerStateFromBackup,
  };
}
