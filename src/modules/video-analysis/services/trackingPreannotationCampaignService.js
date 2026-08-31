import {
  normalizeTrackingPreannotationReviewEffort,
  summarizeTrackingPreannotationReviewEffort,
} from "./trackingPreannotationReviewEffortService.js";

const maximumCases = 100;
const maximumSuggestionsPerCase = 25_000;
const maximumCampaignSuggestions = 100_000;
const entityTypes = new Set(["player", "ball", "referee"]);
const fingerprintPattern = /^[a-f0-9]{64}$/;

export class TrackingPreannotationCampaignError extends Error {
  constructor(message, code = "TRACKING_PREANNOTATION_CAMPAIGN_INVALID") {
    super(message);
    this.name = "TrackingPreannotationCampaignError";
    this.code = code;
  }
}

function invalid(message) {
  throw new TrackingPreannotationCampaignError(message);
}

function identifier(value, label) {
  const text = String(value || "").trim();
  if (!text || text.length > 160 || !/^[a-z0-9][a-z0-9._:-]*$/i.test(text)) invalid(`Invalid ${label}.`);
  return text;
}

function integer(value, label, maximum = maximumSuggestionsPerCase) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0 || number > maximum) invalid(`Invalid ${label}.`);
  return number;
}

function sha256(value, label) {
  const text = String(value || "").trim().toLowerCase();
  if (!fingerprintPattern.test(text)) invalid(`Invalid ${label}.`);
  return text;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function campaignCase(value = {}) {
  const totalSuggestionCount = integer(value.totalSuggestionCount, "campaign suggestion count");
  const associatedTrackCount = integer(value.associatedTrackCount, "campaign associated count");
  const unassociatedObservationCount = integer(value.unassociatedObservationCount, "campaign unassociated count");
  if (!totalSuggestionCount || associatedTrackCount + unassociatedObservationCount !== totalSuggestionCount) {
    invalid("Campaign case workload counts do not reconcile.");
  }
  const missingSuggestedEntityTypes = [...new Set((value.missingSuggestedEntityTypes || []).map(String))];
  if (missingSuggestedEntityTypes.some((entry) => !entityTypes.has(entry))) {
    invalid("Campaign case has an invalid missing entity type.");
  }
  return {
    caseId: identifier(value.caseId, "campaign case id"),
    totalSuggestionCount,
    associatedTrackCount,
    unassociatedObservationCount,
    missingSuggestedEntityTypes,
  };
}

export function normalizeTrackingPreannotationCampaign(value = {}) {
  const cases = Array.isArray(value.cases) ? value.cases.map(campaignCase) : invalid("Campaign cases are required.");
  if (!cases.length || cases.length > maximumCases
    || new Set(cases.map((entry) => entry.caseId)).size !== cases.length) {
    invalid("Campaign case identities are invalid.");
  }
  const totalSuggestionCount = cases.reduce((sum, entry) => sum + entry.totalSuggestionCount, 0);
  if (totalSuggestionCount > maximumCampaignSuggestions
    || Number(value.caseCount) !== cases.length
    || Number(value.totalSuggestionCount) !== totalSuggestionCount) {
    invalid("Campaign workload summary does not match its cases.");
  }
  return deepFreeze({
    workspaceSha256: sha256(value.workspaceSha256, "campaign workspace checksum"),
    packId: identifier(value.packId, "campaign pack id"),
    caseCount: cases.length,
    totalSuggestionCount,
    cases,
  });
}

function caseProgress(value = {}, campaignCaseValue = {}, campaign = {}) {
  if ((value.workspaceSha256 && sha256(value.workspaceSha256, "campaign progress workspace checksum")
      !== campaign.workspaceSha256)
    || (value.packId && identifier(value.packId, "campaign progress pack id") !== campaign.packId)) {
    invalid("Campaign progress belongs to another sealed workspace.");
  }
  const totalSuggestionCount = integer(value.totalSuggestionCount, "campaign progress suggestion count");
  const progress = {
    caseId: identifier(value.caseId, "campaign progress case id"),
    totalSuggestionCount,
    pendingCount: integer(value.pendingCount, "campaign pending count"),
    acceptedCount: integer(value.acceptedCount, "campaign accepted count"),
    rejectedCount: integer(value.rejectedCount, "campaign rejected count"),
    savedCount: integer(value.savedCount, "campaign saved count"),
    updatedAt: String(value.updatedAt || ""),
  };
  if (progress.caseId !== campaignCaseValue.caseId
    || progress.totalSuggestionCount !== campaignCaseValue.totalSuggestionCount
    || progress.pendingCount + progress.acceptedCount + progress.rejectedCount + progress.savedCount
      !== progress.totalSuggestionCount) {
    invalid("Campaign progress does not reconcile with its sealed case workload.");
  }
  return {
    ...progress,
    reviewEffort: normalizeTrackingPreannotationReviewEffort(value.reviewEffort || {
      coverage: progress.acceptedCount + progress.rejectedCount + progress.savedCount ? "partial" : "complete",
    }),
  };
}

export function trackingPreannotationCampaignProgress(campaignValue = {}, records = [], options = {}) {
  const campaign = normalizeTrackingPreannotationCampaign(campaignValue);
  const byCaseId = new Map((records || []).map((entry) => [String(entry.caseId || ""), entry]));
  if (byCaseId.size !== (records || []).length) invalid("Campaign progress repeats one case.");
  if (options.current?.caseId) byCaseId.set(String(options.current.caseId), options.current);
  const cases = campaign.cases.map((entry) => {
    const stored = byCaseId.get(entry.caseId);
    const progress = stored ? caseProgress(stored, entry, campaign) : {
      caseId: entry.caseId,
      totalSuggestionCount: entry.totalSuggestionCount,
      pendingCount: entry.totalSuggestionCount,
      acceptedCount: 0,
      rejectedCount: 0,
      savedCount: 0,
      reviewEffort: normalizeTrackingPreannotationReviewEffort(),
      updatedAt: "",
    };
    const effort = summarizeTrackingPreannotationReviewEffort(
      progress.reviewEffort,
      progress.totalSuggestionCount,
    );
    return {
      ...entry,
      ...progress,
      reviewEffort: effort,
      decisionCount: progress.acceptedCount + progress.rejectedCount + progress.savedCount,
      resolvedCount: progress.rejectedCount + progress.savedCount,
      reviewActionCount: effort.reviewActionCount,
      reworkActionCount: effort.reworkActionCount,
      reviewActionsPer100Suggestions: effort.reviewActionsPer100Suggestions,
      complete: progress.pendingCount === 0 && progress.acceptedCount === 0,
      active: entry.caseId === String(options.activeCaseId || ""),
    };
  });
  return deepFreeze({
    status: String(options.status || "ready"),
    error: String(options.error || ""),
    workspaceSha256: campaign.workspaceSha256,
    packId: campaign.packId,
    caseCount: campaign.caseCount,
    openedCaseCount: cases.filter((entry) => entry.updatedAt || entry.active).length,
    completeCaseCount: cases.filter((entry) => entry.complete).length,
    totalSuggestionCount: campaign.totalSuggestionCount,
    decisionCount: cases.reduce((sum, entry) => sum + entry.decisionCount, 0),
    resolvedCount: cases.reduce((sum, entry) => sum + entry.resolvedCount, 0),
    reviewEffortCoverage: cases.some((entry) => entry.reviewEffort.coverage === "partial")
      ? "partial"
      : "complete",
    reviewActionCount: cases.reduce((sum, entry) => sum + entry.reviewActionCount, 0),
    reworkActionCount: cases.reduce((sum, entry) => sum + entry.reworkActionCount, 0),
    correctionHandoffCount: cases.reduce(
      (sum, entry) => sum + entry.reviewEffort.correctionHandoffCount,
      0,
    ),
    savedTrackActionCount: cases.reduce(
      (sum, entry) => sum + entry.reviewEffort.savedTrackActionCount,
      0,
    ),
    reviewActionsPer100Suggestions: Math.round((cases.reduce(
      (sum, entry) => sum + entry.reviewActionCount,
      0,
    ) / campaign.totalSuggestionCount) * 10_000) / 100,
    cases,
  });
}
