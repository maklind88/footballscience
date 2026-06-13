import { expect, test } from "@playwright/test";
import { createScoutingProfileOverviewController } from "../src/modules/scouting/index.mjs";

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

function formatNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? String(Math.round(number * 10) / 10) : "n/a";
}

function createElement(overrides = {}) {
  return {
    className: overrides.className || "",
    dataset: { ...(overrides.dataset || {}) },
    outerHTML: overrides.outerHTML || "",
    textContent: overrides.textContent || "",
    children: new Map(Object.entries(overrides.children || {})),
    querySelector(selector) {
      return this.children.get(selector) || null;
    },
    querySelectorAll(selector) {
      if (selector === "[data-scouting-profile-overview-shell]") {
        return this.overviewShells || [];
      }
      return [];
    },
  };
}

function createDecisionStrip() {
  const nodes = {
    roleFit: createElement(),
    roleFitLabel: createElement(),
    roleFloor: createElement(),
    roleFloorLabel: createElement(),
    confidence: createElement(),
    signalLabel: createElement(),
    roleStack: createElement(),
    roleStackLabel: createElement(),
  };
  const strip = createElement({
    children: {
      "[data-scouting-profile-role-fit]": nodes.roleFit,
      "[data-scouting-profile-role-fit-label]": nodes.roleFitLabel,
      "[data-scouting-profile-role-floor]": nodes.roleFloor,
      "[data-scouting-profile-role-floor-label]": nodes.roleFloorLabel,
      "[data-scouting-profile-confidence]": nodes.confidence,
      "[data-scouting-profile-best-signal]": nodes.signalLabel,
      "[data-scouting-profile-role-stack]": nodes.roleStack,
      "[data-scouting-profile-role-stack-label]": nodes.roleStackLabel,
    },
  });
  return { nodes, strip };
}

function createModal(recordId = "record-1") {
  const { nodes, strip } = createDecisionStrip();
  const shell = createElement({
    dataset: { scoutingProfileOverviewShell: recordId },
    outerHTML: "<section data-scouting-profile-overview-shell>Loading</section>",
  });
  const modal = createElement({
    children: {
      "[data-scouting-profile-decision-strip]": strip,
    },
  });
  modal.overviewShells = [shell];
  return { modal, nodes, shell };
}

function createHarness(overrides = {}) {
  const calls = [];
  const record = { id: "record-1", player: "Ada Forward" };
  const records = new Map([[record.id, record]]);
  const scheduled = [];
  const state = {
    profileRoleProfileId: overrides.roleProfileId || "role-cf",
    profileTab: overrides.profileTab || "overview",
    selectedRecordId: overrides.selectedRecordId || "record-1",
  };
  const modalParts = createModal(overrides.shellRecordId || "record-1");
  let modal = overrides.modal === false ? null : modalParts.modal;
  const controller = createScoutingProfileOverviewController({
    ensureState: () => state,
    escapeHtml,
    formatNumber,
    getIntelligenceProfile: (_record, _state, roleId) => {
      calls.push(["intelligence", roleId]);
      return {
        confidence: { label: "Strong <trust>" },
        floor: { label: "Floor & signal", score: 64.4 },
        roleLabel: "Wide & Runner",
        signal: { headline: "Elite <press>" },
      };
    },
    getProfileModal: () => modal,
    getProfileRows: () => {
      calls.push(["profile-rows"]);
      return [{ season: "2026" }, { season: "2025" }];
    },
    getRecordById: (recordId) => records.get(recordId) || null,
    getRoleFitLabel: (score) => `Role fit ${score}`,
    getRoleFitScore: (_record, roleId) => {
      calls.push(["role-fit", roleId]);
      return 87.6;
    },
    getRoleFitTier: () => "high",
    getShadowSlotRecordIds: (slotId) => (slotId === "slot-a" ? ["record-1"] : []),
    getShadowSlots: () => [
      { id: "slot-a", label: "LCB & Cover" },
      { id: "slot-b", label: "RB" },
    ],
    normalizeProfileTab: (value) => (value === "overview" ? "overview" : "other"),
    normalizeRoleProfileId: (value, fallback = "auto") => normalizeText(value || fallback, 80),
    normalizeText,
    renderDossier: (latestRecord, _latestState, rows) => {
      calls.push(["render-dossier", latestRecord.id, rows.length]);
      return `<section data-dossier="${escapeHtml(latestRecord.id)}">${rows.length}</section>`;
    },
    renderShell: (latestRecord) => `<shell>${escapeHtml(latestRecord.id)}</shell>`,
    setTimeout: (callback, delayMs) => {
      scheduled.push({ callback, delayMs });
      return scheduled.length;
    },
  });
  return {
    calls,
    controller,
    modalParts,
    records,
    runScheduled(index = 0) {
      scheduled[index]?.callback();
    },
    scheduled,
    setModal(nextModal) {
      modal = nextModal;
    },
    state,
  };
}

test("Scouting profile overview controller delegates shell rendering", () => {
  const harness = createHarness();

  expect(harness.controller.renderShell({ id: "record-1" })).toBe("<shell>record-1</shell>");
});

test("Scouting profile overview controller guards invalid and duplicate hydration", () => {
  expect(createHarness().controller.hydrateOverview("")).toEqual({ changed: false, status: "empty" });

  const inactiveHarness = createHarness({ selectedRecordId: "record-2" });
  expect(inactiveHarness.controller.hydrateOverview("record-1")).toEqual({
    changed: false,
    recordId: "record-1",
    status: "inactive",
  });

  const missingModalHarness = createHarness({ modal: false });
  expect(missingModalHarness.controller.hydrateOverview("record-1")).toEqual({
    changed: false,
    recordId: "record-1",
    status: "missing-modal",
  });

  const missingRecordHarness = createHarness();
  missingRecordHarness.records.clear();
  expect(missingRecordHarness.controller.hydrateOverview("record-1")).toEqual({
    changed: false,
    recordId: "record-1",
    status: "missing-record",
  });

  const inProgressHarness = createHarness();
  expect(inProgressHarness.controller.hydrateOverview("record-1")).toEqual({
    changed: false,
    recordId: "record-1",
    status: "scheduled",
  });
  expect(inProgressHarness.controller.hydrateOverview("record-1")).toEqual({
    changed: false,
    recordId: "record-1",
    status: "in-progress",
  });
  expect(inProgressHarness.scheduled).toHaveLength(1);
  expect(inProgressHarness.controller.getInProgressRecordIds()).toEqual(["record-1"]);
});

test("Scouting profile overview controller hydrates dossier and decision strip on the idle callback", () => {
  const harness = createHarness();

  expect(harness.controller.hydrateOverview("record-1")).toEqual({
    changed: false,
    recordId: "record-1",
    status: "scheduled",
  });
  expect(harness.scheduled.map((entry) => entry.delayMs)).toEqual([80]);

  harness.runScheduled();

  const { nodes, shell } = harness.modalParts;
  expect(shell.outerHTML).toBe(`<section data-dossier="record-1">2</section>`);
  expect(nodes.roleFit.className).toBe("is-high");
  expect(nodes.roleFit.textContent).toBe("P87.6");
  expect(nodes.roleFitLabel.textContent).toBe("Role fit 87.6 / Wide &amp; Runner");
  expect(nodes.roleFloor.textContent).toBe("P64.4");
  expect(nodes.roleFloorLabel.textContent).toBe("Floor &amp; signal");
  expect(nodes.confidence.textContent).toBe("Strong &lt;trust&gt;");
  expect(nodes.signalLabel.textContent).toBe("Elite &lt;press&gt;");
  expect(nodes.roleStack.textContent).toBe("1");
  expect(nodes.roleStackLabel.textContent).toBe("LCB &amp; Cover");
  expect(harness.calls).toEqual([
    ["profile-rows"],
    ["render-dossier", "record-1", 2],
    ["role-fit", "role-cf"],
    ["intelligence", "role-cf"],
  ]);
  expect(harness.controller.getInProgressRecordIds()).toEqual([]);
});

test("Scouting profile overview controller drops stale scheduled hydration", () => {
  const harness = createHarness();

  harness.controller.hydrateOverview("record-1");
  harness.state.selectedRecordId = "record-2";
  harness.runScheduled();

  expect(harness.modalParts.shell.outerHTML).toBe("<section data-scouting-profile-overview-shell>Loading</section>");
  expect(harness.calls).toEqual([]);
  expect(harness.controller.getInProgressRecordIds()).toEqual([]);
});

test("Scouting profile overview controller can clear queued in-flight state", () => {
  const harness = createHarness();

  harness.controller.hydrateOverview("record-1");
  expect(harness.controller.getInProgressRecordIds()).toEqual(["record-1"]);

  harness.controller.clearInProgress();

  expect(harness.controller.getInProgressRecordIds()).toEqual([]);
});
