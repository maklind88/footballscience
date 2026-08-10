import {
  getPresentationThemePreset,
  normalizePresentationSlideStyle,
} from "./presentation-mode-themes.mjs";

export const dashboardPresentationStorageKey = "football-dashboard-presentation-mode-v1";

const presentationSchema = "footballscience-presentation-mode-v1";
const maxTextOverrideLength = 5000;
const maxTextBoxesPerSlide = 12;
const maxShapesPerSlide = 24;
const shapeTypes = new Set(["rect", "circle", "triangle", "diamond", "line", "arrow", "star"]);

function noop() {}

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
            const width = Math.min(42, Math.max(6, Number(safeShape.width) || (type === "line" ? 24 : 14)));
            const height = Math.min(42, Math.max(3, Number(safeShape.height) || (type === "line" ? 4 : 14)));
            return {
              id: String(safeShape.id || `shape-${index + 1}`).trim(),
              type,
              x: Math.min(96 - width, Math.max(2, Number(safeShape.x) || 18)),
              y: Math.min(94 - height, Math.max(4, Number(safeShape.y) || 24)),
              width,
              height,
              fillColor: normalizeHexColor(safeShape.fillColor, "#38bdf8"),
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
    dragShape: null,
    dragTextBox: null,
    editorOpen: false,
    isOpen: false,
    presenting: false,
    slideIndex: 0,
  };
  let root = null;

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

  function writeDeckForDate(dateValue, updater) {
    const store = readStore();
    const currentDeck = normalizeDeck(store.decks?.[dateValue], dateValue);
    const nextDeck = normalizeDeck(updater(currentDeck), dateValue);
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

  function clampShapePosition(x, y, width = 12, height = 12) {
    const safeWidth = Math.min(42, Math.max(6, Number(width) || 12));
    const safeHeight = Math.min(42, Math.max(3, Number(height) || 12));
    return {
      x: Number(Math.min(96 - safeWidth, Math.max(2, Number(x) || 2)).toFixed(2)),
      y: Number(Math.min(94 - safeHeight, Math.max(4, Number(y) || 4)).toFixed(2)),
    };
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
      slideIndex: state.slideIndex,
      slides,
      teamName: brand.teamName,
      textToolbarOpen: Boolean((state.activeTextTarget || state.activeShapeTarget) && !state.presenting),
      totalMinutes: getSessionTotalMinutes(session),
    };
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
  }

  function open(dateValue = "") {
    state.activeShapeTarget = null;
    state.activeTextTarget = null;
    state.dragShape = null;
    state.dragTextBox = null;
    state.dateValue = normalizeDateValue(dateValue, getTodayValue());
    state.slideIndex = 0;
    state.editorOpen = false;
    state.isOpen = true;
    render();
    ensureRoot().querySelector("[data-presentation-stage]")?.focus?.();
  }

  function close() {
    state.activeShapeTarget = null;
    state.activeTextTarget = null;
    state.dragShape = null;
    state.dragTextBox = null;
    state.isOpen = false;
    state.editorOpen = false;
    state.presenting = false;
    if (documentRef.fullscreenElement && root?.contains(documentRef.fullscreenElement)) {
      documentRef.exitFullscreen?.().catch?.(noop);
    }
    if (root) {
      root.hidden = true;
      root.innerHTML = "";
    }
    documentRef.body.classList.remove("is-presentation-mode-open");
    documentRef.body?.classList?.remove("is-presentation-text-box-dragging");
    documentRef.body?.classList?.remove("is-presentation-shape-dragging");
  }

  function goToSlide(index) {
    const slideCount = buildModel().slides.length;
    state.slideIndex = Math.min(Math.max(0, Number(index) || 0), Math.max(0, slideCount - 1));
    state.editorOpen = false;
    state.activeShapeTarget = null;
    state.activeTextTarget = null;
    state.dragShape = null;
    state.dragTextBox = null;
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
    if (!root || !target?.slideId || !target.field) {
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

  function syncTextToolbar() {
    if (!root) return;
    const shell = root.querySelector("[data-presentation-mode-shell]");
    const toolbar = root.querySelector("[data-presentation-text-toolbar]");
    if (!shell || !toolbar || state.presenting || (!state.activeTextTarget && !state.activeShapeTarget)) {
      shell?.classList.remove("is-text-toolbar-open");
      return;
    }
    const activeStyle = getActiveTextStyle();
    shell.classList.add("is-text-toolbar-open");
    const fontSize = toolbar.querySelector("[data-presentation-active-font-size]");
    if (fontSize) {
      fontSize.value = activeStyle.fontSize || "";
      fontSize.disabled = !state.activeTextTarget;
    }
    const textColor = toolbar.querySelector("[data-presentation-active-text-color]");
    if (textColor) {
      textColor.value = normalizeHexColor(activeStyle.textColor, "#f8fafc");
      textColor.disabled = !state.activeTextTarget;
    }
    const activeShape = getActiveShape();
    const shapeFill = toolbar.querySelector("[data-presentation-active-shape-fill]");
    if (shapeFill) {
      shapeFill.value = normalizeHexColor(activeShape?.fillColor, "#38bdf8");
      shapeFill.disabled = !activeShape;
    }
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
    const slideId = String(textElement?.dataset.presentationSlideId || "").trim();
    const field = String(textElement?.dataset.presentationTextField || "").trim();
    if (!slideId || !field || state.presenting) {
      return;
    }
    state.activeShapeTarget = null;
    state.activeTextTarget = {
      field,
      infoId: String(textElement.dataset.presentationInfoId || "").trim(),
      slideId,
      textBoxId: String(textElement.dataset.presentationTextBoxId || "").trim(),
    };
    syncTextToolbar();
  }

  function hideTextToolbar() {
    state.activeShapeTarget = null;
    state.activeTextTarget = null;
    root?.querySelector("[data-presentation-mode-shell]")?.classList.remove("is-text-toolbar-open");
  }

  function insertTextIntoActiveField(text = "") {
    const symbol = String(text || "");
    const activeElement = getActiveTextElement();
    if (!symbol || !activeElement) {
      return;
    }
    if ("setRangeText" in activeElement) {
      const start = Number.isFinite(activeElement.selectionStart) ? activeElement.selectionStart : activeElement.value.length;
      const end = Number.isFinite(activeElement.selectionEnd) ? activeElement.selectionEnd : start;
      activeElement.setRangeText(symbol, start, end, "end");
      activeElement.dispatchEvent(new InputEvent("input", { bubbles: true, data: symbol, inputType: "insertText" }));
      activeElement.focus?.({ preventScroll: true });
      return;
    }
    const selection = win?.getSelection?.();
    if (selection?.rangeCount && activeElement.contains(selection.anchorNode)) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      const node = documentRef.createTextNode(symbol);
      range.insertNode(node);
      range.setStartAfter(node);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    } else {
      activeElement.textContent = `${activeElement.textContent || ""}${symbol}`;
    }
    activeElement.dispatchEvent(new InputEvent("input", { bubbles: true, data: symbol, inputType: "insertText" }));
    activeElement.focus?.({ preventScroll: true });
  }

  function addTextBox() {
    const currentSlide = buildModel().slides[state.slideIndex];
    if (!currentSlide?.id) {
      return;
    }
    const id = `textbox-${Date.now()}`;
    const field = getTextBoxField(id);
    writeDeckForDate(state.dateValue, (deck) => ({
      ...deck,
      textBoxes: normalizeTextBoxes({
        ...deck.textBoxes,
        [currentSlide.id]: [
          ...(deck.textBoxes?.[currentSlide.id] || []),
          {
            id,
            text: "Text box",
            x: 56,
            y: 36,
            width: 30,
            fontSize: "36",
            textColor: "#f8fafc",
          },
        ],
      }),
      textFieldStyles: normalizeTextFieldStyles({
        ...deck.textFieldStyles,
        [currentSlide.id]: {
          ...(deck.textFieldStyles?.[currentSlide.id] || {}),
          [field]: {
            fontSize: "36",
            textColor: "#f8fafc",
          },
        },
      }),
      textOverrides: normalizeTextOverrides({
        ...deck.textOverrides,
        [currentSlide.id]: {
          ...(deck.textOverrides?.[currentSlide.id] || {}),
          [field]: "Text box",
        },
      }),
    }));
    state.activeShapeTarget = null;
    state.activeTextTarget = { field, infoId: "", slideId: currentSlide.id, textBoxId: id };
    render();
    focusActiveTextElement();
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

  function getShapeDefaults(type = "rect") {
    if (type === "line") return { width: 30, height: 4 };
    if (type === "arrow") return { width: 26, height: 12 };
    if (type === "triangle") return { width: 14, height: 13 };
    return { width: 14, height: 14 };
  }

  function addShape(type = "rect") {
    const safeType = shapeTypes.has(String(type || "").trim()) ? String(type).trim() : "rect";
    const currentSlide = buildModel().slides[state.slideIndex];
    if (!currentSlide?.id) {
      return;
    }
    const id = `shape-${Date.now()}`;
    const size = getShapeDefaults(safeType);
    const position = clampShapePosition(42, 34, size.width, size.height);
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
            strokeColor: "#f8fafc",
          },
        ],
      }),
    }));
    state.activeTextTarget = null;
    state.activeShapeTarget = { shapeId: id, slideId: currentSlide.id };
    render();
  }

  function updateActiveShapeFill(value = "") {
    const target = state.activeShapeTarget;
    if (!target?.slideId || !target.shapeId) {
      return;
    }
    writeDeckForDate(state.dateValue, (deck) => ({
      ...deck,
      shapes: normalizeShapes({
        ...deck.shapes,
        [target.slideId]: (deck.shapes?.[target.slideId] || []).map((shape) =>
          shape.id === target.shapeId ? { ...shape, fillColor: normalizeHexColor(value, shape.fillColor) } : shape
        ),
      }),
    }));
    render();
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
    state.dragShape = null;
    state.dragTextBox = null;
    state.presenting = true;
    state.editorOpen = false;
    render();
  }

  function exitFullscreen() {
    documentRef.exitFullscreen?.().catch?.(noop);
    state.presenting = false;
    render();
  }

  function beginTextBoxDrag(event, handle) {
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

  function beginShapeDrag(event, shapeElement) {
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
    const symbolButton = event.target.closest("[data-presentation-insert-symbol]");
    if (symbolButton) {
      insertTextIntoActiveField(symbolButton.dataset.presentationInsertSymbol);
      symbolButton.closest?.("details")?.removeAttribute?.("open");
      return;
    }
    const shapeButton = event.target.closest("[data-presentation-add-shape]");
    if (shapeButton) {
      addShape(shapeButton.dataset.presentationAddShape);
      shapeButton.closest?.("details")?.removeAttribute?.("open");
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
    const dragHandle = event.target.closest("[data-presentation-drag-text-box]");
    if (dragHandle) {
      beginTextBoxDrag(event, dragHandle);
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
      updateActiveShapeFill(activeShapeFill.value);
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
      updateActiveShapeFill(activeShapeFill.value);
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
    state.dragShape = null;
    state.dragTextBox = null;
    state.dateValue = nextDate;
    state.slideIndex = 0;
    state.editorOpen = false;
    render();
  }

  function handleKeydown(event) {
    if (!state.isOpen) {
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
    documentRef.addEventListener("pointermove", updateShapeDrag, true);
    documentRef.addEventListener("pointerup", finishTextBoxDrag, true);
    documentRef.addEventListener("pointerup", finishShapeDrag, true);
    documentRef.addEventListener("pointercancel", finishTextBoxDrag, true);
    documentRef.addEventListener("pointercancel", finishShapeDrag, true);
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
    });
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
