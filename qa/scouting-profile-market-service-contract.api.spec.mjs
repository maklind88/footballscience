import { expect, test } from "@playwright/test";
import { createScoutingProfileMarketService } from "../src/modules/scouting/index.mjs";

function normalizeText(value = "", limit = 160) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function createHarness(overrides = {}) {
  const record = overrides.record || {
    age: 22,
    id: "record-1",
    minutes: 720,
    name: "Ada Forward",
    position: "CF",
    roleFit: 86,
    team: "FC Test",
  };
  const state = {
    marketIntel: {
      "record-1": {
        agent: "North Star Agency",
        contractEnd: "Dec 2027",
        contractStatus: "under-contract",
        dealProbability: "medium",
        medicalLoad: "No recent load flag",
        notes: "Agent call scheduled",
        optionYears: "Club option 2028",
        transferStatus: "Club open to structured fee",
        updatedAt: "2026-06-12T10:00:00.000Z",
        wageBand: "High starter",
      },
      ...(overrides.marketIntel || {}),
    },
    targets: overrides.targets || [{ id: "target-1", priority: "urgent", recordId: "record-1", status: "shortlist" }],
  };
  const service = createScoutingProfileMarketService({
    ensureState: () => state,
    findTargetByRecordId: (recordId, currentState) => currentState.targets.find((target) => target.recordId === recordId) || null,
    getBestSignal: () => ({ metric: { label: "xG p90" }, percentile: 91 }),
    getComparablePlayers: () => [{ record: { id: "peer-1", name: "Peer Forward" }, similarity: 88 }],
    getDecisionGate: () => ({
      blocker: "Commercial terms",
      nextStep: "Prepare decision meeting",
      title: "Ready for decision meeting",
    }),
    getIntelligenceProfile: () => ({
      confidence: { detail: "Stable sample", label: "High confidence", score: 88 },
      risk: { detail: "No major KPI gaps", label: "Low risk", needs: [] },
      signal: { detail: "Strong pressure and box signal", headline: "Elite role signal" },
    }),
    getPlayerDataReadiness: () => ({ label: "Decision ready", score: 92, weakest: { label: "Market file" } }),
    getPositionGroup: () => overrides.positionGroup || "FW",
    getProfileRecommendation: () => ({
      action: "Shortlist now",
      risk: "Low role risk",
    }),
    getRecordAge: (entry) => entry?.age,
    getRecordId: (entry) => entry?.id || "",
    getRecordMinutes: (entry) => entry?.minutes,
    getRecordName: (entry) => entry?.name || "",
    getRecordPosition: (entry) => entry?.position || "",
    getRecordTeam: (entry) => entry?.team || "",
    getRecordsForPlayer: () => [{ season: "2026" }, { season: "2025" }],
    getRoleFitLabel: () => "Excellent fit",
    getRoleFitScore: (entry) => entry?.roleFit,
    getSeasonInsights: () => ({
      bestSeason: "2026",
      reliability: "2 linked seasons",
      trendLabel: "Trending up",
    }),
    getShadowSlotRecordIds: (slotId) => (slotId === "slot-a" ? ["record-1"] : []),
    getShadowSlots: () => [
      { id: "slot-a", label: "CF" },
      { id: "slot-b", label: "RW" },
    ],
    isRecordFavorited: () => overrides.favorite === true,
    normalizeText,
  });
  return { record, service, state };
}

test("Scouting profile market service normalizes market files and contract labels", () => {
  const { service, state } = createHarness();

  expect(service.getContractStatusOptions().map((option) => option.value)).toEqual([
    "unknown",
    "under-contract",
    "option",
    "free-agent",
    "loan",
    "contacted",
  ]);
  expect(service.getContractStatusLabel("loan")).toBe("Loan situation");
  expect(service.getContractStatusLabel("bad")).toBe("Unknown / unverified");
  expect(service.normalizeMarketInfo("record-2", { agent: "  Scout Agency  ", contractStatus: "bad" })).toMatchObject({
    agent: "Scout Agency",
    contractStatus: "unknown",
    recordId: "record-2",
  });
  expect(service.getMarketInfo("record-1", state)).toMatchObject({
    agent: "North Star Agency",
    contractStatus: "under-contract",
    recordId: "record-1",
  });
  expect(
    service.getMarketCompleteness({
      agent: "North Star Agency",
      contractEnd: "2027",
      contractStatus: "under-contract",
      wageBand: "High starter",
    })
  ).toBe(33);
});

test("Scouting profile market service builds market intelligence for active targets", () => {
  const { record, service } = createHarness();

  const market = service.getMarketIntelligence(record);

  expect(market).toMatchObject({
    availability: "Under contract / Ends Dec 2027 / Agent North Star Agency",
    bestSignal: "xG p90 P91",
    completeness: 67,
    negotiationAngle: "Market note: Club open to structured fee",
    segment: "Strategic upside signing",
    urgency: "Urgent follow-up",
  });
  expect(market.checks).toEqual([
    "Contract end: Dec 2027",
    "Option/release context: Club option 2028",
    "Agent/wage: Agent North Star Agency / Wage High starter",
    "Medical/load: No recent load flag",
    "Role translation against stronger opposition",
  ]);
  expect(market.dueDiligence.map((item) => [item.label, item.status])).toEqual([
    ["Contract", "known"],
    ["Agent", "known"],
    ["Wages", "known"],
    ["Injury/load", "known"],
    ["Role translation", "missing"],
    ["Transfer heatmap", "known"],
  ]);
});

test("Scouting profile market service falls back through shadow, favorite, and goalkeeper checks", () => {
  const { service } = createHarness({
    favorite: true,
    marketIntel: {
      "record-2": {},
    },
    positionGroup: "GK",
    targets: [],
  });
  const record = { age: 28, id: "record-2", minutes: 1600, name: "Goalkeeper", position: "GK", roleFit: 72, team: "FC Test" };

  const market = service.getMarketIntelligence(record);

  expect(market).toMatchObject({
    availability: "Favorite - needs contract check",
    negotiationAngle: "Low-pressure monitoring angle: gather agent and contract context first.",
    segment: "Value opportunity",
    urgency: "Keep active",
  });
  expect(market.checks.at(-1)).toBe("Distribution and pressure profile on video");
});

test("Scouting profile market service creates bounded profile report drafts", () => {
  const { record, service } = createHarness();

  const draft = service.getProfileReportDraft(record);

  expect(draft.length).toBeLessThanOrEqual(1200);
  expect(draft).toContain("Ada Forward - CF / FC Test.");
  expect(draft).toContain("Decision: Shortlist now. Role fit P86 (Excellent fit).");
  expect(draft).toContain("Decision gate: Ready for decision meeting. Next step: Prepare decision meeting. Blocker: Commercial terms.");
  expect(draft).toContain("Market lens: Strategic upside signing. Availability: Under contract / Ends Dec 2027 / Agent North Star Agency. Urgency: Urgent follow-up.");
  expect(draft).toContain("Contract/agent detail: status Under contract; end Dec 2027; option Club option 2028; agent North Star Agency;");
  expect(draft).toContain("Season trend: Trending up. Sample: 2 linked seasons. Best season: 2026.");
  expect(draft).toContain("Comparable profiles: Peer Forward (88% similar).");
  expect(draft).toContain("Market notes: Agent call scheduled");
});
