import { expect, test } from "@playwright/test";
import { createScoutingProfileDecisionService } from "../src/modules/scouting/index.mjs";

function normalizeText(value = "", limit = 160) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function createMarket(knownCount = 4) {
  return {
    dueDiligence: Array.from({ length: 6 }, (_entry, index) => ({
      label: `Check ${index + 1}`,
      status: index < knownCount ? "known" : "missing",
    })),
  };
}

function createHarness(options = {}) {
  const record = {
    dateOfBirth: options.dateOfBirth ?? "2002-04-10",
    id: "record-1",
    identityId: options.identityId ?? "player-1",
    nationality: options.nationality || { code: "USA" },
    sourceId: options.sourceId ?? "source-1",
    sourceTrace: options.sourceTrace || { identitySource: "mapped" },
  };
  const state = {
    targets: options.targets || [{ recordId: "record-1", status: "monitoring" }],
  };
  const intelligence = {
    calibration: {
      label: options.calibrationLabel || "Strong sample",
      localSampleAverage: options.localSampleAverage ?? 26,
    },
    confidence: {
      detail: options.confidenceDetail || "Stable sample",
      score: options.confidenceScore ?? 88,
    },
    floor: {
      score: options.floorScore ?? 62,
    },
    risk: {
      detail: options.riskDetail || "No major risk",
      needs: options.roleNeeds || [],
    },
    roleFitScore: options.roleFitScore ?? 84,
  };
  const market = options.market || createMarket(options.marketKnown ?? 4);
  const service = createScoutingProfileDecisionService({
    ensureState: () => state,
    escapeHtml,
    findTargetByRecordId: (recordId, currentState) => currentState.targets.find((target) => target.recordId === recordId) || null,
    getIntelligenceProfile: () => intelligence,
    getMarketIntelligence: () => market,
    getRecordDateOfBirth: (entry) => entry.dateOfBirth,
    getRecordId: (entry) => entry.id,
    getRecordNationalityMeta: (entry) => entry.nationality,
    getRecordPlayerIdentityId: (entry) => entry.identityId,
    getRecordPlayerSourceId: (entry) => entry.sourceId,
    getRecordSourceTrace: (entry) => entry.sourceTrace,
    getRecordsForPlayer: () => Array.from({ length: options.seasonCount ?? 3 }, (_entry, index) => ({ season: String(2026 - index) })),
    normalizeText,
  });
  return { intelligence, market, record, service, state };
}

test("Scouting profile decision service classifies readiness thresholds", () => {
  const { service } = createHarness();

  expect(service.getDataReadinessStatus(82)).toBe("Decision ready");
  expect(service.getDataReadinessStatus(64)).toBe("Scouting ready");
  expect(service.getDataReadinessStatus(42)).toBe("Needs verification");
  expect(service.getDataReadinessStatus(41)).toBe("Data light");
});

test("Scouting profile decision service scores identity, source, role, market and sample readiness", () => {
  const { record, service, state } = createHarness();

  const readiness = service.getPlayerDataReadiness(record, state);

  expect(readiness).toMatchObject({
    label: "Decision ready",
    score: 95,
    weakest: {
      detail: "4/6 market checks known.",
      label: "Market due diligence",
      score: 67,
    },
  });
  expect(readiness.items.map((item) => [item.label, item.score, item.status])).toEqual([
    ["Player identity", 100, "ready"],
    ["Source IDs", 100, "ready"],
    ["Role metrics", 100, "ready"],
    ["Season trend", 100, "ready"],
    ["Market due diligence", 67, "partial"],
    ["Calibration sample", 100, "ready"],
  ]);
});

test("Scouting profile decision service returns ready and market-blocked gates", () => {
  const readyHarness = createHarness();

  expect(readyHarness.service.getDecisionGate(readyHarness.record, readyHarness.state)).toMatchObject({
    blocker: "No major data blocker.",
    nextStep: "Create report memo and move to decision meeting.",
    title: "Ready for decision meeting",
    tone: "ready",
  });

  const marketHarness = createHarness({ marketKnown: 2 });

  expect(marketHarness.service.getDecisionGate(marketHarness.record, marketHarness.state)).toMatchObject({
    blocker: "Market due diligence is incomplete.",
    nextStep: "Complete due diligence checklist.",
    title: "Sporting case ready, market blocked",
    tone: "market",
  });
});

test("Scouting profile decision service separates watch, evidence, data and monitor gates", () => {
  const watchHarness = createHarness({ confidenceScore: 70, floorScore: 42, roleFitScore: 86 });
  expect(watchHarness.service.getDecisionGate(watchHarness.record, watchHarness.state)).toMatchObject({
    blocker: "Role floor P42.",
    title: "High upside, role-floor risk",
    tone: "watch",
  });

  const evidenceHarness = createHarness({ confidenceDetail: "Needs more match sample", confidenceScore: 70, floorScore: 58, roleFitScore: 86 });
  expect(evidenceHarness.service.getDecisionGate(evidenceHarness.record, evidenceHarness.state)).toMatchObject({
    blocker: "Needs more match sample",
    title: "Promising but needs evidence",
    tone: "evidence",
  });

  const dataHarness = createHarness({
    dateOfBirth: "",
    identityId: "",
    localSampleAverage: 4,
    marketKnown: 0,
    roleFitScore: 60,
    roleNeeds: ["xg", "press", "duels", "carries"],
    seasonCount: 1,
    sourceId: "",
  });
  expect(dataHarness.service.getDecisionGate(dataHarness.record, dataHarness.state)).toMatchObject({
    title: "Data not decision-safe",
    tone: "data",
  });

  const monitorHarness = createHarness({ confidenceScore: 72, floorScore: 55, roleFitScore: 66, riskDetail: "Role need is not active" });
  expect(monitorHarness.service.getDecisionGate(monitorHarness.record, monitorHarness.state)).toMatchObject({
    blocker: "Role need is not active",
    title: "Monitor, not decision-ready",
    tone: "monitor",
  });
});

test("Scouting profile decision service renders escaped decision gate cards", () => {
  const { record, service, state } = createHarness({ confidenceDetail: "Needs <video>", confidenceScore: 70, floorScore: 58, roleFitScore: 86 });

  const markup = service.renderDecisionGateCard(record, state);

  expect(markup).toContain("scouting-decision-gate is-evidence");
  expect(markup).toContain("Promising but needs evidence");
  expect(markup).toContain("Blocker: Needs &lt;video&gt;");
  expect(markup).toContain("Add more match data, trend history or live scout notes.");
});
