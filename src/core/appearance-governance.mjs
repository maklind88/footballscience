const PLATFORM_APPEARANCE_SCHEMA = "footballscience-platform-appearance-v1";
const PLATFORM_APPEARANCE_STORAGE_KEY = "football-platform-appearance-v1";
const PLATFORM_APPEARANCE_VERSION = 1;

const platformAppearanceDensityOptions = Object.freeze(["compact", "normal", "airy"]);
const platformAppearanceToneOptions = Object.freeze(["default", "calm", "pitch", "contrast"]);
const platformAppearanceThemeOptions = Object.freeze(["system", "light", "dark"]);
const platformAppearanceHomeSectionDefaults = Object.freeze([
  Object.freeze({
    id: "topTasks",
    label: "Top 3",
    eyebrow: "Top 3",
    title: "Priority Tasks",
    componentType: "home.priority-panel",
    order: 10,
    enabled: true,
  }),
  Object.freeze({
    id: "todo",
    label: "Coach To-Do",
    eyebrow: "Coach To-Do",
    title: "Work Queue",
    componentType: "home.task-panel",
    order: 20,
    enabled: true,
  }),
  Object.freeze({
    id: "alerts",
    label: "Player / Team Alerts",
    eyebrow: "Player / Team Alerts",
    title: "Attention",
    componentType: "home.alert-panel",
    order: 30,
    enabled: true,
  }),
]);
const platformAppearanceHomeSectionIds = Object.freeze(platformAppearanceHomeSectionDefaults.map((section) => section.id));
const platformAppearanceHomeSectionById = Object.freeze(
  Object.fromEntries(platformAppearanceHomeSectionDefaults.map((section) => [section.id, section]))
);
const platformAppearanceHomeComponentTypeDefaults = Object.freeze({
  "home.panel": Object.freeze({
    label: "All Home panels",
    density: "normal",
    tone: "default",
  }),
  "home.priority-panel": Object.freeze({
    label: "Priority panels",
    density: "normal",
    tone: "calm",
  }),
  "home.task-panel": Object.freeze({
    label: "Task panels",
    density: "normal",
    tone: "default",
  }),
  "home.alert-panel": Object.freeze({
    label: "Alert panels",
    density: "normal",
    tone: "pitch",
  }),
});
const platformAppearanceHomeComponentTypeIds = Object.freeze(Object.keys(platformAppearanceHomeComponentTypeDefaults));
const blockedAppearanceTextPattern = /<|>|\bon[a-z]+\s*=|javascript\s*:|data\s*:/i;

function clampNumber(value, min, max, fallback) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(numericValue)));
}

function normalizeChoice(value, options, fallback) {
  const normalized = String(value || "").trim().toLowerCase();
  return options.includes(normalized) ? normalized : fallback;
}

function normalizePlainText(value, fallback = "", maxLength = 80) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text || blockedAppearanceTextPattern.test(text)) {
    return fallback;
  }
  return text.slice(0, maxLength);
}

function normalizeBoolean(value, fallback = true) {
  if (typeof value === "boolean") {
    return value;
  }
  if (value === "true" || value === "1" || value === "on") {
    return true;
  }
  if (value === "false" || value === "0" || value === "off") {
    return false;
  }
  return fallback;
}

function parseAppearanceConfig(value) {
  if (!value) {
    return {};
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function createDefaultPlatformAppearanceConfig(options = {}) {
  const now = options.updatedAt || new Date().toISOString();
  return Object.freeze({
    schema: PLATFORM_APPEARANCE_SCHEMA,
    version: PLATFORM_APPEARANCE_VERSION,
    scope: "global",
    updatedAt: now,
    updatedBy: String(options.updatedBy || ""),
    modules: Object.freeze({
      home: Object.freeze({
        enabled: true,
        layout: "operations",
        density: "normal",
        theme: "system",
        componentTypes: platformAppearanceHomeComponentTypeDefaults,
        sections: Object.freeze(
          Object.fromEntries(platformAppearanceHomeSectionDefaults.map((section) => [section.id, Object.freeze({ ...section })]))
        ),
      }),
    }),
  });
}

function normalizeHomeComponentTypes(componentTypes = {}) {
  return Object.fromEntries(
    platformAppearanceHomeComponentTypeIds.map((typeId) => {
      const defaults = platformAppearanceHomeComponentTypeDefaults[typeId];
      const incoming = componentTypes?.[typeId] || {};
      return [
        typeId,
        {
          label: defaults.label,
          density: normalizeChoice(incoming.density, platformAppearanceDensityOptions, defaults.density),
          tone: normalizeChoice(incoming.tone, platformAppearanceToneOptions, defaults.tone),
        },
      ];
    })
  );
}

function normalizeHomeSections(sections = {}) {
  return Object.fromEntries(
    platformAppearanceHomeSectionDefaults.map((defaults) => {
      const incoming = sections?.[defaults.id] || {};
      return [
        defaults.id,
        {
          id: defaults.id,
          label: defaults.label,
          eyebrow: normalizePlainText(incoming.eyebrow, defaults.eyebrow, 36),
          title: normalizePlainText(incoming.title, defaults.title, 58),
          componentType: defaults.componentType,
          order: clampNumber(incoming.order, 1, 99, defaults.order),
          enabled: normalizeBoolean(incoming.enabled, defaults.enabled),
        },
      ];
    })
  );
}

function normalizePlatformAppearanceConfig(value = {}, options = {}) {
  const parsed = parseAppearanceConfig(value);
  const defaults = createDefaultPlatformAppearanceConfig(options);
  const home = parsed.modules?.home && typeof parsed.modules.home === "object" ? parsed.modules.home : {};
  return {
    schema: PLATFORM_APPEARANCE_SCHEMA,
    version: PLATFORM_APPEARANCE_VERSION,
    scope: "global",
    updatedAt: normalizePlainText(options.updatedAt || parsed.updatedAt, defaults.updatedAt, 40),
    updatedBy: normalizePlainText(options.updatedBy || parsed.updatedBy, defaults.updatedBy, 120),
    modules: {
      home: {
        enabled: normalizeBoolean(home.enabled, true),
        layout: "operations",
        density: normalizeChoice(home.density, platformAppearanceDensityOptions, "normal"),
        theme: normalizeChoice(home.theme, platformAppearanceThemeOptions, "system"),
        componentTypes: normalizeHomeComponentTypes(home.componentTypes),
        sections: normalizeHomeSections(home.sections),
      },
    },
  };
}

function normalizePlatformAppearanceValue(rawValue, options = {}) {
  return JSON.stringify(normalizePlatformAppearanceConfig(rawValue, options));
}

function getHomeAppearanceConfig(config = {}) {
  return normalizePlatformAppearanceConfig(config).modules.home;
}

function getHomeAppearanceSections(config = {}) {
  const home = getHomeAppearanceConfig(config);
  return platformAppearanceHomeSectionIds
    .map((sectionId) => home.sections[sectionId])
    .filter((section) => section?.enabled)
    .sort((first, second) => first.order - second.order || first.id.localeCompare(second.id));
}

function getHomeSectionAppearance(config = {}, sectionId = "") {
  const home = getHomeAppearanceConfig(config);
  const defaults = platformAppearanceHomeSectionById[sectionId] || platformAppearanceHomeSectionDefaults[0];
  const section = home.sections[defaults.id] || defaults;
  const typeDefaults = home.componentTypes[section.componentType] || home.componentTypes["home.panel"] || platformAppearanceHomeComponentTypeDefaults["home.panel"];
  return {
    ...section,
    density: typeDefaults.density,
    tone: typeDefaults.tone,
  };
}

function getHomeAppearanceImpactSummary(config = {}) {
  const home = getHomeAppearanceConfig(config);
  const sections = platformAppearanceHomeSectionIds
    .map((sectionId) => home.sections[sectionId])
    .filter(Boolean)
    .sort((first, second) => first.order - second.order || first.id.localeCompare(second.id));

  return platformAppearanceHomeComponentTypeIds.map((typeId) => {
    const typeDefaults = home.componentTypes[typeId] || platformAppearanceHomeComponentTypeDefaults[typeId];
    const affectedSections = sections.filter((section) => section.componentType === typeId);
    return {
      componentType: typeId,
      label: typeDefaults.label,
      count: affectedSections.length,
      enabledCount: affectedSections.filter((section) => section.enabled).length,
      hiddenCount: affectedSections.filter((section) => !section.enabled).length,
      sections: affectedSections.map((section) => ({
        id: section.id,
        label: section.label,
        title: section.title,
        enabled: section.enabled,
        order: section.order,
      })),
    };
  });
}

function summarizePlatformAppearanceChange(previousValue = "", nextValue = "") {
  const previous = normalizePlatformAppearanceConfig(previousValue);
  const next = normalizePlatformAppearanceConfig(nextValue);
  const previousHome = previous.modules.home;
  const nextHome = next.modules.home;
  return {
    module: "home",
    densityChanged: previousHome.density !== nextHome.density,
    themeChanged: previousHome.theme !== nextHome.theme,
    changedComponentTypes: platformAppearanceHomeComponentTypeIds.filter((typeId) => {
      const before = previousHome.componentTypes[typeId];
      const after = nextHome.componentTypes[typeId];
      return before.density !== after.density || before.tone !== after.tone;
    }),
    changedSections: platformAppearanceHomeSectionIds.filter((sectionId) => {
      const before = previousHome.sections[sectionId];
      const after = nextHome.sections[sectionId];
      return before.enabled !== after.enabled || before.order !== after.order || before.title !== after.title || before.eyebrow !== after.eyebrow;
    }),
  };
}

const appearanceGovernance = {

  PLATFORM_APPEARANCE_SCHEMA,
  PLATFORM_APPEARANCE_STORAGE_KEY,
  PLATFORM_APPEARANCE_VERSION,
  createDefaultPlatformAppearanceConfig,
  getHomeAppearanceImpactSummary,
  getHomeAppearanceConfig,
  getHomeAppearanceSections,
  getHomeSectionAppearance,
  normalizePlatformAppearanceConfig,
  normalizePlatformAppearanceValue,
  platformAppearanceDensityOptions,
  platformAppearanceHomeComponentTypeDefaults,
  platformAppearanceHomeComponentTypeIds,
  platformAppearanceHomeSectionById,
  platformAppearanceHomeSectionDefaults,
  platformAppearanceHomeSectionIds,
  platformAppearanceThemeOptions,
  platformAppearanceToneOptions,
  summarizePlatformAppearanceChange,
};

export {
  PLATFORM_APPEARANCE_SCHEMA,
  PLATFORM_APPEARANCE_STORAGE_KEY,
  PLATFORM_APPEARANCE_VERSION,
  createDefaultPlatformAppearanceConfig,
  getHomeAppearanceImpactSummary,
  getHomeAppearanceConfig,
  getHomeAppearanceSections,
  getHomeSectionAppearance,
  normalizePlatformAppearanceConfig,
  normalizePlatformAppearanceValue,
  platformAppearanceDensityOptions,
  platformAppearanceHomeComponentTypeDefaults,
  platformAppearanceHomeComponentTypeIds,
  platformAppearanceHomeSectionById,
  platformAppearanceHomeSectionDefaults,
  platformAppearanceHomeSectionIds,
  platformAppearanceThemeOptions,
  platformAppearanceToneOptions,
  summarizePlatformAppearanceChange,
};

export default appearanceGovernance;
