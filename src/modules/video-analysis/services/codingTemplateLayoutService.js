export const reservedCodingHotkeys = Object.freeze(new Set([
  " ",
  "space",
  "enter",
  "escape",
  "tab",
  "i",
  "o",
  "p",
  "arrowleft",
  "arrowright",
  "arrowup",
  "arrowdown",
]));

function slug(value = "") {
  return String(value || "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
}

function normalizeGroupName(value = "") {
  const group = String(value || "").trim().replace(/\s+/g, " ");
  return group || "Custom";
}

function normalizeHotkey(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .slice(0, 12);
}

function sortNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function compareByOrderThenIndex(left, right) {
  const leftOrder = sortNumber(left.item.sortOrder, left.index);
  const rightOrder = sortNumber(right.item.sortOrder, right.index);
  return leftOrder === rightOrder ? left.index - right.index : leftOrder - rightOrder;
}

function findTemplateButton(template = {}, buttonId = "") {
  return (template.buttons || []).find((item) => item.id === buttonId) || null;
}

export function groupCodingTemplateButtons(template = {}) {
  const groups = new Map();
  (template.buttons || []).forEach((item, index) => {
    const group = normalizeGroupName(item.group || item.type);
    if (!groups.has(group)) {
      groups.set(group, {
        id: item.groupId || slug(group),
        label: group,
        sortOrder: sortNumber(item.groupSortOrder, groups.size),
        firstIndex: index,
        entries: [],
      });
    }
    const current = groups.get(group);
    current.sortOrder = Math.min(current.sortOrder, sortNumber(item.groupSortOrder, current.sortOrder));
    current.entries.push({ item, index });
  });
  return [...groups.values()]
    .sort((left, right) => left.sortOrder === right.sortOrder ? left.firstIndex - right.firstIndex : left.sortOrder - right.sortOrder)
    .map((group, groupIndex) => ({
      ...group,
      sortOrder: groupIndex,
      buttons: group.entries.sort(compareByOrderThenIndex).map((entry) => entry.item),
    }));
}

export function rebuildTemplateFromGroups(template = {}, groups = []) {
  const buttons = [];
  groups.forEach((group, groupSortOrder) => {
    (group.buttons || []).forEach((item, sortOrder) => {
      buttons.push({
        ...item,
        group: group.label,
        groupId: group.id || slug(group.label),
        groupSortOrder,
        sortOrder,
      });
    });
  });
  return { ...template, buttons };
}

export function moveCodingTemplateGroup(template = {}, sourceGroup = "", targetGroup = "", placement = "before") {
  if (!sourceGroup || !targetGroup || sourceGroup === targetGroup) return template;
  const groups = groupCodingTemplateButtons(template);
  const sourceIndex = groups.findIndex((group) => group.label === sourceGroup);
  const targetIndex = groups.findIndex((group) => group.label === targetGroup);
  if (sourceIndex < 0 || targetIndex < 0) return template;
  const [source] = groups.splice(sourceIndex, 1);
  const nextTargetIndex = groups.findIndex((group) => group.label === targetGroup);
  const insertIndex = placement === "after" ? nextTargetIndex + 1 : nextTargetIndex;
  groups.splice(Math.max(0, insertIndex), 0, source);
  return rebuildTemplateFromGroups(template, groups);
}

export function moveCodingButtonInTemplate(template = {}, buttonId = "", targetGroup = "", beforeButtonId = "") {
  if (!buttonId || !targetGroup) return template;
  const groups = groupCodingTemplateButtons(template);
  let movingButton = null;
  const withoutButton = groups.map((group) => ({
    ...group,
    buttons: group.buttons.filter((buttonItem) => {
      if (buttonItem.id !== buttonId) return true;
      movingButton = buttonItem;
      return false;
    }),
  }));
  if (!movingButton) return template;
  const targetIndex = withoutButton.findIndex((group) => group.label === targetGroup);
  if (targetIndex < 0) return template;
  const targetButtons = [...withoutButton[targetIndex].buttons];
  const beforeIndex = beforeButtonId
    ? targetButtons.findIndex((buttonItem) => buttonItem.id === beforeButtonId)
    : targetButtons.length;
  targetButtons.splice(beforeIndex >= 0 ? beforeIndex : targetButtons.length, 0, movingButton);
  withoutButton[targetIndex] = { ...withoutButton[targetIndex], buttons: targetButtons };
  return rebuildTemplateFromGroups(template, withoutButton);
}

export function moveCodingButtonByStep(template = {}, buttonId = "", direction = 0) {
  const groups = groupCodingTemplateButtons(template);
  const groupIndex = groups.findIndex((group) => group.buttons.some((buttonItem) => buttonItem.id === buttonId));
  if (groupIndex < 0) return template;
  const buttons = [...groups[groupIndex].buttons];
  const index = buttons.findIndex((buttonItem) => buttonItem.id === buttonId);
  const nextIndex = Math.max(0, Math.min(buttons.length - 1, index + Number(direction || 0)));
  if (index === nextIndex) return template;
  const [buttonItem] = buttons.splice(index, 1);
  buttons.splice(nextIndex, 0, buttonItem);
  groups[groupIndex] = { ...groups[groupIndex], buttons };
  return rebuildTemplateFromGroups(template, groups);
}

export function moveCodingGroupByStep(template = {}, groupLabel = "", direction = 0) {
  const groups = groupCodingTemplateButtons(template);
  const index = groups.findIndex((group) => group.label === groupLabel);
  const nextIndex = Math.max(0, Math.min(groups.length - 1, index + Number(direction || 0)));
  if (index < 0 || index === nextIndex) return template;
  const [group] = groups.splice(index, 1);
  groups.splice(nextIndex, 0, group);
  return rebuildTemplateFromGroups(template, groups);
}

export function templateHotkeyIssues(template = {}, buttonId = "") {
  const current = findTemplateButton(template, buttonId);
  const hotkey = normalizeHotkey(current?.hotkey || "");
  if (!current || !hotkey) return [];
  const issues = [];
  if (reservedCodingHotkeys.has(hotkey)) {
    issues.push({ type: "reserved", hotkey, message: `${hotkey === " " ? "Space" : hotkey} is reserved for player shortcuts.` });
  }
  const duplicates = (template.buttons || [])
    .filter((buttonItem) => buttonItem.id !== buttonId && normalizeHotkey(buttonItem.hotkey || "") === hotkey);
  duplicates.forEach((buttonItem) => issues.push({
    type: "duplicate",
    hotkey,
    buttonId: buttonItem.id,
    message: `${hotkey} is already used by ${buttonItem.label || "another button"}.`,
  }));
  return issues;
}
