export const ARCHITECTURE_SIZE_TARGETS_VERSION = "footballscience-architecture-size-targets-v1";

export const architectureSizeTargets = Object.freeze([
  Object.freeze({
    area: "app.js",
    ideal: "1-50 lines",
    warning: "above 100 lines",
    transitionCeiling: 100,
    rule: "Must stay a thin loader/shell. Do not put product logic back here.",
  }),
  Object.freeze({
    area: "app-runtime.js",
    ideal: "1,500-3,000 lines",
    warning: "above 5,000-6,000 lines",
    transitionCeiling: 16000,
    rule: "Temporary wiring shell only. New work should reduce it or move into modules.",
  }),
  Object.freeze({
    area: "module index.mjs",
    ideal: "50-150 lines",
    warning: "above 250 lines",
    transitionCeiling: 500,
    rule: "Re-export and compose module parts; avoid product logic.",
  }),
  Object.freeze({
    area: "renderer/view file",
    ideal: "150-400 lines",
    warning: "above 500 lines",
    transitionCeiling: 700,
    rule: "Split repeated panels, cards, and modal sections before the renderer becomes a workspace.",
  }),
  Object.freeze({
    area: "controller/actions file",
    ideal: "100-400 lines",
    warning: "above 500 lines",
    transitionCeiling: 700,
    rule: "Split by workflow when event handling, orchestration, and persistence mix.",
  }),
  Object.freeze({
    area: "adapter/data-layer file",
    ideal: "100-350 lines",
    warning: "above 500 lines",
    transitionCeiling: 700,
    rule: "Keep API/storage boundaries explicit and contract-tested.",
  }),
  Object.freeze({
    area: "constants/options file",
    ideal: "50-250 lines",
    warning: "above 400 lines",
    transitionCeiling: 500,
    rule: "Group by domain and keep computed behavior out of constants.",
  }),
  Object.freeze({
    area: "single function",
    ideal: "10-50 lines",
    warning: "above 100 lines",
    transitionCeiling: 300,
    rule: "Functions above 300 lines require an extraction plan; above 500 lines is high-risk debt.",
  }),
  Object.freeze({
    area: "module CSS",
    ideal: "150-500 lines",
    warning: "above 700 lines",
    transitionCeiling: 1000,
    rule: "Prefer module CSS and shared tokens over growing global styles.",
  }),
  Object.freeze({
    area: "global styles.css",
    ideal: "under 2,000-4,000 lines",
    warning: "any new broad global styling",
    transitionCeiling: 4000,
    rule: "Global CSS should shrink over time; new styles should usually be module-owned.",
  }),
]);

export const architectureSizeBudgets = Object.freeze({
  hardCeilings: Object.freeze({
    appJsMaxLines: 100,
    appRuntimeTransitionMaxLines: 16000,
  }),
  warnings: Object.freeze({
    appRuntimeTargetWarningLines: 6000,
    moduleFileWarningLines: 500,
    functionWarningLines: 100,
    functionExtractionReviewLines: 300,
    globalCssTargetWarningLines: 4000,
  }),
});

