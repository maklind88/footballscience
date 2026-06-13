import { expect, test } from "@playwright/test";
import { createScoutingProfileTimelineService } from "../src/modules/scouting/index.mjs";

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

function createHarness(options = {}) {
  const record = { id: "record-1", name: "Ada Forward" };
  const state = {
    contactLog: [
      {
        contact: "Agent <A>",
        createdAt: "2026-06-16T12:00:00.000Z",
        date: "2026-06-16",
        id: "contact-1",
        nextStep: "Book call",
        notes: "Bring analyst",
        outcome: "Interested",
        recordId: "record-1",
        type: "agent",
      },
    ],
    marketIntel: {
      "record-1": {
        agent: "North Star",
        contractStatus: "contacted",
        dealProbability: "medium",
        estimatedFee: "500k",
        updatedAt: "2026-06-15T09:00:00.000Z",
      },
    },
    reports: [
      {
        confidence: 4,
        createdAt: "2026-06-18T10:00:00.000Z",
        recommendation: "shortlist",
        targetId: "target-1",
        title: "Recruitment memo",
      },
    ],
    targets: [
      {
        createdAt: "2026-06-10T10:00:00.000Z",
        id: "target-1",
        nextAction: "Live scout",
        owner: "Scout Lead",
        priority: "urgent",
        recordId: "record-1",
        status: "shortlist",
        updatedAt: "2026-06-17T10:00:00.000Z",
      },
    ],
  };
  const service = createScoutingProfileTimelineService({
    canEdit: () => options.canEdit !== false,
    ensureState: () => state,
    escapeHtml,
    findTargetByRecordId: (recordId, currentState) => currentState.targets.find((target) => target.recordId === recordId) || null,
    getContactLogForRecord: (recordId, currentState) => currentState.contactLog.filter((entry) => entry.recordId === recordId),
    getContactTypeOptions: () => [
      { value: "agent", label: "Agent call" },
      { value: "internal", label: "Internal note" },
    ],
    getContractStatusLabel: (value) => (value === "contacted" ? "Agent contacted" : "Unknown / unverified"),
    getMarketInfo: (recordId, currentState) => currentState.marketIntel[recordId] || {},
    getRecordId: (entry) => entry?.id || "",
    getReportsForTarget: (targetId, currentState) => currentState.reports.filter((report) => report.targetId === targetId),
    getShadowRecordMeta: () => ({ tag: "starter", updatedAt: "2026-06-14T10:00:00.000Z" }),
    getShadowSlotRecordIds: (slotId) => (options.shadow !== false && slotId === "slot-a" ? ["record-1"] : []),
    getShadowSlots: () => [
      { id: "slot-a", label: "CF" },
      { id: "slot-b", label: "RW" },
    ],
    getShadowTagOptions: () => [
      { value: "starter", label: "Starter watch" },
      { value: "depth", label: "Depth option" },
    ],
    getStatusOptions: () => [
      { value: "shortlist", label: "Shortlist" },
      { value: "monitoring", label: "Monitoring" },
    ],
    isRecordFavorited: () => options.favorite !== false,
    normalizeText,
    now: () => "2026-06-20T08:00:00.000Z",
  });
  return { record, service, state };
}

test("Scouting profile timeline service combines and sorts case events", () => {
  const { record, service } = createHarness();

  const items = service.getTimelineForRecord(record);

  expect(items.map((item) => item.label)).toEqual(["Report", "Pipeline", "Agent call", "Market", "Shadow XI", "Favorite"]);
  expect(items[0]).toMatchObject({
    date: "2026-06-18T10:00:00.000Z",
    detail: "shortlist / confidence 4/5",
    title: "Recruitment memo",
  });
  expect(items[1]).toMatchObject({
    detail: "urgent / Owner Scout Lead / Next: Live scout",
    title: "Shortlist",
  });
  expect(items[2]).toMatchObject({
    detail: "Interested / Next: Book call / Bring analyst",
    title: "Agent <A>",
  });
  expect(items[3]).toMatchObject({
    detail: "Agent North Star / Fee 500k / Deal medium",
    title: "Agent contacted",
  });
  expect(items[4]).toMatchObject({
    detail: "Starter watch",
    title: "Added to CF",
  });
});

test("Scouting profile timeline service renders timeline empty and populated states", () => {
  const { record, service, state } = createHarness();

  const markup = service.renderTimeline(record, state);

  expect(markup).toContain("6 events");
  expect(markup).toContain("Agent &lt;A&gt;");
  expect(markup).toContain("Report / 2026-06-18");
  expect(markup).toContain("Interested / Next: Book call / Bring analyst");

  const emptyHarness = createHarness({ favorite: false, shadow: false });
  emptyHarness.state.contactLog = [];
  emptyHarness.state.marketIntel = {};
  emptyHarness.state.reports = [];
  emptyHarness.state.targets = [];

  expect(emptyHarness.service.renderTimeline(emptyHarness.record, emptyHarness.state)).toContain("No case events yet");
});

test("Scouting profile timeline service renders editable contacts tab with timeline", () => {
  const { record, service, state } = createHarness();

  const markup = service.renderContactsTab(record, state);

  expect(markup).toContain(`data-scouting-contact-form="record-1"`);
  expect(markup).toContain(`value="2026-06-20"`);
  expect(markup).toContain(`<option value="agent">Agent call</option>`);
  expect(markup).toContain("Agent &lt;A&gt;");
  expect(markup).toContain(`data-delete-scouting-contact="contact-1"`);
  expect(markup).toContain("Case timeline");
});

test("Scouting profile timeline service locks contact writes when editing is unavailable", () => {
  const { record, service, state } = createHarness({ canEdit: false });

  const markup = service.renderContactsTab(record, state);

  expect(markup).toContain("Contact log is locked.");
  expect(markup).not.toContain("data-scouting-contact-form");
  expect(markup).not.toContain("data-delete-scouting-contact");
  expect(markup).toContain("Logged contacts");
});
