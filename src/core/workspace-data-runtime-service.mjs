export function createWorkspaceDataRuntimeService(deps = {}) {
  const win = deps.win ?? globalThis.window ?? {};
  const ui = deps.ui ?? {};
  const call = (name, ...args) => deps[name]?.(...args);

  let periodizationMultiSelectOpenField = "";
  let periodizationDayOverlayOpen = false;
  let periodizationDayOverlayMode = "view";

  const getPeriodizationState = () => call("getPeriodizationState") || null;
  const setPeriodizationState = (nextState) => call("setPeriodizationState", nextState);
  const getScheduleState = () => call("getScheduleState") || null;
  const setScheduleState = (nextState) => call("setScheduleState", nextState);
  const getScoutingState = () => call("getScoutingState") || null;
  const setScoutingState = (nextState) => call("setScoutingState", nextState);
  const getTransferRoomState = () => call("getTransferRoomState") || null;
  const setTransferRoomState = (nextState) => call("setTransferRoomState", nextState);
  const getTransferRoomRuntime = () => call("getTransferRoomRuntime") || null;

  function getPeriodizationDay(dateValue) {
    return call("getPeriodizationDayFromState", dateValue, getPeriodizationState());
  }

  function ensurePeriodizationState() {
    let state = getPeriodizationState();
    if (!state) {
      state = readPeriodizationState();
      setPeriodizationState(state);
    }
    return state;
  }

  function writePeriodizationDay(dateValue, patch = {}, shouldRender = true) {
    const state = getPeriodizationState();
    if (!state || !call("isDateValueInYear", dateValue) || !call("canEditPeriodizationWorkspace")) {
      return;
    }
    const previousDay = getPeriodizationDay(dateValue);
    const nextDay = call("normalizePeriodizationDay", {
      ...previousDay,
      ...patch,
    });
    const fieldUpdatedAtKey = deps.periodizationFieldUpdatedAtKey;
    const fieldUpdatedAt = {
      ...(previousDay[fieldUpdatedAtKey] || {}),
      ...(nextDay[fieldUpdatedAtKey] || {}),
    };
    const now = new Date().toISOString();
    Object.keys(patch || {}).forEach((key) => {
      if (deps.periodizationTrackedFields?.has(key)) {
        fieldUpdatedAt[key] = now;
      }
    });
    if (Object.keys(fieldUpdatedAt).length) {
      nextDay[fieldUpdatedAtKey] = fieldUpdatedAt;
    }
    state.days[dateValue] = nextDay;
    writePeriodizationState();
    if (shouldRender) {
      call("renderPeriodizationWorkspace");
    }
  }

  function selectPeriodizationDate(dateValue, shouldOpenOverlay = true, overlayMode = "view") {
    const state = getPeriodizationState();
    if (!state || !call("isDateValueInYear", dateValue)) {
      return;
    }
    const date = call("parseScheduleDateValue", dateValue);
    const safeOverlayMode = overlayMode === "edit" && !call("canEditPeriodizationWorkspace") ? "view" : overlayMode;
    state.selectedDate = dateValue;
    state.selectedMonthIndex = date.getMonth();
    periodizationDayOverlayOpen = shouldOpenOverlay;
    periodizationDayOverlayMode = safeOverlayMode;
    writePeriodizationState({ syncCentral: false });
    call("renderPeriodizationWorkspace");
  }

  function openPeriodizationDateForDashboard(dateValue) {
    ensurePeriodizationState();
    if (dateValue && call("isDateValueInYear", dateValue)) {
      const state = getPeriodizationState();
      const date = call("parseScheduleDateValue", dateValue);
      state.selectedDate = dateValue;
      state.selectedMonthIndex = date.getMonth();
      periodizationDayOverlayOpen = true;
      periodizationDayOverlayMode = "view";
      writePeriodizationState({ syncCentral: false });
    }
  }

  function setPeriodizationStateStorageValue(state = getPeriodizationState(), options = {}) {
    const shouldSyncCentral = options.syncCentral !== false;
    if (!shouldSyncCentral) {
      call("rawDataSafetySetItem", deps.periodizationStorageKey, JSON.stringify(state));
      return;
    }
    win.localStorage.setItem(deps.periodizationStorageKey, JSON.stringify(state));
  }

  function readPeriodizationState() {
    try {
      const raw = win.localStorage.getItem(deps.periodizationStorageKey);
      const state = raw ? call("clonePeriodizationState", JSON.parse(raw)) : call("clonePeriodizationState", deps.defaultPeriodizationState);
      const normalizedValue = JSON.stringify(state);
      if (raw !== normalizedValue) {
        setPeriodizationStateStorageValue(state, { syncCentral: false });
      }
      return state;
    } catch {
      const state = call("clonePeriodizationState", deps.defaultPeriodizationState);
      try {
        setPeriodizationStateStorageValue(state, { syncCentral: false });
      } catch {}
      return state;
    }
  }

  function writePeriodizationState(options = {}) {
    const state = getPeriodizationState();
    if (!state) {
      return;
    }
    try {
      setPeriodizationStateStorageValue(state, options);
    } catch {
      call("logEvent", "Periodization settings could not be written to local storage.");
    }
  }

  function setPeriodizationMonth(monthIndex) {
    const state = getPeriodizationState();
    if (!state || monthIndex < 0 || monthIndex > 11) {
      return;
    }
    periodizationDayOverlayOpen = false;
    periodizationDayOverlayMode = "view";
    state.selectedMonthIndex = monthIndex;
    const monthStart = new Date(deps.periodizationYear, monthIndex, 1);
    const selectedDate = call("parseScheduleDateValue", state.selectedDate);
    if (selectedDate.getFullYear() !== deps.periodizationYear || selectedDate.getMonth() !== monthIndex) {
      state.selectedDate = call("formatScheduleDateValue", monthStart);
    }
    writePeriodizationState({ syncCentral: false });
    if (call("getActiveWorkspaceId") === "periodization") {
      call("renderPeriodizationWorkspace");
    }
  }

  function shiftPeriodizationMonth(delta) {
    const state = getPeriodizationState();
    if (!state) {
      return;
    }
    setPeriodizationMonth(state.selectedMonthIndex + delta);
  }

  function scrollPeriodizationDateIntoView(dateValue, options = {}) {
    if (!ui.periodizationBoard || !dateValue) {
      return;
    }
    const prefersReducedMotion = win.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const block = options.block || "center";
    const scrollSelectedCard = (behavior) => {
      const selectedCard = ui.periodizationBoard.querySelector(`[data-periodization-date="${dateValue}"]`);
      if (!selectedCard) {
        return null;
      }
      selectedCard.scrollIntoView({
        block,
        inline: "nearest",
        behavior,
      });
      return selectedCard;
    };
    const isCardInViewport = (card) => {
      if (!card?.getBoundingClientRect) {
        return true;
      }
      const rect = card.getBoundingClientRect();
      return rect.top >= 80 && rect.bottom <= win.innerHeight - 20;
    };
    win.requestAnimationFrame(() => {
      const selectedCard = scrollSelectedCard(options.behavior || (prefersReducedMotion ? "auto" : "smooth"));
      if (!selectedCard || options.ensure === false) {
        return;
      }
      win.setTimeout?.(() => {
        if (!isCardInViewport(selectedCard)) {
          scrollSelectedCard("auto");
        }
      }, Number(options.ensureDelayMs ?? 120));
    });
  }

  function jumpPeriodizationToToday() {
    ensurePeriodizationState();
    const state = getPeriodizationState();
    if (!state) {
      return;
    }
    const today = new Date();
    const todayDateValue = call("formatScheduleDateValue", new Date(deps.periodizationYear, today.getMonth(), today.getDate()));
    periodizationDayOverlayOpen = false;
    periodizationDayOverlayMode = "view";
    const nextState = call("clonePeriodizationState", {
      ...state,
      selectedMonthIndex: today.getMonth(),
      selectedDate: todayDateValue,
      days: state?.days ?? {},
    });
    setPeriodizationState(nextState);
    writePeriodizationState({ syncCentral: false });
    if (call("getActiveWorkspaceId") === "periodization") {
      call("renderPeriodizationWorkspace");
      scrollPeriodizationDateIntoView(todayDateValue);
    }
  }

  function mergeImportedNccSchedule(state) {
    return call("mergeImportedScheduleEvents", state, {
      importVersion: deps.importedNccScheduleVersion,
      events: deps.importedNccScheduleEvents,
    });
  }

  function setScheduleStateStorageValue(state = getScheduleState(), options = {}) {
    const shouldSyncCentral = options.syncCentral !== false;
    if (!shouldSyncCentral) {
      call("rawDataSafetySetItem", deps.scheduleStorageKey, JSON.stringify(state));
      return;
    }
    win.localStorage.setItem(deps.scheduleStorageKey, JSON.stringify(state));
  }

  function readScheduleState() {
    try {
      const raw = win.localStorage.getItem(deps.scheduleStorageKey);
      const state = raw ? call("cloneScheduleState", JSON.parse(raw)) : call("cloneScheduleState", deps.defaultScheduleState);
      const mergedState = mergeImportedNccSchedule(state);
      const mergedValue = JSON.stringify(mergedState);
      if (raw !== mergedValue) {
        setScheduleStateStorageValue(mergedState, { syncCentral: false });
      }
      return mergedState;
    } catch {
      return mergeImportedNccSchedule(deps.defaultScheduleState);
    }
  }

  function ensureScheduleState() {
    let state = getScheduleState();
    if (!state) {
      state = readScheduleState();
      setScheduleState(state);
    }
    return state;
  }

  function writeScheduleState(options = {}) {
    const state = getScheduleState();
    if (!state) {
      return;
    }
    try {
      setScheduleStateStorageValue(state, options);
    } catch {
      call("logEvent", "Schedule could not be written to local storage.");
    }
  }

  function setScoutingStateStorageValue(state = getScoutingState(), options = {}) {
    const shouldSyncCentral = options.syncCentral !== false;
    if (!shouldSyncCentral) {
      call("rawDataSafetySetItem", deps.scoutingStorageKey, JSON.stringify(state));
      return;
    }
    win.localStorage.setItem(deps.scoutingStorageKey, JSON.stringify(state));
  }

  function readScoutingState() {
    try {
      const raw = win.localStorage.getItem(deps.scoutingStorageKey);
      const state = raw ? call("cloneScoutingState", JSON.parse(raw)) : call("cloneScoutingState", deps.defaultScoutingState);
      const nextState = call("getActiveWorkspaceId") === "scouting" ? call("preserveScoutingTransientUiState", state, getScoutingState()) : state;
      const normalizedValue = JSON.stringify(nextState);
      if (raw !== normalizedValue) {
        setScoutingStateStorageValue(nextState, { syncCentral: false });
      }
      return nextState;
    } catch {
      const state = call("cloneScoutingState", deps.defaultScoutingState);
      try {
        setScoutingStateStorageValue(state, { syncCentral: false });
      } catch {}
      return state;
    }
  }

  function writeScoutingState(options = {}) {
    const state = getScoutingState();
    if (!state) {
      return;
    }
    try {
      setScoutingStateStorageValue(state, options);
    } catch {
      call("logEvent", "Scouting could not be written to local storage.");
    }
  }

  function ensureScoutingState() {
    let state = getScoutingState();
    if (!state) {
      state = readScoutingState();
      setScoutingState(state);
    }
    return state;
  }

  function readTransferRoomState() {
    return getTransferRoomRuntime()?.readState();
  }

  function ensureTransferRoomState() {
    return getTransferRoomRuntime()?.ensureState();
  }

  function syncTransferRoomLinkedState(options = {}) {
    if (!call("getPlayerProfilesState")) {
      call("setPlayerProfilesState", call("readPlayerProfilesState"));
    }
    ensureScoutingState();
    const nextState = ensureTransferRoomState();
    setTransferRoomState(nextState);
    if (options.render && call("getActiveWorkspaceId") === "transfer-room" && !call("shouldDeferCentralizedAppStateReload")) {
      call("renderTransferRoomWorkspace");
    }
    return getTransferRoomState();
  }

  function canUserAccessTransferRoom(user = call("getCurrentPlatformUser")) {
    return Boolean(getTransferRoomRuntime()?.canAccess(user));
  }

  function canUserEditTransferRoom(user = call("getCurrentPlatformUser")) {
    return Boolean(getTransferRoomRuntime()?.canAccess(user));
  }

  function addTransferRoomTargetFromScoutingSnapshot(snapshot = {}, options = {}) {
    return getTransferRoomRuntime()?.addTargetFromScoutingSnapshot(snapshot, options);
  }

  return {
    addTransferRoomTargetFromScoutingSnapshot,
    canUserAccessTransferRoom,
    canUserEditTransferRoom,
    ensurePeriodizationState,
    ensureScheduleState,
    ensureScoutingState,
    ensureTransferRoomState,
    getPeriodizationDay,
    getPeriodizationMultiSelectOpenField: () => periodizationMultiSelectOpenField,
    getPeriodizationOverlayState: () => ({ open: periodizationDayOverlayOpen, mode: periodizationDayOverlayMode }),
    jumpPeriodizationToToday,
    mergeImportedNccSchedule,
    openPeriodizationDateForDashboard,
    readPeriodizationState,
    readScheduleState,
    readScoutingState,
    readTransferRoomState,
    scrollPeriodizationDateIntoView,
    selectPeriodizationDate,
    setPeriodizationMonth,
    setPeriodizationMultiSelectOpenField: (fieldKey = "") => {
      periodizationMultiSelectOpenField = fieldKey;
    },
    setPeriodizationOverlayMode: (mode) => {
      periodizationDayOverlayMode = mode === "edit" ? "edit" : "view";
    },
    setPeriodizationOverlayState: ({ open, mode }) => {
      periodizationDayOverlayOpen = Boolean(open);
      periodizationDayOverlayMode = mode === "edit" ? "edit" : "view";
    },
    setPeriodizationSelection: (dateValue, monthIndex) => {
      const state = getPeriodizationState();
      if (!state) {
        return;
      }
      state.selectedDate = dateValue;
      state.selectedMonthIndex = Number.isInteger(monthIndex)
        ? monthIndex
        : call("parseScheduleDateValue", dateValue).getMonth();
    },
    setPeriodizationStateStorageValue,
    setScheduleStateStorageValue,
    setScoutingStateStorageValue,
    shiftPeriodizationMonth,
    syncTransferRoomLinkedState,
    writePeriodizationDay,
    writePeriodizationState,
    writeScheduleState,
    writeScoutingState,
  };
}
