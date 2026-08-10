import {
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

function getTextColor(backgroundColor = "") {
  const color = normalizeHexColor(backgroundColor, "#ffffff");
  const red = parseInt(color.slice(1, 3), 16) / 255;
  const green = parseInt(color.slice(3, 5), 16) / 255;
  const blue = parseInt(color.slice(5, 7), 16) / 255;
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue > 0.62 ? "#111827" : "#ffffff";
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
  const value = Number(participation);
  if (!Number.isFinite(value)) return "unset";
  if (value <= 10) return "low";
  if (value <= 25) return "rehab";
  if (value <= 50) return "controlled";
  if (value < 100) return "modified";
  return "full";
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

  function getEditableAttributes(model = {}, slide = {}, field = "", options = {}) {
    if (model.presenting || !slide.id || !field) {
      return "";
    }
    return [
      `data-presentation-slide-id="${escapeHtml(slide.id)}"`,
      `data-presentation-text-field="${escapeHtml(field)}"`,
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
    const style = { ...fallback, ...getTextFieldStyle(slide, field) };
    const declarations = [];
    if (extraStyle) {
      declarations.push(String(extraStyle).replace(/;+$/g, ""));
    }
    if (style.fontSize) {
      declarations.push(`font-size: ${Number((Number(getSafeSize(style.fontSize)) / 16).toFixed(3))}rem`);
    }
    if (style.textColor) {
      declarations.push(`color: ${normalizeHexColor(style.textColor, "#f8fafc")}`);
    }
    return declarations.length ? `style="${escapeHtml(`${declarations.join("; ")};`)}"` : "";
  }

  function mergeAttributes(...attributes) {
    return attributes.filter(Boolean).join(" ");
  }

  function renderEditableElement(model = {}, slide = {}, field = "", fallback = "", tagName = "span", attributes = "", options = {}) {
    const editableAttributes = getEditableAttributes(model, slide, field, options);
    const value = getSlideText(slide, field, fallback);
    const styleAttribute = getTextFieldStyleAttribute(slide, field, options.style || {}, options.extraStyle || "");
    const mergedAttributes = mergeAttributes(attributes, styleAttribute, editableAttributes);
    return `<${tagName}${mergedAttributes ? ` ${mergedAttributes}` : ""}>${escapeHtml(value)}</${tagName}>`;
  }

  function renderEditableTextArea(model = {}, slide = {}, field = "", fallback = "", attributes = "", options = {}) {
    const value = getSlideText(slide, field, fallback).replace(/\r\n?/g, "\n").trim();
    if (!value) {
      return "";
    }
    const editableAttributes = getEditableAttributes(model, slide, field, { ...options, multiline: true });
    const styleAttribute = getTextFieldStyleAttribute(slide, field, options.style || {}, options.extraStyle || "");
    const mergedAttributes = mergeAttributes(attributes, styleAttribute, editableAttributes);
    return `<div${mergedAttributes ? ` ${mergedAttributes}` : ""}>${escapeHtml(value)}</div>`;
  }

  function renderControlBar(model = {}) {
    const slide = model.slides[model.slideIndex] || model.slides[0];
    const canDeleteSlide = slide?.type === "info";
    return `
      <header class="presentation-control-bar">
        <div class="presentation-control-brand">
          ${renderLogo(model.brand)}
          <div>
            <strong>Presentation Mode</strong>
          </div>
        </div>
        <div class="presentation-pass-controls">
          ${renderThemeControl(slide)}
          <button type="button" class="presentation-tool-button presentation-new-slide-button" data-presentation-add-info>New Slide</button>
          <button type="button" class="presentation-tool-button" data-presentation-delete-slide ${canDeleteSlide ? "" : "disabled"} title="${canDeleteSlide ? "Delete current slide" : "Only custom slides can be deleted"}">Delete Slide</button>
          <label>
            <input type="date" value="${escapeHtml(model.dateValue)}" data-presentation-date-input aria-label="Presentation date" />
          </label>
        </div>
        <div class="presentation-control-actions">
          <button type="button" class="presentation-tool-button is-primary" data-presentation-start title="Start fullscreen" aria-label="Start fullscreen">Start</button>
          <button type="button" class="presentation-icon-button" data-presentation-close title="Close" aria-label="Close presentation">x</button>
        </div>
      </header>
    `;
  }

  function renderToolPopover(label = "", body = "", attributes = "") {
    return `
      <details class="presentation-tool-popover" ${attributes}>
        <summary class="presentation-tool-button">${escapeHtml(label)}</summary>
        <div class="presentation-tool-popover-panel">
          ${body}
        </div>
      </details>
    `;
  }

  function renderSymbolMenu() {
    return renderToolPopover(
      "Symbols",
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
      "data-presentation-symbol-menu"
    );
  }

  function renderShapeMenu() {
    return renderToolPopover(
      "Shapes",
      `
        <div class="presentation-shape-grid" role="group" aria-label="Add shape">
          ${shapeOptions
            .map(
              (shape) => `
                <button
                  type="button"
                  data-presentation-add-shape="${escapeHtml(shape.type)}"
                  title="${escapeHtml(`Add ${shape.label}`)}"
                  aria-label="${escapeHtml(`Add ${shape.label}`)}"
                >
                  <span class="presentation-shape-preview is-${escapeHtml(shape.type)}" aria-hidden="true"></span>
                  <strong>${escapeHtml(shape.label)}</strong>
                </button>
              `
            )
            .join("")}
        </div>
      `,
      "data-presentation-shape-menu"
    );
  }

  function renderTextToolbar(model = {}) {
    const slide = model.slides?.[model.slideIndex] || model.slides?.[0] || {};
    const style = normalizePresentationSlideStyle(slide.style, { accentColor: slide.accentColor || model.accentColor });
    return `
      <section class="presentation-editor-strip presentation-text-toolbar" data-presentation-text-toolbar aria-label="Text tools">
        <button type="button" class="presentation-toolbar-command" data-presentation-add-text-box title="Add text box" aria-label="Add text box">T</button>
        <button type="button" data-presentation-duplicate-info data-presentation-active-info-only disabled>Duplicate</button>
        <label>
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
        <label>
          <span>Text</span>
          <input type="color" value="#f8fafc" data-presentation-active-text-color aria-label="Text color" />
        </label>
        <label>
          <span>Fill</span>
          <input type="color" value="#38bdf8" data-presentation-active-shape-fill aria-label="Shape fill color" disabled />
        </label>
        <label>
          <span>Bg</span>
          <input type="color" value="${escapeHtml(style.backgroundColor)}" data-presentation-style-field="backgroundColor" aria-label="Slide background color" />
        </label>
        <label>
          <span>Accent</span>
          <input type="color" value="${escapeHtml(style.accentColor)}" data-presentation-style-field="accentColor" aria-label="Slide accent color" />
        </label>
        ${renderSymbolMenu()}
        ${renderShapeMenu()}
      </section>
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
                aria-label="${escapeHtml(`Go to ${slide.label}`)}"
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
            const fallbackStyle = {
              fontSize: box.fontSize || "36",
              textColor: box.textColor || "#f8fafc",
            };
            const textBox = renderEditableTextArea(
              model,
              slide,
              field,
              box.text || "Text box",
              `class="presentation-free-text-box" data-presentation-text-box-id="${escapeHtml(box.id)}"`,
              {
                label: "Text box",
                style: fallbackStyle,
              }
            );
            return `
              <div
                class="presentation-free-text-box-shell"
                data-presentation-text-box-shell
                data-presentation-text-box-id="${escapeHtml(box.id)}"
                style="left: ${escapeHtml(box.x)}%; top: ${escapeHtml(box.y)}%; width: ${escapeHtml(box.width)}%;"
              >
                <button
                  type="button"
                  class="presentation-text-box-drag-handle"
                  data-presentation-drag-text-box="${escapeHtml(box.id)}"
                  data-presentation-slide-id="${escapeHtml(slide.id)}"
                  title="Move text box"
                  aria-label="Move text box"
                ></button>
                ${textBox}
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
            return `
              <button
                type="button"
                class="presentation-slide-shape is-${escapeHtml(type)}"
                data-presentation-shape
                data-presentation-shape-id="${escapeHtml(shape.id)}"
                data-presentation-slide-id="${escapeHtml(slide.id)}"
                style="left: ${escapeHtml(shape.x)}%; top: ${escapeHtml(shape.y)}%; width: ${escapeHtml(shape.width)}%; height: ${escapeHtml(shape.height)}%; --presentation-shape-fill: ${escapeHtml(normalizeHexColor(shape.fillColor, "#38bdf8"))}; --presentation-shape-stroke: ${escapeHtml(normalizeHexColor(shape.strokeColor, "#f8fafc"))};"
                aria-label="${escapeHtml(`Move ${type} shape`)}"
                title="Move shape"
              ></button>
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
          class="presentation-info-sheet"
          style="--presentation-info-color: ${escapeHtml(textColor)}; --presentation-info-accent: ${escapeHtml(accentColor)}; ${escapeHtml(getInfoSizeStyle(infoSlide.fontSize))}"
        >
          <input
            class="presentation-info-title"
            value="${escapeHtml(infoSlide.title || "Team Information")}"
            data-presentation-info-field="title"
            data-presentation-info-id="${escapeHtml(infoSlide.id)}"
            data-presentation-slide-id="${escapeHtml(frameSlide.id)}"
            data-presentation-text-field="info.title"
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
            aria-label="Info slide content"
            spellcheck="true"
            ${getTextFieldStyleAttribute(frameSlide, "info.body")}
            ${readonly}
          >${escapeHtml(infoSlide.body || "")}</textarea>
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
    const participation = Number(item.participation);
    const percentage = Number.isFinite(participation) ? `${Math.round(participation)}%` : "-";
    const tone = getParticipationTone(participation);
    const key = getStableTextKey(player.id || player.name, `player-${index + 1}`);
    return `
      <article class="presentation-medical-player is-${escapeHtml(tone)}">
        ${renderRecommendationAvatar(player)}
        ${renderEditableElement(model, slide, `medical.${key}.name`, player.name || "Player", "strong", "", { label: "Player name" })}
        ${renderEditableElement(model, slide, `medical.${key}.percentage`, percentage, "span", "", { label: "Player participation" })}
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
    const phaseLines = [
      ...(Array.isArray(periodization.matchPhases) ? periodization.matchPhases : []),
      ...(Array.isArray(periodization.subPhases) ? periodization.subPhases : []),
    ].filter(Boolean);
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
            ${renderOverviewMetric(model, frameSlide, "Phase", phaseLines.slice(0, 3).join(" / ") || periodization.seasonPhase || periodization.sessionType, "is-phase", "overview.phase")}
            ${renderOverviewMetric(model, frameSlide, "Video", periodization.preTrainingVideo || "None", "is-video", "overview.video")}
            ${renderPitchSizeMetric(model, frameSlide, periodization.pitchSize || model.pitchLabel)}
            ${renderOverviewMetric(model, frameSlide, "Match Day", periodization.matchDay || "Not set", "is-match-day", "overview.matchDay")}
            <div class="presentation-block-flow">
              ${model.blocks
                .map((block, index) => {
                  const blockMeta = [block.pitchSize || "", block.phase || ""].filter(Boolean).join(" / ");
                  const blockKey = getStableTextKey(block.id || block.label || block.title, `block-${index + 1}`);
                  return `
                    <article>
                      ${renderEditableElement(model, frameSlide, `overview.${blockKey}.label`, block.label || `Block ${index + 1}`, "span", "", { label: "Overview block label" })}
                      ${renderEditableElement(model, frameSlide, `overview.${blockKey}.title`, block.title || "Exercise", "strong", "", { label: "Overview block title" })}
                      ${blockMeta ? renderEditableElement(model, frameSlide, `overview.${blockKey}.meta`, blockMeta, "small", "", { label: "Overview block meta" }) : ""}
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
    return `
      <section class="presentation-player-panel ${options.muted ? "is-muted" : ""}">
        <header>
          ${renderEditableElement(model, slide, `${options.keyPrefix || "players"}.title`, title, "span", "", { label: "Player panel title" })}
          <strong>${escapeHtml(String(items.length))}</strong>
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

  function renderBlockSlide(model = {}, slide = {}) {
    const block = slide.block || {};
    const playerSummary = slide.playerSummary || {};
    const visual = renderExerciseVisual(block, { large: true });
    const phase = [block.phase, block.subPhase].filter(Boolean).join(" / ");
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
              ${phaseText ? renderEditableElement(model, frameSlide, "block.phase", phaseText, "p", "", { label: "Block phase" }) : ""}
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
    if (slide.type === "overview") return renderOverviewSlide(model, slide);
    if (slide.type === "block") return renderBlockSlide(model, slide);
    return renderSlideFrame(model, slide, "");
  }

  function render(model = {}) {
    return `
      <section class="presentation-mode-shell${model.presenting ? " is-presenting" : ""}${model.textToolbarOpen ? " is-text-toolbar-open" : ""}" data-presentation-mode-shell>
        ${renderControlBar(model)}
        ${renderTextToolbar(model)}
        <div class="presentation-stage" data-presentation-stage>
          ${renderActiveSlide(model)}
        </div>
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
    renderOverviewSlide,
    renderTextToolbar,
  };
}
