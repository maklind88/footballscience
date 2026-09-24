export const focusLevels = Object.freeze({ main: "Main focus", secondary: "Supporting focus", personal: "Personal focus" });
export const activeFocusStatuses = Object.freeze(["Active", "Needs Evidence", "Ready For Review", "Reviewed"]);

export function focusLevel(focus = {}) {
  return focus.focusLevel || focus.focus_level || "main";
}

export function orderedFocuses(detail = {}) {
  const levels = Object.keys(focusLevels);
  return [...(detail.focuses || [])].sort((a, b) =>
    Number(activeFocusStatuses.includes(b.status)) - Number(activeFocusStatuses.includes(a.status))
    || levels.indexOf(focusLevel(a)) - levels.indexOf(focusLevel(b))
    || String(a.id).localeCompare(String(b.id))
  );
}

export function selectIdpFocus(detail = {}, selectedId = "") {
  return (detail.focuses || []).find((focus) => focus.id === selectedId) || orderedFocuses(detail)[0] || null;
}

export function availableFocusLevels(detail = {}, currentId = "") {
  const occupied = new Set((detail.focuses || [])
    .filter((focus) => focus.id !== currentId && !String(focus.id).startsWith("legacy-") && activeFocusStatuses.includes(focus.status))
    .map(focusLevel));
  return Object.keys(focusLevels).filter((level) => !occupied.has(level));
}
