import {
  getPresentationThemePreset,
  normalizePresentationSlideStyle,
} from "./presentation-mode-themes.mjs";

export const dashboardPresentationStorageKey = "football-dashboard-presentation-mode-v1";

const presentationSchema = "footballscience-presentation-mode-v1";
const maxTextOverrideLength = 5000;
const maxTextBoxesPerSlide = 12;
const maxShapesPerSlide = 24;
const maxUndoHistory = 80;
const shapeTypes = new Set(["rect", "circle", "triangle", "diamond", "line", "arrow", "star"]);
const resizeAxes = new Set(["n", "ne", "e", "se", "s", "sw", "w", "nw"]);

function noop() {}

function clonePlain(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function defaultReadJson() {
  return null;
}

function defaultWriteJson() {}

function defaultEscapeHtml(value = "") {
  return String(value ?? "");
}

function defaultFormatDateLabel(dateValue) {
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return String(dateValue || "");
  }
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function normalizeDateValue(value = "", fallback = "") {
  const dateValue = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(dateValue) ? dateValue : fallback;
}

function normalizeHexColor(value = "", fallback = "#38bdf8") {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
}

function normalizeOpacity(value = "", fallback = 90) {
  const numericValue = Number(value);
  const safeFallback = Number.isFinite(Number(fallback)) ? Number(fallback) : 90;
  return Number(Math.min(100, Math.max(0, Number.isFinite(numericValue) ? numericValue : safeFallback)).toFixed(0));
}

function normalizeFontSize(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  const legacySizes = {
    normal: "40",
    large: "56",
    hero: "72",
  };
  if (legacySizes[normalized]) {
    return legacySizes[normalized];
  }
  const numericSize = Number.parseInt(normalized, 10);
  if (!Number.isFinite(numericSize)) {
    return "56";
  }
  return String(Math.min(128, Math.max(16, numericSize)));
}

function getSlideLabel(title = "", fallback = "Slide") {
  const label = String(title || "").trim() || fallback;
  return label.length > 18 ? `${label.slice(0, 17).trim()}...` : label;
}

function getSessionPitchLabel(blocks = []) {
  const values = [
    ...new Set(
      (Array.isArray(blocks) ? blocks : [])
        .map((block) => String(block?.pitchSize || "").trim())
        .filter(Boolean)
    ),
  ];
  if (!values.length) {
    return "";
  }
  return values.length === 1 ? values[0] : "Mixed pitch";
}

function createDefaultInfoSlide(dateValue = "") {
  return {
    id: `info-${dateValue || "date"}-main`,
    title: "Team Information",
    body: "- Meeting point\n- Training focus\n- Staff note",
    fontSize: "56",
    accentColor: "#38bdf8",
    textColor: "#f8fafc",
  };
}

function normalizeSlideStyles(slideStyles = {}) {
  const styles = slideStyles && typeof slideStyles === "object" && !Array.isArray(slideStyles) ? slideStyles : {};
  return Object.fromEntries(
    Object.entries(styles)
      .map(([slideId, style]) => [String(slideId || "").trim(), normalizePresentationSlideStyle(style)])
      .filter(([slideId]) => slideId)
  );
}

function normalizeTextOverrides(textOverrides = {}) {
  const overrides = textOverrides && typeof textOverrides === "object" && !Array.isArray(textOverrides) ? textOverrides : {};
  return Object.fromEntries(
    Object.entries(overrides)
      .map(([slideId, fields]) => {
        const slideFields = fields && typeof fields === "object" && !Array.isArray(fields) ? fields : {};
        return [
          String(slideId || "").trim(),
          Object.fromEntries(
            Object.entries(slideFields)
              .map(([field, value]) => [
                String(field || "").trim(),
                String(value ?? "").slice(0, maxTextOverrideLength),
              ])
              .filter(([field]) => field)
          ),
        ];
      })
      .filter(([slideId, fields]) => slideId && Object.keys(fields).length)
  );
}

function normalizeTextFieldStyles(textFieldStyles = {}) {
  const styles = textFieldStyles && typeof textFieldStyles === "object" && !Array.isArray(textFieldStyles) ? textFieldStyles : {};
  return Object.fromEntries(
    Object.entries(styles)
      .map(([slideId, fields]) => {
        const slideFields = fields && typeof fields === "object" && !Array.isArray(fields) ? fields : {};
        return [
          String(slideId || "").trim(),
          Object.fromEntries(
            Object.entries(slideFields)
              .map(([field, style]) => {
                const textStyle = style && typeof style === "object" && !Array.isArray(style) ? style : {};
                const normalized = {
                  fontSize: textStyle.fontSize ? normalizeFontSize(textStyle.fontSize) : "",
                  textColor: textStyle.textColor ? normalizeHexColor(textStyle.textColor, "") : "",
                };
                return [
                  String(field || "").trim(),
                  Object.fromEntries(Object.entries(normalized).filter(([, value]) => value)),
                ];
              })
              .filter(([field, style]) => field && Object.keys(style).length)
          ),
        ];
      })
      .filter(([slideId, fields]) => slideId && Object.keys(fields).length)
  );
}

function normalizeTextBoxes(textBoxes = {}) {
  const boxes = textBoxes && typeof textBoxes === "object" && !Array.isArray(textBoxes) ? textBoxes : {};
  return Object.fromEntries(
    Object.entries(boxes)
      .map(([slideId, slideBoxes]) => [
        String(slideId || "").trim(),
        (Array.isArray(slideBoxes) ? slideBoxes : [])
          .slice(0, maxTextBoxesPerSlide)
          .map((box, index) => {
            const safeBox = box && typeof box === "object" && !Array.isArray(box) ? box : {};
            const id = String(safeBox.id || `textbox-${index + 1}`).trim();
            const width = Math.min(70, Math.max(14, Number(safeBox.width) || 28));
            return {
              id,
              kind: safeBox.kind === "symbol" ? "symbol" : "text",
              x: Math.min(96 - width, Math.max(2, Number(safeBox.x) || 12)),
              y: Math.min(88, Math.max(4, Number(safeBox.y) || 22)),
              width,
              text: String(safeBox.text ?? "Text box").slice(0, maxTextOverrideLength),
              fontSize: normalizeFontSize(safeBox.fontSize || "36"),
              textColor: normalizeHexColor(safeBox.textColor, "#f8fafc"),
            };
          })
          .filter((box) => box.id),
      ])
      .filter(([slideId, slideBoxes]) => slideId && slideBoxes.length)
  );
}

function normalizeShapeSize(type = "rect", width = 12, height = 12) {
  const safeType = shapeTypes.has(String(type || "").trim()) ? String(type).trim() : "rect";
  const fallbackWidth = safeType === "line" ? 24 : safeType === "arrow" ? 22 : 14;
  const fallbackHeight = safeType === "line" ? 1.4 : safeType === "arrow" ? 8 : 14;
  const minWidth = safeType === "line" ? 6 : 3;
  const minHeight = safeType === "line" ? 1 : 2.5;
  return {
    width: Number(Math.min(88, Math.max(minWidth, Number(width) || fallbackWidth)).toFixed(2)),
    height: Number(Math.min(84, Math.max(minHeight, Number(height) || fallbackHeight)).toFixed(2)),
  };
}

function normalizeShapes(shapes = {}) {
  const slideShapes = shapes && typeof shapes === "object" && !Array.isArray(shapes) ? shapes : {};
  return Object.fromEntries(
    Object.entries(slideShapes)
      .map(([slideId, items]) => [
        String(slideId || "").trim(),
        (Array.isArray(items) ? items : [])
          .slice(0, maxShapesPerSlide)
          .map((shape, index) => {
            const safeShape = shape && typeof shape === "object" && !Array.isArray(shape) ? shape : {};
            const type = shapeTypes.has(String(safeShape.type || "").trim()) ? String(safeShape.type).trim() : "rect";
            const size = normalizeShapeSize(type, safeShape.width, safeShape.height);
            return {
              id: String(safeShape.id || `shape-${index + 1}`).trim(),
              type,
              x: Math.min(98 - size.width, Math.max(1, Number(safeShape.x) || 18)),
              y: Math.min(96 - size.height, Math.max(2, Number(safeShape.y) || 24)),
              ...size,
              fillColor: normalizeHexColor(safeShape.fillColor, "#38bdf8"),
              opacity: normalizeOpacity(safeShape.opacity, 90),
              strokeColor: normalizeHexColor(safeShape.strokeColor, "#f8fafc"),
            };
          })
          .filter((shape) => shape.id),
      ])
      .filter(([slideId, items]) => slideId && items.length)
  );
}

function normalizeInfoSlide(slide = {}, index = 0, dateValue = "") {
  const fallback = createDefaultInfoSlide(dateValue);
  return {
    id: String(slide.id || (index ? `info-${dateValue}-${index + 1}` : fallback.id)).trim(),
    title: String(slide.title ?? fallback.title).trim().slice(0, 90),
    body: String(slide.body ?? fallback.body).slice(0, 5000),
    fontSize: normalizeFontSize(slide.fontSize),
    accentColor: normalizeHexColor(slide.accentColor, fallback.accentColor),
    textColor: normalizeHexColor(slide.textColor, fallback.textColor),
  };
}

function normalizeDeck(deck = {}, dateValue = "") {
  const hasSavedInfoSlides = Array.isArray(deck?.infoSlides);
  const infoSlides = hasSavedInfoSlides
    ? deck.infoSlides.map((slide, index) => normalizeInfoSlide(slide, index, dateValue)).filter((slide) => slide.id)
    : [];
  return {
    updatedAt: String(deck.updatedAt || "").trim(),
    infoSlides: hasSavedInfoSlides ? infoSlides : [createDefaultInfoSlide(dateValue)],
    shapes: normalizeShapes(deck.shapes),
    slideStyles: normalizeSlideStyles(deck.slideStyles),
    textBoxes: normalizeTextBoxes(deck.textBoxes),
    textFieldStyles: normalizeTextFieldStyles(deck.textFieldStyles),
    textOverrides: normalizeTextOverrides(deck.textOverrides),
  };
}

function normalizeStore(store = {}) {
  const decks = store?.decks && typeof store.decks === "object" && !Array.isArray(store.decks) ? store.decks : {};
  return {
    schema: presentationSchema,
    version: 1,
    decks: Object.fromEntries(
      Object.entries(decks)
        .filter(([dateValue]) => /^\d{4}-\d{2}-\d{2}$/.test(dateValue))
        .map(([dateValue, deck]) => [dateValue, normalizeDeck(deck, dateValue)])
    ),
  };
}

function getBlockRule(blockIndex = 0) {
  const blockNumber = blockIndex + 1;
  if (blockNumber <= 1) return { blockNumber, label: "Block 1", valueLabel: "10%+", min: 10 };
  if (blockNumber === 2) return { blockNumber, label: "Block 2", valueLabel: "25%+", min: 25 };
  if (blockNumber === 3) return { blockNumber, label: "Block 3", valueLabel: "50%+", min: 50 };
  return { blockNumber, label: `Block ${blockNumber}`, valueLabel: "75%+", min: 75 };
}

function isPlayerVisibleForRule(participation, rule) {
  const value = Number(participation);
  return Number.isFinite(value) && value > 0 && value >= rule.min;
}

function getDataObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizePlayerItem(item = {}, block = {}) {
  const player = item.player || {};
  const playerId = String(player.id || player.playerId || player.profileId || player.name || "").trim();
  if (!playerId || !player.name) {
    return null;
  }
  const colors = getDataObject(block.playerBoardColors);
  return {
    ...item,
    player: {
      ...player,
      id: playerId,
      name: String(player.name || "Player").trim(),
    },
    participation: Number.isFinite(Number(item.participation)) ? Number(item.participation) : null,
    statusLabel: String(item.status?.label || item.statusLabel || "").trim(),
    color: normalizeHexColor(colors[playerId], ""),
  };
}

function sortPlannedPlayers(first, second) {
  const firstColor = first.color || "";
  const secondColor = second.color || "";
  if (firstColor !== secondColor) return firstColor.localeCompare(secondColor);
  const participationDelta = Number(second.participation || 0) - Number(first.participation || 0);
  if (participationDelta) return participationDelta;
  return String(first.player?.name || "").localeCompare(String(second.player?.name || ""));
}

function sortNonParticipants(first, second) {
  const participationDelta = Number(first.participation || 0) - Number(second.participation || 0);
  if (participationDelta) return participationDelta;
  return String(first.player?.name || "").localeCompare(String(second.player?.name || ""));
}

function sortMedicalRecommendations(first, second) {
  const firstParticipation = Number.isFinite(Number(first.participation)) ? Number(first.participation) : 101;
  const secondParticipation = Number.isFinite(Number(second.participation)) ? Number(second.participation) : 101;
  if (firstParticipation !== secondParticipation) return firstParticipation - secondParticipation;
  return String(first.player?.name || "").localeCompare(String(second.player?.name || ""));
}

export function createPresentationModeController(dependencies = {}) {
  const {
    documentRef = globalThis.document,
    win = globalThis.window,
    renderer,
    storageKey = dashboardPresentationStorageKey,
    readJson = defaultReadJson,
    writeJson = defaultWriteJson,
    getTodayValue = () => new Date().toISOString().slice(0, 10),
    getPasses = () => [],
    getSessionForDate = () => ({ blocks: [] }),
    getScheduleEventsForDate = () => [],
    getScheduleMainEvent = (events = []) => events[0] || null,
    getScheduledSessionTitle = () => "",
    getPeriodizationDay = () => ({}),
    getAvailabilityItems = () => [],
    getCustomPeople = () => [],
    createCustomPersonItem = () => null,
    getTeam = () => ({}),
    getTeamName = () => "Football Science",
    getTeamLogoUrl = () => "",
    formatDateLabel = defaultFormatDateLabel,
    isEditableTarget = () => false,
    escapeHtml = defaultEscapeHtml,
    onDeckChange = noop,
  } = dependencies;

  const state = {
    activeShapeTarget: null,
    activeTextTarget: null,
    bound: false,
    dateValue: "",
    drawShape: null,
    dragShape: null,
    dragTextBox: null,
    editorOpen: false,
    isOpen: false,
    presenting: false,
    resizeShape: null,
    resizeTextBox: null,
    shapeDrawTool: null,
    slideIndex: 0,
    redoStack: [],
    undoStack: [],
  };
  let root = null;
  let stageResizeObserver = null;
  let stageMetricsFrame = 0;

  function ensureRoot() {
    if (root) return root;
    root = documentRef.createElement("div");
    root.id = "presentationModeRoot";
    root.className = "presentation-mode-root";
    root.hidden = true;
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    documentRef.body.appendChild(root);
    return root;
  }

  function readStore() {
    return normalizeStore(readJson(storageKey, {}));
  }

  function writeStore(store) {
    writeJson(storageKey, normalizeStore(store));
    onDeckChange();
  }

  function getDeckForDate(dateValue = state.dateValue) {
    return normalizeDeck(readStore().decks?.[dateValue], dateValue);
  }

  function getHistoryDeckSnapshot(deck = {}, dateValue = "") {
    const { updatedAt, ...snapshot } = normalizeDeck(deck, dateValue);
    return clonePlain(snapshot);
  }

  function getHistoryStateSnapshot() {
    return {
      activeShapeTarget: clonePlain(state.activeShapeTarget),
      activeTextTarget: clonePlain(state.activeTextTarget),
      slideIndex: state.slideIndex,
    };
  }

  function resetUndoHistory() {
    state.undoStack = [];
    state.redoStack = [];
  }

  function decksMatch(firstDeck = {}, secondDeck = {}, dateValue = "") {
    return JSON.stringify(getHistoryDeckSnapshot(firstDeck, dateValue)) === JSON.stringify(getHistoryDeckSnapshot(secondDeck, dateValue));
  }

  function pushUndoSnapshot(dateValue = "", deck = {}) {
    if (!dateValue) {
      return;
    }
    const snapshot = {
      dateValue,
      deck: getHistoryDeckSnapshot(deck, dateValue),
      state: getHistoryStateSnapshot(),
    };
    const previousSnapshot = state.undoStack.at(-1);
    if (
      previousSnapshot?.dateValue === snapshot.dateValue &&
      JSON.stringify(previousSnapshot.deck) === JSON.stringify(snapshot.deck)
    ) {
      return;
    }
    state.undoStack.push(snapshot);
    if (state.undoStack.length > maxUndoHistory) {
      state.undoStack.splice(0, state.undoStack.length - maxUndoHistory);
    }
    state.redoStack = [];
  }

  function restoreHistorySnapshot(snapshot = {}) {
    const dateValue = normalizeDateValue(snapshot.dateValue, state.dateValue);
    if (!dateValue) {
      return false;
    }
    const store = readStore();
    const nextDeck = normalizeDeck(snapshot.deck, dateValue);
    writeStore({
      ...store,
      decks: {
        ...store.decks,
        [dateValue]: {
          ...nextDeck,
          updatedAt: new Date().toISOString(),
        },
      },
    });
    state.dateValue = dateValue;
    state.activeShapeTarget = clonePlain(snapshot.state?.activeShapeTarget);
    state.activeTextTarget = clonePlain(snapshot.state?.activeTextTarget);
    state.drawShape = null;
    state.dragShape = null;
    state.dragTextBox = null;
    state.resizeShape = null;
    state.resizeTextBox = null;
    state.shapeDrawTool = null;
    documentRef.body?.classList?.remove("is-presentation-shape-drawing");
    documentRef.body?.classList?.remove("is-presentation-text-box-dragging");
    documentRef.body?.classList?.remove("is-presentation-text-box-resizing");
    documentRef.body?.classList?.remove("is-presentation-shape-dragging");
    documentRef.body?.classList?.remove("is-presentation-shape-resizing");
    const slideCount = buildModel().slides.length;
    state.slideIndex = Math.min(Math.max(0, Number(snapshot.state?.slideIndex) || 0), Math.max(0, slideCount - 1));
    render();
    focusActiveTextElement();
    return true;
  }

  function undoDeckChange() {
    if (state.presenting || documentRef.fullscreenElement || state.undoStack.length === 0) {
      return false;
    }
    const snapshot = state.undoStack.pop();
    state.redoStack.push({
      dateValue: state.dateValue,
      deck: getHistoryDeckSnapshot(getDeckForDate(), state.dateValue),
      state: getHistoryStateSnapshot(),
    });
    restoreHistorySnapshot(snapshot);
    return true;
  }

  function redoDeckChange() {
    if (state.presenting || documentRef.fullscreenElement || state.redoStack.length === 0) {
      return false;
    }
    const snapshot = state.redoStack.pop();
    state.undoStack.push({
      dateValue: state.dateValue,
      deck: getHistoryDeckSnapshot(getDeckForDate(), state.dateValue),
      state: getHistoryStateSnapshot(),
    });
    restoreHistorySnapshot(snapshot);
    return true;
  }

  function isUndoShortcut(event) {
    return (event.metaKey || event.ctrlKey) && !event.shiftKey && String(event.key || "").toLowerCase() === "z";
  }

  function isRedoShortcut(event) {
    const key = String(event.key || "").toLowerCase();
    return ((event.metaKey || event.ctrlKey) && event.shiftKey && key === "z") || (event.ctrlKey && !event.metaKey && key === "y");
  }

  function writeDeckForDate(dateValue, updater, options = {}) {
    const store = readStore();
    const currentDeck = normalizeDeck(store.decks?.[dateValue], dateValue);
    const nextDeck = normalizeDeck(updater(currentDeck), dateValue);
    if (decksMatch(currentDeck, nextDeck, dateValue)) {
      return;
    }
    if (options.recordHistory !== false) {
      pushUndoSnapshot(dateValue, currentDeck);
    }
    writeStore({
      ...store,
      decks: {
        ...store.decks,
        [dateValue]: {
          ...nextDeck,
          updatedAt: new Date().toISOString(),
        },
      },
    });
  }

  function clampTextBoxPosition(x, y, width = 30) {
    const safeWidth = Math.min(70, Math.max(14, Number(width) || 30));
    return {
      x: Number(Math.min(96 - safeWidth, Math.max(2, Number(x) || 2)).toFixed(2)),
      y: Number(Math.min(88, Math.max(4, Number(y) || 4)).toFixed(2)),
    };
  }

  function clampTextBoxWidth(width = 30) {
    return Number(Math.min(70, Math.max(14, Number(width) || 30)).toFixed(2));
  }

  function clampShapePosition(x, y, width = 12, height = 12) {
    const safeWidth = Math.min(88, Math.max(1, Number(width) || 12));
    const safeHeight = Math.min(84, Math.max(1, Number(height) || 12));
    return {
      x: Number(Math.min(98 - safeWidth, Math.max(1, Number(x) || 1)).toFixed(2)),
      y: Number(Math.min(96 - safeHeight, Math.max(2, Number(y) || 2)).toFixed(2)),
    };
  }

  function getResizeAxis(element = null, fallback = "se") {
    const axis = String(element?.dataset?.presentationResizeAxis || fallback || "se").trim().toLowerCase();
    return resizeAxes.has(axis) ? axis : "se";
  }

  function getTextBoxField(boxId = "") {
    return `textbox.${String(boxId || "").trim()}.text`;
  }

  function getResolvedPasses(dateValue = state.dateValue) {
    const rawPasses = getPasses(dateValue);
    const passes = Array.isArray(rawPasses) ? rawPasses : [];
    if (passes.some((pass) => pass.dateValue === dateValue)) {
      return passes;
    }
    const session = getSessionForDate(dateValue);
    return [
      {
        dateValue,
        dateLabel: formatDateLabel(dateValue),
        title: getScheduledSessionTitle(dateValue) || session?.title || "Selected session",
        blockCount: Array.isArray(session?.blocks) ? session.blocks.length : 0,
        totalMinutes: getSessionTotalMinutes(session),
      },
      ...passes,
    ];
  }

  function getSessionTotalMinutes(session = {}) {
    return (Array.isArray(session?.blocks) ? session.blocks : []).reduce(
      (total, block) => total + (Number(block?.minutes) || 0),
      0
    );
  }

  function getPlayerSummaryForBlock(dateValue, block = {}, blockIndex = 0) {
    const rule = getBlockRule(blockIndex);
    const availabilityItems = getAvailabilityItems(dateValue)
      .map((item) => normalizePlayerItem(item, block))
      .filter(Boolean);
    const customItems = getCustomPeople(block)
      .map((person) => createCustomPersonItem(person))
      .map((item) => normalizePlayerItem(item, block))
      .filter(Boolean);
    const plannedFromAvailability = availabilityItems.filter(
      (item) => (item.record || item.planningOnly) && isPlayerVisibleForRule(item.participation, rule)
    );
    const plannedIds = new Set(plannedFromAvailability.map((item) => item.player.id));
    const nonParticipants = availabilityItems.filter(
      (item) =>
        item.record &&
        !plannedIds.has(item.player.id) &&
        Number.isFinite(Number(item.participation)) &&
        !isPlayerVisibleForRule(item.participation, rule)
    );
    return {
      rule,
      plannedPlayers: [...plannedFromAvailability, ...customItems].sort(sortPlannedPlayers),
      nonParticipants: nonParticipants.sort(sortNonParticipants),
    };
  }

  function getMedicalRecommendationsForDate(dateValue) {
    const seenPlayerIds = new Set();
    return getAvailabilityItems(dateValue)
      .map((item) => normalizePlayerItem(item))
      .filter(Boolean)
      .filter((item) => {
        const playerId = String(item.player?.id || "").trim();
        if (!playerId || seenPlayerIds.has(playerId)) {
          return false;
        }
        seenPlayerIds.add(playerId);
        return true;
      })
      .sort(sortMedicalRecommendations);
  }

  function getBrandModel() {
    const team = getTeam() || {};
    const teamName = getTeamName(team) || team.name || "Football Science";
    return {
      teamName,
      logoUrl: getTeamLogoUrl(team),
      fallbackLogoUrl: "assets/football-science-logo.png",
    };
  }

  function applySlideStyle(deck, slide, fallbackStyle = {}) {
    const style = normalizePresentationSlideStyle(deck.slideStyles?.[slide.id], fallbackStyle);
    return {
      ...slide,
      accentColor: style.accentColor,
      style,
      shapes: deck.shapes?.[slide.id] || [],
      textBoxes: deck.textBoxes?.[slide.id] || [],
      textFieldStyles: deck.textFieldStyles?.[slide.id] || {},
      textOverrides: deck.textOverrides?.[slide.id] || {},
    };
  }

  function buildSlides(deck, session, dateValue) {
    const blocks = Array.isArray(session?.blocks) ? session.blocks : [];
    return [
      applySlideStyle(deck, { id: "cover", type: "cover", label: "Cover" }, { accentColor: "#22c55e" }),
      ...deck.infoSlides.map((infoSlide, index) => ({
        ...applySlideStyle(
          deck,
          {
            id: infoSlide.id,
            type: "info",
            label: getSlideLabel(infoSlide.title, index ? `Slide ${index + 1}` : "Info"),
            infoSlide,
          },
          { accentColor: infoSlide.accentColor, textColor: infoSlide.textColor }
        ),
      })),
      applySlideStyle(deck, { id: "overview", type: "overview", label: "Overview" }, { accentColor: "#22c55e" }),
      ...blocks.map((block, index) =>
        applySlideStyle(
          deck,
          {
            id: block.id || `block-${index + 1}`,
            type: "block",
            label: block.label || `Block ${index + 1}`,
            block,
            playerSummary: getPlayerSummaryForBlock(dateValue, block, index),
          },
          { accentColor: "#f59e0b", glowColor: "#b45309" }
        )
      ),
    ].map((slide, index) => ({ ...slide, index }));
  }

  function buildModel() {
    const dateValue = normalizeDateValue(state.dateValue, getTodayValue());
    const session = getSessionForDate(dateValue) || { blocks: [] };
    const deck = getDeckForDate(dateValue);
    const events = getScheduleEventsForDate(dateValue);
    const event = getScheduleMainEvent(events) || null;
    const periodization = getPeriodizationDay(dateValue) || {};
    const blocks = Array.isArray(session.blocks) ? session.blocks : [];
    const slides = buildSlides(deck, session, dateValue);
    state.slideIndex = Math.min(Math.max(0, state.slideIndex), Math.max(0, slides.length - 1));
    const title = String(session.title || getScheduledSessionTitle(dateValue) || event?.title || "Training Session").trim();
    const brand = getBrandModel();
    return {
      accentColor: "#22c55e",
      blockCount: blocks.length,
      blocks,
      brand,
      dateLabel: formatDateLabel(dateValue),
      dateValue,
      editorOpen: state.editorOpen,
      event,
      activeShapeTarget: state.activeShapeTarget ? { ...state.activeShapeTarget } : null,
      activeTextTarget: state.activeTextTarget ? { ...state.activeTextTarget } : null,
      infoSlideCount: deck.infoSlides.length,
      loadLabel: periodization.physicalLoad || event?.type || "Not set",
      medicalRecommendations: getMedicalRecommendationsForDate(dateValue),
      passTypeLabel: event?.title || periodization.sessionType || "Training briefing",
      passes: getResolvedPasses(dateValue),
      periodization,
      pitchLabel: periodization.pitchSize || getSessionPitchLabel(blocks),
      presenting: state.presenting,
      sessionTheme: session.theme || periodization.mainFocus || "",
      sessionTitle: title,
      shapeDrawTool: state.shapeDrawTool,
      slideIndex: state.slideIndex,
      slides,
      teamName: brand.teamName,
      textToolbarOpen: !state.presenting,
      totalMinutes: getSessionTotalMinutes(session),
    };
  }

  function updateStageMetrics() {
    stageMetricsFrame = 0;
    if (!state.isOpen || !root || root.hidden) {
      return;
    }
    const stage = root.querySelector("[data-presentation-stage]");
    if (!stage) {
      return;
    }
    const rect = stage.getBoundingClientRect();
    const stageWidth = Math.max(0, Number(rect.width) || 0);
    const stageHeight = Math.max(0, Number(rect.height) || 0);
    if (!stageWidth || !stageHeight) {
      return;
    }
    const slideHeight = Math.min(stageHeight, stageWidth * (9 / 16));
    const slideWidth = slideHeight * (16 / 9);
    stage.style.setProperty("--presentation-stage-width", `${Number(stageWidth.toFixed(2))}px`);
    stage.style.setProperty("--presentation-stage-height", `${Number(stageHeight.toFixed(2))}px`);
    stage.style.setProperty("--presentation-slide-width", `${Number(slideWidth.toFixed(2))}px`);
    stage.style.setProperty("--presentation-slide-height", `${Number(slideHeight.toFixed(2))}px`);
  }

  function scheduleStageMetrics() {
    if (stageMetricsFrame || !state.isOpen) {
      return;
    }
    const requestFrame = win?.requestAnimationFrame?.bind(win) || ((callback) => win?.setTimeout?.(callback, 0));
    stageMetricsFrame = requestFrame(updateStageMetrics);
  }

  function disconnectStageMetrics() {
    stageResizeObserver?.disconnect?.();
    stageResizeObserver = null;
    if (stageMetricsFrame && win?.cancelAnimationFrame) {
      win.cancelAnimationFrame(stageMetricsFrame);
    }
    stageMetricsFrame = 0;
  }

  function observeStageMetrics() {
    const stage = root?.querySelector("[data-presentation-stage]");
    if (!stage) {
      return;
    }
    stageResizeObserver?.disconnect?.();
    if (typeof win?.ResizeObserver === "function") {
      stageResizeObserver = new win.ResizeObserver(scheduleStageMetrics);
      stageResizeObserver.observe(stage);
    }
    scheduleStageMetrics();
  }

  function render() {
    if (!state.isOpen || !renderer) {
      return;
    }
    const currentRoot = ensureRoot();
    currentRoot.hidden = false;
    currentRoot.innerHTML = renderer.render(buildModel());
    documentRef.body.classList.add("is-presentation-mode-open");
    syncTextToolbar();
    observeStageMetrics();
  }

  function open(dateValue = "") {
    state.activeShapeTarget = null;
    state.activeTextTarget = null;
    state.drawShape = null;
    state.dragShape = null;
    state.dragTextBox = null;
    state.resizeShape = null;
    state.resizeTextBox = null;
    state.shapeDrawTool = null;
    state.dateValue = normalizeDateValue(dateValue, getTodayValue());
    state.slideIndex = 0;
    state.editorOpen = false;
    state.isOpen = true;
    resetUndoHistory();
    render();
    ensureRoot().querySelector("[data-presentation-stage]")?.focus?.();
  }

  function close() {
    state.activeShapeTarget = null;
    state.activeTextTarget = null;
    state.drawShape = null;
    state.dragShape = null;
    state.dragTextBox = null;
    state.resizeShape = null;
    state.resizeTextBox = null;
    state.shapeDrawTool = null;
    state.isOpen = false;
    state.editorOpen = false;
    state.presenting = false;
    resetUndoHistory();
    if (documentRef.fullscreenElement && root?.contains(documentRef.fullscreenElement)) {
      documentRef.exitFullscreen?.().catch?.(noop);
    }
    if (root) {
      root.hidden = true;
      root.innerHTML = "";
    }
    disconnectStageMetrics();
    documentRef.body.classList.remove("is-presentation-mode-open");
    documentRef.body?.classList?.remove("is-presentation-shape-drawing");
    documentRef.body?.classList?.remove("is-presentation-text-box-dragging");
    documentRef.body?.classList?.remove("is-presentation-text-box-resizing");
    documentRef.body?.classList?.remove("is-presentation-shape-dragging");
    documentRef.body?.classList?.remove("is-presentation-shape-resizing");
  }

  function goToSlide(index) {
    const slideCount = buildModel().slides.length;
    state.slideIndex = Math.min(Math.max(0, Number(index) || 0), Math.max(0, slideCount - 1));
    state.editorOpen = false;
    state.activeShapeTarget = null;
    state.activeTextTarget = null;
    state.drawShape = null;
    state.dragShape = null;
    state.dragTextBox = null;
    state.resizeShape = null;
    state.resizeTextBox = null;
    state.shapeDrawTool = null;
    documentRef.body?.classList?.remove("is-presentation-shape-drawing");
    documentRef.body?.classList?.remove("is-presentation-text-box-resizing");
    documentRef.body?.classList?.remove("is-presentation-shape-resizing");
    render();
  }

  function updateInfoSlideField(slideId, field, value, options = {}) {
    const allowedFields = new Set(["title", "body", "fontSize", "accentColor", "textColor"]);
    if (!allowedFields.has(field) || !slideId) {
      return;
    }
    writeDeckForDate(state.dateValue, (deck) => ({
      ...deck,
      infoSlides: deck.infoSlides.map((slide) =>
        slide.id === slideId
          ? normalizeInfoSlide(
              {
                ...slide,
                [field]:
                  field === "fontSize"
                    ? normalizeFontSize(value)
                    : field === "accentColor" || field === "textColor"
                      ? normalizeHexColor(value, slide[field])
                      : String(value ?? ""),
              },
              0,
              state.dateValue
            )
          : slide
      ),
      slideStyles:
        field === "accentColor" || field === "textColor"
          ? {
              ...deck.slideStyles,
              [slideId]: normalizePresentationSlideStyle(
                {
                  ...(deck.slideStyles?.[slideId] || {}),
                  theme: "custom",
                  [field]: normalizeHexColor(value, deck.slideStyles?.[slideId]?.[field]),
                },
                deck.slideStyles?.[slideId]
              ),
            }
          : deck.slideStyles,
    }));
    if (options.render) {
      render();
    }
  }

  function updateCurrentSlideStyle(field, value) {
    const allowedFields = new Set(["theme", "accentColor", "backgroundColor", "glowColor", "textColor"]);
    if (!allowedFields.has(field)) {
      return;
    }
    const currentSlide = buildModel().slides[state.slideIndex];
    if (!currentSlide?.id) {
      return;
    }
    writeDeckForDate(state.dateValue, (deck) => {
      const currentStyle = normalizePresentationSlideStyle(deck.slideStyles?.[currentSlide.id], currentSlide.style);
      let nextStyle;
      if (field === "theme") {
        const themeValue = String(value || "").trim();
        if (themeValue === "custom") {
          nextStyle = normalizePresentationSlideStyle({ ...currentStyle, theme: "custom" }, currentSlide.style);
        } else {
          const preset = getPresentationThemePreset(themeValue);
          nextStyle = normalizePresentationSlideStyle(
            {
              theme: preset.value,
              accentColor: preset.accentColor,
              backgroundColor: preset.backgroundColor,
              glowColor: preset.glowColor,
              textColor: preset.textColor,
            },
            currentSlide.style
          );
        }
      } else {
        nextStyle = normalizePresentationSlideStyle(
          {
            ...currentStyle,
            theme: "custom",
            [field]: normalizeHexColor(value, currentStyle[field]),
          },
          currentSlide.style
        );
      }
      return {
        ...deck,
        slideStyles: {
          ...deck.slideStyles,
          [currentSlide.id]: nextStyle,
        },
      };
    });
    render();
  }

  function updateTextOverride(slideId = "", field = "", value = "") {
    const safeSlideId = String(slideId || "").trim();
    const safeField = String(field || "").trim();
    if (!safeSlideId || !safeField) {
      return;
    }
    writeDeckForDate(state.dateValue, (deck) => ({
      ...deck,
      textOverrides: normalizeTextOverrides({
        ...deck.textOverrides,
        [safeSlideId]: {
          ...(deck.textOverrides?.[safeSlideId] || {}),
          [safeField]: String(value ?? "").slice(0, maxTextOverrideLength),
        },
      }),
    }));
  }

  function getActiveTextStyle() {
    const target = state.activeTextTarget;
    if (!target?.slideId || !target.field) {
      return {};
    }
    return getDeckForDate().textFieldStyles?.[target.slideId]?.[target.field] || {};
  }

  function updateActiveTextStyle(field = "", value = "") {
    const target = state.activeTextTarget;
    const allowedFields = new Set(["fontSize", "textColor"]);
    if (!target?.slideId || !target.field || !allowedFields.has(field)) {
      return;
    }
    writeDeckForDate(state.dateValue, (deck) => ({
      ...deck,
      textFieldStyles: normalizeTextFieldStyles({
        ...deck.textFieldStyles,
        [target.slideId]: {
          ...(deck.textFieldStyles?.[target.slideId] || {}),
          [target.field]: {
            ...(deck.textFieldStyles?.[target.slideId]?.[target.field] || {}),
            [field]: field === "fontSize" ? (value ? normalizeFontSize(value) : "") : normalizeHexColor(value, "#f8fafc"),
          },
        },
      }),
    }));
    render();
    focusActiveTextElement();
  }

  function getActiveTextElement() {
    const target = state.activeTextTarget;
    if (!root || typeof root.querySelectorAll !== "function" || !target?.slideId || !target.field) {
      return null;
    }
    return [...root.querySelectorAll("[data-presentation-slide-id][data-presentation-text-field]")].find(
      (element) =>
        element.dataset.presentationSlideId === target.slideId &&
        element.dataset.presentationTextField === target.field
    );
  }

  function getFocusedTextElement() {
    const activeElement = documentRef.activeElement;
    if (!root || !activeElement || !root.contains(activeElement)) {
      return null;
    }
    return activeElement.closest?.("[data-presentation-text-field]") || null;
  }

  function focusActiveTextElement() {
    getActiveTextElement()?.focus?.({ preventScroll: true });
  }

  function syncActiveCanvasSelection() {
    if (!root || typeof root.querySelectorAll !== "function") return;
    const activeTextElement = getActiveTextElement();
    root.querySelectorAll("[data-presentation-active-text='true']").forEach((element) => {
      if (element !== activeTextElement) {
        element.removeAttribute("data-presentation-active-text");
      }
    });
    root.querySelectorAll("[data-presentation-text-box-shell]").forEach((textBoxShell) => {
      const isActive =
        !state.presenting &&
        Boolean(state.activeTextTarget?.textBoxId) &&
        textBoxShell.dataset.presentationSlideId === state.activeTextTarget.slideId &&
        textBoxShell.dataset.presentationTextBoxId === state.activeTextTarget.textBoxId;
      textBoxShell.classList.toggle("is-selected", isActive);
    });
    if (!state.presenting && activeTextElement) {
      activeTextElement.setAttribute("data-presentation-active-text", "true");
    }
  }

  function syncTextToolbar() {
    if (!root) return;
    syncActiveCanvasSelection();
    const shell = root.querySelector("[data-presentation-mode-shell]");
    const toolbar = root.querySelector("[data-presentation-text-toolbar]");
    if (!shell || !toolbar || state.presenting) {
      shell?.classList.remove("is-text-toolbar-open");
      return;
    }
    const activeStyle = getActiveTextStyle();
    shell.classList.add("is-text-toolbar-open");
    toolbar.querySelectorAll("[data-presentation-active-font-size]").forEach((fontSize) => {
      fontSize.value = activeStyle.fontSize || "";
      fontSize.disabled = !state.activeTextTarget;
    });
    toolbar.querySelectorAll("[data-presentation-active-text-color]").forEach((textColor) => {
      textColor.value = normalizeHexColor(activeStyle.textColor, "#f8fafc");
      textColor.disabled = !state.activeTextTarget;
    });
    const activeShape = getActiveShape();
    toolbar.querySelectorAll("[data-presentation-active-shape-fill]").forEach((shapeFill) => {
      shapeFill.value = normalizeHexColor(activeShape?.fillColor, "#38bdf8");
      shapeFill.disabled = !activeShape;
    });
    toolbar.querySelectorAll("[data-presentation-active-shape-stroke]").forEach((shapeStroke) => {
      shapeStroke.value = normalizeHexColor(activeShape?.strokeColor, "#f8fafc");
      shapeStroke.disabled = !activeShape;
    });
    const opacityValue = normalizeOpacity(activeShape?.opacity, 90);
    toolbar.querySelectorAll("[data-presentation-active-shape-opacity]").forEach((shapeOpacity) => {
      shapeOpacity.value = String(opacityValue);
      shapeOpacity.disabled = !activeShape;
    });
    toolbar.querySelectorAll("[data-presentation-active-shape-opacity-value]").forEach((shapeOpacityValue) => {
      shapeOpacityValue.textContent = activeShape ? `${opacityValue}%` : "--";
    });
    const isInfoSlide = Boolean(state.activeTextTarget?.infoId);
    toolbar.querySelectorAll("[data-presentation-active-info-only]").forEach((control) => {
      control.disabled = !isInfoSlide;
    });
    const isTextBox = Boolean(state.activeTextTarget?.textBoxId);
    toolbar.querySelectorAll("[data-presentation-active-text-box-only]").forEach((control) => {
      control.disabled = !isTextBox;
    });
  }

  function getActiveShape() {
    const target = state.activeShapeTarget;
    if (!target?.slideId || !target.shapeId) {
      return null;
    }
    return getDeckForDate().shapes?.[target.slideId]?.find((shape) => shape.id === target.shapeId) || null;
  }

  function setActiveShapeTargetFromElement(element) {
    const shapeElement = element?.closest?.("[data-presentation-shape]");
    const slideId = String(shapeElement?.dataset.presentationSlideId || "").trim();
    const shapeId = String(shapeElement?.dataset.presentationShapeId || "").trim();
    if (!slideId || !shapeId || state.presenting) {
      return;
    }
    state.activeTextTarget = null;
    state.activeShapeTarget = { shapeId, slideId };
    syncTextToolbar();
  }

  function setActiveTextTargetFromElement(element) {
    const textElement = element?.closest?.("[data-presentation-text-field]");
    const textBoxShell = textElement ? null : element?.closest?.("[data-presentation-text-box-shell]");
    const textBoxId = String(textBoxShell?.dataset.presentationTextBoxId || "").trim();
    const slideId = String(textElement?.dataset.presentationSlideId || textBoxShell?.dataset.presentationSlideId || "").trim();
    const field = String(textElement?.dataset.presentationTextField || (textBoxId ? getTextBoxField(textBoxId) : "")).trim();
    if (!slideId || !field || state.presenting) {
      return;
    }
    state.activeShapeTarget = null;
    state.activeTextTarget = {
      field,
      infoId: String(textElement?.dataset.presentationInfoId || "").trim(),
      slideId,
      textBoxId: String(textElement?.dataset.presentationTextBoxId || textBoxId).trim(),
    };
    syncTextToolbar();
  }

  function hideTextToolbar() {
    state.activeShapeTarget = null;
    state.activeTextTarget = null;
    root?.querySelectorAll("[data-presentation-text-toolbar] .presentation-tool-popover[open]").forEach((popover) => {
      popover.removeAttribute("open");
    });
    syncTextToolbar();
  }

  function addTextBox(options = {}) {
    const currentSlide = buildModel().slides[state.slideIndex];
    if (!currentSlide?.id) {
      return;
    }
    const isSymbol = options.kind === "symbol";
    const text = String(options.text ?? "Text box").slice(0, maxTextOverrideLength) || (isSymbol ? "•" : "Text box");
    const fontSize = normalizeFontSize(options.fontSize || (isSymbol ? "88" : "36"));
    const textColor = normalizeHexColor(options.textColor, "#f8fafc");
    const width = clampTextBoxWidth(options.width || (isSymbol ? 14 : 30));
    const position = clampTextBoxPosition(options.x ?? (isSymbol ? 46 : 56), options.y ?? (isSymbol ? 28 : 36), width);
    const id = `${isSymbol ? "symbol" : "textbox"}-${Date.now()}`;
    const field = getTextBoxField(id);
    writeDeckForDate(state.dateValue, (deck) => ({
      ...deck,
      textBoxes: normalizeTextBoxes({
        ...deck.textBoxes,
        [currentSlide.id]: [
          ...(deck.textBoxes?.[currentSlide.id] || []),
          {
            id,
            kind: isSymbol ? "symbol" : "text",
            text,
            x: position.x,
            y: position.y,
            width,
            fontSize,
            textColor,
          },
        ],
      }),
      textFieldStyles: normalizeTextFieldStyles({
        ...deck.textFieldStyles,
        [currentSlide.id]: {
          ...(deck.textFieldStyles?.[currentSlide.id] || {}),
          [field]: {
            fontSize,
            textColor,
          },
        },
      }),
      textOverrides: normalizeTextOverrides({
        ...deck.textOverrides,
        [currentSlide.id]: {
          ...(deck.textOverrides?.[currentSlide.id] || {}),
          [field]: text,
        },
      }),
    }));
    state.activeShapeTarget = null;
    state.activeTextTarget = { field, infoId: "", slideId: currentSlide.id, textBoxId: id };
    render();
    focusActiveTextElement();
  }

  function addSymbolTextBox(symbol = "") {
    const text = String(symbol || "").trim();
    if (!text) {
      return;
    }
    addTextBox({
      kind: "symbol",
      text,
      width: 14,
      fontSize: "88",
      textColor: "#f8fafc",
      x: 45,
      y: 26,
    });
  }

  function deleteTextBox(slideId = "", boxId = "") {
    const safeSlideId = String(slideId || "").trim();
    const safeBoxId = String(boxId || "").trim();
    const field = getTextBoxField(safeBoxId);
    if (!safeSlideId || !safeBoxId) {
      return;
    }
    writeDeckForDate(state.dateValue, (deck) => ({
      ...deck,
      textBoxes: normalizeTextBoxes({
        ...deck.textBoxes,
        [safeSlideId]: (deck.textBoxes?.[safeSlideId] || []).filter((box) => box.id !== safeBoxId),
      }),
      textFieldStyles: {
        ...deck.textFieldStyles,
        [safeSlideId]: Object.fromEntries(
          Object.entries(deck.textFieldStyles?.[safeSlideId] || {}).filter(([styleField]) => styleField !== field)
        ),
      },
      textOverrides: {
        ...deck.textOverrides,
        [safeSlideId]: Object.fromEntries(
          Object.entries(deck.textOverrides?.[safeSlideId] || {}).filter(([textField]) => textField !== field)
        ),
      },
    }));
    state.activeTextTarget = null;
    render();
  }

  function updateTextBoxPosition(slideId = "", boxId = "", x = 0, y = 0) {
    const safeSlideId = String(slideId || "").trim();
    const safeBoxId = String(boxId || "").trim();
    if (!safeSlideId || !safeBoxId) {
      return;
    }
    writeDeckForDate(state.dateValue, (deck) => ({
      ...deck,
      textBoxes: normalizeTextBoxes({
        ...deck.textBoxes,
        [safeSlideId]: (deck.textBoxes?.[safeSlideId] || []).map((box) => {
          if (box.id !== safeBoxId) {
            return box;
          }
          return {
            ...box,
            ...clampTextBoxPosition(x, y, box.width),
          };
        }),
      }),
    }));
    state.activeShapeTarget = null;
    state.activeTextTarget = { field: getTextBoxField(safeBoxId), infoId: "", slideId: safeSlideId, textBoxId: safeBoxId };
    render();
  }

  function updateTextBoxSize(slideId = "", boxId = "", width = 30, fontSize = "36") {
    const safeSlideId = String(slideId || "").trim();
    const safeBoxId = String(boxId || "").trim();
    const safeWidth = clampTextBoxWidth(width);
    const safeFontSize = normalizeFontSize(fontSize);
    const field = getTextBoxField(safeBoxId);
    if (!safeSlideId || !safeBoxId) {
      return;
    }
    writeDeckForDate(state.dateValue, (deck) => ({
      ...deck,
      textBoxes: normalizeTextBoxes({
        ...deck.textBoxes,
        [safeSlideId]: (deck.textBoxes?.[safeSlideId] || []).map((box) => {
          if (box.id !== safeBoxId) {
            return box;
          }
          return {
            ...box,
            ...clampTextBoxPosition(box.x, box.y, safeWidth),
            width: safeWidth,
            fontSize: safeFontSize,
          };
        }),
      }),
      textFieldStyles: normalizeTextFieldStyles({
        ...deck.textFieldStyles,
        [safeSlideId]: {
          ...(deck.textFieldStyles?.[safeSlideId] || {}),
          [field]: {
            ...(deck.textFieldStyles?.[safeSlideId]?.[field] || {}),
            fontSize: safeFontSize,
          },
        },
      }),
    }));
    state.activeShapeTarget = null;
    state.activeTextTarget = { field, infoId: "", slideId: safeSlideId, textBoxId: safeBoxId };
    render();
    focusActiveTextElement();
  }

  function updateTextBoxBounds(slideId = "", boxId = "", bounds = {}, fontSize = "") {
    const safeSlideId = String(slideId || "").trim();
    const safeBoxId = String(boxId || "").trim();
    const field = getTextBoxField(safeBoxId);
    if (!safeSlideId || !safeBoxId) {
      return;
    }
    let safeFontSize = "";
    writeDeckForDate(state.dateValue, (deck) => ({
      ...deck,
      textBoxes: normalizeTextBoxes({
        ...deck.textBoxes,
        [safeSlideId]: (deck.textBoxes?.[safeSlideId] || []).map((box) => {
          if (box.id !== safeBoxId) {
            return box;
          }
          const safeWidth = clampTextBoxWidth(bounds.width ?? box.width);
          safeFontSize = normalizeFontSize(fontSize || bounds.fontSize || box.fontSize || "36");
          return {
            ...box,
            ...clampTextBoxPosition(bounds.x ?? box.x, bounds.y ?? box.y, safeWidth),
            width: safeWidth,
            fontSize: safeFontSize,
          };
        }),
      }),
      textFieldStyles: normalizeTextFieldStyles({
        ...deck.textFieldStyles,
        [safeSlideId]: {
          ...(deck.textFieldStyles?.[safeSlideId] || {}),
          [field]: {
            ...(deck.textFieldStyles?.[safeSlideId]?.[field] || {}),
            fontSize: safeFontSize || normalizeFontSize(fontSize || bounds.fontSize || "36"),
          },
        },
      }),
    }));
    state.activeShapeTarget = null;
    state.activeTextTarget = { field, infoId: "", slideId: safeSlideId, textBoxId: safeBoxId };
    render();
    focusActiveTextElement();
  }

  function normalizeShapeType(type = "rect") {
    return shapeTypes.has(String(type || "").trim()) ? String(type).trim() : "rect";
  }

  function getShapeDefaults(type = "rect") {
    if (type === "line") return { width: 30, height: 1.4 };
    if (type === "arrow") return { width: 26, height: 10 };
    if (type === "triangle") return { width: 14, height: 13 };
    return { width: 14, height: 14 };
  }

  function addShape(type = "rect", bounds = null) {
    const safeType = normalizeShapeType(type);
    const currentSlide = buildModel().slides[state.slideIndex];
    if (!currentSlide?.id) {
      return;
    }
    const id = `shape-${Date.now()}`;
    const defaultSize = getShapeDefaults(safeType);
    const size = normalizeShapeSize(safeType, bounds?.width ?? defaultSize.width, bounds?.height ?? defaultSize.height);
    const position = clampShapePosition(bounds?.x ?? 42, bounds?.y ?? 34, size.width, size.height);
    writeDeckForDate(state.dateValue, (deck) => ({
      ...deck,
      shapes: normalizeShapes({
        ...deck.shapes,
        [currentSlide.id]: [
          ...(deck.shapes?.[currentSlide.id] || []),
          {
            id,
            type: safeType,
            ...position,
            ...size,
            fillColor: "#38bdf8",
            opacity: 90,
            strokeColor: "#f8fafc",
          },
        ],
      }),
    }));
    state.activeTextTarget = null;
    state.activeShapeTarget = { shapeId: id, slideId: currentSlide.id };
    render();
  }

  function getActiveShapeElement() {
    const target = state.activeShapeTarget;
    if (!root || !target?.slideId || !target.shapeId) {
      return null;
    }
    return [...root.querySelectorAll("[data-presentation-shape]")].find(
      (element) =>
        element.dataset.presentationSlideId === target.slideId &&
        element.dataset.presentationShapeId === target.shapeId
    );
  }

  function applyShapeStyleToElement(shape = {}) {
    const element = getActiveShapeElement();
    if (!element || !shape) {
      return;
    }
    element.style.setProperty("--presentation-shape-fill", normalizeHexColor(shape.fillColor, "#38bdf8"));
    element.style.setProperty("--presentation-shape-stroke", normalizeHexColor(shape.strokeColor, "#f8fafc"));
    element.style.setProperty("--presentation-shape-opacity", String(normalizeOpacity(shape.opacity, 90) / 100));
  }

  function updateActiveShapeStyle(field = "", value = "") {
    const target = state.activeShapeTarget;
    const allowedFields = new Set(["fillColor", "strokeColor", "opacity"]);
    if (!target?.slideId || !target.shapeId || !allowedFields.has(field)) {
      return;
    }
    let nextActiveShape = null;
    writeDeckForDate(state.dateValue, (deck) => ({
      ...deck,
      shapes: normalizeShapes({
        ...deck.shapes,
        [target.slideId]: (deck.shapes?.[target.slideId] || []).map((shape) =>
          shape.id === target.shapeId
            ? (nextActiveShape = {
                ...shape,
                [field]:
                  field === "opacity"
                    ? normalizeOpacity(value, shape.opacity)
                    : normalizeHexColor(value, shape[field] || (field === "strokeColor" ? "#f8fafc" : "#38bdf8")),
              })
            : shape
        ),
      }),
    }));
    if (nextActiveShape) {
      applyShapeStyleToElement(nextActiveShape);
    }
    syncTextToolbar();
  }

  function deleteShape(slideId = "", shapeId = "") {
    const safeSlideId = String(slideId || "").trim();
    const safeShapeId = String(shapeId || "").trim();
    if (!safeSlideId || !safeShapeId) {
      return;
    }
    writeDeckForDate(state.dateValue, (deck) => ({
      ...deck,
      shapes: normalizeShapes({
        ...deck.shapes,
        [safeSlideId]: (deck.shapes?.[safeSlideId] || []).filter((shape) => shape.id !== safeShapeId),
      }),
    }));
    state.activeShapeTarget = null;
    render();
  }

  function updateShapePosition(slideId = "", shapeId = "", x = 0, y = 0) {
    const safeSlideId = String(slideId || "").trim();
    const safeShapeId = String(shapeId || "").trim();
    if (!safeSlideId || !safeShapeId) {
      return;
    }
    writeDeckForDate(state.dateValue, (deck) => ({
      ...deck,
      shapes: normalizeShapes({
        ...deck.shapes,
        [safeSlideId]: (deck.shapes?.[safeSlideId] || []).map((shape) =>
          shape.id === safeShapeId ? { ...shape, ...clampShapePosition(x, y, shape.width, shape.height) } : shape
        ),
      }),
    }));
    state.activeShapeTarget = { shapeId: safeShapeId, slideId: safeSlideId };
    render();
  }

  function updateShapeBounds(slideId = "", shapeId = "", bounds = {}) {
    const safeSlideId = String(slideId || "").trim();
    const safeShapeId = String(shapeId || "").trim();
    if (!safeSlideId || !safeShapeId) {
      return;
    }
    writeDeckForDate(state.dateValue, (deck) => ({
      ...deck,
      shapes: normalizeShapes({
        ...deck.shapes,
        [safeSlideId]: (deck.shapes?.[safeSlideId] || []).map((shape) => {
          if (shape.id !== safeShapeId) {
            return shape;
          }
          const size = normalizeShapeSize(shape.type, bounds.width ?? shape.width, bounds.height ?? shape.height);
          return {
            ...shape,
            ...clampShapePosition(bounds.x ?? shape.x, bounds.y ?? shape.y, size.width, size.height),
            ...size,
          };
        }),
      }),
    }));
    state.activeShapeTarget = { shapeId: safeShapeId, slideId: safeSlideId };
    render();
  }

  function selectShapeTool(type = "rect") {
    state.shapeDrawTool = normalizeShapeType(type);
    state.activeTextTarget = null;
    state.activeShapeTarget = null;
    syncTextToolbar();
    render();
  }

  function getSlidePoint(event, slideRect) {
    return {
      x: Number(Math.min(99, Math.max(1, ((event.clientX - slideRect.left) / slideRect.width) * 100)).toFixed(2)),
      y: Number(Math.min(98, Math.max(2, ((event.clientY - slideRect.top) / slideRect.height) * 100)).toFixed(2)),
    };
  }

  function getDrawnShapeBounds(draw, event) {
    const point = getSlidePoint(event, draw.slideRect);
    const moved = Math.abs(event.clientX - draw.startClientX) > 5 || Math.abs(event.clientY - draw.startClientY) > 5;
    const defaults = getShapeDefaults(draw.type);
    if (!moved) {
      const size = normalizeShapeSize(draw.type, defaults.width, defaults.height);
      return {
        ...clampShapePosition(draw.startPoint.x - size.width / 2, draw.startPoint.y - size.height / 2, size.width, size.height),
        ...size,
      };
    }
    if (draw.type === "line") {
      const size = normalizeShapeSize(draw.type, Math.abs(point.x - draw.startPoint.x), defaults.height);
      const x = point.x < draw.startPoint.x ? draw.startPoint.x - size.width : draw.startPoint.x;
      return {
        ...clampShapePosition(x, draw.startPoint.y - size.height / 2, size.width, size.height),
        ...size,
      };
    }
    const size = normalizeShapeSize(draw.type, Math.abs(point.x - draw.startPoint.x), Math.abs(point.y - draw.startPoint.y));
    const x = point.x < draw.startPoint.x ? draw.startPoint.x - size.width : draw.startPoint.x;
    const y = point.y < draw.startPoint.y ? draw.startPoint.y - size.height : draw.startPoint.y;
    return {
      ...clampShapePosition(x, y, size.width, size.height),
      ...size,
    };
  }

  function applyShapeBounds(element, bounds = {}) {
    if (!element) return;
    element.style.left = `${bounds.x}%`;
    element.style.top = `${bounds.y}%`;
    element.style.width = `${bounds.width}%`;
    element.style.height = `${bounds.height}%`;
  }

  function requestNewSlideTitle(defaultTitle = "New Slide") {
    if (typeof win?.prompt !== "function") {
      return defaultTitle;
    }
    const requestedTitle = win.prompt("Name this slide", defaultTitle);
    if (requestedTitle === null) {
      return "";
    }
    return String(requestedTitle || "").trim().slice(0, 90) || defaultTitle;
  }

  function addInfoSlide(sourceSlide = null) {
    const title = sourceSlide
      ? `${sourceSlide.title || "Team Information"} Copy`
      : requestNewSlideTitle("New Slide");
    if (!title) {
      return;
    }
    writeDeckForDate(state.dateValue, (deck) => {
      const nextSlide = normalizeInfoSlide(
        sourceSlide
          ? {
              ...sourceSlide,
              id: `info-${state.dateValue}-${Date.now()}`,
              title,
            }
          : {
              id: `info-${state.dateValue}-${Date.now()}`,
              title,
              body: "- Point one\n- Point two",
              fontSize: "56",
              accentColor: "#22c55e",
              textColor: "#f8fafc",
            },
        0,
        state.dateValue
      );
      return { ...deck, infoSlides: [...deck.infoSlides, nextSlide] };
    });
    const model = buildModel();
    const nextSlideId = readStore().decks[state.dateValue].infoSlides.at(-1)?.id;
    state.slideIndex = model.slides.findIndex((slide) => slide.id === nextSlideId);
    state.activeTextTarget = nextSlideId ? { field: "info.title", infoId: nextSlideId, slideId: nextSlideId } : null;
    state.editorOpen = false;
    render();
    focusActiveTextElement();
  }

  function duplicateInfoSlide(slideId) {
    const sourceSlide = getDeckForDate().infoSlides.find((slide) => slide.id === slideId);
    addInfoSlide(sourceSlide || null);
  }

  function deleteInfoSlide(slideId) {
    const deck = getDeckForDate();
    if (!slideId || !deck.infoSlides.some((slide) => slide.id === slideId)) {
      return;
    }
    const deletedIndex = state.slideIndex;
    writeDeckForDate(state.dateValue, (currentDeck) => ({
      ...currentDeck,
      infoSlides: currentDeck.infoSlides.filter((slide) => slide.id !== slideId),
      shapes: Object.fromEntries(Object.entries(currentDeck.shapes || {}).filter(([shapeSlideId]) => shapeSlideId !== slideId)),
      slideStyles: Object.fromEntries(Object.entries(currentDeck.slideStyles || {}).filter(([styleSlideId]) => styleSlideId !== slideId)),
      textBoxes: Object.fromEntries(Object.entries(currentDeck.textBoxes || {}).filter(([boxSlideId]) => boxSlideId !== slideId)),
      textFieldStyles: Object.fromEntries(Object.entries(currentDeck.textFieldStyles || {}).filter(([styleSlideId]) => styleSlideId !== slideId)),
      textOverrides: Object.fromEntries(Object.entries(currentDeck.textOverrides || {}).filter(([textSlideId]) => textSlideId !== slideId)),
    }));
    const nextModel = buildModel();
    const nextInfoIndexes = nextModel.slides.map((slide, index) => (slide.type === "info" ? index : -1)).filter((index) => index >= 0);
    const nextInfoIndex = nextInfoIndexes.find((index) => index >= deletedIndex) ?? nextInfoIndexes.at(-1);
    if (Number.isFinite(nextInfoIndex)) {
      state.slideIndex = nextInfoIndex;
    } else {
      state.slideIndex = Math.min(deletedIndex, Math.max(0, nextModel.slides.length - 1));
      state.editorOpen = false;
    }
    state.activeTextTarget = null;
    render();
  }

  function deleteCurrentSlide() {
    const currentSlide = buildModel().slides[state.slideIndex];
    if (currentSlide?.type !== "info" || !currentSlide.infoSlide?.id) {
      return;
    }
    deleteInfoSlide(currentSlide.infoSlide.id);
  }

  function startFullscreen() {
    const currentRoot = ensureRoot();
    currentRoot.requestFullscreen?.().catch?.(noop);
    state.activeShapeTarget = null;
    state.activeTextTarget = null;
    state.drawShape = null;
    state.dragShape = null;
    state.dragTextBox = null;
    state.resizeShape = null;
    state.resizeTextBox = null;
    state.shapeDrawTool = null;
    state.presenting = true;
    state.editorOpen = false;
    documentRef.body?.classList?.remove("is-presentation-shape-drawing");
    documentRef.body?.classList?.remove("is-presentation-text-box-resizing");
    documentRef.body?.classList?.remove("is-presentation-shape-resizing");
    render();
  }

  function exitFullscreen() {
    documentRef.exitFullscreen?.().catch?.(noop);
    state.presenting = false;
    render();
  }

  function beginTextBoxDrag(event, handle) {
    if (event.button && event.button !== 0) {
      return;
    }
    const slideId = String(handle?.dataset.presentationSlideId || "").trim();
    const boxId = String(handle?.dataset.presentationDragTextBox || "").trim();
    const shell = handle?.closest?.("[data-presentation-text-box-shell]");
    const slideElement = shell?.closest?.(".presentation-slide");
    const slideRect = slideElement?.getBoundingClientRect?.();
    const box = getDeckForDate().textBoxes?.[slideId]?.find((item) => item.id === boxId);
    if (!slideId || !boxId || !shell || !slideRect?.width || !slideRect?.height || !box || state.presenting) {
      return;
    }
    event.preventDefault?.();
    const position = clampTextBoxPosition(box.x, box.y, box.width);
    state.dragTextBox = {
      boxId,
      shell,
      slideId,
      slideHeight: slideRect.height,
      slideWidth: slideRect.width,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: position.x,
      startY: position.y,
      nextX: position.x,
      nextY: position.y,
      width: box.width,
    };
    state.activeTextTarget = { field: getTextBoxField(boxId), infoId: "", slideId, textBoxId: boxId };
    shell.classList.add("is-dragging");
    documentRef.body?.classList?.add("is-presentation-text-box-dragging");
    handle.setPointerCapture?.(event.pointerId);
    syncTextToolbar();
  }

  function updateTextBoxDrag(event) {
    const drag = state.dragTextBox;
    if (!drag) {
      return;
    }
    event.preventDefault?.();
    const nextPosition = clampTextBoxPosition(
      drag.startX + ((event.clientX - drag.startClientX) / drag.slideWidth) * 100,
      drag.startY + ((event.clientY - drag.startClientY) / drag.slideHeight) * 100,
      drag.width
    );
    drag.nextX = nextPosition.x;
    drag.nextY = nextPosition.y;
    drag.shell.style.left = `${nextPosition.x}%`;
    drag.shell.style.top = `${nextPosition.y}%`;
  }

  function finishTextBoxDrag(event) {
    const drag = state.dragTextBox;
    if (!drag) {
      return;
    }
    event.preventDefault?.();
    drag.shell.classList.remove("is-dragging");
    documentRef.body?.classList?.remove("is-presentation-text-box-dragging");
    state.dragTextBox = null;
    updateTextBoxPosition(drag.slideId, drag.boxId, drag.nextX, drag.nextY);
  }

  function beginTextBoxResize(event, handle) {
    if (event.button && event.button !== 0) {
      return;
    }
    const slideId = String(handle?.dataset.presentationSlideId || "").trim();
    const boxId = String(handle?.dataset.presentationResizeTextBox || "").trim();
    const axis = getResizeAxis(handle);
    const shell = handle?.closest?.("[data-presentation-text-box-shell]");
    const slideElement = shell?.closest?.(".presentation-slide");
    const slideRect = slideElement?.getBoundingClientRect?.();
    const box = getDeckForDate().textBoxes?.[slideId]?.find((item) => item.id === boxId);
    if (!slideId || !boxId || !shell || !slideRect?.width || !slideRect?.height || !box || state.presenting) {
      return;
    }
    event.preventDefault?.();
    event.stopPropagation?.();
    const startWidth = clampTextBoxWidth(box.width);
    const startFontSize = Number(normalizeFontSize(box.fontSize || "36"));
    state.resizeTextBox = {
      boxId,
      shell,
      slideId,
      slideHeight: slideRect.height,
      slideWidth: slideRect.width,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startFontSize,
      startWidth,
      startX: box.x,
      startY: box.y,
      axis,
      nextBounds: {
        x: box.x,
        y: box.y,
        width: startWidth,
      },
      nextFontSize: startFontSize,
      nextWidth: startWidth,
    };
    state.activeShapeTarget = null;
    state.activeTextTarget = { field: getTextBoxField(boxId), infoId: "", slideId, textBoxId: boxId };
    shell.classList.add("is-resizing");
    documentRef.body?.classList?.add("is-presentation-text-box-resizing");
    handle.setPointerCapture?.(event.pointerId);
    syncTextToolbar();
  }

  function getResizedTextBoxBounds(resize, event) {
    const axis = resize.axis || "se";
    const deltaWidth = ((event.clientX - resize.startClientX) / resize.slideWidth) * 100;
    const deltaHeight = ((event.clientY - resize.startClientY) / resize.slideHeight) * 100;
    const horizontalDelta = axis.includes("e") ? deltaWidth : axis.includes("w") ? -deltaWidth : 0;
    const verticalDelta = axis.includes("s") ? deltaHeight : axis.includes("n") ? -deltaHeight : 0;
    const scaleDelta = Math.abs(verticalDelta) > Math.abs(horizontalDelta) ? verticalDelta : horizontalDelta;
    const nextWidth = axis.includes("e") || axis.includes("w") ? clampTextBoxWidth(resize.startWidth + horizontalDelta) : resize.startWidth;
    const scaleBase = Math.max(4, resize.startWidth);
    const scale = Math.max(0.42, Math.min(2.4, (resize.startWidth + scaleDelta) / scaleBase));
    const nextFontSize = Number(normalizeFontSize(Math.round(resize.startFontSize * scale)));
    const widthChange = nextWidth - resize.startWidth;
    const nextX = axis.includes("w") ? resize.startX - widthChange : resize.startX;
    const position = clampTextBoxPosition(nextX, resize.startY, nextWidth);
    return {
      x: position.x,
      y: position.y,
      width: nextWidth,
      fontSize: nextFontSize,
    };
  }

  function updateTextBoxResize(event) {
    const resize = state.resizeTextBox;
    if (!resize) {
      return;
    }
    event.preventDefault?.();
    const bounds = getResizedTextBoxBounds(resize, event);
    resize.nextBounds = bounds;
    resize.nextWidth = bounds.width;
    resize.nextFontSize = bounds.fontSize;
    resize.shell.style.left = `${bounds.x}%`;
    resize.shell.style.top = `${bounds.y}%`;
    resize.shell.style.width = `${bounds.width}%`;
    const textElement = resize.shell.querySelector(".presentation-free-text-box");
    if (textElement) {
      textElement.style.fontSize = `${Number((bounds.fontSize / 16).toFixed(3))}rem`;
    }
  }

  function finishTextBoxResize(event) {
    const resize = state.resizeTextBox;
    if (!resize) {
      return;
    }
    event.preventDefault?.();
    resize.shell.classList.remove("is-resizing");
    documentRef.body?.classList?.remove("is-presentation-text-box-resizing");
    state.resizeTextBox = null;
    updateTextBoxBounds(resize.slideId, resize.boxId, resize.nextBounds, resize.nextFontSize);
  }

  function beginShapeDraw(event, slideElement) {
    const safeType = normalizeShapeType(state.shapeDrawTool);
    const currentSlide = buildModel().slides[state.slideIndex];
    const slideRect = slideElement?.getBoundingClientRect?.();
    if (!currentSlide?.id || !slideRect?.width || !slideRect?.height || state.presenting) {
      return;
    }
    event.preventDefault?.();
    event.stopPropagation?.();
    const previewElement = documentRef.createElement("div");
    previewElement.className = `presentation-slide-shape is-${safeType} is-drawing-preview`;
    previewElement.setAttribute("aria-hidden", "true");
    previewElement.style.setProperty("--presentation-shape-fill", "#38bdf8");
    previewElement.style.setProperty("--presentation-shape-stroke", "#f8fafc");
    slideElement.appendChild(previewElement);
    state.drawShape = {
      previewElement,
      slideId: currentSlide.id,
      slideRect,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPoint: getSlidePoint(event, slideRect),
      type: safeType,
      nextBounds: null,
    };
    documentRef.body?.classList?.add("is-presentation-shape-drawing");
    slideElement.setPointerCapture?.(event.pointerId);
    updateShapeDraw(event);
  }

  function updateShapeDraw(event) {
    const draw = state.drawShape;
    if (!draw) {
      return;
    }
    event.preventDefault?.();
    const bounds = getDrawnShapeBounds(draw, event);
    draw.nextBounds = bounds;
    applyShapeBounds(draw.previewElement, bounds);
  }

  function finishShapeDraw(event) {
    const draw = state.drawShape;
    if (!draw) {
      return;
    }
    event.preventDefault?.();
    const shouldCancel = event.type === "pointercancel";
    const bounds = draw.nextBounds || getDrawnShapeBounds(draw, event);
    draw.previewElement?.remove?.();
    state.drawShape = null;
    state.shapeDrawTool = null;
    documentRef.body?.classList?.remove("is-presentation-shape-drawing");
    if (!shouldCancel) {
      addShape(draw.type, bounds);
    } else {
      render();
    }
  }

  function beginShapeDrag(event, shapeElement) {
    if (event.button && event.button !== 0) {
      return;
    }
    const slideId = String(shapeElement?.dataset.presentationSlideId || "").trim();
    const shapeId = String(shapeElement?.dataset.presentationShapeId || "").trim();
    const slideElement = shapeElement?.closest?.(".presentation-slide");
    const slideRect = slideElement?.getBoundingClientRect?.();
    const shape = getDeckForDate().shapes?.[slideId]?.find((item) => item.id === shapeId);
    if (!slideId || !shapeId || !slideRect?.width || !slideRect?.height || !shape || state.presenting) {
      return;
    }
    event.preventDefault?.();
    const position = clampShapePosition(shape.x, shape.y, shape.width, shape.height);
    state.dragShape = {
      shapeElement,
      shapeId,
      slideId,
      slideHeight: slideRect.height,
      slideWidth: slideRect.width,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: position.x,
      startY: position.y,
      nextX: position.x,
      nextY: position.y,
      width: shape.width,
      height: shape.height,
    };
    state.activeTextTarget = null;
    state.activeShapeTarget = { shapeId, slideId };
    shapeElement.classList.add("is-dragging");
    documentRef.body?.classList?.add("is-presentation-shape-dragging");
    shapeElement.setPointerCapture?.(event.pointerId);
    syncTextToolbar();
  }

  function updateShapeDrag(event) {
    const drag = state.dragShape;
    if (!drag) {
      return;
    }
    event.preventDefault?.();
    const nextPosition = clampShapePosition(
      drag.startX + ((event.clientX - drag.startClientX) / drag.slideWidth) * 100,
      drag.startY + ((event.clientY - drag.startClientY) / drag.slideHeight) * 100,
      drag.width,
      drag.height
    );
    drag.nextX = nextPosition.x;
    drag.nextY = nextPosition.y;
    drag.shapeElement.style.left = `${nextPosition.x}%`;
    drag.shapeElement.style.top = `${nextPosition.y}%`;
  }

  function finishShapeDrag(event) {
    const drag = state.dragShape;
    if (!drag) {
      return;
    }
    event.preventDefault?.();
    drag.shapeElement.classList.remove("is-dragging");
    documentRef.body?.classList?.remove("is-presentation-shape-dragging");
    state.dragShape = null;
    updateShapePosition(drag.slideId, drag.shapeId, drag.nextX, drag.nextY);
  }

  function beginShapeResize(event, handle) {
    if (event.button && event.button !== 0) {
      return;
    }
    const slideId = String(handle?.dataset.presentationSlideId || "").trim();
    const shapeId = String(handle?.dataset.presentationResizeShape || "").trim();
    const axis = getResizeAxis(handle);
    const shapeElement = handle?.closest?.("[data-presentation-shape]");
    const slideElement = shapeElement?.closest?.(".presentation-slide");
    const slideRect = slideElement?.getBoundingClientRect?.();
    const shape = getDeckForDate().shapes?.[slideId]?.find((item) => item.id === shapeId);
    if (!slideId || !shapeId || !shapeElement || !slideRect?.width || !slideRect?.height || !shape || state.presenting) {
      return;
    }
    event.preventDefault?.();
    event.stopPropagation?.();
    const size = normalizeShapeSize(shape.type, shape.width, shape.height);
    const position = clampShapePosition(shape.x, shape.y, size.width, size.height);
    state.resizeShape = {
      shapeElement,
      shapeId,
      slideId,
      slideHeight: slideRect.height,
      slideWidth: slideRect.width,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startHeight: size.height,
      startWidth: size.width,
      startX: position.x,
      startY: position.y,
      axis,
      type: shape.type,
      nextBounds: {
        ...position,
        ...size,
      },
    };
    state.activeTextTarget = null;
    state.activeShapeTarget = { shapeId, slideId };
    shapeElement.classList.add("is-resizing");
    documentRef.body?.classList?.add("is-presentation-shape-resizing");
    handle.setPointerCapture?.(event.pointerId);
    syncTextToolbar();
  }

  function getResizedShapeBounds(resize, event) {
    const axis = resize.axis || "se";
    const deltaWidth = ((event.clientX - resize.startClientX) / resize.slideWidth) * 100;
    const deltaHeight = ((event.clientY - resize.startClientY) / resize.slideHeight) * 100;
    const rawWidth = resize.startWidth + (axis.includes("e") ? deltaWidth : axis.includes("w") ? -deltaWidth : 0);
    const rawHeight = resize.startHeight + (axis.includes("s") ? deltaHeight : axis.includes("n") ? -deltaHeight : 0);
    const maxWidth = axis.includes("w")
      ? Math.max(1, resize.startX + resize.startWidth - 1)
      : Math.max(1, 98 - resize.startX);
    const maxHeight = axis.includes("n")
      ? Math.max(1, resize.startY + resize.startHeight - 2)
      : Math.max(1, 96 - resize.startY);
    const size = normalizeShapeSize(
      resize.type,
      Math.min(maxWidth, rawWidth || resize.startWidth),
      Math.min(maxHeight, rawHeight || resize.startHeight)
    );
    const nextX = axis.includes("w") ? resize.startX + resize.startWidth - size.width : resize.startX;
    const nextY = axis.includes("n") ? resize.startY + resize.startHeight - size.height : resize.startY;
    const position = clampShapePosition(nextX, nextY, size.width, size.height);
    return {
      x: position.x,
      y: position.y,
      ...size,
    };
  }

  function updateShapeResize(event) {
    const resize = state.resizeShape;
    if (!resize) {
      return;
    }
    event.preventDefault?.();
    const bounds = getResizedShapeBounds(resize, event);
    resize.nextBounds = bounds;
    applyShapeBounds(resize.shapeElement, bounds);
  }

  function finishShapeResize(event) {
    const resize = state.resizeShape;
    if (!resize) {
      return;
    }
    event.preventDefault?.();
    resize.shapeElement.classList.remove("is-resizing");
    documentRef.body?.classList?.remove("is-presentation-shape-resizing");
    state.resizeShape = null;
    updateShapeBounds(resize.slideId, resize.shapeId, resize.nextBounds);
  }

  function handleClick(event) {
    if (!state.isOpen || !root?.contains(event.target)) {
      return;
    }
    const gotoButton = event.target.closest("[data-presentation-goto]");
    if (gotoButton) {
      goToSlide(gotoButton.dataset.presentationGoto);
      return;
    }
    if (event.target.closest("[data-presentation-next]")) {
      goToSlide(state.slideIndex + 1);
      return;
    }
    if (event.target.closest("[data-presentation-prev]")) {
      goToSlide(state.slideIndex - 1);
      return;
    }
    if (event.target.closest("[data-presentation-close]")) {
      close();
      return;
    }
    if (event.target.closest("[data-presentation-start]")) {
      startFullscreen();
      return;
    }
    if (event.target.closest("[data-presentation-exit-fullscreen]")) {
      exitFullscreen();
      return;
    }
    if (event.target.closest("[data-presentation-drag-text-box]")) {
      return;
    }
    const toolbarSummary = event.target.closest("[data-presentation-text-toolbar] .presentation-tool-popover > summary");
    if (toolbarSummary) {
      const currentPopover = toolbarSummary.closest("details");
      root.querySelectorAll("[data-presentation-text-toolbar] .presentation-tool-popover[open]").forEach((popover) => {
        if (popover !== currentPopover) {
          popover.removeAttribute("open");
        }
      });
    }
    const symbolButton = event.target.closest("[data-presentation-insert-symbol]");
    if (symbolButton) {
      addSymbolTextBox(symbolButton.dataset.presentationInsertSymbol);
      symbolButton.closest?.("details")?.removeAttribute?.("open");
      return;
    }
    const shapeButton = event.target.closest("[data-presentation-add-shape]");
    if (shapeButton) {
      shapeButton.closest?.("details")?.removeAttribute?.("open");
      selectShapeTool(shapeButton.dataset.presentationAddShape);
      return;
    }
    const themePresetButton = event.target.closest("[data-presentation-theme-preset]");
    if (themePresetButton) {
      updateCurrentSlideStyle("theme", themePresetButton.dataset.presentationThemePreset);
      return;
    }
    if (event.target.closest("[data-presentation-add-text-box]")) {
      addTextBox();
      return;
    }
    if (event.target.closest("[data-presentation-add-info]")) {
      addInfoSlide();
      return;
    }
    if (event.target.closest("[data-presentation-delete-slide]")) {
      deleteCurrentSlide();
      return;
    }
    const duplicateButton = event.target.closest("[data-presentation-duplicate-info]");
    if (duplicateButton) {
      duplicateInfoSlide(duplicateButton.dataset.presentationDuplicateInfo || state.activeTextTarget?.infoId);
      return;
    }
    const deleteButton = event.target.closest("[data-presentation-delete-info]");
    if (deleteButton) {
      deleteInfoSlide(deleteButton.dataset.presentationDeleteInfo || state.activeTextTarget?.infoId);
      return;
    }
    const shapeElement = event.target.closest("[data-presentation-shape]");
    if (shapeElement) {
      setActiveShapeTargetFromElement(shapeElement);
      return;
    }
    if (event.target.closest("[data-presentation-text-field]")) {
      setActiveTextTargetFromElement(event.target);
      return;
    }
    const focusedTextElement = getFocusedTextElement();
    if (focusedTextElement) {
      setActiveTextTargetFromElement(focusedTextElement);
      return;
    }
    if (!event.target.closest("[data-presentation-text-field], [data-presentation-shape], [data-presentation-text-toolbar]")) {
      hideTextToolbar();
    }
  }

  function handleTextActivation(event) {
    if (!state.isOpen || !root?.contains(event.target)) {
      return;
    }
    const resizeHandle = event.target.closest("[data-presentation-resize-text-box]");
    if (resizeHandle) {
      beginTextBoxResize(event, resizeHandle);
      return;
    }
    const shapeResizeHandle = event.target.closest("[data-presentation-resize-shape]");
    if (shapeResizeHandle) {
      beginShapeResize(event, shapeResizeHandle);
      return;
    }
    const dragHandle = event.target.closest("[data-presentation-drag-text-box]");
    if (dragHandle) {
      beginTextBoxDrag(event, dragHandle);
      return;
    }
    const slideElement = event.target.closest(".presentation-slide");
    if (
      state.shapeDrawTool &&
      slideElement &&
      !event.target.closest("[data-presentation-text-toolbar], [data-presentation-shape], [data-presentation-text-box-shell]")
    ) {
      beginShapeDraw(event, slideElement);
      return;
    }
    const shapeElement = event.target.closest("[data-presentation-shape]");
    if (shapeElement) {
      beginShapeDrag(event, shapeElement);
      return;
    }
    if (event.target.closest("[data-presentation-text-field]")) {
      setActiveTextTargetFromElement(event.target);
      return;
    }
    if (!event.target.closest("[data-presentation-text-toolbar], [data-presentation-text-box-shell], [data-presentation-shape]")) {
      hideTextToolbar();
    }
  }

  function handleInput(event) {
    if (!state.isOpen || !root?.contains(event.target)) {
      return;
    }
    const activeTextSize = event.target.closest("[data-presentation-active-font-size]");
    if (activeTextSize) {
      updateActiveTextStyle("fontSize", activeTextSize.value);
      return;
    }
    const activeTextColor = event.target.closest("[data-presentation-active-text-color]");
    if (activeTextColor) {
      updateActiveTextStyle("textColor", activeTextColor.value);
      return;
    }
    const activeShapeFill = event.target.closest("[data-presentation-active-shape-fill]");
    if (activeShapeFill) {
      updateActiveShapeStyle("fillColor", activeShapeFill.value);
      return;
    }
    const activeShapeStroke = event.target.closest("[data-presentation-active-shape-stroke]");
    if (activeShapeStroke) {
      updateActiveShapeStyle("strokeColor", activeShapeStroke.value);
      return;
    }
    const activeShapeOpacity = event.target.closest("[data-presentation-active-shape-opacity]");
    if (activeShapeOpacity) {
      updateActiveShapeStyle("opacity", activeShapeOpacity.value);
      return;
    }
    const infoField = event.target.closest("[data-presentation-info-field]");
    if (infoField) {
      const field = infoField.dataset.presentationInfoField;
      const slideId = infoField.dataset.presentationInfoId;
      const shouldRender = field === "fontSize" || field === "accentColor" || field === "textColor";
      updateInfoSlideField(slideId, field, infoField.value, { render: shouldRender });
      return;
    }
    const styleField = event.target.closest("[data-presentation-style-field]");
    if (styleField && styleField.type === "color") {
      updateCurrentSlideStyle(styleField.dataset.presentationStyleField, styleField.value);
      return;
    }
    const textField = event.target.closest("[data-presentation-text-field]");
    if (textField) {
      const isMultiline = textField.dataset.presentationTextMultiline === "true";
      const rawValue = String(textField.innerText ?? textField.textContent ?? "").replace(/\u00a0/g, " ");
      const value = isMultiline
        ? rawValue
            .replace(/\r\n?/g, "\n")
            .split("\n")
            .map((line) => line.trimEnd())
            .join("\n")
            .replace(/^\n+|\n+$/g, "")
        : rawValue.replace(/\s+/g, " ").trim();
      updateTextOverride(textField.dataset.presentationSlideId, textField.dataset.presentationTextField, value);
    }
  }

  function handleChange(event) {
    if (!state.isOpen || !root?.contains(event.target)) {
      return;
    }
    const activeTextSize = event.target.closest("[data-presentation-active-font-size]");
    if (activeTextSize) {
      updateActiveTextStyle("fontSize", activeTextSize.value);
      return;
    }
    const activeTextColor = event.target.closest("[data-presentation-active-text-color]");
    if (activeTextColor) {
      updateActiveTextStyle("textColor", activeTextColor.value);
      return;
    }
    const activeShapeFill = event.target.closest("[data-presentation-active-shape-fill]");
    if (activeShapeFill) {
      updateActiveShapeStyle("fillColor", activeShapeFill.value);
      return;
    }
    const activeShapeStroke = event.target.closest("[data-presentation-active-shape-stroke]");
    if (activeShapeStroke) {
      updateActiveShapeStyle("strokeColor", activeShapeStroke.value);
      return;
    }
    const activeShapeOpacity = event.target.closest("[data-presentation-active-shape-opacity]");
    if (activeShapeOpacity) {
      updateActiveShapeStyle("opacity", activeShapeOpacity.value);
      return;
    }
    const styleField = event.target.closest("[data-presentation-style-field]");
    if (styleField) {
      updateCurrentSlideStyle(styleField.dataset.presentationStyleField, styleField.value);
      return;
    }
    const dateInput = event.target.closest("[data-presentation-date-input]");
    const nextDate = normalizeDateValue(dateInput?.value || "", state.dateValue);
    if (!nextDate || nextDate === state.dateValue) {
      return;
    }
    state.activeTextTarget = null;
    state.activeShapeTarget = null;
    state.drawShape = null;
    state.dragShape = null;
    state.dragTextBox = null;
    state.resizeShape = null;
    state.resizeTextBox = null;
    state.shapeDrawTool = null;
    state.dateValue = nextDate;
    state.slideIndex = 0;
    state.editorOpen = false;
    resetUndoHistory();
    documentRef.body?.classList?.remove("is-presentation-shape-drawing");
    documentRef.body?.classList?.remove("is-presentation-text-box-resizing");
    documentRef.body?.classList?.remove("is-presentation-shape-resizing");
    render();
  }

  function handleKeydown(event) {
    if (!state.isOpen) {
      return;
    }
    if (isUndoShortcut(event)) {
      if (undoDeckChange()) {
        event.preventDefault();
      }
      return;
    }
    if (isRedoShortcut(event)) {
      if (redoDeckChange()) {
        event.preventDefault();
      }
      return;
    }
    if ((event.key === "Delete" || event.key === "Backspace") && !isEditableTarget(event.target)) {
      if (state.activeShapeTarget?.slideId && state.activeShapeTarget?.shapeId) {
        event.preventDefault();
        deleteShape(state.activeShapeTarget.slideId, state.activeShapeTarget.shapeId);
        return;
      }
      if (state.activeTextTarget?.slideId && state.activeTextTarget?.textBoxId) {
        event.preventDefault();
        deleteTextBox(state.activeTextTarget.slideId, state.activeTextTarget.textBoxId);
        return;
      }
    }
    if (isEditableTarget(event.target)) {
      return;
    }
    if (event.key === "Escape") {
      if (state.drawShape) {
        finishShapeDraw({ ...event, type: "pointercancel" });
        return;
      }
      if (state.shapeDrawTool) {
        event.preventDefault();
        state.shapeDrawTool = null;
        render();
        return;
      }
      if (state.presenting || documentRef.fullscreenElement) {
        state.presenting = false;
        render();
        return;
      }
      close();
      return;
    }
    if (event.key === "ArrowRight" || event.key === "PageDown" || event.key === " ") {
      event.preventDefault();
      goToSlide(state.slideIndex + 1);
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "PageUp") {
      event.preventDefault();
      goToSlide(state.slideIndex - 1);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      goToSlide(0);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      goToSlide(buildModel().slides.length - 1);
    }
  }

  function handleFocusin(event) {
    if (!state.isOpen || !root?.contains(event.target)) {
      return;
    }
    setActiveTextTargetFromElement(event.target);
    if (event.target.closest?.("[data-presentation-shape]")) {
      setActiveShapeTargetFromElement(event.target);
    }
  }

  function bindInteractions() {
    if (state.bound) {
      return;
    }
    state.bound = true;
    documentRef.addEventListener("pointerdown", handleTextActivation, true);
    documentRef.addEventListener("pointermove", updateTextBoxDrag, true);
    documentRef.addEventListener("pointermove", updateTextBoxResize, true);
    documentRef.addEventListener("pointermove", updateShapeDraw, true);
    documentRef.addEventListener("pointermove", updateShapeDrag, true);
    documentRef.addEventListener("pointermove", updateShapeResize, true);
    documentRef.addEventListener("pointerup", finishTextBoxDrag, true);
    documentRef.addEventListener("pointerup", finishTextBoxResize, true);
    documentRef.addEventListener("pointerup", finishShapeDraw, true);
    documentRef.addEventListener("pointerup", finishShapeDrag, true);
    documentRef.addEventListener("pointerup", finishShapeResize, true);
    documentRef.addEventListener("pointercancel", finishTextBoxDrag, true);
    documentRef.addEventListener("pointercancel", finishTextBoxResize, true);
    documentRef.addEventListener("pointercancel", finishShapeDraw, true);
    documentRef.addEventListener("pointercancel", finishShapeDrag, true);
    documentRef.addEventListener("pointercancel", finishShapeResize, true);
    documentRef.addEventListener("click", handleClick);
    documentRef.addEventListener("focus", handleFocusin, true);
    documentRef.addEventListener("focusin", handleFocusin, true);
    documentRef.addEventListener("input", handleInput);
    documentRef.addEventListener("change", handleChange);
    documentRef.addEventListener("keydown", handleKeydown);
    documentRef.addEventListener("fullscreenchange", () => {
      if (!state.isOpen) {
        return;
      }
      const isPresenting = Boolean(documentRef.fullscreenElement && root?.contains(documentRef.fullscreenElement));
      if (state.presenting !== isPresenting) {
        state.presenting = isPresenting;
        render();
      }
      scheduleStageMetrics();
    });
    win?.addEventListener?.("resize", scheduleStageMetrics);
  }

  return {
    bindInteractions,
    buildModel,
    close,
    getDeckForDate,
    open,
    readStore,
    render,
    writeDeckForDate,
  };
}
