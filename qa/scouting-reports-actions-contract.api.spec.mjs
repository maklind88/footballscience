import { expect, test } from "@playwright/test";
import { createScoutingReportsActions } from "../src/modules/scouting/index.mjs";

function normalizeText(value = "", limit = 160) {
  return String(value || "").trim().slice(0, limit);
}

function normalizeStatus(value = "") {
  return ["new", "monitoring", "longlist", "shortlist"].includes(normalizeText(value, 40)) ? normalizeText(value, 40) : "new";
}

function normalizePriority(value = "") {
  return ["low", "normal", "high", "urgent"].includes(normalizeText(value, 40)) ? normalizeText(value, 40) : "normal";
}

function createHarness(options = {}) {
  const calls = [];
  const state = {
    targets: Array.isArray(options.targets) ? options.targets.slice() : [],
    reports: Array.isArray(options.reports) ? options.reports.slice() : [],
  };
  const records = new Map([
    [
      "record-1",
      { id: "record-1", name: "Player One", team: "FC Test", position: "CF", age: 22, roleFit: 84 },
    ],
  ]);
  let builderOpen = false;
  let expandedPanels = new Set(options.expandedPanels || []);
  let idCounter = 0;
  const actions = createScoutingReportsActions({
    canEdit: () => options.canEdit !== false,
    createId: (prefix) => `${prefix}-${++idCounter}`,
    ensureState: () => state,
    getExpandedPanels: () => expandedPanels,
    getRecordAge: (record) => record?.age || "",
    getRecordById: (recordId) => records.get(normalizeText(recordId, 160)) || null,
    getRecordId: (record) => record?.id || "",
    getRecordName: (record) => record?.name || "",
    getRecordPosition: (record) => record?.position || "",
    getRecordTeam: (record) => record?.team || "",
    getReports: (currentState) =>
      (Array.isArray(currentState.reports) ? currentState.reports : []).slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
    getRoleFitScore: (record) => record?.roleFit,
    getTargets: (currentState) => (Array.isArray(currentState.targets) ? currentState.targets : []),
    normalizeDateText: (value) => (/^\d{4}-\d{2}-\d{2}$/.test(normalizeText(value, 20)) ? normalizeText(value, 20) : ""),
    normalizeReportRecommendation: (value) => (["monitor", "sign", "shortlist", "reject"].includes(normalizeText(value, 40)) ? normalizeText(value, 40) : "monitor"),
    normalizeReportScore: (value, fallback = 3) => {
      const number = Number(value);
      return Number.isFinite(number) ? Math.max(1, Math.min(5, Math.round(number))) : fallback;
    },
    normalizeTargetPriority: normalizePriority,
    normalizeTargetStatus: normalizeStatus,
    normalizeText,
    now: () => "2026-06-12T10:00:00.000Z",
    rememberRecordSnapshot: (record, currentState) => calls.push(["snapshot", record.id, currentState === state]),
    renderWorkspace: (renderOptions) => calls.push(["render", renderOptions]),
    rerenderActiveContent: (renderOptions) => {
      calls.push(["rerender-active", renderOptions]);
      return options.rerenderActive !== false;
    },
    setExpandedPanels: (panels) => {
      expandedPanels = panels;
      calls.push(["panels", [...expandedPanels]]);
    },
    setReportBuilderOpen: (open) => {
      builderOpen = Boolean(open);
      calls.push(["builder", builderOpen]);
    },
    touchIntelligenceCache: () => calls.push(["touch"]),
    writeState: () => calls.push(["write"]),
  });
  return {
    actions,
    calls,
    get builderOpen() {
      return builderOpen;
    },
    get expandedPanels() {
      return expandedPanels;
    },
    state,
  };
}

test("Scouting Reports actions create and delete normalized reports", () => {
  const harness = createHarness();

  const created = harness.actions.createReport({
    title: "  Winger report ",
    targetId: "target-1",
    summary: "Strong role fit",
    recommendation: "sign",
    confidence: 9,
    technical: 4,
  });

  expect(created).toMatchObject({ changed: true, status: "updated" });
  expect(harness.state.reports[0]).toMatchObject({
    id: "scouting-report-1",
    title: "Winger report",
    targetId: "target-1",
    summary: "Strong role fit",
    recommendation: "sign",
    confidence: 5,
    technical: 4,
    tactical: 3,
    createdAt: "2026-06-12T10:00:00.000Z",
  });

  const deleted = harness.actions.deleteReport("scouting-report-1");
  expect(deleted).toMatchObject({ changed: true, reportId: "scouting-report-1", status: "updated" });
  expect(harness.state.reports).toEqual([]);
  expect(harness.calls.filter((call) => call[0] === "write")).toHaveLength(2);
});

test("Scouting Reports actions preserve blank form guard and opposition target isolation", () => {
  const harness = createHarness();

  expect(harness.actions.createReportFromForm("", "player", "target-1", "")).toEqual({ changed: false, status: "empty" });
  const created = harness.actions.createReportFromForm("Opposition memo", "opposition", "target-1", "Press high");

  expect(created).toMatchObject({ changed: true, status: "updated" });
  expect(harness.state.reports[0]).toMatchObject({
    title: "Opposition memo",
    type: "opposition",
    targetId: "",
    summary: "Press high",
  });
});

test("Scouting Reports actions save, update, and remove pipeline targets", () => {
  const harness = createHarness();

  const saved = harness.actions.saveTarget("record-1", {
    status: "monitoring",
    priority: "high",
    notes: "Watch next match",
    owner: "Scout",
  });

  expect(saved).toMatchObject({ changed: true, status: "updated" });
  expect(harness.state.targets[0]).toMatchObject({
    id: "scouting-target-1",
    recordId: "record-1",
    name: "Player One",
    club: "FC Test",
    position: "CF",
    age: "22",
    status: "monitoring",
    priority: "high",
    fit: "P84",
    notes: "Watch next match",
    owner: "Scout",
  });

  const updated = harness.actions.updateTarget("scouting-target-1", { priority: "urgent", nextActionDate: "2026-06-20" });
  expect(updated).toMatchObject({ changed: true, status: "updated" });
  expect(harness.state.targets[0]).toMatchObject({ priority: "urgent", nextActionDate: "2026-06-20" });

  const removed = harness.actions.removeTarget("scouting-target-1");
  expect(removed).toMatchObject({ changed: true, targetId: "scouting-target-1", status: "updated" });
  expect(harness.state.targets).toEqual([]);
  expect(harness.calls.filter((call) => call[0] === "touch")).toHaveLength(3);
});

test("Scouting Reports actions manage builder and lazy panels without owning DOM", () => {
  const harness = createHarness({ expandedPanels: ["comparison-lab"] });

  expect(harness.actions.openBuilder()).toMatchObject({ changed: true });
  expect(harness.builderOpen).toBe(true);
  expect(harness.actions.closeBuilder()).toMatchObject({ changed: true });
  expect(harness.builderOpen).toBe(false);

  expect(harness.actions.expandPanel("targets")).toMatchObject({ changed: true, panelId: "targets" });
  expect([...harness.expandedPanels]).toEqual(["comparison-lab", "targets"]);
  expect(harness.actions.collapsePanel("comparison-lab")).toMatchObject({ changed: true, panelId: "comparison-lab" });
  expect([...harness.expandedPanels]).toEqual(["targets"]);
  expect(harness.calls.filter((call) => call[0] === "rerender-active")).toHaveLength(2);
});

test("Scouting Reports actions fail closed when editing is unavailable", () => {
  const harness = createHarness({ canEdit: false, reports: [{ id: "report-1", title: "Saved" }] });

  expect(harness.actions.openBuilder()).toEqual({ changed: false, status: "blocked" });
  expect(harness.actions.createReport({ title: "Nope" })).toEqual({ changed: false, status: "blocked" });
  expect(harness.actions.deleteReport("report-1")).toEqual({ changed: false, status: "blocked" });
  expect(harness.actions.saveTarget("record-1")).toEqual({ changed: false, status: "blocked" });
  expect(harness.state.reports).toEqual([{ id: "report-1", title: "Saved" }]);
  expect(harness.state.targets).toEqual([]);
});
