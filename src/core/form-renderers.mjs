const defaultEscapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

export function createPasswordRevealInputRenderer({ escapeHtml = defaultEscapeHtml } = {}) {
  return function renderPasswordRevealInput(name, placeholder, autocomplete = "new-password") {
    return `
    <span class="password-input-shell">
      <input name="${escapeHtml(name)}" type="password" autocomplete="${escapeHtml(autocomplete)}" placeholder="${escapeHtml(placeholder)}" />
      <button
        type="button"
        class="password-visibility-toggle"
        data-toggle-password-visibility
        aria-label="Show password"
        aria-pressed="false"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"></path>
          <circle cx="12" cy="12" r="3"></circle>
        </svg>
      </button>
    </span>
  `;
  };
}
