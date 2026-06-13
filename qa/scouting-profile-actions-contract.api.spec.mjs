import { expect, test } from "@playwright/test";
import { createScoutingProfileActions } from "../src/modules/scouting/index.mjs";

function normalizeText(value = "", limit = 160) {
  return String(value || "").trim().slice(0, limit);
}

function createHarness(options = {}) {
  const calls = [];
  const state = {
    selectedRecordId: options.selectedRecordId || "",
    profileRoleProfileId: "auto",
    profileSpiderSeasonMode: "latest",
    profileSpiderSeasonValue: "",
    profileTab: "overview",
    contactLog: Array.isArray(options.contactLog) ? options.contactLog.slice() : [],
    marketIntel: options.marketIntel && typeof options.marketIntel === "object" ? { ...options.marketIntel } : {},
    targets: Array.isArray(options.targets) ? options.targets.slice() : [],
  };
  const records = new Map([
    ["record-1", { id: "record-1", name: "Player One", team: "FC Test", position: "CF", age: 22, roleFit: 84 }],
  ]);
  let marketVersion = 0;
  let contactId = 0;
  const normalizeDateText = (value) => (/^\d{4}-\d{2}-\d{2}$/.test(normalizeText(value, 20)) ? normalizeText(value, 20) : "");
  const normalizeMarketInfo = (recordId, value = {}) => ({
    recordId: normalizeText(recordId || value.recordId, 160),
    contractStatus: ["unknown", "contacted", "free-agent"].includes(normalizeText(value.contractStatus, 40))
      ? normalizeText(value.contractStatus, 40)
      : "unknown",
    agent: normalizeText(value.agent, 120),
    estimatedFee: normalizeText(value.estimatedFee, 120),
    notes: normalizeText(value.notes, 500),
    updatedAt: normalizeText(value.updatedAt, 40),
  });
  const actions = createScoutingProfileActions({
    bumpMarketIntelVersion: () => {
      marketVersion += 1;
      calls.push(["market-version", marketVersion]);
    },
    canEdit: () => options.canEdit !== false,
    createTarget: (record, target = {}) => ({
      ...target,
      id: target.id || "target-1",
      recordId: record?.id || target.recordId || "",
      name: record?.name || target.name || "Unknown target",
      updatedAt: target.updatedAt,
    }),
    ensureState: () => state,
    getContactLog: (currentState) =>
      (Array.isArray(currentState.contactLog) ? currentState.contactLog : []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date))),
    getMarketInfo: (recordId, currentState) => normalizeMarketInfo(recordId, currentState.marketIntel?.[recordId] || {}),
    getRecordById: (recordId) => records.get(normalizeText(recordId, 160)) || null,
    getTargets: (currentState) => (Array.isArray(currentState.targets) ? currentState.targets : []),
    hasProfileModal: () => options.profileModal === true,
    hydrateProfileApiDetails: (recordId) => calls.push(["hydrate-api", recordId]),
    normalizeContactLogEntry: (entry = {}) => ({
      id: normalizeText(entry.id, 120) || `contact-${++contactId}`,
      recordId: normalizeText(entry.recordId, 160),
      date: normalizeDateText(entry.date) || "2026-06-12",
      type: normalizeText(entry.type, 40) || "internal",
      contact: normalizeText(entry.contact, 120),
      outcome: normalizeText(entry.outcome, 160),
      nextStep: normalizeText(entry.nextStep, 180),
      notes: normalizeText(entry.notes, 700),
      createdAt: normalizeText(entry.createdAt, 40) || "2026-06-12T10:00:00.000Z",
    }),
    normalizeDateText,
    normalizeMarketInfo,
    normalizeProfileTab: (value) => (["overview", "performance", "squad", "reports", "contacts", "history", "market"].includes(normalizeText(value, 40)) ? normalizeText(value, 40) : "overview"),
    normalizeRoleProfileId: (value, fallback = "auto") => normalizeText(value, 120) || fallback,
    normalizeText,
    now: () => "2026-06-12T10:00:00.000Z",
    queueFootballScienceDbProfileHydration: (recordId) => calls.push(["hydrate-fsdb", recordId]),
    requestAnimationFrame: (callback) => {
      calls.push(["raf"]);
      callback();
    },
    renderProfileModal: (recordId, modalOptions) => calls.push(["profile-modal", recordId, modalOptions]),
    renderWorkspace: (renderOptions) => calls.push(["render", renderOptions]),
    touchIntelligenceCache: () => calls.push(["touch"]),
    writeState: () => calls.push(["write"]),
  });
  return {
    actions,
    calls,
    get marketVersion() {
      return marketVersion;
    },
    state,
  };
}

test("Scouting profile actions create contact log entries and update matching pipeline targets", () => {
  const harness = createHarness({
    selectedRecordId: "record-1",
    profileModal: true,
    targets: [{ id: "target-1", recordId: "record-1", nextAction: "Old step", lastContact: "" }],
  });

  const result = harness.actions.createContactLogEntry("record-1", {
    date: "2026-06-20",
    type: "agent",
    contact: "Agent A",
    outcome: "Interested",
    nextStep: "Book live watch",
  });

  expect(result).toMatchObject({ changed: true, recordId: "record-1", surface: "profile-modal", status: "updated" });
  expect(harness.state.contactLog[0]).toMatchObject({
    id: "contact-1",
    recordId: "record-1",
    date: "2026-06-20",
    type: "agent",
    contact: "Agent A",
    outcome: "Interested",
    nextStep: "Book live watch",
  });
  expect(harness.state.targets[0]).toMatchObject({
    id: "target-1",
    recordId: "record-1",
    lastContact: "2026-06-20",
    nextAction: "Book live watch",
    updatedAt: "2026-06-12T10:00:00.000Z",
  });
  expect(harness.calls).toEqual([["touch"], ["write"], ["profile-modal", "record-1", undefined]]);
});

test("Scouting profile actions switch tabs with modal scroll reset and history hydration", () => {
  const harness = createHarness({ selectedRecordId: "record-1", profileModal: true });

  const result = harness.actions.setProfileTab("history");

  expect(result).toMatchObject({ changed: true, profileTab: "history", recordId: "record-1", surface: "profile-modal" });
  expect(harness.state.profileTab).toBe("history");
  expect(harness.calls).toEqual([
    ["write"],
    ["profile-modal", "record-1", { resetScroll: true }],
    ["raf"],
    ["hydrate-api", "record-1"],
  ]);
});

test("Scouting profile actions queue source hydration when returning to overview", () => {
  const harness = createHarness({ selectedRecordId: "record-1" });

  const result = harness.actions.setProfileTab("overview");

  expect(result).toMatchObject({ changed: true, profileTab: "overview", surface: "workspace" });
  expect(harness.calls).toEqual([["write"], ["render", { preserveFocus: true }], ["hydrate-fsdb", "record-1"]]);
});

test("Scouting profile actions update role profile and spider season through the same profile surface", () => {
  const harness = createHarness({ selectedRecordId: "record-1", profileModal: true });

  const roleResult = harness.actions.setProfileRoleProfile("role-cf");
  const seasonResult = harness.actions.setProfileSpiderSeason("season::2025");

  expect(roleResult).toMatchObject({ changed: true, roleProfileId: "role-cf", surface: "profile-modal" });
  expect(seasonResult).toMatchObject({ changed: true, mode: "season", season: "2025", surface: "profile-modal" });
  expect(harness.state.profileRoleProfileId).toBe("role-cf");
  expect(harness.state.profileSpiderSeasonMode).toBe("season");
  expect(harness.state.profileSpiderSeasonValue).toBe("2025");
  expect(harness.calls).toEqual([
    ["write"],
    ["profile-modal", "record-1", undefined],
    ["write"],
    ["profile-modal", "record-1", undefined],
  ]);
});

test("Scouting profile actions delete contact log entries through the active surface", () => {
  const harness = createHarness({
    selectedRecordId: "record-1",
    contactLog: [
      { id: "contact-1", recordId: "record-1", date: "2026-06-20" },
      { id: "contact-2", recordId: "record-2", date: "2026-06-18" },
    ],
  });

  const result = harness.actions.deleteContactLogEntry("contact-1");

  expect(result).toMatchObject({ changed: true, contactId: "contact-1", surface: "workspace", status: "updated" });
  expect(harness.state.contactLog).toEqual([{ id: "contact-2", recordId: "record-2", date: "2026-06-18" }]);
  expect(harness.calls).toEqual([["write"], ["render", { preserveFocus: true }]]);
});

test("Scouting profile actions save market info and bump the market filter version", () => {
  const harness = createHarness({
    marketIntel: {
      "record-1": { recordId: "record-1", contractStatus: "unknown", agent: "Old agent" },
    },
  });

  const result = harness.actions.saveMarketInfo("record-1", {
    contractStatus: "contacted",
    estimatedFee: "500k",
    notes: "Agent says summer window only",
  });

  expect(result).toMatchObject({ changed: true, recordId: "record-1", status: "updated" });
  expect(harness.state.marketIntel["record-1"]).toEqual({
    recordId: "record-1",
    contractStatus: "contacted",
    agent: "Old agent",
    estimatedFee: "500k",
    notes: "Agent says summer window only",
    updatedAt: "2026-06-12T10:00:00.000Z",
  });
  expect(harness.marketVersion).toBe(1);
  expect(harness.calls).toEqual([["market-version", 1], ["write"], ["render", undefined]]);
});

test("Scouting profile actions fail closed when editing is unavailable", () => {
  const harness = createHarness({ canEdit: false });

  expect(harness.actions.createContactLogEntry("record-1", { nextStep: "Nope" })).toEqual({ changed: false, status: "blocked" });
  expect(harness.actions.deleteContactLogEntry("contact-1")).toEqual({ changed: false, status: "blocked" });
  expect(harness.actions.saveMarketInfo("record-1", { agent: "Nope" })).toEqual({ changed: false, status: "blocked" });
  expect(harness.state.contactLog).toEqual([]);
  expect(harness.state.marketIntel).toEqual({});
  expect(harness.calls).toEqual([]);
});
