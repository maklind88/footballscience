import {
  periodizationPhaseLibrary,
} from "../periodization/periodization-state.mjs";
import {
  getReadablePresentationTextColor,
  normalizePresentationSlideStyle,
  presentationThemeOptions,
} from "./presentation-mode-themes.mjs";

function defaultEscapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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

function getTextColor(backgroundColor = "") {
  return getReadablePresentationTextColor(backgroundColor, "");
}

const infoFontSizeOptions = [16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 40, 44, 48, 52, 56, 60, 64, 72, 80, 88, 96, 104, 112, 120, 128];
const symbolOptions = [
  { value: "&#8226;", label: "bullet" },
  { value: "&#8594;", label: "arrow right" },
  { value: "&#8592;", label: "arrow left" },
  { value: "&#8593;", label: "arrow up" },
  { value: "&#8595;", label: "arrow down" },
  { value: "&#10003;", label: "check" },
  { value: "&#10005;", label: "cross" },
  { value: "+", label: "plus" },
  { value: "&#8722;", label: "minus" },
  { value: "&#9733;", label: "star" },
  { value: "&#9888;", label: "warning" },
  { value: "&#9679;", label: "circle" },
  { value: "&#9675;", label: "open circle" },
  { value: "&#9632;", label: "square" },
  { value: "&#9633;", label: "open square" },
  { value: "&#9650;", label: "triangle" },
  { value: "&#9670;", label: "diamond" },
  { value: "&#8212;", label: "line" },
  { value: "&#8596;", label: "two way arrow" },
  { value: "&#10084;", label: "heart" },
];
const shapeOptions = [
  { type: "rect", label: "Rectangle" },
  { type: "circle", label: "Circle" },
  { type: "triangle", label: "Triangle" },
  { type: "diamond", label: "Diamond" },
  { type: "line", label: "Line" },
  { type: "arrow", label: "Arrow" },
  { type: "star", label: "Star" },
];
const mediaInsertOptions = [
  { kind: "image", label: "Image", description: "Choose local image" },
  { kind: "video", label: "Video", description: "Choose local video" },
];
const slideTemplateOptions = [
  {
    value: "title",
    label: "Title",
    description: "Large headline",
    preview: ["wide"],
  },
  {
    value: "title-subtitle",
    label: "Title + Subtitle",
    description: "Headline and support line",
    preview: ["wide", "short"],
  },
  {
    value: "text",
    label: "Text",
    description: "Open writing area",
    preview: ["line", "line", "line"],
  },
  {
    value: "bullets",
    label: "Bullets",
    description: "Meeting points",
    preview: ["wide", "line", "line"],
  },
  {
    value: "media",
    label: "Image",
    description: "Local image with notes",
    preview: ["media", "short"],
  },
  {
    value: "split",
    label: "Text + Image",
    description: "Text and visual",
    preview: ["split", "line"],
  },
  {
    value: "video",
    label: "Video",
    description: "Local clip with controls",
    preview: ["screen", "line", "line"],
  },
  {
    value: "match-squad",
    label: "Match Squad",
    description: "Select squad players",
    preview: ["cards", "cards", "cards"],
  },
  {
    value: "starting-xi",
    label: "Starting XI",
    description: "Formation with 11 players",
    preview: ["pitch", "cards"],
  },
  {
    value: "blank",
    label: "Blank",
    description: "Free canvas",
    preview: [],
  },
];

function getSafeSize(value = "", fallback = "56") {
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
    return fallback;
  }
  return String(Math.min(128, Math.max(16, numericSize)));
}

function getInfoSizeStyle(value = "") {
  const size = Number(getSafeSize(value));
  const remValue = `${Number((size / 16).toFixed(3))}rem`;
  return `--presentation-info-body-size: ${remValue};`;
}

function getLoadMeterModel(value = "") {
  const label = String(value || "").trim() || "Not set";
  const key = label.toLowerCase();
  if (key.includes("match") || key.includes("high")) {
    return { label, level: 5, tone: "match", color: "#d92d3f", soft: "rgba(217, 45, 63, .18)", glow: "rgba(217, 45, 63, .34)", angle: 68 };
  }
  if (key.includes("hard") || key.includes("medium-high") || key.includes("medium high")) {
    return { label, level: 4, tone: "hard", color: "#f57c2b", soft: "rgba(245, 124, 43, .18)", glow: "rgba(245, 124, 43, .32)", angle: 34 };
  }
  if (key.includes("moderate") || key === "medium") {
    return { label, level: 3, tone: "moderate", color: "#d9a514", soft: "rgba(217, 165, 20, .18)", glow: "rgba(217, 165, 20, .3)", angle: 0 };
  }
  if (key.includes("low")) {
    return { label, level: 2, tone: "low", color: "#1f9d61", soft: "rgba(31, 157, 97, .18)", glow: "rgba(31, 157, 97, .32)", angle: -34 };
  }
  if (key.includes("recovery") || key.includes("light")) {
    return { label, level: 1, tone: "recovery", color: "#74c69d", soft: "rgba(116, 198, 157, .16)", glow: "rgba(116, 198, 157, .28)", angle: -68 };
  }
  if (key.includes("off") || key === "not set" || key === "none") {
    return { label, level: 0, tone: "neutral", color: "#94a3b8", soft: "rgba(148, 163, 184, .13)", glow: "rgba(148, 163, 184, .22)", angle: -76 };
  }
  return { label, level: 3, tone: "moderate", color: "#d9a514", soft: "rgba(217, 165, 20, .18)", glow: "rgba(217, 165, 20, .3)", angle: 0 };
}

function getPitchTone(value = "") {
  const key = String(value || "").trim().toLowerCase();
  if (!key || key === "not set" || key === "none") return "empty";
  if (key.includes("gym") || key.includes("recovery")) return "gym-recovery";
  if (key === "ssg" || key.includes("small")) return "ssg";
  if (key === "msg" || key.includes("9")) return "msg";
  if (key === "bsg" || key.includes("full")) return "bsg";
  if (key === "lsg" || key.includes("large")) return "lsg";
  if (key.includes("half")) return "half-pitch";
  if (key.includes("final")) return "final-third";
  return key.replace(/[^a-z0-9]+/g, "-");
}

function getParticipationTone(participation) {
  if (participation === null || participation === undefined || participation === "") return "unset";
  const value = Number(participation);
  if (!Number.isFinite(value)) return "unset";
  if (value <= 10) return "low";
  if (value <= 25) return "rehab";
  if (value <= 50) return "controlled";
  if (value < 100) return "modified";
  return "full";
}

function getParticipationLabel(participation) {
  if (participation === null || participation === undefined || participation === "") return "Not recommended";
  const value = Number(participation);
  if (!Number.isFinite(value)) return "Not recommended";
  return `${Math.round(value)}%`;
}

function getInitials(name = "") {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return (parts[0]?.[0] || "P") + (parts.length > 1 ? parts[parts.length - 1][0] : "");
}

function removeParticipationPercentText(value = "") {
  const text = String(value || "");
  if (text.includes("/")) {
    return text
      .split("/")
      .map((part) => part.trim())
      .filter((part) => !/^\d+(?:\.\d+)?%\+?$/.test(part))
      .join(" / ");
  }
  return text.replace(/\s*\(\s*\d+(?:\.\d+)?%\+?\s*\)/g, "").trim();
}

export function createPresentationModeRenderer(options = {}) {
  const escapeHtml = typeof options.escapeHtml === "function" ? options.escapeHtml : defaultEscapeHtml;
  const renderExerciseVisual =
    typeof options.renderExerciseVisual === "function" ? options.renderExerciseVisual : () => "";
  const resizeDirections = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

  function renderResizeHandles(kind = "text-box", id = "", slideId = "") {
    const dataAttribute = kind === "shape"
      ? "data-presentation-resize-shape"
      : kind === "text-field"
        ? "data-presentation-resize-text-field"
        : "data-presentation-resize-text-box";
    const className =
      kind === "shape"
        ? "presentation-object-resize-handle presentation-shape-resize-handle"
        : kind === "text-field"
          ? "presentation-object-resize-handle presentation-text-field-resize-handle"
        : "presentation-object-resize-handle presentation-text-box-resize-handle";
    return resizeDirections
      .map(
        (direction) =>
          `<span class="${className} is-${escapeHtml(direction)}" ${dataAttribute}="${escapeHtml(id)}" data-presentation-resize-axis="${escapeHtml(direction)}" data-presentation-slide-id="${escapeHtml(slideId)}" contenteditable="false" aria-hidden="true"></span>`
      )
      .join("");
  }

  function renderLogo(brand = {}, variant = "corner") {
    const logoUrl = String(brand.logoUrl || brand.fallbackLogoUrl || "").trim();
    const label = String(brand.teamName || "Football Science").trim();
    if (logoUrl) {
      return `
        <span class="presentation-logo presentation-logo-${escapeHtml(variant)}">
          <img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(`${label} logo`)}" />
        </span>
      `;
    }
    return `
      <span class="presentation-logo presentation-logo-${escapeHtml(variant)} is-initials" aria-label="${escapeHtml(`${label} logo`)}">
        <strong>${escapeHtml(String(label).slice(0, 3).toUpperCase())}</strong>
      </span>
    `;
  }

  function renderThemeControl(slide = {}) {
    const style = normalizePresentationSlideStyle(slide.style, { accentColor: slide.accentColor });
    return `
      <details class="presentation-theme-menu" data-presentation-theme-menu>
        <summary class="presentation-tool-button presentation-theme-button" aria-label="Open slide theme picker">
          <span class="presentation-theme-button-mark" aria-hidden="true" style="--mark-a: ${escapeHtml(style.accentColor)}; --mark-b: ${escapeHtml(style.backgroundColor)};"></span>
          <strong>Theme</strong>
        </summary>
        <div class="presentation-theme-popover" role="group" aria-label="Slide theme">
          <div class="presentation-theme-card-grid">
            ${presentationThemeOptions
              .filter((theme) => theme.value !== "custom")
              .map(
                (theme) => `
                  <button
                    type="button"
                    class="presentation-theme-card ${style.theme === theme.value ? "is-active" : ""}"
                    data-presentation-theme-preset="${escapeHtml(theme.value)}"
                    aria-label="${escapeHtml(`Use ${theme.label} theme`)}"
                    style="--theme-card-accent: ${escapeHtml(theme.accentColor)}; --theme-card-bg: ${escapeHtml(theme.backgroundColor)}; --theme-card-glow: ${escapeHtml(theme.glowColor)}; --theme-card-text: ${escapeHtml(theme.textColor)};"
                  >
                    <span class="presentation-theme-card-preview" aria-hidden="true">
                      <i></i>
                      <b></b>
                    </span>
                    <strong>${escapeHtml(theme.label)}</strong>
                  </button>
                `
              )
              .join("")}
          </div>
          <label class="presentation-theme-select">
            <span>Theme</span>
            <select data-presentation-style-field="theme" aria-label="Slide theme preset">
              ${presentationThemeOptions
                .map(
                  (theme) =>
                    `<option value="${escapeHtml(theme.value)}" ${style.theme === theme.value ? "selected" : ""}>${escapeHtml(theme.label)}</option>`
                )
                .join("")}
            </select>
          </label>
          <div class="presentation-theme-swatches" aria-hidden="true">
            <i style="--swatch: ${escapeHtml(style.accentColor)}"></i>
            <i style="--swatch: ${escapeHtml(style.backgroundColor)}"></i>
            <i style="--swatch: ${escapeHtml(style.glowColor)}"></i>
            <i style="--swatch: ${escapeHtml(style.textColor)}"></i>
          </div>
          <label>
            <span>Accent</span>
            <input type="color" value="${escapeHtml(style.accentColor)}" data-presentation-style-field="accentColor" aria-label="Slide accent color" />
          </label>
          <label>
            <span>Background</span>
            <input type="color" value="${escapeHtml(style.backgroundColor)}" data-presentation-style-field="backgroundColor" aria-label="Slide background color" />
          </label>
          <label>
            <span>Glow</span>
            <input type="color" value="${escapeHtml(style.glowColor)}" data-presentation-style-field="glowColor" aria-label="Slide glow color" />
          </label>
          <label>
            <span>Text</span>
            <input type="color" value="${escapeHtml(style.textColor)}" data-presentation-style-field="textColor" aria-label="Slide text color" />
          </label>
        </div>
      </details>
    `;
  }

  function getSlideText(slide = {}, field = "", fallback = "") {
    const key = String(field || "").trim();
    const overrides = slide.textOverrides && typeof slide.textOverrides === "object" ? slide.textOverrides : {};
    const value = Object.prototype.hasOwnProperty.call(overrides, key) ? String(overrides[key] ?? "") : String(fallback ?? "");
    if (key === "block.label" || /^players\.[^.]+\..+\.meta$/.test(key)) {
      return removeParticipationPercentText(value);
    }
    return value;
  }

  function getStableTextKey(value = "", fallback = "item") {
    return (
      String(value || fallback)
        .trim()
        .replace(/[^a-z0-9_-]+/gi, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 72) || fallback
    );
  }

  function isActiveTextField(model = {}, slide = {}, field = "") {
    const target = model.activeTextTarget;
    return Boolean(!model.presenting && target?.slideId === slide.id && target.field === field);
  }

  function getActiveTextAttribute(model = {}, slide = {}, field = "") {
    return isActiveTextField(model, slide, field) ? `data-presentation-active-text="true"` : "";
  }

  function getEditableAttributes(model = {}, slide = {}, field = "", options = {}) {
    if (model.presenting || !slide.id || !field) {
      return "";
    }
    return [
      `data-presentation-slide-id="${escapeHtml(slide.id)}"`,
      `data-presentation-text-field="${escapeHtml(field)}"`,
      getActiveTextAttribute(model, slide, field),
      options.multiline ? `data-presentation-text-multiline="true"` : "",
      `contenteditable="true"`,
      `spellcheck="true"`,
      `role="textbox"`,
      options.multiline ? `aria-multiline="true"` : "",
      options.label ? `aria-label="${escapeHtml(options.label)}"` : "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  function getTextFieldStyle(slide = {}, field = "") {
    const styles = slide.textFieldStyles && typeof slide.textFieldStyles === "object" ? slide.textFieldStyles : {};
    return styles[String(field || "").trim()] || {};
  }

  function getTextFieldStyleAttribute(slide = {}, field = "", fallback = {}, extraStyle = "") {
    const slideStyle = normalizePresentationSlideStyle(slide.style, {
      accentColor: slide.accentColor,
      textColor: fallback.textColor,
    });
    const style = { ...fallback, ...getTextFieldStyle(slide, field) };
    const declarations = [];
    if (extraStyle) {
      declarations.push(String(extraStyle).replace(/;+$/g, ""));
    }
    if (style.fontSize) {
      const remSize = `${Number((Number(getSafeSize(style.fontSize)) / 16).toFixed(3))}rem`;
      declarations.push(`--presentation-editable-font-size: ${remSize}`);
      declarations.push(
        "font-size: min(var(--presentation-editable-font-size), var(--presentation-editable-fit-size, var(--presentation-editable-font-size)))"
      );
    }
    if (style.textColor || slideStyle.textColor) {
      declarations.push(
        `color: ${getReadablePresentationTextColor(slideStyle.backgroundColor, style.textColor || slideStyle.textColor)}`
      );
    }
    const offsetX = Number(style.offsetX);
    const offsetY = Number(style.offsetY);
    if (Number.isFinite(offsetX) || Number.isFinite(offsetY)) {
      declarations.push(
        `transform: translate3d(calc(var(--presentation-slide-width, 1px) * ${Number.isFinite(offsetX) ? offsetX / 100 : 0}), calc(var(--presentation-slide-height, 1px) * ${Number.isFinite(offsetY) ? offsetY / 100 : 0}), 0)`
      );
    }
    if (style.width) {
      declarations.push("display: inline-flex");
      declarations.push("align-items: center");
      declarations.push(`width: calc(var(--presentation-slide-width, 1px) * ${Number(style.width) / 100})`);
      declarations.push("max-width: calc(var(--presentation-slide-width, 1px) * .94)");
    }
    if (style.height) {
      declarations.push(`min-height: calc(var(--presentation-slide-height, 1px) * ${Number(style.height) / 100})`);
    }
    return declarations.length ? `style="${escapeHtml(`${declarations.join("; ")};`)}"` : "";
  }

  function mergeAttributes(...attributes) {
    return attributes.filter(Boolean).join(" ");
  }

  function renderTextFieldControls(model = {}, slide = {}, field = "", options = {}) {
    if (model.presenting || options.objectFrame === false || !slide.id || !field) {
      return "";
    }
    const safeField = escapeHtml(field);
    const safeSlideId = escapeHtml(slide.id || "");
    return [
      `<span class="presentation-text-field-edge-handle is-top" data-presentation-drag-text-field="${safeField}" data-presentation-slide-id="${safeSlideId}" contenteditable="false" aria-hidden="true"></span>`,
      `<span class="presentation-text-field-edge-handle is-right" data-presentation-drag-text-field="${safeField}" data-presentation-slide-id="${safeSlideId}" contenteditable="false" aria-hidden="true"></span>`,
      `<span class="presentation-text-field-edge-handle is-bottom" data-presentation-drag-text-field="${safeField}" data-presentation-slide-id="${safeSlideId}" contenteditable="false" aria-hidden="true"></span>`,
      `<span class="presentation-text-field-edge-handle is-left" data-presentation-drag-text-field="${safeField}" data-presentation-slide-id="${safeSlideId}" contenteditable="false" aria-hidden="true"></span>`,
      renderResizeHandles("text-field", field, slide.id),
    ].join("");
  }

  function renderEditableElement(model = {}, slide = {}, field = "", fallback = "", tagName = "span", attributes = "", options = {}) {
    const editableAttributes = getEditableAttributes(model, slide, field, options);
    const value = getSlideText(slide, field, fallback);
    const styleAttribute = getTextFieldStyleAttribute(slide, field, options.style || {}, options.extraStyle || "");
    const objectAttributes = !model.presenting && options.objectFrame !== false
      ? `data-presentation-text-object="${escapeHtml(field)}"`
      : "";
    const mergedAttributes = mergeAttributes(attributes, styleAttribute, objectAttributes, editableAttributes);
    return `<${tagName}${mergedAttributes ? ` ${mergedAttributes}` : ""}>${escapeHtml(value)}${renderTextFieldControls(model, slide, field, options)}</${tagName}>`;
  }

  function renderEditableTextArea(model = {}, slide = {}, field = "", fallback = "", attributes = "", options = {}) {
    const value = getSlideText(slide, field, fallback).replace(/\r\n?/g, "\n").trim();
    if (!value) {
      return "";
    }
    const editableAttributes = getEditableAttributes(model, slide, field, { ...options, multiline: true });
    const styleAttribute = getTextFieldStyleAttribute(slide, field, options.style || {}, options.extraStyle || "");
    const objectAttributes = !model.presenting && options.objectFrame !== false
      ? `data-presentation-text-object="${escapeHtml(field)}"`
      : "";
    const mergedAttributes = mergeAttributes(attributes, styleAttribute, objectAttributes, editableAttributes);
    return `<div${mergedAttributes ? ` ${mergedAttributes}` : ""}>${escapeHtml(value)}${renderTextFieldControls(model, slide, field, options)}</div>`;
  }

  function renderControlBar(model = {}) {
    const slide = model.slides[model.slideIndex] || model.slides[0];
    const canDeleteSlide = Boolean(slide?.infoSlide?.id);
    return `
      <header class="presentation-control-bar">
        <div class="presentation-control-brand">
          ${renderLogo(model.brand)}
          <div>
            <strong>Presentation Mode</strong>
          </div>
        </div>
        <div class="presentation-control-edit-slot">
          ${renderTextToolbar(model)}
        </div>
        <div class="presentation-pass-controls">
          ${renderInsertControl(model)}
          ${renderThemeControl(slide)}
          ${renderNewSlideControl()}
          <button type="button" class="presentation-tool-button" data-presentation-delete-slide ${canDeleteSlide ? "" : "disabled"} title="${canDeleteSlide ? "Delete current slide" : "Only custom slides can be deleted"}">Delete Slide</button>
          <div class="presentation-date-control">
            <input type="date" value="${escapeHtml(model.dateValue)}" data-presentation-date-input aria-label="Presentation date" />
            <button type="button" class="presentation-date-picker-button" data-presentation-date-picker aria-label="Open calendar"></button>
          </div>
        </div>
        <div class="presentation-control-actions">
          <button type="button" class="presentation-tool-button is-primary" data-presentation-start title="Start fullscreen" aria-label="Start fullscreen">Start</button>
          <button type="button" class="presentation-icon-button" data-presentation-close title="Close" aria-label="Close presentation">x</button>
        </div>
      </header>
    `;
  }

  function renderInsertControl(model = {}) {
    const quickSymbols = symbolOptions.slice(0, 10);
    return `
      <details class="presentation-insert-menu" data-presentation-insert-menu>
        <summary class="presentation-tool-button presentation-insert-button" aria-label="Insert content">
          Insert
        </summary>
        <div class="presentation-insert-popover" role="group" aria-label="Insert content">
          <div class="presentation-insert-section is-primary">
            <button type="button" data-presentation-add-text-box>
              ${renderToolbarIcon("text", "A")}
              <span>
                <strong>Text</strong>
                <small>Movable text box</small>
              </span>
            </button>
            ${mediaInsertOptions
              .map(
                (item) => `
                  <button type="button" data-presentation-add-media="${escapeHtml(item.kind)}">
                    ${renderToolbarIcon(item.kind, "")}
                    <span>
                      <strong>${escapeHtml(item.label)}</strong>
                      <small>${escapeHtml(item.description)}</small>
                    </span>
                  </button>
                `
              )
              .join("")}
          </div>
          <div class="presentation-insert-section">
            <strong>Shapes</strong>
            <div class="presentation-insert-chip-grid">
              ${shapeOptions
                .map(
                  (shape) => `
                    <button
                      type="button"
                      class="${model.shapeDrawTool === shape.type ? "is-active" : ""}"
                      data-presentation-add-shape="${escapeHtml(shape.type)}"
                      aria-label="${escapeHtml(`Draw ${shape.label}`)}"
                    >
                      <span class="presentation-shape-preview is-${escapeHtml(shape.type)}" aria-hidden="true"></span>
                      <span>${escapeHtml(shape.label)}</span>
                    </button>
                  `
                )
                .join("")}
            </div>
          </div>
          <div class="presentation-insert-section">
            <strong>Symbols</strong>
            <div class="presentation-symbol-grid is-compact" role="group" aria-label="Insert quick symbol">
              ${quickSymbols
                .map(
                  (symbol) => `
                    <button
                      type="button"
                      data-presentation-insert-symbol="${symbol.value}"
                      title="${escapeHtml(`Insert ${symbol.label}`)}"
                      aria-label="${escapeHtml(`Insert ${symbol.label}`)}"
                    >${symbol.value}</button>
                  `
                )
                .join("")}
            </div>
          </div>
        </div>
      </details>
    `;
  }

  function renderSlideTemplatePreview(template = {}) {
    return `
      <span class="presentation-slide-template-preview" aria-hidden="true">
        ${(template.preview || [])
          .map((item) => `<i class="is-${escapeHtml(item)}"></i>`)
          .join("")}
      </span>
    `;
  }

  function renderNewSlideControl() {
    return `
      <details class="presentation-new-slide-menu">
        <summary class="presentation-tool-button presentation-new-slide-button" data-presentation-add-info-menu aria-label="Choose new slide layout">
          New Slide
        </summary>
        <div class="presentation-new-slide-popover" role="group" aria-label="New slide layout">
          <strong class="presentation-new-slide-heading">Choose Layout</strong>
          ${slideTemplateOptions
            .map(
              (template) => `
                <button type="button" data-presentation-add-info="${escapeHtml(template.value)}">
                  ${renderSlideTemplatePreview(template)}
                  <span>
                    <strong>${escapeHtml(template.label)}</strong>
                    <small>${escapeHtml(template.description)}</small>
                  </span>
                </button>
              `
            )
            .join("")}
        </div>
      </details>
    `;
  }

  function renderToolbarIcon(type = "tool", label = "") {
    return `
      <span class="presentation-keynote-icon is-${escapeHtml(type)}" aria-hidden="true">
        ${label ? `<span>${escapeHtml(label)}</span>` : ""}
      </span>
    `;
  }

  function renderToolbarButton(label = "", icon = "tool", attributes = "", options = {}) {
    return `
      <button type="button" class="presentation-keynote-tool${options.utility ? " is-utility" : ""}" ${attributes}>
        ${renderToolbarIcon(icon, options.iconLabel || "")}
        <span>${escapeHtml(label)}</span>
      </button>
    `;
  }

  function renderToolPopover(label = "", body = "", attributes = "", options = {}) {
    return `
      <details class="presentation-tool-popover" ${attributes}>
        <summary class="presentation-keynote-tool">
          ${renderToolbarIcon(options.icon || "tool", options.iconLabel || "")}
          <span>${escapeHtml(label)}</span>
        </summary>
        <div class="presentation-tool-popover-panel">
          ${body}
        </div>
      </details>
    `;
  }

  function renderSymbolMenu() {
    return renderToolPopover(
      "Symbol",
      `
        <div class="presentation-symbol-grid" role="group" aria-label="Insert symbol">
          ${symbolOptions
            .map(
              (symbol) => `
                <button
                  type="button"
                  data-presentation-insert-symbol="${symbol.value}"
                  title="${escapeHtml(`Insert ${symbol.label}`)}"
                  aria-label="${escapeHtml(`Insert ${symbol.label}`)}"
                >${symbol.value}</button>
              `
            )
            .join("")}
        </div>
      `,
      "data-presentation-symbol-menu",
      { icon: "symbol" }
    );
  }

  function renderShapeMenu(model = {}) {
    return renderToolPopover(
      "Shape",
      `
        <div class="presentation-shape-grid" role="group" aria-label="Add shape">
          ${shapeOptions
            .map(
              (shape) => `
                <button
                  type="button"
                  class="${model.shapeDrawTool === shape.type ? "is-active" : ""}"
                  data-presentation-add-shape="${escapeHtml(shape.type)}"
                  title="${escapeHtml(`Draw ${shape.label}`)}"
                  aria-label="${escapeHtml(`Draw ${shape.label}`)}"
                  aria-pressed="${model.shapeDrawTool === shape.type ? "true" : "false"}"
                >
                  <span class="presentation-shape-preview is-${escapeHtml(shape.type)}" aria-hidden="true"></span>
                  <strong>${escapeHtml(shape.label)}</strong>
                </button>
              `
            )
            .join("")}
        </div>
      `,
      "data-presentation-shape-menu",
      { icon: "shape" }
    );
  }

  function renderStyleMenu(style = {}) {
    return renderToolPopover(
      "Style",
      `
        <div class="presentation-style-panel" role="group" aria-label="Style controls">
          <label class="presentation-style-control is-wide">
            <span>Text size</span>
            <select data-presentation-active-font-size aria-label="Text size">
              <option value="">Auto</option>
              ${infoFontSizeOptions
                .map((size) => {
                  const sizeValue = String(size);
                  return `<option value="${sizeValue}">${escapeHtml(`${sizeValue} pt`)}</option>`;
                })
                .join("")}
            </select>
          </label>
          <label class="presentation-style-control is-wide presentation-opacity-control">
            <span>Opacity <output data-presentation-active-shape-opacity-value>--</output></span>
            <input type="range" min="0" max="100" step="5" value="90" data-presentation-active-shape-opacity aria-label="Shape opacity" disabled />
          </label>
          <label class="presentation-style-control">
            <span>Background</span>
            <input type="color" value="${escapeHtml(style.backgroundColor)}" data-presentation-style-field="backgroundColor" aria-label="Slide background color" />
          </label>
          <label class="presentation-style-control">
            <span>Accent</span>
            <input type="color" value="${escapeHtml(style.accentColor)}" data-presentation-style-field="accentColor" aria-label="Slide accent color" />
          </label>
        </div>
      `,
      "data-presentation-style-menu",
      { icon: "style" }
    );
  }

  function renderColorMenu(style = {}) {
    return renderToolPopover(
      "Color",
      `
        <div class="presentation-color-panel" role="group" aria-label="Color controls">
          <label class="presentation-color-control" title="Text color">
            <span>
              <strong>Text</strong>
              <small>Selected text</small>
            </span>
            <input type="color" value="#f8fafc" data-presentation-active-text-color aria-label="Text color" disabled />
          </label>
          <label class="presentation-color-control" title="Shape fill color">
            <span>
              <strong>Fill</strong>
              <small>Shape fill</small>
            </span>
            <input type="color" value="#38bdf8" data-presentation-active-shape-fill aria-label="Shape fill color" disabled />
          </label>
          <label class="presentation-color-control" title="Shape line color">
            <span>
              <strong>Line</strong>
              <small>Shape outline</small>
            </span>
            <input type="color" value="#f8fafc" data-presentation-active-shape-stroke aria-label="Shape line color" disabled />
          </label>
          <label class="presentation-color-control" title="Slide background color">
            <span>
              <strong>Background</strong>
              <small>Current slide</small>
            </span>
            <input type="color" value="${escapeHtml(style.backgroundColor)}" data-presentation-style-field="backgroundColor" aria-label="Slide background color" />
          </label>
        </div>
      `,
      "data-presentation-color-menu",
      { icon: "color" }
    );
  }

  function renderTextToolbar(model = {}) {
    const slide = model.slides?.[model.slideIndex] || model.slides?.[0] || {};
    const style = normalizePresentationSlideStyle(slide.style, { accentColor: slide.accentColor || model.accentColor });
    return `
      <section class="presentation-editor-strip presentation-text-toolbar" data-presentation-text-toolbar aria-label="Text tools">
        ${renderToolbarButton("Text", "text", "data-presentation-add-text-box title=\"Add text box\" aria-label=\"Add text box\"", { iconLabel: "A" })}
        ${renderShapeMenu(model)}
        ${renderSymbolMenu()}
        ${renderColorMenu(style)}
        ${renderStyleMenu(style)}
        <span class="presentation-toolbar-separator" aria-hidden="true"></span>
        ${renderToolbarButton("Duplicate", "duplicate", "data-presentation-duplicate-info data-presentation-active-info-only disabled title=\"Duplicate slide\" aria-label=\"Duplicate slide\"", { utility: true })}
      </section>
    `;
  }

  function renderContextMenu(model = {}) {
    const menu = model.contextMenu;
    if (model.presenting || !menu) {
      return "";
    }
    const x = Number.isFinite(Number(menu.x)) ? Number(menu.x) : 24;
    const y = Number.isFinite(Number(menu.y)) ? Number(menu.y) : 24;
    const hasObjectTarget = menu.targetType === "shape" || menu.targetType === "textBox";
    return `
      <div
        class="presentation-context-menu"
        data-presentation-context-menu
        style="--presentation-context-menu-x: ${escapeHtml(x)}px; --presentation-context-menu-y: ${escapeHtml(y)}px;"
        role="menu"
        aria-label="Slide context menu"
      >
        ${hasObjectTarget
          ? `
            <div class="presentation-context-section">
              <button type="button" data-presentation-context-action="duplicate-object" role="menuitem">Duplicate</button>
              <button type="button" data-presentation-context-action="delete-object" role="menuitem">Delete</button>
            </div>
          `
          : ""}
        <div class="presentation-context-section">
          <strong>Insert</strong>
          <button type="button" data-presentation-context-action="text" role="menuitem">Text</button>
          <button type="button" data-presentation-context-action="image" role="menuitem">Image</button>
          <button type="button" data-presentation-context-action="video" role="menuitem">Video</button>
        </div>
        <div class="presentation-context-section">
          <strong>Shapes</strong>
          <div class="presentation-context-grid">
            ${shapeOptions
              .slice(0, 6)
              .map(
                (shape) => `
                  <button type="button" data-presentation-context-action="shape:${escapeHtml(shape.type)}" role="menuitem" aria-label="${escapeHtml(`Draw ${shape.label}`)}">
                    <span class="presentation-shape-preview is-${escapeHtml(shape.type)}" aria-hidden="true"></span>
                  </button>
                `
              )
              .join("")}
          </div>
        </div>
        <div class="presentation-context-section">
          <strong>Symbols</strong>
          <div class="presentation-context-grid">
            ${symbolOptions
              .slice(0, 12)
              .map(
                (symbol) => `
                  <button type="button" data-presentation-context-action="symbol:${escapeHtml(symbol.value)}" role="menuitem" aria-label="${escapeHtml(`Insert ${symbol.label}`)}">${symbol.value}</button>
                `
              )
              .join("")}
          </div>
        </div>
      </div>
    `;
  }

  function renderSlideNav(slides = [], activeIndex = 0) {
    return `
      <nav class="presentation-slide-tabs" aria-label="Presentation slides">
        ${slides
          .map(
            (slide, index) => `
              <button
                type="button"
                class="${index === activeIndex ? "is-active" : ""}"
                data-presentation-goto="${index}"
                data-presentation-slide-tab
                data-presentation-slide-index="${index}"
                draggable="true"
                aria-label="${escapeHtml(`Go to ${slide.label}`)}"
                title="${escapeHtml(`Drag to reorder ${slide.label}`)}"
              >
                <span>${index + 1}</span>
                <strong>${escapeHtml(slide.label)}</strong>
              </button>
            `
          )
          .join("")}
      </nav>
    `;
  }

  function renderFooter(model = {}) {
    return `
      <footer class="presentation-footer-nav">
        ${model.presenting ? "" : renderSlideNav(model.slides, model.slideIndex)}
        <div class="presentation-footer-pager">
          <button type="button" class="presentation-nav-button" data-presentation-prev ${model.slideIndex <= 0 ? "disabled" : ""} aria-label="Previous slide" title="Previous slide">&larr;</button>
          <div class="presentation-progress">
            <strong>${escapeHtml(String(model.slideIndex + 1))}</strong>
            <span>/ ${escapeHtml(String(model.slides.length))}</span>
          </div>
          <button type="button" class="presentation-nav-button" data-presentation-next ${model.slideIndex >= model.slides.length - 1 ? "disabled" : ""} aria-label="Next slide" title="Next slide">&rarr;</button>
          ${model.presenting ? `<button type="button" class="presentation-icon-button" data-presentation-exit-fullscreen aria-label="Exit fullscreen" title="Exit fullscreen">x</button>` : ""}
        </div>
      </footer>
    `;
  }

  function renderSlideTextBoxes(model = {}, slide = {}) {
    const boxes = Array.isArray(slide.textBoxes) ? slide.textBoxes : [];
    if (!boxes.length) {
      return "";
    }
    return `
      <div class="presentation-text-box-layer" aria-label="Slide text boxes">
        ${boxes
          .map((box) => {
            const field = `textbox.${box.id}.text`;
            const kind = ["symbol", "image", "video"].includes(box.kind) ? box.kind : "text";
            const mediaSrc = String(box.mediaSrc || "").trim();
            const mediaName = String(box.mediaName || box.text || (kind === "video" ? "Local video" : "Local image")).trim();
            const isActive =
              model.activeTextTarget?.slideId === slide.id && model.activeTextTarget?.textBoxId === box.id;
            const fallbackStyle = {
              fontSize: box.fontSize || "36",
              textColor: box.textColor || "#f8fafc",
            };
            const isFixedObject = kind === "symbol" || kind === "image" || kind === "video";
            const objectDragAttributes =
              isFixedObject
                ? `data-presentation-drag-text-box="${escapeHtml(box.id)}" data-presentation-slide-id="${escapeHtml(slide.id)}"`
                : "";
            const textBox =
              (kind === "image" || kind === "video") && mediaSrc
                ? `
                  <figure
                    class="presentation-local-media-box is-${escapeHtml(kind)}"
                    data-presentation-drag-text-box="${escapeHtml(box.id)}"
                    data-presentation-slide-id="${escapeHtml(slide.id)}"
                    aria-label="${escapeHtml(mediaName)}"
                  >
                    ${
                      kind === "video"
                        ? `<video class="presentation-local-media-object" src="${escapeHtml(mediaSrc)}" controls preload="metadata" playsinline title="${escapeHtml(mediaName)}"></video>`
                        : `<img class="presentation-local-media-object" src="${escapeHtml(mediaSrc)}" alt="${escapeHtml(mediaName)}" />`
                    }
                    <figcaption>${escapeHtml(mediaName)}</figcaption>
                  </figure>
                `
                : renderEditableTextArea(
                    model,
                    slide,
                    field,
                    box.text ?? "Text box",
                    `class="presentation-free-text-box" data-presentation-text-box-id="${escapeHtml(box.id)}" ${objectDragAttributes}`,
                    {
                      label: "Text box",
                      objectFrame: false,
                      style: fallbackStyle,
                    }
                  );
            return `
              <div
                class="presentation-free-text-box-shell is-${escapeHtml(kind)}${isActive ? " is-selected" : ""}"
                data-presentation-text-box-shell
                data-presentation-text-box-id="${escapeHtml(box.id)}"
                data-presentation-text-box-kind="${escapeHtml(kind)}"
                data-presentation-slide-id="${escapeHtml(slide.id)}"
                tabindex="${model.presenting ? "-1" : "0"}"
                aria-label="${escapeHtml(kind === "symbol" ? "Symbol object" : kind === "image" ? "Image placeholder object" : kind === "video" ? "Video placeholder object" : "Text box object")}"
                style="left: ${escapeHtml(box.x)}%; top: ${escapeHtml(box.y)}%; width: ${escapeHtml(box.width)}%; height: ${escapeHtml(box.height || (kind === "symbol" ? 14 : kind === "image" || kind === "video" ? 24 : 12))}%;"
              >
                ${textBox}
                <span
                  class="presentation-text-box-edge-handle is-top"
                  data-presentation-drag-text-box="${escapeHtml(box.id)}"
                  data-presentation-slide-id="${escapeHtml(slide.id)}"
                  aria-hidden="true"
                ></span>
                <span
                  class="presentation-text-box-edge-handle is-right"
                  data-presentation-drag-text-box="${escapeHtml(box.id)}"
                  data-presentation-slide-id="${escapeHtml(slide.id)}"
                  aria-hidden="true"
                ></span>
                <span
                  class="presentation-text-box-edge-handle is-bottom"
                  data-presentation-drag-text-box="${escapeHtml(box.id)}"
                  data-presentation-slide-id="${escapeHtml(slide.id)}"
                  aria-hidden="true"
                ></span>
                <span
                  class="presentation-text-box-edge-handle is-left"
                  data-presentation-drag-text-box="${escapeHtml(box.id)}"
                  data-presentation-slide-id="${escapeHtml(slide.id)}"
                  aria-hidden="true"
                ></span>
                ${renderResizeHandles("text-box", box.id, slide.id)}
              </div>
            `;
          })
          .join("")}
      </div>
    `;
  }

  function renderSlideShapes(model = {}, slide = {}) {
    const shapes = Array.isArray(slide.shapes) ? slide.shapes : [];
    if (!shapes.length) {
      return "";
    }
    return `
      <div class="presentation-shape-layer" aria-label="Slide shapes">
        ${shapes
          .map((shape) => {
            const type = String(shape.type || "rect").trim();
            const opacity = Number((normalizeOpacity(shape.opacity, 90) / 100).toFixed(2));
            const isActive =
              model.activeShapeTarget?.slideId === slide.id && model.activeShapeTarget?.shapeId === shape.id;
            return `
              <button
                type="button"
                class="presentation-slide-shape is-${escapeHtml(type)}${isActive ? " is-selected" : ""}"
                data-presentation-shape
                data-presentation-shape-id="${escapeHtml(shape.id)}"
                data-presentation-slide-id="${escapeHtml(slide.id)}"
                style="left: ${escapeHtml(shape.x)}%; top: ${escapeHtml(shape.y)}%; width: ${escapeHtml(shape.width)}%; height: ${escapeHtml(shape.height)}%; --presentation-shape-fill: ${escapeHtml(normalizeHexColor(shape.fillColor, "#38bdf8"))}; --presentation-shape-stroke: ${escapeHtml(normalizeHexColor(shape.strokeColor, "#f8fafc"))}; --presentation-shape-opacity: ${escapeHtml(opacity)};"
                aria-label="${escapeHtml(`Move and resize ${type} shape`)}"
                title="Move or resize shape"
              >
                ${renderResizeHandles("shape", shape.id, slide.id)}
              </button>
            `;
          })
          .join("")}
      </div>
    `;
  }

  function renderSlideFrame(model = {}, slide = {}, body = "") {
    const style = normalizePresentationSlideStyle(slide.style, { accentColor: slide.accentColor || model.accentColor });
    return `
      <section
        class="presentation-slide presentation-slide-${escapeHtml(slide.type || "blank")} is-theme-${escapeHtml(style.theme)}"
        data-presentation-slide-id="${escapeHtml(slide.id)}"
        style="--presentation-accent: ${escapeHtml(style.accentColor)}; --presentation-slide-bg: ${escapeHtml(style.backgroundColor)}; --presentation-slide-glow: ${escapeHtml(style.glowColor)}; --presentation-slide-text: ${escapeHtml(style.textColor)};"
        aria-label="${escapeHtml(slide.label || "Presentation slide")}"
      >
        ${slide.type === "cover" ? "" : `<div class="presentation-corner-logo">${renderLogo(model.brand)}</div>`}
        <main class="presentation-slide-body">${body}</main>
        ${renderSlideShapes(model, slide)}
        ${renderSlideTextBoxes(model, slide)}
        <footer class="presentation-slide-footer">
          ${renderEditableElement(model, slide, "footer.teamName", model.teamName, "span", "", { label: "Footer team name" })}
          ${renderEditableElement(model, slide, "footer.dateLabel", model.dateLabel, "strong", "", { label: "Footer date" })}
        </footer>
      </section>
    `;
  }

  function renderCoverSlide(model = {}, slide = {}) {
    const coverSlide = slide.id ? slide : model.slides?.find((item) => item.type === "cover") || {};
    const frameSlide = {
      id: coverSlide.id || "cover",
      type: "cover",
      label: "Cover",
      accentColor: coverSlide.accentColor || model.accentColor,
      style: coverSlide.style,
      shapes: coverSlide.shapes,
      textBoxes: coverSlide.textBoxes,
      textFieldStyles: coverSlide.textFieldStyles,
      textOverrides: coverSlide.textOverrides,
    };
    return renderSlideFrame(
      model,
      frameSlide,
      `
        <div class="presentation-cover-mark">
          ${renderLogo(model.brand, "hero")}
        </div>
        <div class="presentation-cover-copy">
          ${renderEditableElement(model, frameSlide, "cover.title", model.sessionTitle, "h1", "", { label: "Cover title" })}
          ${renderEditableElement(model, frameSlide, "cover.dateLabel", model.dateLabel, "p", "", { label: "Cover date" })}
        </div>
      `
    );
  }

  function getInfoSlideMediaKind(infoSlide = {}) {
    const requestedKind = String(infoSlide.mediaKind || "").trim();
    if (requestedKind === "video" || infoSlide.layout === "video") {
      return "video";
    }
    if (requestedKind === "image" || infoSlide.layout === "media" || infoSlide.layout === "split") {
      return "image";
    }
    return "";
  }

  function renderInfoSlideMedia(model = {}, infoSlide = {}) {
    const mediaKind = getInfoSlideMediaKind(infoSlide);
    if (!mediaKind) {
      return "";
    }
    const mediaSrc = String(infoSlide.mediaSrc || "").trim();
    const mediaName = String(infoSlide.mediaName || (mediaKind === "video" ? "Local video" : "Local image")).trim();
    const hasMedia = Boolean(mediaSrc);
    const chooseLabel = `${hasMedia ? "Replace" : "Choose"} ${mediaKind === "video" ? "Video" : "Image"}`;
    return `
      <figure class="presentation-info-media-panel is-${escapeHtml(mediaKind)}${hasMedia ? " has-media" : " is-empty"}">
        <div class="presentation-info-media-stage">
          ${
            hasMedia
              ? mediaKind === "video"
                ? `<video class="presentation-info-media-object" src="${escapeHtml(mediaSrc)}" controls preload="metadata" playsinline title="${escapeHtml(mediaName)}"></video>`
                : `<img class="presentation-info-media-object" src="${escapeHtml(mediaSrc)}" alt="${escapeHtml(mediaName)}" />`
              : `<span class="presentation-info-media-empty-mark">${escapeHtml(mediaKind === "video" ? "Video" : "Image")}</span>`
          }
        </div>
        <figcaption class="presentation-info-media-caption">
          <span>${escapeHtml(hasMedia ? mediaName : "")}</span>
          ${
            model.presenting
              ? ""
              : `<button
                  type="button"
                  class="presentation-info-media-pick"
                  data-presentation-info-media-pick="${escapeHtml(mediaKind)}"
                  data-presentation-info-id="${escapeHtml(infoSlide.id)}"
                >${escapeHtml(chooseLabel)}</button>`
          }
        </figcaption>
      </figure>
    `;
  }

  function renderInfoSlide(model = {}, slide = {}) {
    const infoSlide = slide.infoSlide || {};
    const slideStyle = normalizePresentationSlideStyle(slide.style, {
      accentColor: infoSlide.accentColor,
      textColor: infoSlide.textColor,
    });
    const accentColor = normalizeHexColor(slideStyle.accentColor, "#38bdf8");
    const textColor = normalizeHexColor(slideStyle.textColor, "#f8fafc");
    const readonly = model.presenting ? "readonly" : "";
    const frameSlide = {
      id: slide.id,
      type: "info",
      label: slide.label,
      accentColor,
      style: slide.style,
      shapes: slide.shapes,
      textBoxes: slide.textBoxes,
      textFieldStyles: slide.textFieldStyles,
      textOverrides: slide.textOverrides,
    };
    return renderSlideFrame(
      model,
      frameSlide,
      `
        <section
          class="presentation-info-sheet is-layout-${escapeHtml(infoSlide.layout || "bullets")}"
          style="--presentation-info-color: ${escapeHtml(textColor)}; --presentation-info-accent: ${escapeHtml(accentColor)}; ${escapeHtml(getInfoSizeStyle(infoSlide.fontSize))}"
        >
          <input
            class="presentation-info-title"
            value="${escapeHtml(infoSlide.title || "Team Information")}"
            data-presentation-info-field="title"
            data-presentation-info-id="${escapeHtml(infoSlide.id)}"
            data-presentation-slide-id="${escapeHtml(frameSlide.id)}"
            data-presentation-text-field="info.title"
            ${getActiveTextAttribute(model, frameSlide, "info.title")}
            aria-label="Info slide title"
            ${getTextFieldStyleAttribute(frameSlide, "info.title")}
            ${readonly}
          />
          <span class="presentation-info-rule" aria-hidden="true"></span>
          <textarea
            class="presentation-info-body"
            data-presentation-info-field="body"
            data-presentation-info-id="${escapeHtml(infoSlide.id)}"
            data-presentation-slide-id="${escapeHtml(frameSlide.id)}"
            data-presentation-text-field="info.body"
            data-presentation-text-multiline="true"
            ${getActiveTextAttribute(model, frameSlide, "info.body")}
            aria-label="Info slide content"
            spellcheck="true"
            ${getTextFieldStyleAttribute(frameSlide, "info.body")}
            ${readonly}
          >${escapeHtml(infoSlide.body || "")}</textarea>
          ${renderInfoSlideMedia(model, infoSlide)}
        </section>
      `
    );
  }

  function getLineupLastName(name = "") {
    const parts = String(name || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    return parts.at(-1) || String(name || "Player").trim() || "Player";
  }

  function getLineupPlayerLabel(player = {}) {
    const number = String(player.number || "").trim();
    const lastName = getLineupLastName(player.name);
    return `${number ? `#${number} ` : ""}${lastName}`;
  }

  function renderLineupAvatar(player = {}, className = "presentation-lineup-avatar") {
    const photoUrl = String(player.photoUrl || player.avatarUrl || player.imageUrl || "").trim();
    const label = String(player.name || "Player").trim();
    if (photoUrl) {
      return `
        <span class="${escapeHtml(className)} has-photo">
          <img src="${escapeHtml(photoUrl)}" alt="${escapeHtml(label)}" loading="lazy" />
        </span>
      `;
    }
    return `<span class="${escapeHtml(className)}">${escapeHtml(getInitials(label).toUpperCase())}</span>`;
  }

  function renderMatchSquadPlayerCard(player = {}, index = 0) {
    const position = String(player.position || "").trim();
    return `
      <article class="presentation-match-squad-card">
        ${renderLineupAvatar(player, "presentation-match-squad-photo")}
        <div class="presentation-match-squad-card-copy">
          <strong>${escapeHtml(getLineupPlayerLabel(player))}</strong>
          <small>${escapeHtml(position || player.name || `Player ${index + 1}`)}</small>
        </div>
      </article>
    `;
  }

  function renderMatchSquadOption(player = {}, selectedIds = new Set(), infoId = "") {
    const playerId = String(player.id || "").trim();
    const checked = selectedIds.has(playerId) ? "checked" : "";
    return `
      <label class="presentation-match-squad-option">
        <input
          type="checkbox"
          value="${escapeHtml(playerId)}"
          data-presentation-match-squad-player="${escapeHtml(playerId)}"
          data-presentation-info-id="${escapeHtml(infoId)}"
          ${checked}
        />
        ${renderLineupAvatar(player, "presentation-match-squad-option-photo")}
        <span>
          <strong>${escapeHtml(getLineupPlayerLabel(player))}</strong>
          <small>${escapeHtml(player.position || player.name || "Player")}</small>
        </span>
      </label>
    `;
  }

  function renderMatchSquadSlide(model = {}, slide = {}) {
    const infoSlide = slide.infoSlide || {};
    const squad = slide.matchSquad || {};
    const selectedPlayers = Array.isArray(squad.selectedPlayers) ? squad.selectedPlayers : [];
    const playerOptions = Array.isArray(squad.playerOptions) ? squad.playerOptions : [];
    const selectedIds = new Set(Array.isArray(squad.selectedIds) ? squad.selectedIds : []);
    const accentColor = normalizeHexColor(slide.accentColor || infoSlide.accentColor, "#22c55e");
    const frameSlide = {
      id: slide.id,
      type: "match-squad",
      label: slide.label,
      accentColor,
      style: slide.style,
      shapes: slide.shapes,
      textBoxes: slide.textBoxes,
      textFieldStyles: slide.textFieldStyles,
      textOverrides: slide.textOverrides,
    };
    const selectorHtml = model.presenting
      ? ""
      : `
        <aside class="presentation-match-squad-selector" aria-label="Choose match squad players">
          <span>Squad Pool</span>
          <div class="presentation-match-squad-option-list">
            ${playerOptions
              .map((player) => renderMatchSquadOption(player, selectedIds, infoSlide.id))
              .join("")}
          </div>
        </aside>
      `;
    return renderSlideFrame(
      model,
      frameSlide,
      `
        <section class="presentation-match-squad-layout${model.presenting ? " is-play-mode" : ""}">
          <div class="presentation-section-heading">
            ${renderEditableElement(model, frameSlide, "matchSquad.title", infoSlide.title || "Match Squad", "h2", "", { label: "Match squad title" })}
            <p>${escapeHtml(selectedPlayers.length ? `${selectedPlayers.length} players selected` : "Select the match squad")}</p>
          </div>
          <div class="presentation-match-squad-main">
            <div class="presentation-match-squad-grid">
              ${
                selectedPlayers.length
                  ? selectedPlayers.map((player, index) => renderMatchSquadPlayerCard(player, index)).join("")
                  : `<p class="presentation-match-squad-empty">Select players from the squad list.</p>`
              }
            </div>
            ${selectorHtml}
          </div>
        </section>
      `
    );
  }

  function renderLineupPlayerSelect(model = {}, slide = {}, slot = {}, lineup = {}) {
    if (model.presenting) {
      return "";
    }
    const selectedIds = new Set((Array.isArray(lineup.slots) ? lineup.slots : []).map((item) => item.playerId).filter(Boolean));
    const currentPlayerId = String(slot.playerId || "").trim();
    return `
      <select
        class="presentation-lineup-player-select"
        data-presentation-lineup-player
        data-presentation-info-id="${escapeHtml(slide.infoSlide?.id || "")}"
        data-presentation-lineup-slot="${escapeHtml(slot.id)}"
        aria-label="${escapeHtml(`Select ${slot.label}`)}"
      >
        <option value="">${escapeHtml(slot.label || "Position")}</option>
        ${(Array.isArray(lineup.playerOptions) ? lineup.playerOptions : [])
          .map((player) => {
            const playerId = String(player.id || "").trim();
            const selected = playerId === currentPlayerId ? "selected" : "";
            const disabled = selectedIds.has(playerId) && playerId !== currentPlayerId ? "disabled" : "";
            return `<option value="${escapeHtml(playerId)}" ${selected} ${disabled}>${escapeHtml(getLineupPlayerLabel(player))}</option>`;
          })
          .join("")}
      </select>
    `;
  }

  function renderLineupSlot(model = {}, slide = {}, slot = {}, lineup = {}) {
    const player = slot.player || null;
    return `
      <article
        class="presentation-lineup-slot${player ? " has-player" : ""}"
        style="--slot-x: ${escapeHtml(String(slot.x || 50))}%; --slot-y: ${escapeHtml(String(slot.y || 50))}%;"
      >
        ${player ? renderLineupAvatar(player) : `<span class="presentation-lineup-avatar is-empty">${escapeHtml(slot.label || "")}</span>`}
        <strong>${escapeHtml(player ? getLineupPlayerLabel(player) : slot.label || "Position")}</strong>
        ${renderLineupPlayerSelect(model, slide, slot, lineup)}
      </article>
    `;
  }

  function renderLineupSlide(model = {}, slide = {}) {
    const infoSlide = slide.infoSlide || {};
    const lineup = slide.lineup || {};
    const slots = Array.isArray(lineup.slots) ? lineup.slots : [];
    const accentColor = normalizeHexColor(slide.accentColor || infoSlide.accentColor, "#22c55e");
    const frameSlide = {
      id: slide.id,
      type: "lineup",
      label: slide.label,
      accentColor,
      style: slide.style,
      shapes: slide.shapes,
      textBoxes: slide.textBoxes,
      textFieldStyles: slide.textFieldStyles,
      textOverrides: slide.textOverrides,
    };
    const controlsHtml = model.presenting
      ? ""
      : `
        <div class="presentation-lineup-controls">
          <label>
            <span>Formation</span>
            <select data-presentation-lineup-formation data-presentation-info-id="${escapeHtml(infoSlide.id)}" aria-label="Choose formation">
              ${(Array.isArray(lineup.formationOptions) ? lineup.formationOptions : [])
                .map(
                  (option) =>
                    `<option value="${escapeHtml(option.id)}" ${option.id === lineup.formationId ? "selected" : ""}>${escapeHtml(option.label)}</option>`
                )
                .join("")}
            </select>
          </label>
        </div>
      `;
    return renderSlideFrame(
      model,
      frameSlide,
      `
        <section class="presentation-lineup-layout">
          <div class="presentation-lineup-heading">
            <div class="presentation-section-heading">
              ${renderEditableElement(model, frameSlide, "lineup.title", infoSlide.title || "Starting XI", "h2", "", { label: "Starting XI title" })}
            </div>
            ${controlsHtml}
          </div>
          <div class="presentation-lineup-pitch" aria-label="Starting eleven formation">
            <span class="presentation-lineup-field-lines" aria-hidden="true"></span>
            <span class="presentation-lineup-penalty-arc" aria-hidden="true"></span>
            <span class="presentation-lineup-penalty-spot" aria-hidden="true"></span>
            <span class="presentation-lineup-goal" aria-hidden="true"></span>
            ${slots.map((slot) => renderLineupSlot(model, slide, slot, lineup)).join("")}
          </div>
        </section>
      `
    );
  }

  function renderOverviewMetric(model = {}, slide = {}, label, value, className = "", keyPrefix = "") {
    return `
      <div class="presentation-overview-metric ${escapeHtml(className)}">
        ${renderEditableElement(model, slide, `${keyPrefix}.label`, label, "span", "", { label })}
        ${renderEditableElement(model, slide, `${keyPrefix}.value`, value || "Not set", "strong", "", { label: `${label} value` })}
      </div>
    `;
  }

  function renderOverviewVideoMetric(model = {}, slide = {}, videoValue = "", notesValue = "") {
    const notes = String(notesValue || "").trim();
    return `
      <div class="presentation-overview-metric is-video">
        ${renderEditableElement(model, slide, "overview.video.label", "Video", "span", "", { label: "Video label" })}
        ${renderEditableElement(model, slide, "overview.video.value", videoValue || "None", "strong", "", { label: "Video value" })}
        ${notes ? renderEditableTextArea(model, slide, "overview.video.notes", notes, "class=\"presentation-overview-video-notes\"", { label: "Video notes" }) : ""}
      </div>
    `;
  }

  function renderPitchSizeMetric(model = {}, slide = {}, value = "") {
    const label = String(value || "").trim() || "Not set";
    const tone = getPitchTone(label);
    return `
      <div class="presentation-overview-metric is-pitch is-pitch-size">
        ${renderEditableElement(model, slide, "overview.pitch.label", "Pitch", "span", "", { label: "Pitch label" })}
        <strong>
          <span class="periodization-pitch-icon is-${escapeHtml(tone)}" aria-hidden="true">
            <span class="periodization-pitch-lines"></span>
            <span class="periodization-pitch-highlight"></span>
          </span>
          ${renderEditableElement(model, slide, "overview.pitch.value", label, "span", "class=\"presentation-pitch-text\"", { label: "Pitch value" })}
        </strong>
      </div>
    `;
  }

  function renderOverviewLoadMetric(model = {}, slide = {}, value = "") {
    const load = getLoadMeterModel(value);
    return `
      <div
        class="presentation-overview-metric is-load is-${escapeHtml(load.tone)} is-level-${escapeHtml(String(load.level))}"
        style="--presentation-load-angle: ${escapeHtml(String(load.angle))}deg; --presentation-load-color: ${escapeHtml(load.color)}; --presentation-load-soft: ${escapeHtml(load.soft)}; --presentation-load-glow: ${escapeHtml(load.glow)};"
      >
        ${renderEditableElement(model, slide, "overview.load.label", "Planned Load", "span", "", { label: "Planned load label" })}
        <div class="presentation-load-meter" aria-label="${escapeHtml(`Physical load: ${load.label}`)}">
          <span class="presentation-load-gauge" aria-hidden="true">
            <span class="presentation-load-needle"></span>
            <span class="presentation-load-pin"></span>
          </span>
        </div>
      </div>
    `;
  }

  function normalizePhaseLabel(value = "") {
    return String(value || "").trim().toLowerCase();
  }

  function getOverviewPhaseParts(value = "") {
    const values = Array.isArray(value) ? value : String(value || "").split(/\s*(?:\/|,|;|\n)\s*/);
    return values.map((part) => String(part || "").trim()).filter(Boolean);
  }

  function getPhaseLibraryEntryForSubPhase(subPhase = "") {
    const normalizedSubPhase = normalizePhaseLabel(subPhase);
    if (!normalizedSubPhase) {
      return null;
    }
    return Object.entries(periodizationPhaseLibrary).find(([phase, subPhases]) => {
      if (normalizePhaseLabel(phase) === normalizedSubPhase) {
        return true;
      }
      return subPhases.some((item) => normalizePhaseLabel(item) === normalizedSubPhase);
    }) || null;
  }

  function buildOverviewPhaseGroups(phaseValue = "", subPhaseValue = "") {
    const explicitPhases = getOverviewPhaseParts(phaseValue);
    const subPhases = getOverviewPhaseParts(subPhaseValue);
    const inferredPhases = subPhases
      .map((subPhase) => getPhaseLibraryEntryForSubPhase(subPhase)?.[0] || "")
      .filter(Boolean)
      .filter((phase, index, phases) => phases.findIndex((item) => normalizePhaseLabel(item) === normalizePhaseLabel(phase)) === index);
    const phases = explicitPhases.length ? explicitPhases : inferredPhases;
    const groups = (phases.length ? phases : ["Not set"]).map((phase) => ({
      phase,
      subPhases: [],
      key: normalizePhaseLabel(phase),
    }));
    const groupByKey = new Map(groups.map((group) => [group.key, group]));
    const leftovers = [];

    subPhases.forEach((subPhase) => {
      const entry = getPhaseLibraryEntryForSubPhase(subPhase);
      const phase = entry?.[0] || "";
      const phaseKey = normalizePhaseLabel(phase);
      const subPhaseKey = normalizePhaseLabel(subPhase);
      if (phaseKey && phaseKey === subPhaseKey) {
        return;
      }
      if (phaseKey && groupByKey.has(phaseKey)) {
        groupByKey.get(phaseKey).subPhases.push(subPhase);
        return;
      }
      if (groups.length === 1 && groups[0].phase !== "Not set") {
        groups[0].subPhases.push(subPhase);
        return;
      }
      leftovers.push(subPhase);
    });

    if (leftovers.length) {
      groups.push({
        phase: "Additional Focus",
        subPhases: leftovers,
        key: "additional-focus",
      });
    }
    return groups;
  }

  function renderOverviewPhaseSummary(model = {}, slide = {}, phaseValue = "", subPhaseValue = "") {
    const phaseGroups = buildOverviewPhaseGroups(phaseValue, subPhaseValue);
    return `
      <article class="presentation-day-overview">
        ${renderEditableElement(model, slide, "overview.phase.label", "Phase", "span", "", { label: "Phase label" })}
        <div class="presentation-day-phase-list">
          ${phaseGroups
            .map((group, index) => {
              const fieldKey = getStableTextKey(group.phase, `phase-${index + 1}`);
              const subPhaseText = group.subPhases.join(" / ");
              const phaseField = index === 0 ? "overview.phase.value" : `overview.phase.${fieldKey}.value`;
              const subPhaseField = index === 0 ? "overview.subPhase.value" : `overview.phase.${fieldKey}.subPhase`;
              return `
                <div class="presentation-day-phase-item">
                  ${renderEditableElement(model, slide, phaseField, group.phase, "strong", "class=\"presentation-day-phase-value\"", { label: "Phase value" })}
                  ${
                    subPhaseText
                      ? `<em class="presentation-day-subphase">(${renderEditableElement(model, slide, subPhaseField, subPhaseText, "span", "", { label: "Sub phase value" })})</em>`
                      : ""
                  }
                </div>
              `;
            })
            .join("")}
        </div>
      </article>
    `;
  }

  function renderRecommendationAvatar(player = {}) {
    const photoUrl = String(player.photoUrl || player.avatarUrl || player.imageUrl || "").trim();
    const label = String(player.name || "Player").trim();
    if (photoUrl) {
      return `
        <span class="presentation-medical-avatar has-photo">
          <img src="${escapeHtml(photoUrl)}" alt="${escapeHtml(label)}" loading="lazy" />
        </span>
      `;
    }
    return `<span class="presentation-medical-avatar">${escapeHtml(getInitials(label).toUpperCase())}</span>`;
  }

  function renderMedicalRecommendation(model = {}, slide = {}, item = {}, index = 0) {
    const player = item.player || {};
    const participation = item.participation;
    const participationLabel = getParticipationLabel(participation);
    const tone = getParticipationTone(participation);
    const key = getStableTextKey(player.id || player.name, `player-${index + 1}`);
    const participationKey = getStableTextKey(participationLabel, "participation");
    return `
      <article class="presentation-medical-player is-${escapeHtml(tone)}">
        ${renderRecommendationAvatar(player)}
        ${renderEditableElement(model, slide, `medical.${key}.name`, player.name || "Player", "strong", "", { label: "Player name" })}
        ${renderEditableElement(model, slide, `medical.${key}.participation.${participationKey}`, participationLabel, "span", "", { label: "Player participation" })}
      </article>
    `;
  }

  function renderMedicalRecommendationsPanel(model = {}, slide = {}, items = []) {
    return `
      <section class="presentation-medical-overview" aria-label="Medical participation recommendations">
        <div class="presentation-medical-list">
          ${
            items.length
              ? items.map((item, index) => renderMedicalRecommendation(model, slide, item, index)).join("")
              : renderEditableElement(
                  model,
                  slide,
                  "medical.empty",
                  "No medical recommendations for this day.",
                  "p",
                  "",
                  { label: "Empty medical recommendation text" }
                )
          }
        </div>
      </section>
    `;
  }

  function renderOverviewSlide(model = {}, slide = {}) {
    const periodization = model.periodization || {};
    const overviewSlide = slide.id ? slide : model.slides?.find((item) => item.type === "overview") || {};
    const frameSlide = {
      id: overviewSlide.id || "overview",
      type: "overview",
      label: "Overview",
      accentColor: overviewSlide.accentColor || "#22c55e",
      style: overviewSlide.style,
      shapes: overviewSlide.shapes,
      textBoxes: overviewSlide.textBoxes,
      textFieldStyles: overviewSlide.textFieldStyles,
      textOverrides: overviewSlide.textOverrides,
    };
    const matchPhases = (Array.isArray(periodization.matchPhases) ? periodization.matchPhases : []).filter(Boolean);
    const phaseValue = matchPhases.length ? matchPhases : periodization.seasonPhase || periodization.sessionType;
    const subPhaseValue = (Array.isArray(periodization.subPhases) ? periodization.subPhases : []).filter(Boolean);
    return renderSlideFrame(
      model,
      frameSlide,
      `
        <section class="presentation-overview">
          <div class="presentation-section-heading">
            ${renderEditableElement(model, frameSlide, "overview.heading", "Training Overview", "span", "", { label: "Overview heading" })}
          </div>
          <div class="presentation-overview-grid">
            ${renderOverviewLoadMetric(model, frameSlide, model.loadLabel)}
            ${renderPitchSizeMetric(model, frameSlide, periodization.pitchSize || model.pitchLabel)}
            ${renderOverviewMetric(model, frameSlide, "Match Day", periodization.matchDay || "Not set", "is-match-day", "overview.matchDay")}
            ${renderOverviewVideoMetric(model, frameSlide, periodization.preTrainingVideo || "None", periodization.preTrainingNotes || "")}
            ${renderOverviewPhaseSummary(model, frameSlide, phaseValue, subPhaseValue)}
            <div class="presentation-block-flow">
              ${model.blocks
                .map((block, index) => {
                  const blockKey = getStableTextKey(block.id || block.label || block.title, `block-${index + 1}`);
                  return `
                    <article>
                      ${renderEditableElement(model, frameSlide, `overview.${blockKey}.label`, block.label || `Block ${index + 1}`, "span", "", { label: "Overview block label" })}
                      ${renderEditableElement(model, frameSlide, `overview.${blockKey}.title`, block.title || "Exercise", "strong", "", { label: "Overview block title" })}
                    </article>
                  `;
                })
                .join("") ||
                `<article>
                  ${renderEditableElement(model, frameSlide, "overview.empty.label", "Plan", "span", "", { label: "Empty plan label" })}
                  ${renderEditableElement(model, frameSlide, "overview.empty.title", "No blocks planned", "strong", "", { label: "Empty plan title" })}
                  ${renderEditableElement(model, frameSlide, "overview.empty.meta", "Open Session Planner to build the training.", "small", "", { label: "Empty plan meta" })}
                </article>`}
            </div>
            ${renderMedicalRecommendationsPanel(model, frameSlide, model.medicalRecommendations || [])}
          </div>
        </section>
      `
    );
  }

  function renderPlayerChip(model = {}, slide = {}, item = {}, options = {}, index = 0) {
    const player = item.player || {};
    const participation = Number(item.participation);
    const color = normalizeHexColor(item.color, "");
    const playerKey = getStableTextKey(player.id || player.name, `player-${index + 1}`);
    const colorStyle = color
      ? `style="--presentation-player-color: ${escapeHtml(color)}; --presentation-player-text: ${escapeHtml(getTextColor(color))};"`
      : "";
    const meta = [
      player.position || player.role || player.playerBoardRoleLabel || "",
      item.statusLabel || "",
    ].filter(Boolean);
    return `
      <span class="presentation-player-chip is-${escapeHtml(getParticipationTone(participation))}${options.muted ? " is-muted" : ""}${color ? " has-color" : ""}" ${colorStyle}>
        ${renderEditableElement(model, slide, `${options.keyPrefix || "players"}.${playerKey}.name`, player.name || "Player", "strong", "", { label: "Player name" })}
        ${renderEditableElement(model, slide, `${options.keyPrefix || "players"}.${playerKey}.meta`, meta.join(" / "), "small", "", { label: "Player status" })}
      </span>
    `;
  }

  function renderPlayerPanel(model = {}, slide = {}, title, items = [], emptyLabel = "", options = {}) {
    const playerCountLabel = items.length === 1 ? "Player" : "Players";
    const countText = options.inlineCount ? `(${items.length} ${playerCountLabel})` : String(items.length);
    return `
      <section class="presentation-player-panel ${options.muted ? "is-muted" : ""}">
        <header class="${options.inlineCount ? "is-inline-count" : ""}">
          ${renderEditableElement(model, slide, `${options.keyPrefix || "players"}.title`, title, "span", "", { label: "Player panel title" })}
          <strong>${escapeHtml(countText)}</strong>
        </header>
        <div class="presentation-player-list">
          ${
            items.length
              ? items.map((item, index) => renderPlayerChip(model, slide, item, options, index)).join("")
              : renderEditableElement(model, slide, `${options.keyPrefix || "players"}.empty`, emptyLabel, "p", "", { label: "Empty player panel text" })
          }
        </div>
      </section>
    `;
  }

  function renderTextBlock(model = {}, slide = {}, title, value, keyPrefix = "") {
    const bodyKey = `${keyPrefix}.body`;
    const body = getSlideText(slide, bodyKey, value).replace(/\r\n?/g, "\n").trim();
    if (!body) {
      return "";
    }
    return `
      <section class="presentation-detail-block">
        ${renderEditableElement(model, slide, `${keyPrefix}.title`, title, "span", "", { label: `${title} title` })}
        ${renderEditableTextArea(model, slide, bodyKey, value, "class=\"presentation-detail-text\"", { label: `${title} text` })}
      </section>
    `;
  }

  function getBlockPhaseParts(value = "") {
    const values = Array.isArray(value) ? value : String(value || "").split(/[,;\n]+/);
    return values.map((part) => String(part || "").trim()).filter(Boolean);
  }

  function formatBlockPhaseLine(phaseValue = "", subPhaseValue = "") {
    const phases = getBlockPhaseParts(phaseValue);
    const subPhases = getBlockPhaseParts(subPhaseValue);
    const formatPhaseWithSubPhases = (phase, pairedSubPhases = []) => {
      const phaseKey = normalizePhaseLabel(phase);
      const uniqueSubPhases = pairedSubPhases.filter((subPhase) => normalizePhaseLabel(subPhase) !== phaseKey);
      const subPhase = uniqueSubPhases.join(", ");
      return subPhase ? `${phase} (${subPhase})` : phase;
    };
    if (!phases.length) {
      return subPhases.join(", ");
    }
    const groups = phases.map((phase) => ({
      phase,
      key: normalizePhaseLabel(phase),
      subPhases: [],
    }));
    const groupByKey = new Map(groups.map((group) => [group.key, group]));
    const leftovers = [];
    subPhases.forEach((subPhase) => {
      const entry = getPhaseLibraryEntryForSubPhase(subPhase);
      const phaseKey = normalizePhaseLabel(entry?.[0] || "");
      if (phaseKey && groupByKey.has(phaseKey)) {
        groupByKey.get(phaseKey).subPhases.push(subPhase);
        return;
      }
      if (groups.length === 1) {
        groups[0].subPhases.push(subPhase);
        return;
      }
      leftovers.push(subPhase);
    });
    leftovers.forEach((subPhase) => {
      const alreadyUsed = groups.some((group) =>
        normalizePhaseLabel(group.phase) === normalizePhaseLabel(subPhase) ||
        group.subPhases.some((item) => normalizePhaseLabel(item) === normalizePhaseLabel(subPhase))
      );
      if (!alreadyUsed) {
        groups[groups.length - 1]?.subPhases.push(subPhase);
      }
    });
    return groups
      .map((group) => formatPhaseWithSubPhases(group.phase, group.subPhases))
      .join("\n");
  }

  function renderBlockSlide(model = {}, slide = {}) {
    const block = slide.block || {};
    const playerSummary = slide.playerSummary || {};
    const visual = renderExerciseVisual(block, { large: true });
    const phase = formatBlockPhaseLine(block.phase, block.subPhase);
    const blockLabel = [
      block.label || slide.label || "Block",
    ]
      .filter(Boolean)
      .join(" ");
    const frameSlide = {
      id: slide.id || block.id || "block",
      type: "block",
      label: slide.label,
      accentColor: slide.accentColor || "#f59e0b",
      style: slide.style,
      shapes: slide.shapes,
      textBoxes: slide.textBoxes,
      textFieldStyles: slide.textFieldStyles,
      textOverrides: slide.textOverrides,
    };
    const phaseText = getSlideText(frameSlide, "block.phase", phase);
    return renderSlideFrame(
      model,
      frameSlide,
      `
        <section class="presentation-block-layout">
          <div class="presentation-block-visual">
            ${visual || `<div class="presentation-empty-visual">No visual</div>`}
          </div>
          <div class="presentation-block-copy">
            <div class="presentation-section-heading">
              ${renderEditableElement(model, frameSlide, "block.label", blockLabel, "span", "", { label: "Block label" })}
              ${renderEditableElement(model, frameSlide, "block.title", block.title || "Exercise", "h2", "", { label: "Block title" })}
              ${phaseText ? renderEditableElement(model, frameSlide, "block.phase", phaseText, "p", "", { label: "Block phase", multiline: true }) : ""}
            </div>
            <div class="presentation-block-details">
              ${renderTextBlock(model, frameSlide, "Objective", block.objective, "detail.objective")}
              ${renderTextBlock(model, frameSlide, "Organization", block.organization, "detail.organization")}
              ${renderTextBlock(model, frameSlide, "Team Principles & MG Principles", block.principles, "detail.principles")}
            </div>
          </div>
          <div class="presentation-block-players">
            ${renderPlayerPanel(model, frameSlide, "Not in this block", playerSummary.nonParticipants || [], "Everyone available is included.", {
              keyPrefix: "players.notInBlock",
              inlineCount: true,
              muted: true,
            })}
          </div>
        </section>
      `
    );
  }

  function renderActiveSlide(model = {}) {
    const slide = model.slides[model.slideIndex] || model.slides[0];
    if (!slide) {
      return "";
    }
    if (slide.type === "cover") return renderCoverSlide(model, slide);
    if (slide.type === "info") return renderInfoSlide(model, slide);
    if (slide.type === "match-squad") return renderMatchSquadSlide(model, slide);
    if (slide.type === "lineup") return renderLineupSlide(model, slide);
    if (slide.type === "overview") return renderOverviewSlide(model, slide);
    if (slide.type === "block") return renderBlockSlide(model, slide);
    return renderSlideFrame(model, slide, "");
  }

  function render(model = {}) {
    return `
      <section class="presentation-mode-shell${model.presenting ? " is-presenting" : ""}${model.textToolbarOpen ? " is-text-toolbar-open" : ""}${model.shapeDrawTool ? " is-shape-tool-active" : ""}" data-presentation-mode-shell>
        ${renderControlBar(model)}
        <div class="presentation-stage" data-presentation-stage>
          ${renderActiveSlide(model)}
        </div>
        ${renderContextMenu(model)}
        ${renderFooter(model)}
      </section>
    `;
  }

  return {
    render,
    renderActiveSlide,
    renderBlockSlide,
    renderControlBar,
    renderCoverSlide,
    renderInfoSlide,
    renderLineupSlide,
    renderMatchSquadSlide,
    renderOverviewSlide,
    renderTextToolbar,
  };
}
