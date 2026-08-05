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

const infoFontSizeOptions = [28, 32, 36, 40, 44, 48, 56, 64, 72, 84, 96, 112];

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
  return String(Math.min(112, Math.max(28, numericSize)));
}

function getInfoSizeStyle(value = "") {
  const size = Number(getSafeSize(value));
  const remValue = `${Number((size / 16).toFixed(3))}rem`;
  return `--presentation-info-body-size: ${remValue};`;
}

function getLineItems(value = "") {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*]\s+/, "").trim())
    .filter(Boolean);
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

  function renderControlBar(model = {}) {
    const slide = model.slides[model.slideIndex] || model.slides[0];
    return `
      <header class="presentation-control-bar">
        <div class="presentation-control-brand">
          ${renderLogo(model.brand)}
          <div>
            <strong>Presentation Mode</strong>
          </div>
        </div>
        <div class="presentation-pass-controls">
          <button type="button" class="presentation-tool-button presentation-new-slide-button" data-presentation-add-info>New Slide</button>
          <label>
            <input type="date" value="${escapeHtml(model.dateValue)}" data-presentation-date-input aria-label="Presentation date" />
          </label>
        </div>
        <div class="presentation-control-actions">
          ${
            slide?.type === "info"
              ? `<button type="button" class="presentation-tool-button" data-presentation-toggle-editor>${model.editorOpen ? "Done" : "Edit"}</button>`
              : ""
          }
          <button type="button" class="presentation-tool-button is-primary" data-presentation-start title="Start fullscreen" aria-label="Start fullscreen">Start</button>
          <button type="button" class="presentation-icon-button" data-presentation-close title="Close" aria-label="Close presentation">x</button>
        </div>
      </header>
    `;
  }

  function renderInfoEditor(model = {}) {
    const slide = model.slides[model.slideIndex] || {};
    if (slide.type !== "info" || !model.editorOpen) {
      return "";
    }
    const infoSlide = slide.infoSlide || {};
    const activeSize = getSafeSize(infoSlide.fontSize);
    const sizeOptions = infoFontSizeOptions.includes(Number(activeSize))
      ? infoFontSizeOptions
      : [...infoFontSizeOptions, Number(activeSize)].sort((first, second) => first - second);
    return `
      <section class="presentation-editor-strip" aria-label="Info slide editor">
        <button type="button" data-presentation-duplicate-info="${escapeHtml(infoSlide.id)}">Duplicate</button>
        <button type="button" data-presentation-delete-info="${escapeHtml(infoSlide.id)}" ${model.infoSlideCount <= 1 ? "disabled" : ""}>Delete</button>
        <label>
          <span>Text size</span>
          <select data-presentation-info-field="fontSize" data-presentation-info-id="${escapeHtml(infoSlide.id)}">
            ${sizeOptions
              .map((size) => {
                const sizeValue = String(size);
                return `<option value="${sizeValue}" ${activeSize === sizeValue ? "selected" : ""}>${escapeHtml(`${sizeValue} pt`)}</option>`;
              })
              .join("")}
          </select>
        </label>
        <label>
          <span>Accent</span>
          <input type="color" value="${escapeHtml(normalizeHexColor(infoSlide.accentColor, "#38bdf8"))}" data-presentation-info-field="accentColor" data-presentation-info-id="${escapeHtml(infoSlide.id)}" />
        </label>
        <label>
          <span>Text</span>
          <input type="color" value="${escapeHtml(normalizeHexColor(infoSlide.textColor, "#f8fafc"))}" data-presentation-info-field="textColor" data-presentation-info-id="${escapeHtml(infoSlide.id)}" />
        </label>
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

  function renderSlideFrame(model = {}, slide = {}, body = "") {
    return `
      <section
        class="presentation-slide presentation-slide-${escapeHtml(slide.type || "blank")}"
        style="--presentation-accent: ${escapeHtml(normalizeHexColor(slide.accentColor || model.accentColor, "#38bdf8"))};"
        aria-label="${escapeHtml(slide.label || "Presentation slide")}"
      >
        ${slide.type === "cover" ? "" : `<div class="presentation-corner-logo">${renderLogo(model.brand)}</div>`}
        <main class="presentation-slide-body">${body}</main>
        <footer class="presentation-slide-footer">
          <span>${escapeHtml(model.teamName)}</span>
          <strong>${escapeHtml(model.dateLabel)}</strong>
        </footer>
      </section>
    `;
  }

  function renderCoverSlide(model = {}) {
    return renderSlideFrame(
      model,
      { type: "cover", label: "Cover", accentColor: model.accentColor },
      `
        <div class="presentation-cover-mark">
          ${renderLogo(model.brand, "hero")}
        </div>
        <div class="presentation-cover-copy">
          <h1>${escapeHtml(model.sessionTitle)}</h1>
          <p>${escapeHtml(model.dateLabel)}</p>
        </div>
      `
    );
  }

  function renderInfoSlide(model = {}, slide = {}) {
    const infoSlide = slide.infoSlide || {};
    const accentColor = normalizeHexColor(infoSlide.accentColor, "#38bdf8");
    const textColor = normalizeHexColor(infoSlide.textColor, "#f8fafc");
    const readonly = model.editorOpen && slide.index === model.slideIndex ? "" : "readonly";
    return renderSlideFrame(
      model,
      {
        type: "info",
        label: slide.label,
        accentColor,
      },
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
            aria-label="Info slide title"
            ${readonly}
          />
          <span class="presentation-info-rule" aria-hidden="true"></span>
          <textarea
            class="presentation-info-body"
            data-presentation-info-field="body"
            data-presentation-info-id="${escapeHtml(infoSlide.id)}"
            aria-label="Info slide content"
            spellcheck="true"
            ${readonly}
          >${escapeHtml(infoSlide.body || "")}</textarea>
        </section>
      `
    );
  }

  function renderOverviewMetric(label, value, className = "") {
    return `
      <div class="presentation-overview-metric ${escapeHtml(className)}">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value || "Not set")}</strong>
      </div>
    `;
  }

  function renderOverviewLoadMetric(value = "") {
    const load = getLoadMeterModel(value);
    return `
      <div
        class="presentation-overview-metric is-load is-${escapeHtml(load.tone)} is-level-${escapeHtml(String(load.level))}"
        style="--presentation-load-angle: ${escapeHtml(String(load.angle))}deg; --presentation-load-color: ${escapeHtml(load.color)}; --presentation-load-soft: ${escapeHtml(load.soft)}; --presentation-load-glow: ${escapeHtml(load.glow)};"
      >
        <span>Load</span>
        <div class="presentation-load-meter" aria-label="${escapeHtml(`Physical load: ${load.label}`)}">
          <span class="presentation-load-gauge" aria-hidden="true">
            <span class="presentation-load-needle"></span>
            <span class="presentation-load-pin"></span>
          </span>
          <span class="presentation-load-copy">
            <strong>${escapeHtml(load.label)}</strong>
            <small>Planned today</small>
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

  function renderMedicalRecommendation(item = {}) {
    const player = item.player || {};
    const participation = Number(item.participation);
    const percentage = Number.isFinite(participation) ? `${Math.round(participation)}%` : "-";
    const tone = getParticipationTone(participation);
    return `
      <article class="presentation-medical-player is-${escapeHtml(tone)}">
        ${renderRecommendationAvatar(player)}
        <strong>${escapeHtml(player.name || "Player")}</strong>
        <span>${escapeHtml(percentage)}</span>
      </article>
    `;
  }

  function renderMedicalRecommendationsPanel(items = []) {
    return `
      <section class="presentation-medical-overview" aria-label="Medical participation recommendations">
        <div class="presentation-medical-list">
          ${
            items.length
              ? items.map((item) => renderMedicalRecommendation(item)).join("")
              : `<p>No medical recommendations for this day.</p>`
          }
        </div>
      </section>
    `;
  }

  function renderOverviewSlide(model = {}) {
    const periodization = model.periodization || {};
    const phaseLines = [
      ...(Array.isArray(periodization.matchPhases) ? periodization.matchPhases : []),
      ...(Array.isArray(periodization.subPhases) ? periodization.subPhases : []),
    ].filter(Boolean);
    return renderSlideFrame(
      model,
      { type: "overview", label: "Overview", accentColor: "#22c55e" },
      `
        <section class="presentation-overview">
          <div class="presentation-section-heading">
            <span>Training Overview</span>
          </div>
          <div class="presentation-overview-grid">
            ${renderOverviewLoadMetric(model.loadLabel)}
            ${renderOverviewMetric("Phase", phaseLines.slice(0, 3).join(" / ") || periodization.seasonPhase || periodization.sessionType, "is-phase")}
            ${renderOverviewMetric("Video", periodization.preTrainingVideo || "None", "is-video")}
            ${renderOverviewMetric("Pitch", periodization.pitchSize || model.pitchLabel, "is-pitch")}
            ${renderOverviewMetric("Match Day", periodization.matchDay || "Not set", "is-match-day")}
            <div class="presentation-block-flow">
              ${model.blocks
                .map(
                  (block, index) => `
                    <article>
                      <span>${escapeHtml(block.label || `Block ${index + 1}`)}</span>
                      <strong>${escapeHtml(block.title || "Exercise")}</strong>
                      <small>${escapeHtml([block.minutes ? `${block.minutes} min` : "", block.pitchSize || "", block.phase || ""].filter(Boolean).join(" / ") || "Ready")}</small>
                    </article>
                  `
                )
                .join("") || `<article><span>Plan</span><strong>No blocks planned</strong><small>Open Session Planner to build the training.</small></article>`}
            </div>
            ${renderOverviewMetric("Main Focus", periodization.mainFocus || model.sessionTheme || "Not set", "is-focus")}
            ${renderMedicalRecommendationsPanel(model.medicalRecommendations || [])}
          </div>
        </section>
      `
    );
  }

  function renderPlayerChip(item = {}, options = {}) {
    const player = item.player || {};
    const participation = Number(item.participation);
    const color = normalizeHexColor(item.color, "");
    const colorStyle = color
      ? `style="--presentation-player-color: ${escapeHtml(color)}; --presentation-player-text: ${escapeHtml(getTextColor(color))};"`
      : "";
    const meta = [
      player.position || player.role || player.playerBoardRoleLabel || "",
      Number.isFinite(participation) ? `${participation}%` : "",
      item.statusLabel || "",
    ].filter(Boolean);
    return `
      <span class="presentation-player-chip is-${escapeHtml(getParticipationTone(participation))}${options.muted ? " is-muted" : ""}${color ? " has-color" : ""}" ${colorStyle}>
        <strong>${escapeHtml(player.name || "Player")}</strong>
        <small>${escapeHtml(meta.join(" / "))}</small>
      </span>
    `;
  }

  function renderPlayerPanel(title, items = [], emptyLabel = "", options = {}) {
    return `
      <section class="presentation-player-panel ${options.muted ? "is-muted" : ""}">
        <header>
          <span>${escapeHtml(title)}</span>
          <strong>${escapeHtml(String(items.length))}</strong>
        </header>
        <div class="presentation-player-list">
          ${items.length ? items.map((item) => renderPlayerChip(item, options)).join("") : `<p>${escapeHtml(emptyLabel)}</p>`}
        </div>
      </section>
    `;
  }

  function renderTextBlock(title, value) {
    const lines = getLineItems(value);
    if (!lines.length) {
      return "";
    }
    return `
      <section class="presentation-detail-block">
        <span>${escapeHtml(title)}</span>
        <ul>${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>
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
      playerSummary.rule?.valueLabel ? `(${playerSummary.rule.valueLabel})` : "",
    ]
      .filter(Boolean)
      .join(" ");
    return renderSlideFrame(
      model,
      { type: "block", label: slide.label, accentColor: "#f59e0b" },
      `
        <section class="presentation-block-layout">
          <div class="presentation-block-visual">
            ${visual || `<div class="presentation-empty-visual">No visual</div>`}
          </div>
          <div class="presentation-block-copy">
            <div class="presentation-section-heading">
              <span>${escapeHtml(blockLabel)}</span>
              <h2>${escapeHtml(block.title || "Exercise")}</h2>
              <p>${escapeHtml([block.minutes ? `${block.minutes} min` : "", block.pitchSize || "", phase].filter(Boolean).join(" / "))}</p>
            </div>
            <div class="presentation-block-details">
              ${renderTextBlock("Objective", block.objective)}
              ${renderTextBlock("Organization", block.organization)}
              ${renderTextBlock("Coaching Points", block.principles)}
            </div>
          </div>
          <div class="presentation-block-players">
            ${renderPlayerPanel("Not in this block", playerSummary.nonParticipants || [], "Everyone available is included.", { muted: true })}
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
    if (slide.type === "cover") return renderCoverSlide(model);
    if (slide.type === "info") return renderInfoSlide(model, slide);
    if (slide.type === "overview") return renderOverviewSlide(model);
    if (slide.type === "block") return renderBlockSlide(model, slide);
    return renderSlideFrame(model, slide, "");
  }

  function render(model = {}) {
    return `
      <section class="presentation-mode-shell${model.presenting ? " is-presenting" : ""}${model.editorOpen ? " is-editor-open" : ""}" data-presentation-mode-shell>
        ${renderControlBar(model)}
        ${renderInfoEditor(model)}
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
  };
}
