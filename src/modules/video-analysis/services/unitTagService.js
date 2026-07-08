import { descriptorGroups } from "../constants/descriptors.js";

const defaultUnitTagOptions = Object.freeze(
  descriptorGroups.find((group) => group.id === "unit")?.options || []
);

export function normalizeUnitTagOptions(options = []) {
  const seen = new Set();
  return (Array.isArray(options) ? options : [])
    .map((option) => String(option || "").trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .filter((option) => {
      const key = option.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 24);
}

export function unitTagOptionsFromTemplate(template = {}) {
  const configuredOptions = Array.isArray(template.settings?.unitOptions)
    ? template.settings.unitOptions
    : Array.isArray(template.unitOptions)
      ? template.unitOptions
      : [];
  const normalized = normalizeUnitTagOptions(configuredOptions);
  return normalized.length ? normalized : [...defaultUnitTagOptions];
}

export function unitTagOptionsForState(state = {}) {
  return unitTagOptionsFromTemplate(state.template || {});
}

export function withUnitTagOptions(template = {}, options = []) {
  const normalized = normalizeUnitTagOptions(options);
  return {
    ...template,
    settings: {
      ...(template.settings || {}),
      unitOptions: normalized.length ? normalized : [...defaultUnitTagOptions],
    },
  };
}
