const maximumCounter = 10_000_000;
const coverageValues = new Set(["complete", "partial"]);
const effortFields = Object.freeze([
  "coverage", "openedCount", "acceptActionCount", "rejectActionCount", "undoActionCount",
  "deferActionCount", "correctionHandoffCount", "batchSaveActionCount", "savedTrackActionCount",
  "firstOpenedAt", "lastActionAt",
]);
const actionFields = Object.freeze({
  open: "openedCount",
  accept: "acceptActionCount",
  reject: "rejectActionCount",
  undo: "undoActionCount",
  defer: "deferActionCount",
  "correction-handoff": "correctionHandoffCount",
  "batch-save": "batchSaveActionCount",
});

export class TrackingPreannotationReviewEffortError extends Error {
  constructor(message, code = "TRACKING_PREANNOTATION_REVIEW_EFFORT_INVALID") {
    super(message);
    this.name = "TrackingPreannotationReviewEffortError";
    this.code = code;
  }
}

function invalid(message) {
  throw new TrackingPreannotationReviewEffortError(message);
}

function exactKeys(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid("Review effort must be an object.");
  const unexpected = Object.keys(value).filter((key) => !effortFields.includes(key));
  if (unexpected.length) invalid(`Review effort contains unsupported field ${unexpected[0]}.`);
}

function integer(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0 || number > maximumCounter) {
    invalid(`Invalid ${label}.`);
  }
  return number;
}

function timestamp(value, label, optional = false) {
  if (optional && (value === "" || value === null || value === undefined)) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) invalid(`Invalid ${label}.`);
  return date.toISOString();
}

function roundedRatio(numerator, denominator, multiplier = 1) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * multiplier * 100) / 100;
}

export function normalizeTrackingPreannotationReviewEffort(value = {}) {
  exactKeys(value);
  const coverage = String(value.coverage ?? "complete");
  if (!coverageValues.has(coverage)) invalid("Invalid review effort coverage.");
  return Object.freeze({
    coverage,
    openedCount: integer(value.openedCount ?? 0, "review open count"),
    acceptActionCount: integer(value.acceptActionCount ?? 0, "review accept count"),
    rejectActionCount: integer(value.rejectActionCount ?? 0, "review reject count"),
    undoActionCount: integer(value.undoActionCount ?? 0, "review undo count"),
    deferActionCount: integer(value.deferActionCount ?? 0, "review defer count"),
    correctionHandoffCount: integer(value.correctionHandoffCount ?? 0, "review correction handoff count"),
    batchSaveActionCount: integer(value.batchSaveActionCount ?? 0, "review batch save count"),
    savedTrackActionCount: integer(value.savedTrackActionCount ?? 0, "review saved track count"),
    firstOpenedAt: timestamp(value.firstOpenedAt, "review first-open time", true),
    lastActionAt: timestamp(value.lastActionAt, "review last-action time", true),
  });
}

export function recordTrackingPreannotationReviewEffort(value = {}, action = "", options = {}) {
  const current = normalizeTrackingPreannotationReviewEffort(value);
  const field = actionFields[action];
  if (!field) invalid("Unsupported review effort action.");
  const amount = integer(options.amount ?? 1, "review effort action amount");
  if (!amount) invalid("Review effort actions must have a positive amount.");
  const at = timestamp(options.now?.() ?? options.at ?? Date.now(), "review effort action time");
  const next = {
    ...current,
    [field]: integer(current[field] + amount, `${action} cumulative count`),
    firstOpenedAt: current.firstOpenedAt || at,
    lastActionAt: action === "open" ? current.lastActionAt : at,
  };
  if (action === "correction-handoff") {
    next.savedTrackActionCount = integer(
      current.savedTrackActionCount + amount,
      "review saved track cumulative count",
    );
  }
  if (action === "batch-save") {
    const savedTrackCount = integer(options.savedTrackCount, "batch saved track count");
    if (!savedTrackCount) invalid("A batch save must contain at least one track.");
    next.savedTrackActionCount = integer(
      current.savedTrackActionCount + savedTrackCount,
      "review saved track cumulative count",
    );
  }
  return normalizeTrackingPreannotationReviewEffort(next);
}

export function summarizeTrackingPreannotationReviewEffort(value = {}, totalSuggestionCount = 0) {
  const effort = normalizeTrackingPreannotationReviewEffort(value);
  const total = integer(totalSuggestionCount, "review effort suggestion count");
  const decisionActionCount = effort.acceptActionCount + effort.rejectActionCount;
  const reviewActionCount = decisionActionCount + effort.undoActionCount + effort.deferActionCount
    + effort.correctionHandoffCount + effort.batchSaveActionCount;
  return Object.freeze({
    ...effort,
    decisionActionCount,
    reviewActionCount,
    reworkActionCount: effort.undoActionCount + effort.correctionHandoffCount,
    reviewActionsPer100Suggestions: roundedRatio(reviewActionCount, total, 100),
    undoPer100Decisions: roundedRatio(effort.undoActionCount, decisionActionCount, 100),
    correctionHandoffsPer100SavedTracks: roundedRatio(
      effort.correctionHandoffCount,
      effort.savedTrackActionCount,
      100,
    ),
  });
}
