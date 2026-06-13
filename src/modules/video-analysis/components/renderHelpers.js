export function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function optionList(options = [], selected = "", getValue = (item) => item, getLabel = (item) => item) {
  return options
    .map((option) => {
      const value = String(getValue(option));
      return `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(getLabel(option))}</option>`;
    })
    .join("");
}
