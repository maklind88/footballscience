import {
  getPresentationThemePreset,
  normalizePresentationSlideStyle,
} from "./presentation-mode-themes.mjs";
import {
  getSetPiecePresentationCatalog,
  resolveSetPiecePresentationVariant,
} from "../set-pieces-room/presentation-adapter.mjs";
import { createSetPiecesPlaybackController } from "../set-pieces-room/playback-controller.mjs";
import { renderSetPiecePlaybackFrame, updateSetPiecePlaybackView } from "../set-pieces-room/playback-view.mjs";

export const dashboardPresentationStorageKey = "football-dashboard-presentation-mode-v1";

const presentationSchema = "footballscience-presentation-mode-v1";
const presentationMeetingTypes = {
  team: {
    id: "team",
    label: "Team Meeting",
    coverTitle: "",
    passTypeLabel: "",
  },
  technical: {
    id: "technical",
    label: "Technical Staff Meeting",
    coverTitle: "Technical Staff Meeting",
    passTypeLabel: "Technical staff briefing",
  },
};
const maxTextOverrideLength = 5000;
const maxTextBoxesPerSlide = 12;
const maxShapesPerSlide = 24;
const maxUndoHistory = 80;
const shapeTypes = new Set(["rect", "circle", "triangle", "diamond", "line", "arrow", "star"]);
const textBoxKinds = new Set(["text", "symbol", "image", "video"]);
const resizeAxes = new Set(["n", "ne", "e", "se", "s", "sw", "w", "nw"]);
const slideTemplateTypes = new Set(["title", "title-subtitle", "text", "bullets", "media", "split", "video", "match-squad", "starting-xi", "set-piece", "blank"]);
const localMediaKinds = new Set(["image", "video"]);
const lineupFormationOptions = [
  {
    id: "4-3-3",
    label: "4-3-3",
    slots: [
      { id: "gk", label: "GK", x: 50, y: 90 },
      { id: "lb", label: "LB", x: 14, y: 70 },
      { id: "lcb", label: "LCB", x: 38, y: 70 },
      { id: "rcb", label: "RCB", x: 62, y: 70 },
      { id: "rb", label: "RB", x: 86, y: 70 },
      { id: "lcm", label: "LCM", x: 27, y: 49 },
      { id: "cm", label: "CM", x: 50, y: 49 },
      { id: "rcm", label: "RCM", x: 73, y: 49 },
      { id: "lw", label: "LW", x: 18, y: 27 },
      { id: "st", label: "ST", x: 50, y: 16 },
      { id: "rw", label: "RW", x: 82, y: 27 },
    ],
  },
  {
    id: "4-2-3-1",
    label: "4-2-3-1",
    slots: [
      { id: "gk", label: "GK", x: 50, y: 90 },
      { id: "lb", label: "LB", x: 14, y: 70 },
      { id: "lcb", label: "LCB", x: 38, y: 70 },
      { id: "rcb", label: "RCB", x: 62, y: 70 },
      { id: "rb", label: "RB", x: 86, y: 70 },
      { id: "ldm", label: "LDM", x: 34, y: 50 },
      { id: "rdm", label: "RDM", x: 66, y: 50 },
      { id: "lam", label: "LAM", x: 17, y: 32 },
      { id: "cam", label: "CAM", x: 50, y: 32 },
      { id: "ram", label: "RAM", x: 83, y: 32 },
      { id: "st", label: "ST", x: 50, y: 12 },
    ],
  },
  {
    id: "4-4-2",
    label: "4-4-2",
    slots: [
      { id: "gk", label: "GK", x: 50, y: 90 },
      { id: "lb", label: "LB", x: 14, y: 70 },
      { id: "lcb", label: "LCB", x: 38, y: 70 },
      { id: "rcb", label: "RCB", x: 62, y: 70 },
      { id: "rb", label: "RB", x: 86, y: 70 },
      { id: "lm", label: "LM", x: 15, y: 46 },
      { id: "lcm", label: "LCM", x: 38, y: 46 },
      { id: "rcm", label: "RCM", x: 62, y: 46 },
      { id: "rm", label: "RM", x: 85, y: 46 },
      { id: "lst", label: "LST", x: 37, y: 20 },
      { id: "rst", label: "RST", x: 63, y: 20 },
    ],
  },
  {
    id: "3-5-2",
    label: "3-5-2",
    slots: [
      { id: "gk", label: "GK", x: 50, y: 90 },
      { id: "lcb", label: "LCB", x: 29, y: 68 },
      { id: "cb", label: "CB", x: 50, y: 68 },
      { id: "rcb", label: "RCB", x: 71, y: 68 },
      { id: "lwb", label: "LWB", x: 12, y: 48 },
      { id: "lcm", label: "LCM", x: 32, y: 46 },
      { id: "cm", label: "CM", x: 50, y: 41 },
      { id: "rcm", label: "RCM", x: 68, y: 46 },
      { id: "rwb", label: "RWB", x: 88, y: 48 },
      { id: "lst", label: "LST", x: 37, y: 18 },
      { id: "rst", label: "RST", x: 63, y: 18 },
    ],
  },
  {
    id: "3-4-3",
    label: "3-4-3",
    slots: [
      { id: "gk", label: "GK", x: 50, y: 90 },
      { id: "lcb", label: "LCB", x: 29, y: 68 },
      { id: "cb", label: "CB", x: 50, y: 68 },
      { id: "rcb", label: "RCB", x: 71, y: 68 },
      { id: "lm", label: "LM", x: 16, y: 46 },
      { id: "lcm", label: "LCM", x: 38, y: 46 },
      { id: "rcm", label: "RCM", x: 62, y: 46 },
      { id: "rm", label: "RM", x: 84, y: 46 },
      { id: "lw", label: "LW", x: 18, y: 24 },
      { id: "st", label: "ST", x: 50, y: 14 },
      { id: "rw", label: "RW", x: 82, y: 24 },
    ],
  },
  {
    id: "4-1-4-1",
    label: "4-1-4-1",
    slots: [
      { id: "gk", label: "GK", x: 50, y: 90 },
      { id: "lb", label: "LB", x: 14, y: 70 },
      { id: "lcb", label: "LCB", x: 38, y: 70 },
      { id: "rcb", label: "RCB", x: 62, y: 70 },
      { id: "rb", label: "RB", x: 86, y: 70 },
      { id: "dm", label: "DM", x: 50, y: 50 },
      { id: "lm", label: "LM", x: 14, y: 32 },
      { id: "lcm", label: "LCM", x: 34, y: 32 },
      { id: "rcm", label: "RCM", x: 66, y: 32 },
      { id: "rm", label: "RM", x: 86, y: 32 },
      { id: "st", label: "ST", x: 50, y: 12 },
    ],
  },
];

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

function addDaysToDateValue(dateValue = "", dayOffset = 0) {
  const normalizedDate = normalizeDateValue(dateValue, "");
  if (!normalizedDate) {
    return "";
  }
  const [year, month, day] = normalizedDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + Number(dayOffset || 0)));
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toISOString().slice(0, 10);
}

function getScheduleEventTitle(event = {}) {
  return String(event?.title || event?.name || event?.label || "").replace(/\s+/g, " ").trim();
}

function getMatchOpponentLabel(event = {}) {
  const explicitOpponent = String(event?.opponent || event?.opponentName || event?.awayTeam || "").replace(/\s+/g, " ").trim();
  if (explicitOpponent) {
    return explicitOpponent;
  }
  const title = getScheduleEventTitle(event)
    .replace(/\([^)]*\)/g, " ")
    .replace(/^match\s*[:\-]?\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
  const vsMatch = title.match(/\bvs\.?\s+(.+)$/i);
  if (vsMatch?.[1]) {
    return vsMatch[1].trim();
  }
  if (/^(match|game|match day|gameday)$/i.test(title)) {
    return "";
  }
  return title;
}

function isMatchScheduleEvent(event = {}) {
  return String(event?.type || "").trim().toLowerCase() === "match";
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

function normalizeTextFieldOffset(value = "", fallback = 0) {
  const numericValue = Number(value);
  const safeFallback = Number.isFinite(Number(fallback)) ? Number(fallback) : 0;
  return Number(Math.min(96, Math.max(-96, Number.isFinite(numericValue) ? numericValue : safeFallback)).toFixed(2));
}

function normalizeTextFieldWidth(value = "") {
  if (value === "" || value === null || value === undefined) {
    return "";
  }
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? Number(Math.min(92, Math.max(4, numericValue)).toFixed(2)) : "";
}

function normalizeTextFieldHeight(value = "") {
  if (value === "" || value === null || value === undefined) {
    return "";
  }
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? Number(Math.min(88, Math.max(2, numericValue)).toFixed(2)) : "";
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
    layout: "bullets",
    title: "Team Information",
    body: "- Meeting point\n- Training focus\n- Staff note",
    fontSize: "56",
    accentColor: "#38bdf8",
    textColor: "#f8fafc",
  };
}

function normalizePresentationMeetingType(value = "") {
  const meetingType = String(value || "").trim().toLowerCase();
  return presentationMeetingTypes[meetingType]?.id || presentationMeetingTypes.team.id;
}

function getPresentationMeetingConfig(meetingType = "team") {
  return presentationMeetingTypes[normalizePresentationMeetingType(meetingType)];
}

function createDefaultInfoSlides(dateValue = "", meetingType = "team") {
  if (normalizePresentationMeetingType(meetingType) !== "technical") {
    return [createDefaultInfoSlide(dateValue)];
  }
  return [
    {
      id: `technical-${dateValue || "date"}-main`,
      layout: "bullets",
      title: "Technical Notes",
      body: "- Training objective\n- Staff responsibilities\n- Player management\n- Video / opponent notes",
      fontSize: "52",
      accentColor: "#38bdf8",
      textColor: "#f8fafc",
    },
  ];
}

function normalizeSlideTemplate(value = "") {
  const template = String(value || "").trim();
  return slideTemplateTypes.has(template) ? template : "bullets";
}

function getSlideTemplateDefaults(template = "bullets") {
  const layout = normalizeSlideTemplate(template);
  const defaults = {
    title: { title: "Title", body: "", fontSize: "72", accentColor: "#38bdf8" },
    "title-subtitle": { title: "Title", body: "Subtitle", fontSize: "60", accentColor: "#38bdf8" },
    text: { title: "Text", body: "Write your notes here", fontSize: "48", accentColor: "#38bdf8" },
    bullets: { title: "Information", body: "- First point\n- Second point\n- Third point", fontSize: "56", accentColor: "#38bdf8" },
    media: { title: "Image", body: "Caption or notes", fontSize: "44", accentColor: "#38bdf8", mediaKind: "image" },
    split: { title: "Text + Image", body: "Supporting text", fontSize: "44", accentColor: "#38bdf8" },
    video: { title: "Video Analysis", body: "- Clip focus\n- Player cues\n- Team principles", fontSize: "44", accentColor: "#facc15", mediaKind: "video" },
    "match-squad": { title: "Match Squad", body: "", fontSize: "48", accentColor: "#22c55e" },
    "starting-xi": { title: "Starting XI", body: "", fontSize: "56", accentColor: "#22c55e" },
    "set-piece": { title: "Set Piece", body: "", fontSize: "56", accentColor: "#22c55e" },
    blank: { title: "Blank", body: "", fontSize: "56", accentColor: "#38bdf8" },
  };
  return {
    layout,
    title: defaults[layout].title,
    body: defaults[layout].body,
    fontSize: defaults[layout].fontSize,
    accentColor: defaults[layout].accentColor,
    textColor: "#f8fafc",
    mediaKind: defaults[layout].mediaKind || "",
  };
}

function normalizeLineupFormation(value = "") {
  const formation = String(value || "").trim();
  return lineupFormationOptions.some((option) => option.id === formation) ? formation : lineupFormationOptions[0].id;
}

function normalizeLineupAssignments(lineup = {}) {
  const assignments = lineup && typeof lineup === "object" && !Array.isArray(lineup) ? lineup : {};
  return Object.fromEntries(
    Object.entries(assignments)
      .map(([slotId, playerId]) => [String(slotId || "").trim(), String(playerId || "").trim()])
      .filter(([slotId, playerId]) => slotId && playerId)
  );
}

function normalizeMatchSquadPlayerIds(value = []) {
  const values = Array.isArray(value)
    ? value
    : value && typeof value === "object"
      ? Object.values(value)
      : String(value || "").split(/\s*(?:,|;|\n)\s*/);
  return [...new Set(values.map((playerId) => String(playerId || "").trim()).filter(Boolean))];
}

function normalizeSlideOrder(slideOrder = []) {
  return [...new Set((Array.isArray(slideOrder) ? slideOrder : []).map((id) => String(id || "").trim()).filter(Boolean))];
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

function normalizeTextOverrideUpdatedAt(textOverrideUpdatedAt = {}) {
  const updatedAt =
    textOverrideUpdatedAt && typeof textOverrideUpdatedAt === "object" && !Array.isArray(textOverrideUpdatedAt)
      ? textOverrideUpdatedAt
      : {};
  return Object.fromEntries(
    Object.entries(updatedAt)
      .map(([slideId, fields]) => {
        const slideFields = fields && typeof fields === "object" && !Array.isArray(fields) ? fields : {};
        return [
          String(slideId || "").trim(),
          Object.fromEntries(
            Object.entries(slideFields)
              .map(([field, value]) => [String(field || "").trim(), String(value || "").trim()])
              .filter(([field, value]) => field && value)
          ),
        ];
      })
      .filter(([slideId, fields]) => slideId && Object.keys(fields).length)
  );
}

function markTextOverrideUpdatedAt(deck = {}, slideId = "", field = "", updatedAt = new Date().toISOString()) {
  const safeSlideId = String(slideId || "").trim();
  const safeField = String(field || "").trim();
  if (!safeSlideId || !safeField) {
    return normalizeTextOverrideUpdatedAt(deck.textOverrideUpdatedAt);
  }
  return normalizeTextOverrideUpdatedAt({
    ...deck.textOverrideUpdatedAt,
    [safeSlideId]: {
      ...(deck.textOverrideUpdatedAt?.[safeSlideId] || {}),
      [safeField]: updatedAt,
    },
  });
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
                  offsetX: normalizeTextFieldOffset(textStyle.offsetX),
                  offsetY: normalizeTextFieldOffset(textStyle.offsetY),
                  width: normalizeTextFieldWidth(textStyle.width),
                  height: normalizeTextFieldHeight(textStyle.height),
                };
                return [String(field || "").trim(), Object.fromEntries(Object.entries(normalized).filter(([, value]) => value !== "" && value !== 0))];
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
            const kind = textBoxKinds.has(String(safeBox.kind || "").trim()) ? String(safeBox.kind).trim() : "text";
            const width = Math.min(70, Math.max(14, Number(safeBox.width) || 28));
            const fallbackHeight =
              kind === "symbol" ? Math.max(8, Math.min(28, width)) : kind === "image" || kind === "video" ? 24 : 12;
            const height = Math.min(84, Math.max(5, Number(safeBox.height) || fallbackHeight));
            const mediaFields =
              localMediaKinds.has(kind)
                ? {
                    mediaId: String(safeBox.mediaId || "").trim().slice(0, 120),
                    mediaLocal: Boolean(safeBox.mediaLocal),
                    mediaMimeType: String(safeBox.mediaMimeType || "").trim().slice(0, 140),
                    mediaName: String(safeBox.mediaName || "").trim().slice(0, 180),
                    mediaSize: Math.max(0, Number(safeBox.mediaSize) || 0),
                  }
                : {};
            return {
              id,
              kind,
              x: Math.min(96 - width, Math.max(2, Number(safeBox.x) || 12)),
              y: Math.min(96 - height, Math.max(2, Number(safeBox.y) || 22)),
              width,
              height,
              text: String(safeBox.text ?? "Text box").slice(0, maxTextOverrideLength),
              fontSize: normalizeFontSize(safeBox.fontSize || "36"),
              textColor: normalizeHexColor(safeBox.textColor, "#f8fafc"),
              ...Object.fromEntries(Object.entries(mediaFields).filter(([, value]) => value !== "" && value !== 0 && value !== false)),
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

function normalizeInfoSlide(slide = {}, index = 0, dateValue = "", meetingType = "team") {
  const defaultInfoSlide = createDefaultInfoSlides(dateValue, meetingType)[0] || createDefaultInfoSlide(dateValue);
  const layout = normalizeSlideTemplate(slide.layout || defaultInfoSlide.layout);
  const templateFallback = getSlideTemplateDefaults(layout);
  const fallback = layout === defaultInfoSlide.layout ? defaultInfoSlide : { ...templateFallback, id: defaultInfoSlide.id };
  const fallbackMediaKind =
    layout === "video" ? "video" : layout === "media" || layout === "split" ? "image" : fallback.mediaKind || "";
  const mediaKind = localMediaKinds.has(String(slide.mediaKind || fallbackMediaKind || "").trim())
    ? String(slide.mediaKind || fallbackMediaKind).trim()
    : "";
  return {
    id: String(slide.id || (index ? `info-${dateValue}-${index + 1}` : fallback.id)).trim(),
    layout,
    title: String(slide.title ?? fallback.title).trim().slice(0, 90),
    body: String(slide.body ?? fallback.body).slice(0, 5000),
    fontSize: normalizeFontSize(slide.fontSize ?? fallback.fontSize),
    accentColor: normalizeHexColor(slide.accentColor, fallback.accentColor),
    textColor: normalizeHexColor(slide.textColor, fallback.textColor),
    matchSquadPlayerIds:
      layout === "match-squad"
        ? normalizeMatchSquadPlayerIds(slide.matchSquadPlayerIds || slide.squadPlayerIds || slide.squad || slide.players)
        : [],
    formation: layout === "starting-xi" ? normalizeLineupFormation(slide.formation) : "",
    lineup: layout === "starting-xi" ? normalizeLineupAssignments(slide.lineup) : {},
    setPiecePlayId: layout === "set-piece" ? String(slide.setPiecePlayId || slide.playId || "").trim().slice(0, 120) : "",
    setPieceVariantId: layout === "set-piece" ? String(slide.setPieceVariantId || slide.variantId || "").trim().slice(0, 120) : "",
    mediaKind,
    mediaId: mediaKind ? String(slide.mediaId || "").trim().slice(0, 120) : "",
    mediaLocal: mediaKind ? Boolean(slide.mediaLocal) : false,
    mediaMimeType: mediaKind ? String(slide.mediaMimeType || "").trim().slice(0, 120) : "",
    mediaName: mediaKind ? String(slide.mediaName || "").trim().slice(0, 180) : "",
    mediaSize: mediaKind ? Math.max(0, Number(slide.mediaSize) || 0) : 0,
  };
}

function normalizeDeck(deck = {}, dateValue = "", meetingType = "team") {
  const hasSavedInfoSlides = Array.isArray(deck?.infoSlides);
  const infoSlides = hasSavedInfoSlides
    ? deck.infoSlides.map((slide, index) => normalizeInfoSlide(slide, index, dateValue, meetingType)).filter((slide) => slide.id)
    : [];
  return {
    updatedAt: String(deck.updatedAt || "").trim(),
    infoSlides: hasSavedInfoSlides ? infoSlides : createDefaultInfoSlides(dateValue, meetingType),
    slideOrder: normalizeSlideOrder(deck.slideOrder),
    shapes: normalizeShapes(deck.shapes),
    slideStyles: normalizeSlideStyles(deck.slideStyles),
    textBoxes: normalizeTextBoxes(deck.textBoxes),
    textFieldStyles: normalizeTextFieldStyles(deck.textFieldStyles),
    textOverrides: normalizeTextOverrides(deck.textOverrides),
    textOverrideUpdatedAt: normalizeTextOverrideUpdatedAt(deck.textOverrideUpdatedAt),
  };
}

function normalizeStore(store = {}) {
  const decks = store?.decks && typeof store.decks === "object" && !Array.isArray(store.decks) ? store.decks : {};
  const meetingDecks =
    store?.meetingDecks && typeof store.meetingDecks === "object" && !Array.isArray(store.meetingDecks) ? store.meetingDecks : {};
  const technicalDecks =
    meetingDecks.technical && typeof meetingDecks.technical === "object" && !Array.isArray(meetingDecks.technical)
      ? meetingDecks.technical
      : {};
  return {
    schema: presentationSchema,
    version: 1,
    decks: Object.fromEntries(
      Object.entries(decks)
        .filter(([dateValue]) => /^\d{4}-\d{2}-\d{2}$/.test(dateValue))
        .map(([dateValue, deck]) => [dateValue, normalizeDeck(deck, dateValue, "team")])
    ),
    meetingDecks: {
      technical: Object.fromEntries(
        Object.entries(technicalDecks)
          .filter(([dateValue]) => /^\d{4}-\d{2}-\d{2}$/.test(dateValue))
          .map(([dateValue, deck]) => [dateValue, normalizeDeck(deck, dateValue, "technical")])
      ),
    },
  };
}

function parsePresentationStoreValue(value) {
  if (value && typeof value === "object") {
    return value;
  }
  try {
    return JSON.parse(String(value || "{}"));
  } catch {
    return {};
  }
}

function getPresentationTimestampMs(value = "") {
  const timestamp = Date.parse(String(value || ""));
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function hasTextOverrideField(deck = {}, slideId = "", field = "") {
  const fields = deck.textOverrides?.[slideId];
  return Boolean(fields && Object.prototype.hasOwnProperty.call(fields, field));
}

function hasTextOverrideFieldTimestamp(deck = {}, slideId = "", field = "") {
  const fields = deck.textOverrideUpdatedAt?.[slideId];
  return Boolean(fields && Object.prototype.hasOwnProperty.call(fields, field) && String(fields[field] || "").trim());
}

function getTextOverrideFieldUpdatedAtMs(deck = {}, slideId = "", field = "") {
  const explicitTimestamp = getPresentationTimestampMs(deck.textOverrideUpdatedAt?.[slideId]?.[field]);
  if (explicitTimestamp) {
    return explicitTimestamp;
  }
  return hasTextOverrideField(deck, slideId, field) ? getPresentationTimestampMs(deck.updatedAt) : 0;
}

function getTextOverrideFieldUpdatedAt(deck = {}, slideId = "", field = "") {
  return String(deck.textOverrideUpdatedAt?.[slideId]?.[field] || deck.updatedAt || "").trim();
}

function mergeTextOverrideFieldsPreservingNewest(localDeck = {}, syncedDeck = {}) {
  const textOverrides = {};
  const textOverrideUpdatedAt = {};
  const slideIds = new Set([
    ...Object.keys(localDeck.textOverrides || {}),
    ...Object.keys(syncedDeck.textOverrides || {}),
  ]);

  slideIds.forEach((slideId) => {
    const fieldIds = new Set([
      ...Object.keys(localDeck.textOverrides?.[slideId] || {}),
      ...Object.keys(syncedDeck.textOverrides?.[slideId] || {}),
    ]);

    fieldIds.forEach((field) => {
      const localHasField = hasTextOverrideField(localDeck, slideId, field);
      const syncedHasField = hasTextOverrideField(syncedDeck, slideId, field);
      if (!localHasField && !syncedHasField) {
        return;
      }
      const localHasTimestamp = hasTextOverrideFieldTimestamp(localDeck, slideId, field);
      const syncedHasTimestamp = hasTextOverrideFieldTimestamp(syncedDeck, slideId, field);
      const localUpdatedAt = getTextOverrideFieldUpdatedAtMs(localDeck, slideId, field);
      const syncedUpdatedAt = getTextOverrideFieldUpdatedAtMs(syncedDeck, slideId, field);
      const useLocal =
        localHasField &&
        (!syncedHasField ||
          (localHasTimestamp && !syncedHasTimestamp) ||
          localUpdatedAt >= syncedUpdatedAt);
      const sourceDeck = useLocal ? localDeck : syncedDeck;
      const sourceTimestamp = getTextOverrideFieldUpdatedAt(sourceDeck, slideId, field);

      textOverrides[slideId] = {
        ...(textOverrides[slideId] || {}),
        [field]: String(sourceDeck.textOverrides?.[slideId]?.[field] ?? "").slice(0, maxTextOverrideLength),
      };
      if (sourceTimestamp) {
        textOverrideUpdatedAt[slideId] = {
          ...(textOverrideUpdatedAt[slideId] || {}),
          [field]: sourceTimestamp,
        };
      }
    });
  });

  return {
    textOverrides: normalizeTextOverrides(textOverrides),
    textOverrideUpdatedAt: normalizeTextOverrideUpdatedAt(textOverrideUpdatedAt),
  };
}

function mergePresentationDeckBucket(localDecks = {}, syncedDecks = {}, meetingType = "team") {
  const dateValues = new Set([...Object.keys(localDecks || {}), ...Object.keys(syncedDecks || {})]);
  const decks = {};

  dateValues.forEach((dateValue) => {
    const hasLocalDeck = Object.prototype.hasOwnProperty.call(localDecks || {}, dateValue);
    const hasSyncedDeck = Object.prototype.hasOwnProperty.call(syncedDecks || {}, dateValue);
    if (!hasLocalDeck && !hasSyncedDeck) {
      return;
    }
    if (!hasLocalDeck) {
      decks[dateValue] = normalizeDeck(syncedDecks[dateValue], dateValue, meetingType);
      return;
    }
    if (!hasSyncedDeck) {
      decks[dateValue] = normalizeDeck(localDecks[dateValue], dateValue, meetingType);
      return;
    }

    const localDeck = normalizeDeck(localDecks[dateValue], dateValue, meetingType);
    const syncedDeck = normalizeDeck(syncedDecks[dateValue], dateValue, meetingType);
    const localUpdatedAt = getPresentationTimestampMs(localDeck.updatedAt);
    const syncedUpdatedAt = getPresentationTimestampMs(syncedDeck.updatedAt);
    const baseDeck = syncedUpdatedAt > localUpdatedAt ? syncedDeck : localDeck;
    const mergedOverrides = mergeTextOverrideFieldsPreservingNewest(localDeck, syncedDeck);

    decks[dateValue] = normalizeDeck(
      {
        ...baseDeck,
        ...mergedOverrides,
      },
      dateValue,
      meetingType
    );
  });

  return decks;
}

export function mergeDashboardPresentationStatePreservingLocalEdits(localValue, syncedValue) {
  const localStore = normalizeStore(parsePresentationStoreValue(localValue));
  const syncedStore = normalizeStore(parsePresentationStoreValue(syncedValue));
  const decks = mergePresentationDeckBucket(localStore.decks, syncedStore.decks, "team");
  const technicalDecks = mergePresentationDeckBucket(
    localStore.meetingDecks?.technical,
    syncedStore.meetingDecks?.technical,
    "technical"
  );

  return JSON.stringify(
    normalizeStore({
      decks,
      meetingDecks: {
        technical: technicalDecks,
      },
    })
  );
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

function getMedicalPositionRank(player = {}) {
  const position = String(
    player.position || player.role || player.playerBoardRoleLabel || player.playerBoardPosition || ""
  )
    .trim()
    .toLowerCase();
  if (!position) return 99;
  if (/\b(gk|goalkeeper|keeper|målvakt|malvakt)\b/.test(position)) return 1;
  if (/\b(def|defender|back|centre back|center back|cb|lb|rb|lwb|rwb)\b/.test(position)) return 2;
  if (/\b(mid|midfielder|mittfält|mittfalt|cm|dm|am|cdm|cam|lm|rm)\b/.test(position)) return 3;
  if (/\b(fwd|forward|striker|attacker|winger|fw|st|cf|lw|rw)\b/.test(position)) return 4;
  return 99;
}

function getMedicalParticipationSortValue(item = {}) {
  const participation = item.participation;
  if (participation === null || participation === undefined || participation === "") return 101;
  const value = Number(participation);
  return Number.isFinite(value) ? value : 101;
}

function sortMedicalRecommendations(first, second) {
  const firstParticipation = getMedicalParticipationSortValue(first);
  const secondParticipation = getMedicalParticipationSortValue(second);
  if (firstParticipation !== secondParticipation) return firstParticipation - secondParticipation;
  const positionDelta = getMedicalPositionRank(first.player) - getMedicalPositionRank(second.player);
  if (positionDelta) return positionDelta;
  return String(first.player?.name || "").localeCompare(String(second.player?.name || ""));
}

function getLineupPlayerNumber(player = {}) {
  const number = [
    player.number,
    player.jerseyNumber,
    player.shirtNumber,
    player.shirt_number,
    player.squadNumber,
    player.rosterNumber,
    player.uniformNumber,
  ]
    .map((value) => String(value ?? "").trim().replace(/^#/, ""))
    .find(Boolean);
  return number || "";
}

function getLineupPlayerPhotoUrl(player = {}) {
  return String(player.photoUrl || player.avatarUrl || player.imageUrl || player.headshotUrl || player.profileImageUrl || "").trim();
}

function getLineupPlayerPosition(player = {}) {
  return String(player.position || player.role || player.primaryRole || player.playerBoardRoleLabel || player.playerBoardPosition || "").trim();
}

function sortLineupPlayerOptions(first, second) {
  const positionDelta = getMedicalPositionRank(first) - getMedicalPositionRank(second);
  if (positionDelta) return positionDelta;
  const firstNumber = Number(first.number);
  const secondNumber = Number(second.number);
  if (Number.isFinite(firstNumber) && Number.isFinite(secondNumber) && firstNumber !== secondNumber) {
    return firstNumber - secondNumber;
  }
  return String(first.name || "").localeCompare(String(second.name || ""));
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
    getSetPiecesState = () => ({ plays: [] }),
    getPlayerProfilesState = () => ({ players: [] }),
    formatDateLabel = defaultFormatDateLabel,
    isEditableTarget = () => false,
    escapeHtml = defaultEscapeHtml,
    onDeckChange = noop,
  } = dependencies;

  const state = {
    activeShapeTarget: null,
    activeTextTarget: null,
    bound: false,
    contextMenu: null,
    dateValue: "",
    drawShape: null,
    dragSlideIndex: null,
    dragShape: null,
    dragTextField: null,
    dragTextBox: null,
    editorOpen: false,
    isOpen: false,
    meetingType: "team",
    presenting: false,
    resizeShape: null,
    resizeTextField: null,
    resizeTextBox: null,
    setPiecePhaseBySlide: {},
    setPiecePlayback: {
      isPlaying: false,
      isPaused: false,
      loop: false,
      progress: 0,
      speed: 1,
    },
    shapeDrawTool: null,
    slideIndex: 0,
    redoStack: [],
    undoStack: [],
  };
  const localMediaAttachments = new Map();
  let root = null;
  let stageResizeObserver = null;
  let stageMetricsFrame = 0;
  let presentingTextFitFrame = 0;
  let fullscreenIntent = false;

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

  function getDeckFromStore(store = {}, dateValue = state.dateValue, meetingType = state.meetingType) {
    const safeMeetingType = normalizePresentationMeetingType(meetingType);
    if (safeMeetingType === "technical") {
      return normalizeDeck(store.meetingDecks?.technical?.[dateValue], dateValue, safeMeetingType);
    }
    return normalizeDeck(store.decks?.[dateValue], dateValue, safeMeetingType);
  }

  function writeDeckToStore(store = {}, dateValue = state.dateValue, deck = {}, meetingType = state.meetingType) {
    const safeMeetingType = normalizePresentationMeetingType(meetingType);
    if (safeMeetingType === "technical") {
      return {
        ...store,
        meetingDecks: {
          ...(store.meetingDecks || {}),
          technical: {
            ...(store.meetingDecks?.technical || {}),
            [dateValue]: deck,
          },
        },
      };
    }
    return {
      ...store,
      decks: {
        ...store.decks,
        [dateValue]: deck,
      },
    };
  }

  function getDeckForDate(dateValue = state.dateValue, meetingType = state.meetingType) {
    return getDeckFromStore(readStore(), dateValue, meetingType);
  }

  function getNextMatchContext(dateValue = state.dateValue) {
    const startDate = normalizeDateValue(dateValue, getTodayValue());
    if (!startDate) {
      return null;
    }
    for (let dayOffset = 0; dayOffset <= 14; dayOffset += 1) {
      const candidateDate = addDaysToDateValue(startDate, dayOffset);
      if (!candidateDate) {
        continue;
      }
      const rawEvents = getScheduleEventsForDate(candidateDate);
      const events = Array.isArray(rawEvents) ? rawEvents : [];
      const matchEvent = events.find(isMatchScheduleEvent);
      if (!matchEvent) {
        continue;
      }
      const matchDateValue = normalizeDateValue(matchEvent.date || matchEvent.dateValue || matchEvent.startDate, candidateDate);
      return {
        dateLabel: formatDateLabel(matchDateValue),
        dateValue: matchDateValue,
        event: matchEvent,
        eventTitle: getScheduleEventTitle(matchEvent),
        opponentLabel: getMatchOpponentLabel(matchEvent),
      };
    }
    return null;
  }

  function getHistoryDeckSnapshot(deck = {}, dateValue = "", meetingType = state.meetingType) {
    const { updatedAt, ...snapshot } = normalizeDeck(deck, dateValue, meetingType);
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

  function decksMatch(firstDeck = {}, secondDeck = {}, dateValue = "", meetingType = state.meetingType) {
    return (
      JSON.stringify(getHistoryDeckSnapshot(firstDeck, dateValue, meetingType)) ===
      JSON.stringify(getHistoryDeckSnapshot(secondDeck, dateValue, meetingType))
    );
  }

  function pushUndoSnapshot(dateValue = "", deck = {}, meetingType = state.meetingType) {
    if (!dateValue) {
      return;
    }
    const snapshotMeetingType = normalizePresentationMeetingType(meetingType);
    const snapshot = {
      dateValue,
      deck: getHistoryDeckSnapshot(deck, dateValue, snapshotMeetingType),
      meetingType: snapshotMeetingType,
      state: getHistoryStateSnapshot(),
    };
    const previousSnapshot = state.undoStack.at(-1);
    if (
      previousSnapshot?.dateValue === snapshot.dateValue &&
      previousSnapshot?.meetingType === snapshot.meetingType &&
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
    const meetingType = normalizePresentationMeetingType(snapshot.meetingType || state.meetingType);
    if (!dateValue) {
      return false;
    }
    const store = readStore();
    const nextDeck = normalizeDeck(snapshot.deck, dateValue, meetingType);
    writeStore(
      writeDeckToStore(
        store,
        dateValue,
        {
          ...nextDeck,
          updatedAt: new Date().toISOString(),
        },
        meetingType
      )
    );
    state.dateValue = dateValue;
    state.meetingType = meetingType;
    state.activeShapeTarget = clonePlain(snapshot.state?.activeShapeTarget);
    state.activeTextTarget = clonePlain(snapshot.state?.activeTextTarget);
    state.drawShape = null;
    state.dragSlideIndex = null;
    state.dragShape = null;
    state.dragTextField = null;
    state.dragTextBox = null;
    state.resizeShape = null;
    state.resizeTextField = null;
    state.resizeTextBox = null;
    state.shapeDrawTool = null;
    state.contextMenu = null;
    documentRef.body?.classList?.remove("is-presentation-shape-drawing");
    documentRef.body?.classList?.remove("is-presentation-text-field-dragging");
    documentRef.body?.classList?.remove("is-presentation-text-field-resizing");
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
      deck: getHistoryDeckSnapshot(getDeckForDate(), state.dateValue, state.meetingType),
      meetingType: state.meetingType,
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
      deck: getHistoryDeckSnapshot(getDeckForDate(), state.dateValue, state.meetingType),
      meetingType: state.meetingType,
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
    const meetingType = normalizePresentationMeetingType(options.meetingType || state.meetingType);
    const currentDeck = getDeckFromStore(store, dateValue, meetingType);
    const nextDeck = normalizeDeck(updater(currentDeck), dateValue, meetingType);
    if (decksMatch(currentDeck, nextDeck, dateValue, meetingType)) {
      return;
    }
    if (options.recordHistory !== false) {
      pushUndoSnapshot(dateValue, currentDeck, meetingType);
    }
    writeStore(
      writeDeckToStore(
        store,
        dateValue,
        {
          ...nextDeck,
          updatedAt: new Date().toISOString(),
        },
        meetingType
      )
    );
  }

  function clampTextBoxPosition(x, y, width = 30, height = 12) {
    const safeWidth = Math.min(70, Math.max(14, Number(width) || 30));
    const safeHeight = clampTextBoxHeight(height);
    return {
      x: Number(Math.min(96 - safeWidth, Math.max(2, Number(x) || 2)).toFixed(2)),
      y: Number(Math.min(96 - safeHeight, Math.max(2, Number(y) || 2)).toFixed(2)),
    };
  }

  function clampTextBoxWidth(width = 30) {
    return Number(Math.min(70, Math.max(14, Number(width) || 30)).toFixed(2));
  }

  function clampTextBoxHeight(height = 12) {
    return Number(Math.min(84, Math.max(5, Number(height) || 12)).toFixed(2));
  }

  function clampTextFieldWidth(width = 24) {
    return Number(Math.min(92, Math.max(4, Number(width) || 24)).toFixed(2));
  }

  function clampTextFieldHeight(height = 8) {
    return Number(Math.min(88, Math.max(2, Number(height) || 8)).toFixed(2));
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

  function getTextFieldElement(slideId = "", field = "") {
    if (!root || typeof root.querySelectorAll !== "function") {
      return null;
    }
    return [...root.querySelectorAll("[data-presentation-slide-id][data-presentation-text-field]")].find(
      (element) =>
        element.dataset.presentationSlideId === slideId &&
        element.dataset.presentationTextField === field
    );
  }

  function createTextFieldControlElement(className = "", attributes = {}) {
    const element = documentRef.createElement?.("span");
    if (!element) {
      return null;
    }
    element.className = className;
    element.setAttribute("contenteditable", "false");
    element.setAttribute("aria-hidden", "true");
    Object.entries(attributes).forEach(([name, value]) => {
      element.setAttribute(name, value);
    });
    return element;
  }

  function ensureTextFieldControls(textElement = null) {
    if (
      state.presenting ||
      !textElement ||
      !textElement.dataset.presentationTextObject
    ) {
      return;
    }
    const field = String(textElement.dataset.presentationTextField || "").trim();
    const slideId = String(textElement.dataset.presentationSlideId || "").trim();
    if (!field || !slideId) {
      return;
    }
    const existingEdges = textElement.querySelectorAll?.("[data-presentation-drag-text-field]") || [];
    const existingResizeHandles = textElement.querySelectorAll?.("[data-presentation-resize-text-field]") || [];
    if (existingEdges.length === 4 && existingResizeHandles.length === 8) {
      return;
    }
    [...existingEdges, ...existingResizeHandles].forEach((handle) => handle.remove?.());
    ["top", "right", "bottom", "left"].forEach((edge) => {
      const handle = createTextFieldControlElement(`presentation-text-field-edge-handle is-${edge}`, {
        "data-presentation-drag-text-field": field,
        "data-presentation-slide-id": slideId,
      });
      if (handle) {
        textElement.appendChild(handle);
      }
    });
    ["nw", "n", "ne", "e", "se", "s", "sw", "w"].forEach((axis) => {
      const handle = createTextFieldControlElement(`presentation-object-resize-handle presentation-text-field-resize-handle is-${axis}`, {
        "data-presentation-resize-text-field": field,
        "data-presentation-resize-axis": axis,
        "data-presentation-slide-id": slideId,
      });
      if (handle) {
        textElement.appendChild(handle);
      }
    });
  }

  function applyTextFieldLayoutStyle(element, bounds = {}) {
    if (!element) {
      return;
    }
    const offsetX = normalizeTextFieldOffset(bounds.offsetX);
    const offsetY = normalizeTextFieldOffset(bounds.offsetY);
    element.style.transform = `translate3d(calc(var(--presentation-slide-width, 1px) * ${offsetX / 100}), calc(var(--presentation-slide-height, 1px) * ${offsetY / 100}), 0)`;
    if (bounds.width) {
      element.style.display = "inline-flex";
      element.style.alignItems = "center";
      element.style.width = `calc(var(--presentation-slide-width, 1px) * ${clampTextFieldWidth(bounds.width) / 100})`;
      element.style.maxWidth = "calc(var(--presentation-slide-width, 1px) * .94)";
    }
    if (bounds.height) {
      element.style.minHeight = `calc(var(--presentation-slide-height, 1px) * ${clampTextFieldHeight(bounds.height) / 100})`;
    }
    if (bounds.fontSize) {
      element.style.fontSize = `${Number((Number(normalizeFontSize(bounds.fontSize)) / 16).toFixed(3))}rem`;
    }
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

  function getLineupPlayerOptions(dateValue) {
    const seenPlayerIds = new Set();
    return getAvailabilityItems(dateValue)
      .map((item) => normalizePlayerItem(item))
      .filter(Boolean)
      .filter((item) => !item.planningOnly)
      .map((item) => {
        const player = item.player || {};
        return {
          id: String(player.id || "").trim(),
          name: String(player.name || "Player").trim(),
          number: getLineupPlayerNumber(player),
          position: getLineupPlayerPosition(player),
          photoUrl: getLineupPlayerPhotoUrl(player),
        };
      })
      .filter((player) => {
        if (!player.id || !player.name || seenPlayerIds.has(player.id)) {
          return false;
        }
        seenPlayerIds.add(player.id);
        return true;
      })
      .sort(sortLineupPlayerOptions);
  }

  function getLineupFormationModel(formationId = "") {
    return lineupFormationOptions.find((option) => option.id === normalizeLineupFormation(formationId)) || lineupFormationOptions[0];
  }

  function getDeckMatchSquadPlayerIds(deck = {}) {
    const ids = (Array.isArray(deck.infoSlides) ? deck.infoSlides : [])
      .filter((slide) => slide.layout === "match-squad")
      .flatMap((slide) => normalizeMatchSquadPlayerIds(slide.matchSquadPlayerIds));
    return [...new Set(ids)];
  }

  function buildMatchSquadModel(infoSlide = {}, playerOptions = [], matchContext = null) {
    const selectedIds = normalizeMatchSquadPlayerIds(infoSlide.matchSquadPlayerIds);
    const playerById = new Map(playerOptions.map((player) => [player.id, player]));
    return {
      matchContext,
      playerOptions,
      selectedIds,
      selectedPlayers: selectedIds
        .map((playerId) => playerById.get(playerId))
        .filter(Boolean)
        .sort(sortLineupPlayerOptions),
    };
  }

  function buildLineupModel(infoSlide = {}, playerOptions = [], deck = {}, matchContext = null) {
    const formation = getLineupFormationModel(infoSlide.formation);
    const assignments = normalizeLineupAssignments(infoSlide.lineup);
    const playerById = new Map(playerOptions.map((player) => [player.id, player]));
    const matchSquadIds = getDeckMatchSquadPlayerIds(deck);
    const matchSquadIdSet = new Set(matchSquadIds);
    const assignedIds = new Set(Object.values(assignments).filter(Boolean));
    const filteredPlayerOptions = matchSquadIds.length
      ? playerOptions.filter((player) => matchSquadIdSet.has(player.id) || assignedIds.has(player.id))
      : playerOptions;
    return {
      formationId: formation.id,
      formationLabel: formation.label,
      formationOptions: lineupFormationOptions.map((option) => ({ id: option.id, label: option.label })),
      matchContext,
      playerOptions: filteredPlayerOptions,
      sourceLabel: matchSquadIds.length ? "Match Squad" : "Full squad",
      slots: formation.slots.map((slot) => {
        const playerId = assignments[slot.id] || "";
        return {
          ...slot,
          playerId,
          player: playerById.get(playerId) || null,
        };
      }),
    };
  }

  function buildSetPieceModel(infoSlide = {}, slideId = "") {
    const setPiecesState = getSetPiecesState();
    const playerProfilesState = getPlayerProfilesState();
    const catalog = getSetPiecePresentationCatalog(setPiecesState, playerProfilesState);
    const requestedPlayId = String(infoSlide.setPiecePlayId || "").trim();
    const requestedVariantId = String(infoSlide.setPieceVariantId || "").trim();
    const selectedPlay = requestedPlayId
      ? catalog.find((play) => play.id === requestedPlayId) || null
      : catalog[0] || null;
    const selectedVariant = requestedVariantId
      ? selectedPlay?.variants.find((variant) => variant.id === requestedVariantId) || null
      : selectedPlay?.variants[0] || null;
    const phaseId = state.setPiecePhaseBySlide[slideId] || "";
    const resolved = selectedPlay && selectedVariant
      ? resolveSetPiecePresentationVariant(setPiecesState, playerProfilesState, {
          playId: selectedPlay.id,
          variantId: selectedVariant.id,
          phaseId,
        })
      : null;
    return {
      available: Boolean(resolved),
      catalog,
      playId: selectedPlay?.id || "",
      variantId: selectedVariant?.id || "",
      playback: { ...state.setPiecePlayback },
      ...(resolved || {}),
    };
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

  function hydrateTextBoxesForRender(textBoxes = []) {
    return (Array.isArray(textBoxes) ? textBoxes : []).map((box) => {
      if (!localMediaKinds.has(String(box.kind || "").trim())) {
        return box;
      }
      const attachment = localMediaAttachments.get(String(box.mediaId || "").trim());
      if (!attachment?.url) {
        return box;
      }
      return {
        ...box,
        mediaSrc: attachment.url,
        mediaName: box.mediaName || attachment.name,
        mediaMimeType: box.mediaMimeType || attachment.mimeType,
      };
    });
  }

  function hydrateInfoSlideForRender(infoSlide = {}) {
    if (!localMediaKinds.has(String(infoSlide.mediaKind || "").trim())) {
      return infoSlide;
    }
    const attachment = localMediaAttachments.get(String(infoSlide.mediaId || "").trim());
    if (!attachment?.url) {
      return infoSlide;
    }
    return {
      ...infoSlide,
      mediaSrc: attachment.url,
      mediaName: infoSlide.mediaName || attachment.name,
      mediaMimeType: infoSlide.mediaMimeType || attachment.mimeType,
    };
  }

  function applySlideStyle(deck, slide, fallbackStyle = {}) {
    const style = normalizePresentationSlideStyle(deck.slideStyles?.[slide.id], fallbackStyle);
    return {
      ...slide,
      accentColor: style.accentColor,
      style,
      shapes: deck.shapes?.[slide.id] || [],
      textBoxes: hydrateTextBoxesForRender(deck.textBoxes?.[slide.id] || []),
      textFieldStyles: deck.textFieldStyles?.[slide.id] || {},
      textOverrides: deck.textOverrides?.[slide.id] || {},
      infoSlide: slide.infoSlide ? hydrateInfoSlideForRender(slide.infoSlide) : slide.infoSlide,
    };
  }

  function buildSlides(deck, session, dateValue, matchContext = null) {
    const blocks = Array.isArray(session?.blocks) ? session.blocks : [];
    const lineupPlayerOptions = getLineupPlayerOptions(dateValue);
    const naturalSlides = [
      applySlideStyle(deck, { id: "cover", type: "cover", label: "Cover" }, { accentColor: "#22c55e" }),
      ...deck.infoSlides.map((infoSlide, index) => {
        const isLineupSlide = infoSlide.layout === "starting-xi";
        const isMatchSquadSlide = infoSlide.layout === "match-squad";
        const isSetPieceSlide = infoSlide.layout === "set-piece";
        const slideType = isLineupSlide ? "lineup" : isMatchSquadSlide ? "match-squad" : isSetPieceSlide ? "set-piece" : "info";
        const fallbackLabel = isLineupSlide ? "Starting XI" : isMatchSquadSlide ? "Match Squad" : isSetPieceSlide ? "Set Piece" : "Info";
        const baseSlide = applySlideStyle(
          deck,
          {
            id: infoSlide.id,
            type: slideType,
            label: getSlideLabel(infoSlide.title, index ? `Slide ${index + 1}` : fallbackLabel),
            infoSlide,
          },
          { accentColor: infoSlide.accentColor, textColor: infoSlide.textColor }
        );
        if (isLineupSlide) {
          return {
            ...baseSlide,
            lineup: buildLineupModel(infoSlide, lineupPlayerOptions, deck, matchContext),
          };
        }
        if (isMatchSquadSlide) {
          return {
            ...baseSlide,
            matchSquad: buildMatchSquadModel(infoSlide, lineupPlayerOptions, matchContext),
          };
        }
        if (isSetPieceSlide) {
          return {
            ...baseSlide,
            setPiece: buildSetPieceModel(infoSlide, baseSlide.id),
          };
        }
        return baseSlide;
      }),
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
    ];
    const slideById = new Map(naturalSlides.map((slide) => [slide.id, slide]));
    const orderedSlides = normalizeSlideOrder(deck.slideOrder)
      .map((slideId) => slideById.get(slideId))
      .filter(Boolean);
    const orderedIds = new Set(orderedSlides.map((slide) => slide.id));
    naturalSlides.forEach((slide) => {
      if (!orderedIds.has(slide.id)) {
        orderedSlides.push(slide);
      }
    });
    return orderedSlides.map((slide, index) => ({ ...slide, index }));
  }

  function buildModel() {
    const dateValue = normalizeDateValue(state.dateValue, getTodayValue());
    const meetingConfig = getPresentationMeetingConfig(state.meetingType);
    const session = getSessionForDate(dateValue) || { blocks: [] };
    const deck = getDeckForDate(dateValue);
    const events = getScheduleEventsForDate(dateValue);
    const event = getScheduleMainEvent(events) || null;
    const periodization = getPeriodizationDay(dateValue) || {};
    const blocks = Array.isArray(session.blocks) ? session.blocks : [];
    const matchContext = getNextMatchContext(dateValue);
    const slides = buildSlides(deck, session, dateValue, matchContext);
    state.slideIndex = Math.min(Math.max(0, state.slideIndex), Math.max(0, slides.length - 1));
    const trainingTitle = String(session.title || getScheduledSessionTitle(dateValue) || event?.title || "Training Session").trim();
    const title = meetingConfig.coverTitle || trainingTitle;
    const passTypeLabel =
      meetingConfig.id === "technical"
        ? meetingConfig.passTypeLabel
        : event?.title || periodization.sessionType || "Training briefing";
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
      contextMenu: state.contextMenu ? { ...state.contextMenu } : null,
      infoSlideCount: deck.infoSlides.length,
      loadLabel: periodization.physicalLoad || event?.type || "Not set",
      medicalRecommendations: getMedicalRecommendationsForDate(dateValue),
      matchContext,
      meetingLabel: meetingConfig.label,
      meetingType: meetingConfig.id,
      passTypeLabel,
      passes: getResolvedPasses(dateValue),
      periodization,
      pitchLabel: periodization.pitchSize || getSessionPitchLabel(blocks),
      presenting: state.presenting,
      sessionTheme: session.theme || periodization.mainFocus || "",
      sessionTitle: title,
      trainingTitle,
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
    const naturalScale = Math.min(slideWidth / 1280, slideHeight / 720);
    const readabilityScale = state.presenting ? Math.min(1.18, Math.max(1, naturalScale)) : 1;
    const displaySize =
      slideWidth >= 1600 && slideHeight >= 900
        ? "large"
        : slideWidth <= 980 || slideHeight <= 552
          ? "compact"
          : "standard";
    const halfPitchAspect = 68 / 52.5;
    const lineupPitchHeightRatio =
      state.presenting && displaySize === "large" ? 0.86 : state.presenting && displaySize === "compact" ? 0.74 : 0.78;
    let lineupPitchHeight = slideHeight * lineupPitchHeightRatio;
    const activeSlide = stage.querySelector(".presentation-slide");
    const activeLineupLayout = activeSlide?.querySelector(".presentation-lineup-layout");
    if (state.presenting && activeSlide && activeLineupLayout) {
      const slideBody = activeSlide.querySelector(".presentation-slide-body");
      const heading = activeLineupLayout.querySelector(".presentation-lineup-heading");
      const slideBodyStyle = win?.getComputedStyle?.(slideBody || activeSlide);
      const lineupLayoutStyle = win?.getComputedStyle?.(activeLineupLayout);
      const readPx = (value) => {
        const parsed = Number.parseFloat(value || "");
        return Number.isFinite(parsed) ? parsed : 0;
      };
      const verticalPadding =
        readPx(slideBodyStyle?.paddingTop) +
        readPx(slideBodyStyle?.paddingBottom) +
        readPx(activeLineupLayout ? lineupLayoutStyle?.paddingTop : "") +
        readPx(activeLineupLayout ? lineupLayoutStyle?.paddingBottom : "");
      const rowGap = readPx(lineupLayoutStyle?.rowGap || lineupLayoutStyle?.gap);
      const headingHeight = heading?.getBoundingClientRect?.().height || 0;
      const availablePitchHeight = slideHeight - verticalPadding - rowGap - headingHeight;
      if (availablePitchHeight > 0) {
        lineupPitchHeight = Math.min(lineupPitchHeight, availablePitchHeight);
      }
    }
    const lineupPitchWidth = Math.min(slideWidth * 0.88, lineupPitchHeight * halfPitchAspect);
    const rootFontSize = Number.parseFloat(win?.getComputedStyle?.(documentRef.documentElement)?.fontSize) || 16;
    const setReadableSize = (name, value, minRem, maxRem) => {
      const min = minRem * rootFontSize;
      const max = maxRem * rootFontSize;
      const safeValue = Math.min(max, Math.max(min, Number(value) || min));
      stage.style.setProperty(name, `${Number(safeValue.toFixed(2))}px`);
    };
    stage.style.setProperty("--presentation-stage-width", `${Number(stageWidth.toFixed(2))}px`);
    stage.style.setProperty("--presentation-stage-height", `${Number(stageHeight.toFixed(2))}px`);
    stage.style.setProperty("--presentation-slide-width", `${Number(slideWidth.toFixed(2))}px`);
    stage.style.setProperty("--presentation-slide-height", `${Number(slideHeight.toFixed(2))}px`);
    stage.style.setProperty("--presentation-readability-scale", Number(readabilityScale.toFixed(3)));
    stage.style.setProperty("--presentation-lineup-pitch-width", `${Number(lineupPitchWidth.toFixed(2))}px`);
    setReadableSize("--presentation-readable-label-font", slideWidth * 0.0096 * readabilityScale, 0.74, 1.08);
    setReadableSize("--presentation-readable-metric-font", slideWidth * 0.0155 * readabilityScale, 1.02, 1.82);
    setReadableSize("--presentation-readable-matchday-font", slideWidth * 0.0135 * readabilityScale, 1, 1.62);
    setReadableSize("--presentation-readable-day-font", slideWidth * 0.0152 * readabilityScale, 1, 1.82);
    setReadableSize("--presentation-readable-support-font", slideWidth * 0.0102 * readabilityScale, 0.74, 1.18);
    setReadableSize("--presentation-readable-block-row-font", slideWidth * 0.0138 * readabilityScale, 0.98, 1.64);
    setReadableSize("--presentation-readable-block-title-font", slideWidth * 0.0372 * readabilityScale, 2.1, 4.5);
    setReadableSize("--presentation-readable-block-meta-font", slideWidth * 0.0142 * readabilityScale, 0.94, 1.7);
    setReadableSize("--presentation-readable-detail-font", slideWidth * 0.0124 * readabilityScale, 0.96, 1.52);
    setReadableSize("--presentation-readable-medical-avatar", slideHeight * 0.048 * readabilityScale, 1.95, 3.7);
    setReadableSize("--presentation-readable-medical-initials-font", slideHeight * 0.0136 * readabilityScale, 0.62, 0.96);
    setReadableSize("--presentation-readable-medical-name-font", slideHeight * 0.0154 * readabilityScale, 0.76, 1.16);
    setReadableSize("--presentation-readable-medical-badge-font", slideHeight * 0.0116 * readabilityScale, 0.58, 0.88);
    setReadableSize("--presentation-readable-muted-title-font", slideWidth * 0.0128 * readabilityScale, 0.88, 1.34);
    setReadableSize("--presentation-readable-muted-name-font", slideWidth * 0.0105 * readabilityScale, 0.76, 1.12);
    setReadableSize("--presentation-readable-muted-meta-font", slideWidth * 0.0088 * readabilityScale, 0.62, 0.94);
    setReadableSize("--presentation-readable-footer-font", slideWidth * 0.0108 * readabilityScale, 0.9, 1.22);
    setReadableSize("--presentation-readable-lineup-card-width", slideWidth * 0.092 * readabilityScale, 6.35, 10.85);
    setReadableSize("--presentation-readable-lineup-card-height", slideHeight * 0.149 * readabilityScale, 5.95, 10.15);
    setReadableSize("--presentation-readable-lineup-avatar", slideHeight * 0.073 * readabilityScale, 2.9, 5.7);
    setReadableSize("--presentation-readable-lineup-name-font", slideWidth * 0.0118 * readabilityScale, 0.86, 1.36);
    stage.dataset.presentationDisplaySize = displaySize;
    schedulePresentingTextFit();
  }

  function scheduleStageMetrics() {
    if (stageMetricsFrame || !state.isOpen) {
      return;
    }
    const requestFrame = win?.requestAnimationFrame?.bind(win) || ((callback) => win?.setTimeout?.(callback, 0));
    stageMetricsFrame = requestFrame(updateStageMetrics);
  }

  function getTextFitMinimum(element) {
    if (element.matches?.(".presentation-info-title")) return 34;
    if (element.matches?.(".presentation-info-body")) return 26;
    if (element.matches?.(".presentation-cover-copy p")) return 24;
    if (element.matches?.(".presentation-block-copy .presentation-section-heading h2")) return 30;
    if (element.matches?.(".presentation-block-copy .presentation-section-heading p")) return 18;
    if (element.matches?.(".presentation-detail-text")) return 17;
    if (element.matches?.(".presentation-overview-video-notes")) return 11;
    if (element.matches?.(".presentation-day-overview strong")) return 18;
    if (element.matches?.(".presentation-day-subphase")) return 14;
    if (element.matches?.(".presentation-overview-metric strong")) return 17;
    if (element.matches?.(".presentation-block-flow strong")) return 16;
    return 14;
  }

  function elementOverflows(element) {
    const isHeadline = element.matches?.(
      ".presentation-info-title, .presentation-block-copy .presentation-section-heading h2"
    );
    const verticalTolerance = isHeadline ? 12 : 5;
    return (
      element.scrollHeight > element.clientHeight + verticalTolerance ||
      element.scrollWidth > element.clientWidth + 3
    );
  }

  function fitPresentingTextElement(element) {
    if (!element?.isConnected) {
      return;
    }
    element.style.removeProperty("font-size");
    element.style.removeProperty("--presentation-editable-fit-size");
    const computed = win?.getComputedStyle?.(element);
    const startingSize = Number.parseFloat(computed?.fontSize || "");
    if (!Number.isFinite(startingSize) || startingSize <= 0) {
      return;
    }
    const minimumSize = Math.min(startingSize, getTextFitMinimum(element));
    let nextSize = startingSize;
    for (let index = 0; index < 12 && nextSize > minimumSize && elementOverflows(element); index += 1) {
      nextSize = Math.max(minimumSize, nextSize * 0.92);
      element.style.fontSize = `${Number(nextSize.toFixed(2))}px`;
    }
  }

  function fitPresentingText() {
    presentingTextFitFrame = 0;
    if (!state.isOpen || !state.presenting || !root || root.hidden) {
      return;
    }
    const selectors = [
      ".presentation-cover-copy p",
      ".presentation-info-title",
      ".presentation-info-body",
      ".presentation-overview-metric strong",
      ".presentation-overview-video-notes",
      ".presentation-day-overview strong",
      ".presentation-day-subphase",
      ".presentation-block-flow strong",
      ".presentation-block-copy .presentation-section-heading h2",
      ".presentation-block-copy .presentation-section-heading p",
      ".presentation-detail-text",
    ].join(", ");
    root.querySelectorAll(selectors).forEach(fitPresentingTextElement);
  }

  function schedulePresentingTextFit() {
    if (presentingTextFitFrame || !state.isOpen || !state.presenting) {
      return;
    }
    const requestFrame = win?.requestAnimationFrame?.bind(win) || ((callback) => win?.setTimeout?.(callback, 0));
    presentingTextFitFrame = requestFrame(fitPresentingText);
  }

  function disconnectStageMetrics() {
    stageResizeObserver?.disconnect?.();
    stageResizeObserver = null;
    if (stageMetricsFrame && win?.cancelAnimationFrame) {
      win.cancelAnimationFrame(stageMetricsFrame);
    }
    stageMetricsFrame = 0;
    if (presentingTextFitFrame && win?.cancelAnimationFrame) {
      win.cancelAnimationFrame(presentingTextFitFrame);
    }
    presentingTextFitFrame = 0;
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
    schedulePresentingTextFit();
  }

  let activeSetPieceRouteIds = new Set();

  function getActiveSetPieceContext() {
    const slide = buildModel().slides[state.slideIndex];
    const setPiece = slide?.type === "set-piece" ? slide.setPiece : null;
    const phase = setPiece?.phases?.find((item) => item.id === setPiece.activePhaseId) || setPiece?.phases?.[0] || null;
    if (!slide || !setPiece?.available || !phase) return null;
    return {
      play: setPiece.play,
      variant: setPiece.variant,
      phase,
      slideId: slide.id,
    };
  }

  const setPiecePlayback = createSetPiecesPlaybackController({
    win,
    getContext: () => getActiveSetPieceContext() || {},
    onFrame(positions, progress) {
      state.setPiecePlayback.progress = Number(progress || 0);
      activeSetPieceRouteIds = renderSetPiecePlaybackFrame(root, activeSetPieceRouteIds, positions);
      updateSetPiecePlaybackView(root, state.setPiecePlayback, getActiveSetPieceContext() || {});
    },
    onPhaseChange(phaseId) {
      const context = getActiveSetPieceContext();
      if (!context) return;
      state.setPiecePhaseBySlide[context.slideId] = phaseId;
      state.setPiecePlayback.progress = 0;
      activeSetPieceRouteIds.clear();
      render();
    },
    onResetFrame() {
      activeSetPieceRouteIds.clear();
      if (state.isOpen) render();
    },
    onStatus(status) {
      Object.assign(state.setPiecePlayback, {
        isPlaying: status.isPlaying,
        isPaused: status.isPaused,
        loop: status.loop,
        speed: status.speed,
      });
      if (!status.isPlaying && !status.isPaused) state.setPiecePlayback.progress = 0;
      updateSetPiecePlaybackView(root, state.setPiecePlayback, getActiveSetPieceContext() || {});
    },
  });

  function selectSetPiecePhase(phaseId = "") {
    const context = getActiveSetPieceContext();
    if (!context?.variant?.phases?.some((phase) => phase.id === phaseId)) return;
    setPiecePlayback.stop({ resetFrame: false });
    state.setPiecePhaseBySlide[context.slideId] = phaseId;
    state.setPiecePlayback.progress = 0;
    render();
  }

  function selectAdjacentSetPiecePhase(direction = 0) {
    const context = getActiveSetPieceContext();
    if (!context) return;
    const index = context.variant.phases.findIndex((phase) => phase.id === context.phase.id);
    const target = context.variant.phases[Math.min(context.variant.phases.length - 1, Math.max(0, index + direction))];
    if (target) selectSetPiecePhase(target.id);
  }

  function handleSetPiecePlaybackAction(action = "") {
    const context = getActiveSetPieceContext();
    if (!context) return false;
    if (action === "toggle") setPiecePlayback.toggle();
    else if (action === "stop") setPiecePlayback.stop();
    else if (action === "restart") selectSetPiecePhase(context.variant.phases[0]?.id);
    else if (action === "previous") selectAdjacentSetPiecePhase(-1);
    else if (action === "next") selectAdjacentSetPiecePhase(1);
    else if (action === "loop") setPiecePlayback.setLoop(!state.setPiecePlayback.loop);
    else return false;
    return true;
  }

  function open(dateValue = "", meetingType = "team") {
    setPiecePlayback.stop({ resetFrame: false });
    fullscreenIntent = false;
    state.activeShapeTarget = null;
    state.activeTextTarget = null;
    state.drawShape = null;
    state.dragSlideIndex = null;
    state.dragShape = null;
    state.dragTextField = null;
    state.dragTextBox = null;
    state.resizeShape = null;
    state.resizeTextField = null;
    state.resizeTextBox = null;
    state.shapeDrawTool = null;
    state.contextMenu = null;
    state.dateValue = normalizeDateValue(dateValue, getTodayValue());
    state.meetingType = normalizePresentationMeetingType(meetingType);
    state.slideIndex = 0;
    state.editorOpen = false;
    state.isOpen = true;
    resetUndoHistory();
    render();
    ensureRoot().querySelector("[data-presentation-stage]")?.focus?.();
  }

  function close() {
    setPiecePlayback.stop({ resetFrame: false });
    fullscreenIntent = false;
    state.activeShapeTarget = null;
    state.activeTextTarget = null;
    state.drawShape = null;
    state.dragSlideIndex = null;
    state.dragShape = null;
    state.dragTextField = null;
    state.dragTextBox = null;
    state.resizeShape = null;
    state.resizeTextField = null;
    state.resizeTextBox = null;
    state.shapeDrawTool = null;
    state.contextMenu = null;
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
    documentRef.body?.classList?.remove("is-presentation-text-field-dragging");
    documentRef.body?.classList?.remove("is-presentation-text-field-resizing");
    documentRef.body?.classList?.remove("is-presentation-text-box-dragging");
    documentRef.body?.classList?.remove("is-presentation-text-box-resizing");
    documentRef.body?.classList?.remove("is-presentation-shape-dragging");
    documentRef.body?.classList?.remove("is-presentation-shape-resizing");
  }

  function goToSlide(index) {
    setPiecePlayback.stop({ resetFrame: false });
    const slideCount = buildModel().slides.length;
    state.slideIndex = Math.min(Math.max(0, Number(index) || 0), Math.max(0, slideCount - 1));
    state.editorOpen = false;
    state.activeShapeTarget = null;
    state.activeTextTarget = null;
    state.drawShape = null;
    state.dragSlideIndex = null;
    state.dragShape = null;
    state.dragTextField = null;
    state.dragTextBox = null;
    state.resizeShape = null;
    state.resizeTextField = null;
    state.resizeTextBox = null;
    state.shapeDrawTool = null;
    state.contextMenu = null;
    documentRef.body?.classList?.remove("is-presentation-shape-drawing");
    documentRef.body?.classList?.remove("is-presentation-text-field-dragging");
    documentRef.body?.classList?.remove("is-presentation-text-field-resizing");
    documentRef.body?.classList?.remove("is-presentation-text-box-dragging");
    documentRef.body?.classList?.remove("is-presentation-text-box-resizing");
    documentRef.body?.classList?.remove("is-presentation-shape-dragging");
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

  function updateMatchSquadPlayer(slideId = "", playerId = "", selected = false) {
    const safeSlideId = String(slideId || "").trim();
    const safePlayerId = String(playerId || "").trim();
    if (!safeSlideId || !safePlayerId) {
      return;
    }
    writeDeckForDate(state.dateValue, (deck) => ({
      ...deck,
      infoSlides: deck.infoSlides.map((slide) => {
        if (slide.id !== safeSlideId || slide.layout !== "match-squad") {
          return slide;
        }
        const currentIds = normalizeMatchSquadPlayerIds(slide.matchSquadPlayerIds);
        const nextIds = selected
          ? [...currentIds.filter((id) => id !== safePlayerId), safePlayerId]
          : currentIds.filter((id) => id !== safePlayerId);
        return normalizeInfoSlide(
          {
            ...slide,
            matchSquadPlayerIds: nextIds,
          },
          0,
          state.dateValue
        );
      }),
    }));
    render();
  }

  function updateLineupFormation(slideId = "", formation = "") {
    const safeSlideId = String(slideId || "").trim();
    if (!safeSlideId) {
      return;
    }
    writeDeckForDate(state.dateValue, (deck) => ({
      ...deck,
      infoSlides: deck.infoSlides.map((slide) =>
        slide.id === safeSlideId && slide.layout === "starting-xi"
          ? normalizeInfoSlide(
              {
                ...slide,
                formation: normalizeLineupFormation(formation),
              },
              0,
              state.dateValue
            )
          : slide
      ),
    }));
    render();
  }

  function updateLineupSlotPlayer(slideId = "", slotId = "", playerId = "") {
    const safeSlideId = String(slideId || "").trim();
    const safeSlotId = String(slotId || "").trim();
    if (!safeSlideId || !safeSlotId) {
      return;
    }
    writeDeckForDate(state.dateValue, (deck) => ({
      ...deck,
      infoSlides: deck.infoSlides.map((slide) => {
        if (slide.id !== safeSlideId || slide.layout !== "starting-xi") {
          return slide;
        }
        const nextLineup = normalizeLineupAssignments({
          ...slide.lineup,
          [safeSlotId]: String(playerId || "").trim(),
        });
        if (!String(playerId || "").trim()) {
          delete nextLineup[safeSlotId];
        }
        return normalizeInfoSlide(
          {
            ...slide,
            lineup: nextLineup,
          },
          0,
          state.dateValue
        );
      }),
    }));
    render();
  }

  function updateSetPieceSource(slideId = "", selection = {}) {
    const safeSlideId = String(slideId || "").trim();
    if (!safeSlideId) return;
    const catalog = getSetPiecePresentationCatalog(getSetPiecesState(), getPlayerProfilesState());
    const currentSlide = getDeckForDate().infoSlides.find((slide) => slide.id === safeSlideId && slide.layout === "set-piece");
    if (!currentSlide) return;
    const playId = String(selection.playId || currentSlide.setPiecePlayId || "").trim();
    const play = catalog.find((item) => item.id === playId) || catalog[0] || null;
    const requestedVariantId = selection.playId ? "" : String(selection.variantId || currentSlide.setPieceVariantId || "").trim();
    const variant = play?.variants.find((item) => item.id === requestedVariantId) || play?.variants[0] || null;
    setPiecePlayback.stop({ resetFrame: false });
    delete state.setPiecePhaseBySlide[safeSlideId];
    writeDeckForDate(state.dateValue, (deck) => ({
      ...deck,
      infoSlides: deck.infoSlides.map((slide) => (
        slide.id === safeSlideId && slide.layout === "set-piece"
          ? normalizeInfoSlide({
              ...slide,
              title: play && variant ? `${play.title} · ${variant.title}` : "Set Piece",
              setPiecePlayId: play?.id || "",
              setPieceVariantId: variant?.id || "",
            }, 0, state.dateValue, state.meetingType)
          : slide
      )),
    }));
    render();
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
    const nextValue = String(value ?? "").slice(0, maxTextOverrideLength);
    writeDeckForDate(state.dateValue, (deck) => {
      const currentFields = deck.textOverrides?.[safeSlideId] || {};
      if (Object.prototype.hasOwnProperty.call(currentFields, safeField) && String(currentFields[safeField] ?? "") === nextValue) {
        return deck;
      }
      const updatedAt = new Date().toISOString();
      return {
        ...deck,
        textOverrides: normalizeTextOverrides({
          ...deck.textOverrides,
          [safeSlideId]: {
            ...currentFields,
            [safeField]: nextValue,
          },
        }),
        textOverrideUpdatedAt: markTextOverrideUpdatedAt(deck, safeSlideId, safeField, updatedAt),
      };
    });
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

  function updateTextFieldLayout(slideId = "", field = "", layout = {}) {
    const safeSlideId = String(slideId || "").trim();
    const safeField = String(field || "").trim();
    if (!safeSlideId || !safeField) {
      return;
    }
    writeDeckForDate(state.dateValue, (deck) => ({
      ...deck,
      textFieldStyles: normalizeTextFieldStyles({
        ...deck.textFieldStyles,
        [safeSlideId]: {
          ...(deck.textFieldStyles?.[safeSlideId] || {}),
          [safeField]: {
            ...(deck.textFieldStyles?.[safeSlideId]?.[safeField] || {}),
            ...layout,
          },
        },
      }),
    }));
    state.activeShapeTarget = null;
    state.activeTextTarget = { field: safeField, infoId: state.activeTextTarget?.infoId || "", slideId: safeSlideId, textBoxId: "" };
    render();
    focusActiveTextElement();
  }

  function getActiveTextElement() {
    const target = state.activeTextTarget;
    if (!root || typeof root.querySelectorAll !== "function" || !target?.slideId || !target.field) {
      return null;
    }
    return getTextFieldElement(target.slideId, target.field);
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
    ensureTextFieldControls(textElement);
    syncTextToolbar();
  }

  function hideTextToolbar() {
    state.activeShapeTarget = null;
    state.activeTextTarget = null;
    state.contextMenu = null;
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
    const kind = textBoxKinds.has(String(options.kind || "").trim()) ? String(options.kind).trim() : "text";
    const isSymbol = kind === "symbol";
    const isMedia = kind === "image" || kind === "video";
    const fallbackText = isSymbol ? "•" : kind === "image" ? "Image Placeholder" : kind === "video" ? "Video Placeholder" : "Text box";
    const text = String(options.text ?? fallbackText).slice(0, maxTextOverrideLength) || fallbackText;
    const fontSize = normalizeFontSize(options.fontSize || (isSymbol ? "88" : isMedia ? "32" : "36"));
    const textColor = normalizeHexColor(options.textColor, "#f8fafc");
    const width = clampTextBoxWidth(options.width || (isSymbol ? 14 : isMedia ? 34 : 30));
    const height = clampTextBoxHeight(options.height || (isSymbol ? 14 : isMedia ? 22 : 12));
    const position = clampTextBoxPosition(options.x ?? (isSymbol ? 46 : isMedia ? 34 : 56), options.y ?? (isSymbol ? 28 : isMedia ? 34 : 36), width, height);
    const id = `${kind === "text" ? "textbox" : kind}-${Date.now()}`;
    const field = getTextBoxField(id);
    const updatedAt = new Date().toISOString();
    const mediaFields =
      isMedia
        ? Object.fromEntries(
            Object.entries({
              mediaId: String(options.mediaId || "").trim(),
              mediaLocal: Boolean(options.mediaLocal),
              mediaMimeType: String(options.mediaMimeType || "").trim(),
              mediaName: String(options.mediaName || "").trim(),
              mediaSize: Math.max(0, Number(options.mediaSize) || 0),
            }).filter(([, value]) => value !== "" && value !== 0 && value !== false)
          )
        : {};
    writeDeckForDate(state.dateValue, (deck) => ({
      ...deck,
      textBoxes: normalizeTextBoxes({
        ...deck.textBoxes,
        [currentSlide.id]: [
          ...(deck.textBoxes?.[currentSlide.id] || []),
          {
            id,
            kind,
            text,
            x: position.x,
            y: position.y,
            width,
            height,
            fontSize,
            textColor,
            ...mediaFields,
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
      textOverrideUpdatedAt: markTextOverrideUpdatedAt(deck, currentSlide.id, field, updatedAt),
    }));
    state.activeShapeTarget = null;
    state.activeTextTarget = { field, infoId: "", slideId: currentSlide.id, textBoxId: id };
    render();
    focusActiveTextElement();
  }

  function getLocalMediaFileLabel(file = null, safeKind = "image") {
    return String(file?.name || (safeKind === "video" ? "Local video" : "Local image")).trim();
  }

  function cacheLocalMediaAttachment(mediaId = "", file = null, safeKind = "image") {
    const id = String(mediaId || "").trim();
    const urlApi = win?.URL || globalThis.URL;
    if (!id || !file || typeof urlApi?.createObjectURL !== "function") {
      return "";
    }
    const previous = localMediaAttachments.get(id);
    if (previous?.url && typeof urlApi.revokeObjectURL === "function") {
      try {
        urlApi.revokeObjectURL(previous.url);
      } catch {
        // Best-effort cleanup only; local object URLs are browser-owned.
      }
    }
    const url = urlApi.createObjectURL(file);
    localMediaAttachments.set(id, {
      kind: safeKind,
      mimeType: String(file.type || "").trim(),
      name: getLocalMediaFileLabel(file, safeKind),
      size: Math.max(0, Number(file.size) || 0),
      url,
    });
    return url;
  }

  function addLocalMediaTextBox(kind = "image", file = null) {
    const safeKind = kind === "video" ? "video" : "image";
    if (!file) {
      return;
    }
    const mediaName = getLocalMediaFileLabel(file, safeKind);
    const mediaId = `${safeKind}-media-${Date.now()}`;
    cacheLocalMediaAttachment(mediaId, file, safeKind);
    addTextBox({
      kind: safeKind,
      text: mediaName,
      width: safeKind === "video" ? 46 : 40,
      height: safeKind === "video" ? 30 : 30,
      fontSize: "24",
      textColor: "#f8fafc",
      x: safeKind === "video" ? 28 : 30,
      y: 30,
      mediaId,
      mediaLocal: true,
      mediaMimeType: String(file.type || "").trim(),
      mediaName,
      mediaSize: Math.max(0, Number(file.size) || 0),
    });
  }

  function attachLocalMediaToInfoSlide(slideId = "", kind = "image", file = null) {
    const safeSlideId = String(slideId || "").trim();
    const safeKind = kind === "video" ? "video" : "image";
    if (!safeSlideId || !file) {
      return;
    }
    const mediaName = getLocalMediaFileLabel(file, safeKind);
    const mediaId = `${safeKind}-slide-media-${Date.now()}`;
    cacheLocalMediaAttachment(mediaId, file, safeKind);
    writeDeckForDate(state.dateValue, (deck) => ({
      ...deck,
      infoSlides: deck.infoSlides.map((slide) =>
        slide.id === safeSlideId
          ? normalizeInfoSlide(
              {
                ...slide,
                layout: slide.layout === "video" || slide.layout === "split" || slide.layout === "media" ? slide.layout : safeKind === "video" ? "video" : "media",
                mediaKind: safeKind,
                mediaId,
                mediaLocal: true,
                mediaMimeType: String(file.type || "").trim(),
                mediaName,
                mediaSize: Math.max(0, Number(file.size) || 0),
              },
              0,
              state.dateValue
            )
          : slide
      ),
    }));
    render();
  }

  function openLocalMediaPicker(kind = "image", options = {}) {
    const safeKind = kind === "video" ? "video" : "image";
    if (state.presenting || !documentRef?.createElement) {
      return;
    }
    const input = documentRef.createElement("input");
    input.type = "file";
    input.accept = safeKind === "video" ? "video/*" : "image/*";
    input.style.position = "fixed";
    input.style.left = "-9999px";
    input.style.top = "-9999px";
    input.setAttribute("aria-hidden", "true");
    input.addEventListener(
      "change",
      () => {
        const file = input.files?.[0] || null;
        input.remove?.();
        if (!file) {
          return;
        }
        if (options?.infoSlideId) {
          attachLocalMediaToInfoSlide(options.infoSlideId, safeKind, file);
          return;
        }
        addLocalMediaTextBox(safeKind, file);
      },
      { once: true }
    );
    documentRef.body?.appendChild?.(input);
    input.click?.();
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
      textOverrideUpdatedAt: normalizeTextOverrideUpdatedAt({
        ...deck.textOverrideUpdatedAt,
        [safeSlideId]: Object.fromEntries(
          Object.entries(deck.textOverrideUpdatedAt?.[safeSlideId] || {}).filter(([textField]) => textField !== field)
        ),
      }),
    }));
    state.activeTextTarget = null;
    render();
  }

  function duplicateTextBox(slideId = "", boxId = "") {
    const safeSlideId = String(slideId || "").trim();
    const safeBoxId = String(boxId || "").trim();
    const deck = getDeckForDate();
    const sourceBox = deck.textBoxes?.[safeSlideId]?.find((box) => box.id === safeBoxId);
    if (!safeSlideId || !safeBoxId || !sourceBox) {
      return;
    }
    const sourceKind = textBoxKinds.has(String(sourceBox.kind || "").trim()) ? String(sourceBox.kind).trim() : "text";
    const nextId = `${sourceKind === "text" ? "textbox" : sourceKind}-${Date.now()}`;
    const sourceField = getTextBoxField(safeBoxId);
    const nextField = getTextBoxField(nextId);
    const position = clampTextBoxPosition(Number(sourceBox.x) + 3, Number(sourceBox.y) + 3, sourceBox.width, sourceBox.height);
    writeDeckForDate(state.dateValue, (currentDeck) => ({
      ...currentDeck,
      textBoxes: normalizeTextBoxes({
        ...currentDeck.textBoxes,
        [safeSlideId]: [
          ...(currentDeck.textBoxes?.[safeSlideId] || []),
          {
            ...sourceBox,
            id: nextId,
            x: position.x,
            y: position.y,
          },
        ],
      }),
      textFieldStyles: normalizeTextFieldStyles({
        ...currentDeck.textFieldStyles,
        [safeSlideId]: {
          ...(currentDeck.textFieldStyles?.[safeSlideId] || {}),
          [nextField]: {
            ...(currentDeck.textFieldStyles?.[safeSlideId]?.[sourceField] || {}),
            fontSize: sourceBox.fontSize || currentDeck.textFieldStyles?.[safeSlideId]?.[sourceField]?.fontSize || "36",
            textColor: sourceBox.textColor || currentDeck.textFieldStyles?.[safeSlideId]?.[sourceField]?.textColor || "#f8fafc",
          },
        },
      }),
      textOverrides: normalizeTextOverrides({
        ...currentDeck.textOverrides,
        [safeSlideId]: {
          ...(currentDeck.textOverrides?.[safeSlideId] || {}),
          [nextField]: currentDeck.textOverrides?.[safeSlideId]?.[sourceField] ?? sourceBox.text ?? "Text box",
        },
      }),
      textOverrideUpdatedAt: markTextOverrideUpdatedAt(currentDeck, safeSlideId, nextField, new Date().toISOString()),
    }));
    state.activeShapeTarget = null;
    state.activeTextTarget = { field: nextField, infoId: "", slideId: safeSlideId, textBoxId: nextId };
    state.contextMenu = null;
    render();
    focusActiveTextElement();
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
            ...clampTextBoxPosition(x, y, box.width, box.height),
          };
        }),
      }),
    }));
    state.activeShapeTarget = null;
    state.activeTextTarget = { field: getTextBoxField(safeBoxId), infoId: "", slideId: safeSlideId, textBoxId: safeBoxId };
    render();
  }

  function updateTextBoxSize(slideId = "", boxId = "", width = 30, height = 12, fontSize = "36") {
    const safeSlideId = String(slideId || "").trim();
    const safeBoxId = String(boxId || "").trim();
    const safeWidth = clampTextBoxWidth(width);
    const safeHeight = clampTextBoxHeight(height);
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
            ...clampTextBoxPosition(box.x, box.y, safeWidth, safeHeight),
            width: safeWidth,
            height: safeHeight,
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
          const safeHeight = clampTextBoxHeight(bounds.height ?? box.height);
          safeFontSize = normalizeFontSize(fontSize || bounds.fontSize || box.fontSize || "36");
          return {
            ...box,
            ...clampTextBoxPosition(bounds.x ?? box.x, bounds.y ?? box.y, safeWidth, safeHeight),
            width: safeWidth,
            height: safeHeight,
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

  function duplicateShape(slideId = "", shapeId = "") {
    const safeSlideId = String(slideId || "").trim();
    const safeShapeId = String(shapeId || "").trim();
    const deck = getDeckForDate();
    const sourceShape = deck.shapes?.[safeSlideId]?.find((shape) => shape.id === safeShapeId);
    if (!safeSlideId || !safeShapeId || !sourceShape) {
      return;
    }
    const nextId = `shape-${Date.now()}`;
    const position = clampShapePosition(Number(sourceShape.x) + 3, Number(sourceShape.y) + 3, sourceShape.width, sourceShape.height);
    writeDeckForDate(state.dateValue, (currentDeck) => ({
      ...currentDeck,
      shapes: normalizeShapes({
        ...currentDeck.shapes,
        [safeSlideId]: [
          ...(currentDeck.shapes?.[safeSlideId] || []),
          {
            ...sourceShape,
            id: nextId,
            x: position.x,
            y: position.y,
          },
        ],
      }),
    }));
    state.activeTextTarget = null;
    state.activeShapeTarget = { shapeId: nextId, slideId: safeSlideId };
    state.contextMenu = null;
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

  function clearPresentationPrintMode() {
    documentRef?.body?.classList?.remove("is-presentation-printing");
    root?.removeAttribute?.("data-presentation-print-slide-id");
  }

  function printActivePresentationSlide() {
    if (typeof win?.print !== "function") {
      return;
    }
    const activeSlide = buildModel().slides[state.slideIndex] || null;
    if (!activeSlide) {
      return;
    }
    root?.setAttribute?.("data-presentation-print-slide-id", activeSlide.id || "");
    documentRef?.body?.classList?.add("is-presentation-printing");
    const handleAfterPrint = () => {
      clearPresentationPrintMode();
      win?.removeEventListener?.("afterprint", handleAfterPrint);
    };
    win?.addEventListener?.("afterprint", handleAfterPrint);
    try {
      win.print();
    } finally {
      if (typeof win?.setTimeout === "function") {
        win.setTimeout(handleAfterPrint, 1000);
      } else {
        handleAfterPrint();
      }
    }
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

  function getNewSlideDefaultTitle(template = "bullets", templateDefaults = {}) {
    const matchContext = getNextMatchContext(state.dateValue);
    const opponentLabel = String(matchContext?.opponentLabel || "").trim();
    if (opponentLabel && template === "match-squad") {
      return `Roster vs ${opponentLabel}`;
    }
    if (opponentLabel && template === "starting-xi") {
      return `Starting XI vs ${opponentLabel}`;
    }
    return templateDefaults.title || "New Slide";
  }

  function addInfoSlide(sourceSlide = null, template = "bullets") {
    const templateDefaults = getSlideTemplateDefaults(template);
    if (templateDefaults.layout === "set-piece" && state.meetingType !== "team") {
      return;
    }
    const setPieceCatalog = templateDefaults.layout === "set-piece"
      ? getSetPiecePresentationCatalog(getSetPiecesState(), getPlayerProfilesState())
      : [];
    const defaultSetPiecePlay = setPieceCatalog[0] || null;
    const defaultSetPieceVariant = defaultSetPiecePlay?.variants?.[0] || null;
    const nextId = `info-${state.dateValue}-${Date.now()}`;
    const title = sourceSlide
      ? `${sourceSlide.title || "Information"} Copy`
      : templateDefaults.layout === "set-piece"
        ? templateDefaults.title
        : requestNewSlideTitle(getNewSlideDefaultTitle(templateDefaults.layout, templateDefaults));
    if (!title) {
      return;
    }
    const currentSlideIds = buildModel().slides.map((slide) => slide.id).filter(Boolean);
    writeDeckForDate(state.dateValue, (deck) => {
      const nextSlide = normalizeInfoSlide(
        sourceSlide
          ? {
              ...sourceSlide,
              id: nextId,
              title,
            }
          : {
              ...templateDefaults,
              id: nextId,
              title: defaultSetPiecePlay && defaultSetPieceVariant
                ? `${defaultSetPiecePlay.title} · ${defaultSetPieceVariant.title}`
                : title,
              setPiecePlayId: defaultSetPiecePlay?.id || "",
              setPieceVariantId: defaultSetPieceVariant?.id || "",
            },
        0,
        state.dateValue,
        state.meetingType
      );
      return {
        ...deck,
        infoSlides: [...deck.infoSlides, nextSlide],
        slideOrder: normalizeSlideOrder([...currentSlideIds.filter((slideId) => slideId !== nextSlide.id), nextSlide.id]),
      };
    });
    const model = buildModel();
    state.slideIndex = model.slides.findIndex((slide) => slide.id === nextId);
    const nextSlide = model.slides.find((slide) => slide.id === nextId);
    const activeField =
      nextSlide?.type === "lineup" ? "lineup.title" : nextSlide?.type === "match-squad" ? "matchSquad.title" : "info.title";
    state.activeTextTarget = nextId ? { field: activeField, infoId: nextId, slideId: nextId } : null;
    state.editorOpen = false;
    render();
    focusActiveTextElement();
  }

  function addSetPieceVariantToTeamMeeting(reference = {}) {
    const dateValue = normalizeDateValue(reference.dateValue, getTodayValue());
    const catalog = getSetPiecePresentationCatalog(getSetPiecesState(), getPlayerProfilesState());
    const play = catalog.find((item) => item.id === String(reference.playId || "").trim()) || null;
    const variant = play?.variants.find((item) => item.id === String(reference.variantId || "").trim()) || null;
    if (!dateValue || !play || !variant) return null;
    const currentDeck = getDeckFromStore(readStore(), dateValue, "team");
    const existing = currentDeck.infoSlides.find((slide) => (
      slide.layout === "set-piece" &&
      slide.setPiecePlayId === play.id &&
      slide.setPieceVariantId === variant.id
    ));
    const slideId = existing?.id || `info-${dateValue}-${Date.now()}`;
    if (!existing) {
      writeDeckForDate(dateValue, (deck) => ({
        ...deck,
        infoSlides: [...deck.infoSlides, normalizeInfoSlide({
          id: slideId,
          layout: "set-piece",
          title: `${play.title} · ${variant.title}`,
          body: "",
          fontSize: "56",
          accentColor: "#22c55e",
          textColor: "#f8fafc",
          setPiecePlayId: play.id,
          setPieceVariantId: variant.id,
        }, 0, dateValue, "team")],
        slideOrder: normalizeSlideOrder([...(deck.slideOrder || []), slideId]),
      }), { meetingType: "team", recordHistory: false });
    }
    open(dateValue, "team");
    const model = buildModel();
    state.slideIndex = Math.max(0, model.slides.findIndex((slide) => slide.id === slideId));
    render();
    return { dateValue, slideId };
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
      slideOrder: normalizeSlideOrder((currentDeck.slideOrder || []).filter((orderedSlideId) => orderedSlideId !== slideId)),
      shapes: Object.fromEntries(Object.entries(currentDeck.shapes || {}).filter(([shapeSlideId]) => shapeSlideId !== slideId)),
      slideStyles: Object.fromEntries(Object.entries(currentDeck.slideStyles || {}).filter(([styleSlideId]) => styleSlideId !== slideId)),
      textBoxes: Object.fromEntries(Object.entries(currentDeck.textBoxes || {}).filter(([boxSlideId]) => boxSlideId !== slideId)),
      textFieldStyles: Object.fromEntries(Object.entries(currentDeck.textFieldStyles || {}).filter(([styleSlideId]) => styleSlideId !== slideId)),
      textOverrides: Object.fromEntries(Object.entries(currentDeck.textOverrides || {}).filter(([textSlideId]) => textSlideId !== slideId)),
      textOverrideUpdatedAt: Object.fromEntries(
        Object.entries(currentDeck.textOverrideUpdatedAt || {}).filter(([textSlideId]) => textSlideId !== slideId)
      ),
    }));
    const nextModel = buildModel();
    const nextInfoIndexes = nextModel.slides.map((slide, index) => (slide.infoSlide?.id ? index : -1)).filter((index) => index >= 0);
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
    if (!currentSlide?.infoSlide?.id) {
      return;
    }
    deleteInfoSlide(currentSlide.infoSlide.id);
  }

  function reorderSlides(fromIndex, insertIndex) {
    if (state.presenting) {
      return false;
    }
    const model = buildModel();
    const slides = model.slides || [];
    const from = Number(fromIndex);
    const insertAt = Number(insertIndex);
    if (
      !Number.isInteger(from) ||
      !Number.isInteger(insertAt) ||
      from < 0 ||
      insertAt < 0 ||
      from >= slides.length ||
      insertAt > slides.length ||
      insertAt === from ||
      insertAt === from + 1
    ) {
      return false;
    }
    const reorderedSlides = [...slides];
    const [movedSlide] = reorderedSlides.splice(from, 1);
    const to = insertAt > from ? insertAt - 1 : insertAt;
    reorderedSlides.splice(to, 0, movedSlide);
    const activeSlideId = slides[state.slideIndex]?.id || movedSlide?.id;
    writeDeckForDate(state.dateValue, (deck) => ({
      ...deck,
      slideOrder: normalizeSlideOrder(reorderedSlides.map((slide) => slide.id)),
    }));
    const nextModel = buildModel();
    const nextActiveIndex = nextModel.slides.findIndex((slide) => slide.id === activeSlideId);
    state.slideIndex = nextActiveIndex >= 0 ? nextActiveIndex : Math.min(to, Math.max(0, nextModel.slides.length - 1));
    state.dragSlideIndex = null;
    render();
    return true;
  }

  function startFullscreen() {
    const currentRoot = ensureRoot();
    fullscreenIntent = true;
    currentRoot.requestFullscreen?.().catch?.(noop);
    state.activeShapeTarget = null;
    state.activeTextTarget = null;
    state.drawShape = null;
    state.dragSlideIndex = null;
    state.dragShape = null;
    state.dragTextField = null;
    state.dragTextBox = null;
    state.resizeShape = null;
    state.resizeTextField = null;
    state.resizeTextBox = null;
    state.shapeDrawTool = null;
    state.contextMenu = null;
    state.presenting = true;
    state.editorOpen = false;
    documentRef.body?.classList?.remove("is-presentation-shape-drawing");
    documentRef.body?.classList?.remove("is-presentation-text-field-dragging");
    documentRef.body?.classList?.remove("is-presentation-text-field-resizing");
    documentRef.body?.classList?.remove("is-presentation-text-box-dragging");
    documentRef.body?.classList?.remove("is-presentation-text-box-resizing");
    documentRef.body?.classList?.remove("is-presentation-shape-dragging");
    documentRef.body?.classList?.remove("is-presentation-shape-resizing");
    render();
  }

  function exitFullscreen() {
    fullscreenIntent = false;
    documentRef.exitFullscreen?.().catch?.(noop);
    state.presenting = false;
    render();
  }

  function beginTextFieldDrag(event, handle) {
    if (event.button && event.button !== 0) {
      return;
    }
    const textElement = handle?.closest?.("[data-presentation-text-field]");
    const slideId = String(handle?.dataset.presentationSlideId || textElement?.dataset.presentationSlideId || "").trim();
    const field = String(handle?.dataset.presentationDragTextField || textElement?.dataset.presentationTextField || "").trim();
    const slideElement = textElement?.closest?.(".presentation-slide");
    const slideRect = slideElement?.getBoundingClientRect?.();
    const style = getDeckForDate().textFieldStyles?.[slideId]?.[field] || {};
    if (!slideId || !field || !textElement || !slideRect?.width || !slideRect?.height || state.presenting) {
      return;
    }
    event.preventDefault?.();
    event.stopPropagation?.();
    const startOffsetX = normalizeTextFieldOffset(style.offsetX);
    const startOffsetY = normalizeTextFieldOffset(style.offsetY);
    state.dragTextField = {
      field,
      slideId,
      slideHeight: slideRect.height,
      slideWidth: slideRect.width,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startOffsetX,
      startOffsetY,
      nextOffsetX: startOffsetX,
      nextOffsetY: startOffsetY,
      textElement,
    };
    state.activeShapeTarget = null;
    state.activeTextTarget = { field, infoId: String(textElement.dataset.presentationInfoId || "").trim(), slideId, textBoxId: "" };
    textElement.setAttribute("data-presentation-active-text", "true");
    documentRef.body?.classList?.add("is-presentation-text-field-dragging");
    handle.setPointerCapture?.(event.pointerId);
    syncTextToolbar();
  }

  function createVirtualTextFieldHandle(textElement = null, axis = "", mode = "drag") {
    const field = String(textElement?.dataset.presentationTextField || "").trim();
    const slideId = String(textElement?.dataset.presentationSlideId || "").trim();
    return {
      closest: (selector) => (selector === "[data-presentation-text-field]" ? textElement : textElement?.closest?.(selector)),
      dataset: {
        presentationDragTextField: field,
        presentationResizeAxis: axis,
        presentationResizeTextField: field,
        presentationSlideId: slideId,
      },
      setPointerCapture: () => {},
      type: mode,
    };
  }

  function getTextFieldPointerHandle(event) {
    if (state.presenting || !state.activeTextTarget?.slideId || !state.activeTextTarget.field || state.activeTextTarget.textBoxId) {
      return null;
    }
    const textElement = getActiveTextElement();
    if (!textElement) {
      return null;
    }
    const rect = textElement.getBoundingClientRect?.();
    if (!rect?.width || !rect?.height) {
      return null;
    }
    const hitSize = 14;
    const x = event.clientX;
    const y = event.clientY;
    const inOuterBounds = x >= rect.left - hitSize && x <= rect.right + hitSize && y >= rect.top - hitSize && y <= rect.bottom + hitSize;
    if (!inOuterBounds) {
      return null;
    }
    const nearLeft = Math.abs(x - rect.left) <= hitSize;
    const nearRight = Math.abs(x - rect.right) <= hitSize;
    const nearTop = Math.abs(y - rect.top) <= hitSize;
    const nearBottom = Math.abs(y - rect.bottom) <= hitSize;
    const cornerAxis =
      nearLeft && nearTop
        ? "nw"
        : nearRight && nearTop
          ? "ne"
          : nearRight && nearBottom
            ? "se"
            : nearLeft && nearBottom
              ? "sw"
              : "";
    if (cornerAxis) {
      return createVirtualTextFieldHandle(textElement, cornerAxis, "resize");
    }
    if (nearLeft || nearRight || nearTop || nearBottom) {
      return createVirtualTextFieldHandle(textElement, "", "drag");
    }
    return null;
  }

  function updateTextFieldDrag(event) {
    const drag = state.dragTextField;
    if (!drag) {
      return;
    }
    event.preventDefault?.();
    const offsetX = normalizeTextFieldOffset(drag.startOffsetX + ((event.clientX - drag.startClientX) / drag.slideWidth) * 100);
    const offsetY = normalizeTextFieldOffset(drag.startOffsetY + ((event.clientY - drag.startClientY) / drag.slideHeight) * 100);
    drag.nextOffsetX = offsetX;
    drag.nextOffsetY = offsetY;
    applyTextFieldLayoutStyle(drag.textElement, {
      offsetX,
      offsetY,
    });
  }

  function finishTextFieldDrag(event) {
    const drag = state.dragTextField;
    if (!drag) {
      return;
    }
    event.preventDefault?.();
    documentRef.body?.classList?.remove("is-presentation-text-field-dragging");
    state.dragTextField = null;
    updateTextFieldLayout(drag.slideId, drag.field, {
      offsetX: drag.nextOffsetX,
      offsetY: drag.nextOffsetY,
    });
  }

  function beginTextFieldResize(event, handle) {
    if (event.button && event.button !== 0) {
      return;
    }
    const textElement = handle?.closest?.("[data-presentation-text-field]");
    const slideId = String(handle?.dataset.presentationSlideId || textElement?.dataset.presentationSlideId || "").trim();
    const field = String(handle?.dataset.presentationResizeTextField || textElement?.dataset.presentationTextField || "").trim();
    const axis = getResizeAxis(handle);
    const slideElement = textElement?.closest?.(".presentation-slide");
    const slideRect = slideElement?.getBoundingClientRect?.();
    const elementRect = textElement?.getBoundingClientRect?.();
    const style = getDeckForDate().textFieldStyles?.[slideId]?.[field] || {};
    if (!slideId || !field || !textElement || !slideRect?.width || !slideRect?.height || !elementRect?.width || state.presenting) {
      return;
    }
    event.preventDefault?.();
    event.stopPropagation?.();
    const startWidth = clampTextFieldWidth(style.width || (elementRect.width / slideRect.width) * 100);
    const startHeight = clampTextFieldHeight(style.height || (elementRect.height / slideRect.height) * 100);
    const startOffsetX = normalizeTextFieldOffset(style.offsetX);
    const startOffsetY = normalizeTextFieldOffset(style.offsetY);
    const startFontSize = Number(normalizeFontSize(style.fontSize || Number.parseFloat(getComputedStyle(textElement).fontSize) || "36"));
    state.resizeTextField = {
      axis,
      field,
      slideId,
      slideHeight: slideRect.height,
      slideWidth: slideRect.width,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startFontSize,
      startHeight,
      startOffsetX,
      startOffsetY,
      startWidth,
      nextLayout: {
        fontSize: startFontSize,
        height: startHeight,
        offsetX: startOffsetX,
        offsetY: startOffsetY,
        width: startWidth,
      },
      textElement,
    };
    state.activeShapeTarget = null;
    state.activeTextTarget = { field, infoId: String(textElement.dataset.presentationInfoId || "").trim(), slideId, textBoxId: "" };
    documentRef.body?.classList?.add("is-presentation-text-field-resizing");
    handle.setPointerCapture?.(event.pointerId);
    syncTextToolbar();
  }

  function getResizedTextFieldLayout(resize, event) {
    const axis = resize.axis || "se";
    const deltaWidth = ((event.clientX - resize.startClientX) / resize.slideWidth) * 100;
    const deltaHeight = ((event.clientY - resize.startClientY) / resize.slideHeight) * 100;
    const rawWidth = resize.startWidth + (axis.includes("e") ? deltaWidth : axis.includes("w") ? -deltaWidth : 0);
    const rawHeight = resize.startHeight + (axis.includes("s") ? deltaHeight : axis.includes("n") ? -deltaHeight : 0);
    const width = axis.includes("e") || axis.includes("w") ? clampTextFieldWidth(rawWidth || resize.startWidth) : resize.startWidth;
    const height = axis.includes("n") || axis.includes("s") ? clampTextFieldHeight(rawHeight || resize.startHeight) : resize.startHeight;
    const widthScale = width / Math.max(1, resize.startWidth);
    const heightScale = height / Math.max(1, resize.startHeight);
    const axisScales = [
      axis.includes("e") || axis.includes("w") ? widthScale : null,
      axis.includes("n") || axis.includes("s") ? heightScale : null,
    ].filter((scaleValue) => Number.isFinite(scaleValue));
    const scale = Math.max(0.35, Math.min(2.6, axisScales.length > 1 ? Math.min(...axisScales) : axisScales[0] || 1));
    const isExpanding =
      (axis.includes("e") && deltaWidth > 0) ||
      (axis.includes("w") && deltaWidth < 0) ||
      (axis.includes("s") && deltaHeight > 0) ||
      (axis.includes("n") && deltaHeight < 0);
    const fontScale = isExpanding ? Math.max(1, scale) : scale;
    const fontSize = Number(normalizeFontSize(Math.round(resize.startFontSize * fontScale)));
    const widthChange = width - resize.startWidth;
    const heightChange = height - resize.startHeight;
    return {
      fontSize,
      height,
      offsetX: normalizeTextFieldOffset(resize.startOffsetX + (axis.includes("w") ? -widthChange : 0)),
      offsetY: normalizeTextFieldOffset(resize.startOffsetY + (axis.includes("n") ? -heightChange : 0)),
      width,
    };
  }

  function updateTextFieldResize(event) {
    const resize = state.resizeTextField;
    if (!resize) {
      return;
    }
    event.preventDefault?.();
    const layout = getResizedTextFieldLayout(resize, event);
    resize.nextLayout = layout;
    applyTextFieldLayoutStyle(resize.textElement, layout);
  }

  function finishTextFieldResize(event) {
    const resize = state.resizeTextField;
    if (!resize) {
      return;
    }
    event.preventDefault?.();
    documentRef.body?.classList?.remove("is-presentation-text-field-resizing");
    state.resizeTextField = null;
    updateTextFieldLayout(resize.slideId, resize.field, resize.nextLayout);
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
    const position = clampTextBoxPosition(box.x, box.y, box.width, box.height);
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
      height: box.height,
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
      drag.width,
      drag.height
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
    const startHeight = clampTextBoxHeight(box.height);
    const startPosition = clampTextBoxPosition(box.x, box.y, startWidth, startHeight);
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
      startHeight,
      startWidth,
      startX: startPosition.x,
      startY: startPosition.y,
      axis,
      nextBounds: {
        x: startPosition.x,
        y: startPosition.y,
        width: startWidth,
        height: startHeight,
      },
      nextFontSize: startFontSize,
      nextHeight: startHeight,
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
    const rawWidth = resize.startWidth + (axis.includes("e") ? deltaWidth : axis.includes("w") ? -deltaWidth : 0);
    const rawHeight = resize.startHeight + (axis.includes("s") ? deltaHeight : axis.includes("n") ? -deltaHeight : 0);
    const maxWidth = axis.includes("w")
      ? Math.max(14, resize.startX + resize.startWidth - 2)
      : Math.max(14, 96 - resize.startX);
    const maxHeight = axis.includes("n")
      ? Math.max(5, resize.startY + resize.startHeight - 2)
      : Math.max(5, 96 - resize.startY);
    const nextWidth = axis.includes("e") || axis.includes("w")
      ? clampTextBoxWidth(Math.min(maxWidth, rawWidth || resize.startWidth))
      : resize.startWidth;
    const nextHeight = axis.includes("n") || axis.includes("s")
      ? clampTextBoxHeight(Math.min(maxHeight, rawHeight || resize.startHeight))
      : resize.startHeight;
    const widthScale = nextWidth / Math.max(1, resize.startWidth);
    const heightScale = nextHeight / Math.max(1, resize.startHeight);
    const axisScales = [
      axis.includes("e") || axis.includes("w") ? widthScale : null,
      axis.includes("n") || axis.includes("s") ? heightScale : null,
    ].filter((scaleValue) => Number.isFinite(scaleValue));
    const scale = Math.max(0.35, Math.min(2.8, axisScales.length > 1 ? Math.min(...axisScales) : axisScales[0] || 1));
    const nextFontSize = Number(normalizeFontSize(Math.round(resize.startFontSize * scale)));
    const widthChange = nextWidth - resize.startWidth;
    const heightChange = nextHeight - resize.startHeight;
    const nextX = axis.includes("w") ? resize.startX - widthChange : resize.startX;
    const nextY = axis.includes("n") ? resize.startY - heightChange : resize.startY;
    const position = clampTextBoxPosition(nextX, nextY, nextWidth, nextHeight);
    return {
      x: position.x,
      y: position.y,
      width: nextWidth,
      height: nextHeight,
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
    resize.nextHeight = bounds.height;
    resize.nextFontSize = bounds.fontSize;
    resize.shell.style.left = `${bounds.x}%`;
    resize.shell.style.top = `${bounds.y}%`;
    resize.shell.style.width = `${bounds.width}%`;
    resize.shell.style.height = `${bounds.height}%`;
    const textElement = resize.shell.querySelector(".presentation-free-text-box");
    if (textElement) {
      textElement.style.height = "100%";
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

  function closeContextMenu(options = {}) {
    if (!state.contextMenu) {
      return;
    }
    state.contextMenu = null;
    if (options.render) {
      render();
    }
  }

  function getContextTarget(event) {
    const shapeElement = event.target.closest?.("[data-presentation-shape]");
    if (shapeElement) {
      return {
        shapeId: String(shapeElement.dataset.presentationShapeId || "").trim(),
        slideId: String(shapeElement.dataset.presentationSlideId || "").trim(),
        targetType: "shape",
      };
    }
    const textBoxElement = event.target.closest?.("[data-presentation-text-box-shell]");
    if (textBoxElement) {
      return {
        slideId: String(textBoxElement.dataset.presentationSlideId || "").trim(),
        targetType: "textBox",
        textBoxId: String(textBoxElement.dataset.presentationTextBoxId || "").trim(),
      };
    }
    const slideElement = event.target.closest?.(".presentation-slide");
    if (slideElement) {
      return {
        slideId: String(slideElement.dataset.presentationSlideId || "").trim(),
        targetType: "slide",
      };
    }
    return null;
  }

  function openContextMenu(event) {
    if (
      !state.isOpen ||
      state.presenting ||
      !root?.contains(event.target) ||
      event.target.closest?.(".presentation-control-bar, .presentation-footer-nav, .presentation-tool-popover-panel, .presentation-new-slide-popover, .presentation-insert-popover, .presentation-theme-popover")
    ) {
      return;
    }
    const target = getContextTarget(event);
    if (!target?.slideId) {
      return;
    }
    event.preventDefault?.();
    event.stopPropagation?.();
    if (target.targetType === "shape" && target.shapeId) {
      state.activeTextTarget = null;
      state.activeShapeTarget = { shapeId: target.shapeId, slideId: target.slideId };
    } else if (target.targetType === "textBox" && target.textBoxId) {
      state.activeShapeTarget = null;
      state.activeTextTarget = { field: getTextBoxField(target.textBoxId), infoId: "", slideId: target.slideId, textBoxId: target.textBoxId };
    }
    const width = 280;
    const height = target.targetType === "slide" ? 410 : 500;
    const maxX = Math.max(8, Number(win?.innerWidth || 1024) - width - 8);
    const maxY = Math.max(8, Number(win?.innerHeight || 768) - height - 8);
    state.contextMenu = {
      ...target,
      x: Math.min(maxX, Math.max(8, Number(event.clientX) || 8)),
      y: Math.min(maxY, Math.max(8, Number(event.clientY) || 8)),
    };
    render();
  }

  function handleContextAction(action = "") {
    const safeAction = String(action || "").trim();
    const menu = state.contextMenu ? { ...state.contextMenu } : null;
    if (!safeAction || !menu) {
      return;
    }
    state.contextMenu = null;
    if (safeAction === "text") {
      addTextBox();
      return;
    }
    if (safeAction === "image" || safeAction === "video") {
      openLocalMediaPicker(safeAction);
      return;
    }
    if (safeAction.startsWith("shape:")) {
      selectShapeTool(safeAction.slice("shape:".length));
      return;
    }
    if (safeAction.startsWith("symbol:")) {
      addSymbolTextBox(safeAction.slice("symbol:".length));
      return;
    }
    if (safeAction === "delete-object") {
      if (menu.targetType === "shape" && menu.slideId && menu.shapeId) {
        deleteShape(menu.slideId, menu.shapeId);
        return;
      }
      if (menu.targetType === "textBox" && menu.slideId && menu.textBoxId) {
        deleteTextBox(menu.slideId, menu.textBoxId);
        return;
      }
    }
    if (safeAction === "duplicate-object") {
      if (menu.targetType === "shape" && menu.slideId && menu.shapeId) {
        duplicateShape(menu.slideId, menu.shapeId);
        return;
      }
      if (menu.targetType === "textBox" && menu.slideId && menu.textBoxId) {
        duplicateTextBox(menu.slideId, menu.textBoxId);
        return;
      }
    }
    render();
  }

  function handleClick(event) {
    if (!state.isOpen || !root?.contains(event.target)) {
      return;
    }
    const setPiecePhaseButton = event.target.closest("[data-presentation-set-piece-phase]");
    if (setPiecePhaseButton) {
      selectSetPiecePhase(setPiecePhaseButton.dataset.presentationSetPiecePhase);
      return;
    }
    const setPiecePlaybackButton = event.target.closest("[data-presentation-set-piece-action]");
    if (setPiecePlaybackButton && handleSetPiecePlaybackAction(setPiecePlaybackButton.dataset.presentationSetPieceAction)) {
      return;
    }
    const contextActionButton = event.target.closest("[data-presentation-context-action]");
    if (contextActionButton) {
      handleContextAction(contextActionButton.dataset.presentationContextAction);
      return;
    }
    const keepOpenMenu = event.target.closest(".presentation-new-slide-menu, .presentation-insert-menu, [data-presentation-theme-menu], [data-presentation-context-menu], [data-presentation-text-toolbar] .presentation-tool-popover");
    if (!keepOpenMenu) {
      state.contextMenu = null;
      root.querySelector("[data-presentation-context-menu]")?.remove();
      root.querySelectorAll(".presentation-new-slide-menu[open], .presentation-insert-menu[open], [data-presentation-theme-menu][open], [data-presentation-text-toolbar] .presentation-tool-popover[open]").forEach((menu) => {
        menu.removeAttribute("open");
      });
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
    if (event.target.closest("[data-presentation-print-match-squad]")) {
      printActivePresentationSlide();
      return;
    }
    const datePickerButton = event.target.closest("[data-presentation-date-picker]");
    if (datePickerButton) {
      const dateControl = datePickerButton.closest(".presentation-date-control");
      const dateInput = dateControl?.querySelector?.("[data-presentation-date-input]");
      if (dateInput) {
        dateInput.focus();
        try {
          if (typeof dateInput.showPicker === "function") {
            dateInput.showPicker();
          } else {
            dateInput.click();
          }
        } catch {
          dateInput.click();
        }
      }
      return;
    }
    if (event.target.closest("[data-presentation-exit-fullscreen]")) {
      exitFullscreen();
      return;
    }
    if (event.target.closest("[data-presentation-drag-text-box]")) {
      return;
    }
    if (event.target.closest("[data-presentation-drag-text-field]")) {
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
    const mediaButton = event.target.closest("[data-presentation-add-media]");
    if (mediaButton) {
      mediaButton.closest?.("details")?.removeAttribute?.("open");
      openLocalMediaPicker(mediaButton.dataset.presentationAddMedia);
      return;
    }
    const infoMediaButton = event.target.closest("[data-presentation-info-media-pick]");
    if (infoMediaButton) {
      openLocalMediaPicker(infoMediaButton.dataset.presentationInfoMediaPick, {
        infoSlideId: infoMediaButton.dataset.presentationInfoId,
      });
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
      event.target.closest?.("details")?.removeAttribute?.("open");
      addTextBox();
      return;
    }
    const addInfoButton = event.target.closest("[data-presentation-add-info]");
    if (addInfoButton) {
      addInfoButton.closest?.("details")?.removeAttribute?.("open");
      addInfoSlide(null, addInfoButton.dataset.presentationAddInfo || "bullets");
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
    if (
      event.target.closest?.(
        "[data-presentation-context-menu], .presentation-insert-popover, .presentation-new-slide-popover, .presentation-theme-popover"
      )
    ) {
      return;
    }
    const pointerTextFieldHandle = getTextFieldPointerHandle(event);
    if (pointerTextFieldHandle?.type === "resize") {
      beginTextFieldResize(event, pointerTextFieldHandle);
      return;
    }
    if (pointerTextFieldHandle?.type === "drag") {
      beginTextFieldDrag(event, pointerTextFieldHandle);
      return;
    }
    const resizeHandle = event.target.closest("[data-presentation-resize-text-box]");
    if (resizeHandle) {
      beginTextBoxResize(event, resizeHandle);
      return;
    }
    const textFieldResizeHandle = event.target.closest("[data-presentation-resize-text-field]");
    if (textFieldResizeHandle) {
      beginTextFieldResize(event, textFieldResizeHandle);
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
    const textFieldDragHandle = event.target.closest("[data-presentation-drag-text-field]");
    if (textFieldDragHandle) {
      beginTextFieldDrag(event, textFieldDragHandle);
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
    if (
      !event.target.closest(
        "[data-presentation-text-toolbar], [data-presentation-text-box-shell], [data-presentation-shape], [data-presentation-context-menu], .presentation-insert-popover, .presentation-new-slide-popover, .presentation-theme-popover"
      )
    ) {
      hideTextToolbar();
    }
  }

  function handleInput(event) {
    if (!state.isOpen || !root?.contains(event.target)) {
      return;
    }
    const setPieceScrubber = event.target.closest("[data-presentation-set-piece-scrubber]");
    if (setPieceScrubber) {
      setPiecePlayback.seek(setPieceScrubber.value);
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
      ensureTextFieldControls(textField);
    }
  }

  function handleChange(event) {
    if (!state.isOpen || !root?.contains(event.target)) {
      return;
    }
    const setPieceSpeed = event.target.closest("[data-presentation-set-piece-speed]");
    if (setPieceSpeed) {
      setPiecePlayback.setSpeed(setPieceSpeed.value);
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
    const matchSquadPlayer = event.target.closest("[data-presentation-match-squad-player]");
    if (matchSquadPlayer) {
      updateMatchSquadPlayer(
        matchSquadPlayer.dataset.presentationInfoId,
        matchSquadPlayer.value || matchSquadPlayer.dataset.presentationMatchSquadPlayer,
        Boolean(matchSquadPlayer.checked)
      );
      return;
    }
    const lineupFormation = event.target.closest("[data-presentation-lineup-formation]");
    if (lineupFormation) {
      updateLineupFormation(lineupFormation.dataset.presentationInfoId, lineupFormation.value);
      return;
    }
    const lineupPlayer = event.target.closest("[data-presentation-lineup-player]");
    if (lineupPlayer) {
      updateLineupSlotPlayer(
        lineupPlayer.dataset.presentationInfoId,
        lineupPlayer.dataset.presentationLineupSlot,
        lineupPlayer.value
      );
      return;
    }
    const setPiecePlay = event.target.closest("[data-presentation-set-piece-play]");
    if (setPiecePlay) {
      updateSetPieceSource(setPiecePlay.dataset.presentationInfoId, { playId: setPiecePlay.value });
      return;
    }
    const setPieceVariant = event.target.closest("[data-presentation-set-piece-variant]");
    if (setPieceVariant) {
      updateSetPieceSource(setPieceVariant.dataset.presentationInfoId, { variantId: setPieceVariant.value });
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
    state.dragSlideIndex = null;
    state.dragShape = null;
    state.dragTextField = null;
    state.dragTextBox = null;
    state.resizeShape = null;
    state.resizeTextField = null;
    state.resizeTextBox = null;
    state.shapeDrawTool = null;
    state.contextMenu = null;
    state.dateValue = nextDate;
    state.slideIndex = 0;
    state.editorOpen = false;
    resetUndoHistory();
    documentRef.body?.classList?.remove("is-presentation-shape-drawing");
    documentRef.body?.classList?.remove("is-presentation-text-field-dragging");
    documentRef.body?.classList?.remove("is-presentation-text-field-resizing");
    documentRef.body?.classList?.remove("is-presentation-text-box-dragging");
    documentRef.body?.classList?.remove("is-presentation-text-box-resizing");
    documentRef.body?.classList?.remove("is-presentation-shape-dragging");
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
    if (event.key === " " && getActiveSetPieceContext()) {
      event.preventDefault();
      setPiecePlayback.toggle();
      return;
    }
    if (event.key === "Escape") {
      if (state.contextMenu) {
        event.preventDefault();
        closeContextMenu({ render: true });
        return;
      }
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
        exitFullscreen();
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

  function getSlideDropTarget(event) {
    const directTab = event.target.closest?.("[data-presentation-slide-tab]");
    const nav = directTab?.closest?.(".presentation-slide-tabs") || event.target.closest?.(".presentation-slide-tabs");
    if (!nav) {
      return null;
    }
    const tabs = Array.from(nav.querySelectorAll("[data-presentation-slide-tab]"));
    let tab = directTab;
    let side = "before";
    if (tab) {
      const rect = tab.getBoundingClientRect();
      side = event.clientX < rect.left + rect.width / 2 ? "before" : "after";
    } else {
      tab =
        tabs.find((candidate) => {
          const rect = candidate.getBoundingClientRect();
          return event.clientX < rect.left + rect.width / 2;
        }) || tabs[tabs.length - 1];
      if (tab) {
        const rect = tab.getBoundingClientRect();
        const isAfterLastTab = tab === tabs[tabs.length - 1] && event.clientX >= rect.left + rect.width / 2;
        side = isAfterLastTab ? "after" : "before";
      }
    }
    if (!tab) {
      return null;
    }
    const index = Number(tab.dataset.presentationSlideIndex);
    if (!Number.isInteger(index)) {
      return null;
    }
    return {
      insertIndex: side === "after" ? index + 1 : index,
      side,
      tab,
    };
  }

  function clearSlideDropIndicators() {
    root
      ?.querySelectorAll?.("[data-presentation-slide-tab].is-drop-before, [data-presentation-slide-tab].is-drop-after")
      .forEach((tab) => {
        tab.classList.remove("is-drop-before", "is-drop-after");
      });
  }

  function clearSlideDragState() {
    state.dragSlideIndex = null;
    clearSlideDropIndicators();
    root?.querySelectorAll?.("[data-presentation-slide-tab].is-dragging").forEach((tab) => {
      tab.classList.remove("is-dragging");
    });
    root?.querySelector?.(".presentation-slide-tabs")?.classList.remove("is-reordering");
  }

  function updateSlideDropIndicator(event) {
    const target = getSlideDropTarget(event);
    clearSlideDropIndicators();
    if (!target || state.dragSlideIndex === null) {
      return null;
    }
    const isCurrentPosition =
      target.insertIndex === state.dragSlideIndex || target.insertIndex === state.dragSlideIndex + 1;
    if (!isCurrentPosition) {
      target.tab.classList.add(target.side === "after" ? "is-drop-after" : "is-drop-before");
    }
    return target;
  }

  function handleSlideDragStart(event) {
    if (!state.isOpen || state.presenting || !root?.contains(event.target)) {
      return;
    }
    const tab = event.target.closest("[data-presentation-slide-tab]");
    if (!tab) {
      return;
    }
    const index = Number(tab.dataset.presentationSlideIndex);
    if (!Number.isInteger(index)) {
      return;
    }
    state.dragSlideIndex = index;
    tab.classList.add("is-dragging");
    tab.closest(".presentation-slide-tabs")?.classList.add("is-reordering");
    event.dataTransfer?.setData?.("text/plain", String(index));
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
    }
  }

  function handleSlideDragOver(event) {
    if (state.dragSlideIndex === null || state.presenting || !root?.contains(event.target)) {
      return;
    }
    const target = getSlideDropTarget(event);
    if (!target) {
      return;
    }
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
    updateSlideDropIndicator(event);
  }

  function handleSlideDrop(event) {
    if (state.dragSlideIndex === null || state.presenting || !root?.contains(event.target)) {
      return;
    }
    const target = getSlideDropTarget(event);
    if (!target) {
      return;
    }
    event.preventDefault();
    const from = Number(event.dataTransfer?.getData?.("text/plain") || state.dragSlideIndex);
    const didReorder = reorderSlides(from, target.insertIndex);
    if (!didReorder) {
      clearSlideDragState();
    }
  }

  function handleSlideDragEnd(event) {
    if (!state.isOpen || !root?.contains(event.target)) {
      return;
    }
    clearSlideDragState();
  }

  function bindInteractions() {
    if (state.bound) {
      return;
    }
    state.bound = true;
    documentRef.addEventListener("pointerdown", handleTextActivation, true);
    documentRef.addEventListener("pointermove", updateTextFieldDrag, true);
    documentRef.addEventListener("pointermove", updateTextFieldResize, true);
    documentRef.addEventListener("pointermove", updateTextBoxDrag, true);
    documentRef.addEventListener("pointermove", updateTextBoxResize, true);
    documentRef.addEventListener("pointermove", updateShapeDraw, true);
    documentRef.addEventListener("pointermove", updateShapeDrag, true);
    documentRef.addEventListener("pointermove", updateShapeResize, true);
    documentRef.addEventListener("pointerup", finishTextFieldDrag, true);
    documentRef.addEventListener("pointerup", finishTextFieldResize, true);
    documentRef.addEventListener("pointerup", finishTextBoxDrag, true);
    documentRef.addEventListener("pointerup", finishTextBoxResize, true);
    documentRef.addEventListener("pointerup", finishShapeDraw, true);
    documentRef.addEventListener("pointerup", finishShapeDrag, true);
    documentRef.addEventListener("pointerup", finishShapeResize, true);
    documentRef.addEventListener("pointercancel", finishTextFieldDrag, true);
    documentRef.addEventListener("pointercancel", finishTextFieldResize, true);
    documentRef.addEventListener("pointercancel", finishTextBoxDrag, true);
    documentRef.addEventListener("pointercancel", finishTextBoxResize, true);
    documentRef.addEventListener("pointercancel", finishShapeDraw, true);
    documentRef.addEventListener("pointercancel", finishShapeDrag, true);
    documentRef.addEventListener("pointercancel", finishShapeResize, true);
    documentRef.addEventListener("click", handleClick);
    documentRef.addEventListener("contextmenu", openContextMenu);
    documentRef.addEventListener("focus", handleFocusin, true);
    documentRef.addEventListener("focusin", handleFocusin, true);
    documentRef.addEventListener("input", handleInput);
    documentRef.addEventListener("change", handleChange);
    documentRef.addEventListener("keydown", handleKeydown);
    documentRef.addEventListener("dragstart", handleSlideDragStart);
    documentRef.addEventListener("dragover", handleSlideDragOver);
    documentRef.addEventListener("drop", handleSlideDrop);
    documentRef.addEventListener("dragend", handleSlideDragEnd);
    documentRef.addEventListener("fullscreenchange", () => {
      if (!state.isOpen) {
        return;
      }
      const rootIsFullscreen = Boolean(documentRef.fullscreenElement && root?.contains(documentRef.fullscreenElement));
      if (rootIsFullscreen && !fullscreenIntent) {
        documentRef.exitFullscreen?.().catch?.(noop);
      }
      if (!rootIsFullscreen) {
        fullscreenIntent = false;
      }
      const isPresenting = Boolean(fullscreenIntent && rootIsFullscreen);
      if (state.presenting !== isPresenting) {
        state.presenting = isPresenting;
        render();
      }
      scheduleStageMetrics();
    });
    win?.addEventListener?.("resize", scheduleStageMetrics);
  }

  return {
    addSetPieceVariantToTeamMeeting,
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
