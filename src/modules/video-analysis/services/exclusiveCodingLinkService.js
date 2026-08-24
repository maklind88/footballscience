function stringValue(value = "") {
  return String(value || "").trim();
}

function canonicalTargetField(button = {}) {
  return stringValue(button.targetField || button.target_field || button.type || button.buttonType);
}

function buttonKeys(button = {}) {
  return [button.id, button.databaseId, button.database_id].map(stringValue).filter(Boolean);
}

function isSameButton(first = {}, second = {}) {
  const secondKeys = new Set(buttonKeys(second));
  return buttonKeys(first).some((key) => secondKeys.has(key));
}

function excludesSelectedButton(link = {}, selected = {}, candidate = {}) {
  const linkType = stringValue(link.linkType || link.link_type).toLowerCase();
  if (linkType !== "excludes") return false;
  const selectedValue = stringValue(selected.value);
  const candidateValue = stringValue(candidate.value);
  const sourceValue = stringValue(link.sourceValue || link.source_value);
  const targetValue = stringValue(link.targetValue || link.target_value);
  return (sourceValue === selectedValue && targetValue === candidateValue)
    || (targetValue === selectedValue && sourceValue === candidateValue);
}

export function exclusiveCodingCompetitors(template = {}, selectedButton = {}) {
  const buttons = Array.isArray(template.buttons) ? template.buttons : [];
  const links = Array.isArray(template.links) ? template.links : [];
  const groupKey = stringValue(
    selectedButton.exclusiveGroupKey || selectedButton.exclusive_group_key,
  );
  return buttons.filter((candidate) => {
    if (isSameButton(candidate, selectedButton)) return false;
    const candidateGroupKey = stringValue(candidate.exclusiveGroupKey || candidate.exclusive_group_key);
    if (groupKey && candidateGroupKey === groupKey) return true;
    return links.some((link) => excludesSelectedButton(link, selectedButton, candidate));
  });
}

function removeTag(tags = "", value = "") {
  const removed = stringValue(value).toLowerCase();
  return String(tags || "")
    .split(",")
    .map(stringValue)
    .filter(Boolean)
    .filter((tag) => tag.toLowerCase() !== removed)
    .join(", ");
}

export function clearExclusiveCodingValues(draft = {}, template = {}, selectedButton = {}) {
  const nextDraft = { ...draft };
  const suppressedButtonIds = [];
  for (const competitor of exclusiveCodingCompetitors(template, selectedButton)) {
    const targetField = canonicalTargetField(competitor);
    if (targetField === "tags") {
      nextDraft.tags = removeTag(nextDraft.tags, competitor.value);
    } else if (stringValue(nextDraft[targetField]) === stringValue(competitor.value)) {
      nextDraft[targetField] = "";
    }
    suppressedButtonIds.push(stringValue(competitor.id || competitor.databaseId));
  }
  return { draft: nextDraft, suppressedButtonIds: suppressedButtonIds.filter(Boolean) };
}

export function applyExclusiveCodingSelection(selectedButtonIds = [], template = {}, selectedButton = {}) {
  const buttons = Array.isArray(template.buttons) ? template.buttons : [];
  const selectedIds = new Set(selectedButtonIds.map(stringValue).filter(Boolean));
  const competitors = exclusiveCodingCompetitors(template, selectedButton);
  competitors.forEach((competitor) => buttonKeys(competitor).forEach((key) => selectedIds.delete(key)));
  const selectedId = stringValue(selectedButton.id || selectedButton.databaseId);
  if (selectedId) selectedIds.add(selectedId);
  return {
    selectedButtonIds: [...selectedIds],
    suppressedButtonIds: competitors
      .map((button) => stringValue(button.id || button.databaseId))
      .filter(Boolean),
    repeatable: canonicalTargetField(selectedButton) === "miniGamePrincipleId",
    selectedButtons: buttons.filter((button) => buttonKeys(button).some((key) => selectedIds.has(key))),
  };
}
