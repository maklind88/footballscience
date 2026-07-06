const platformConfirmStylesheetId = "platform-confirm-dialog-styles";
let activeConfirmDialog = null;

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeTone(tone = "default") {
  return tone === "danger" || tone === "warning" ? tone : "default";
}

function normalizeConfirmConfig(input = {}, options = {}) {
  const source = typeof input === "string" ? { message: input, ...options } : { ...input, ...options };
  const tone = normalizeTone(source.tone);
  return {
    cancelLabel: source.cancelLabel || "Cancel",
    confirmLabel: source.confirmLabel || (tone === "danger" ? "Delete" : "Confirm"),
    eyebrow: source.eyebrow || "Confirmation",
    message: source.message || "This action cannot be undone.",
    title: source.title || "Are you sure?",
    tone,
    win: source.win || options.win || globalThis.window || globalThis,
  };
}

function ensurePlatformConfirmDialogStyles(win = globalThis.window || globalThis) {
  const doc = win?.document || globalThis.document;
  if (!doc?.head || doc.getElementById(platformConfirmStylesheetId)) return;
  const link = doc.createElement("link");
  link.id = platformConfirmStylesheetId;
  link.rel = "stylesheet";
  const version = win?.__assetVersion || Date.now();
  link.href = `src/core/platform-confirm-dialog.css?v=${version}`;
  doc.head.appendChild(link);
}

function fallbackConfirm(config) {
  if (typeof config.win?.confirm === "function") {
    return Promise.resolve(Boolean(config.win.confirm(config.message)));
  }
  return Promise.resolve(true);
}

function messageMarkup(message = "") {
  return String(message || "")
    .split(/\n{1,}/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("");
}

function focusableElements(dialog) {
  return Array.from(
    dialog?.querySelectorAll?.(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    ) || []
  ).filter((element) => !element.disabled && element.getAttribute("aria-hidden") !== "true");
}

function createConfirmMarkup(config, ids) {
  return `
    <article
      class="platform-confirm-dialog"
      role="${config.tone === "danger" ? "alertdialog" : "dialog"}"
      aria-modal="true"
      aria-labelledby="${ids.title}"
      aria-describedby="${ids.message}"
      data-platform-confirm-tone="${escapeHtml(config.tone)}"
      tabindex="-1"
    >
      <button class="platform-confirm-close" type="button" data-platform-confirm-cancel aria-label="Close confirmation">
        <span aria-hidden="true">×</span>
      </button>
      <div class="platform-confirm-identity" aria-hidden="true">
        <span class="platform-confirm-mark">
          <span class="platform-confirm-mark-dot"></span>
          <span class="platform-confirm-mark-stem"></span>
        </span>
      </div>
      <div class="platform-confirm-copy">
        <span class="platform-confirm-eyebrow">${escapeHtml(config.eyebrow)}</span>
        <h2 id="${ids.title}">${escapeHtml(config.title)}</h2>
        <div id="${ids.message}" class="platform-confirm-message">
          ${messageMarkup(config.message)}
        </div>
      </div>
      <div class="platform-confirm-actions">
        <button class="platform-confirm-button is-secondary" type="button" data-platform-confirm-cancel>
          ${escapeHtml(config.cancelLabel)}
        </button>
        <button class="platform-confirm-button is-primary" type="button" data-platform-confirm-ok>
          ${escapeHtml(config.confirmLabel)}
        </button>
      </div>
    </article>
  `;
}

export function confirmPlatformAction(input = {}, options = {}) {
  const config = normalizeConfirmConfig(input, options);
  const doc = config.win?.document || globalThis.document;
  if (!doc?.body) return fallbackConfirm(config);
  ensurePlatformConfirmDialogStyles(config.win);

  if (activeConfirmDialog?.close) {
    activeConfirmDialog.close(false);
  }

  const previousFocus = doc.activeElement;
  const uid = `platform-confirm-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const layer = doc.createElement("section");
  layer.className = "platform-confirm-layer";
  layer.dataset.platformConfirmLayer = "true";
  layer.innerHTML = createConfirmMarkup(config, {
    title: `${uid}-title`,
    message: `${uid}-message`,
  });

  return new Promise((resolve) => {
    const dialog = layer.querySelector(".platform-confirm-dialog");
    let settled = false;

    const close = (confirmed) => {
      if (settled) return;
      settled = true;
      activeConfirmDialog = null;
      layer.classList.remove("is-open");
      config.win?.setTimeout?.(() => layer.remove(), 140);
      if (previousFocus && typeof previousFocus.focus === "function") {
        config.win?.setTimeout?.(() => previousFocus.focus({ preventScroll: true }), 0);
      }
      resolve(Boolean(confirmed));
    };

    activeConfirmDialog = { close };

    layer.addEventListener("click", (event) => {
      if (event.target === layer || event.target.closest?.("[data-platform-confirm-cancel]")) {
        close(false);
        return;
      }
      if (event.target.closest?.("[data-platform-confirm-ok]")) {
        close(true);
      }
    });

    layer.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = focusableElements(dialog);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && doc.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && doc.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });

    doc.body.appendChild(layer);
    config.win?.requestAnimationFrame?.(() => layer.classList.add("is-open"));
    const primary = layer.querySelector("[data-platform-confirm-ok]");
    (primary || dialog)?.focus?.({ preventScroll: true });
  });
}
