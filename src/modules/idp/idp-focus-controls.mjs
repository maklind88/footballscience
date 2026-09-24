import { availableFocusLevels, focusLevel, focusLevels, orderedFocuses } from "./domain/idp-focus-selection.mjs";

function escape(value = "") {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

export function renderFocusSelect(detail, selectedId = "", { required = false, attribute = 'name="focusId"', disabled = false } = {}) {
  const focuses = orderedFocuses(detail).filter((focus) => !focus.id.startsWith("legacy-"));
  // An archived link must remain explicit; never silently replace it with another focus.
  const missing = selectedId && !focuses.some((focus) => focus.id === selectedId);
  return `<label class="idp-focus-select"><span>Focus${required ? "" : " (optional)"}</span>
    <select ${attribute} ${required ? "required" : ""} ${disabled ? "disabled" : ""}>
      <option value="" ${!selectedId ? "selected" : ""}>${required ? "Choose focus" : "No focus"}</option>
      ${missing ? `<option value="${escape(selectedId)}" selected>Archived focus (linked)</option>` : ""}
      ${focuses.map((focus) => `<option value="${escape(focus.id)}" ${focus.id === selectedId ? "selected" : ""}>${escape(focus.title)} &middot; ${escape(focusLevels[focusLevel(focus)])}</option>`).join("")}
    </select></label>`;
}

export function renderFocusLevelSelect(detail, focus) {
  const available = availableFocusLevels(detail, focus?.id);
  const selected = focus ? focusLevel(focus) : available[0];
  return `<label><span>Priority</span><select name="focusLevel" required>
    ${Object.entries(focusLevels).map(([value, label]) => `<option value="${value}" ${value === selected ? "selected" : ""} ${available.includes(value) || value === selected ? "" : "disabled"}>${label}</option>`).join("")}
  </select></label>`;
}
