import { expect, test } from "@playwright/test";
import { createScoutingMiniRadarService } from "../src/modules/scouting/index.mjs";

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

function createShell(overrides = {}) {
  const listeners = {};
  const popover = { innerHTML: "" };
  return {
    dataset: {
      scoutingMiniRadarBound: "",
      scoutingMiniRadarLoaded: overrides.loaded || "",
      scoutingMiniRadarShell: Object.prototype.hasOwnProperty.call(overrides, "recordId") ? overrides.recordId : "record-1",
    },
    listeners,
    popover,
    addEventListener(type, handler, options) {
      listeners[type] = listeners[type] || [];
      listeners[type].push({ handler, options });
    },
    querySelector(selector) {
      return selector === "[role='img']" && overrides.popover !== false ? popover : null;
    },
  };
}

function createTemplate(items = []) {
  const template = [...items];
  template.profileLabel = "Wide role";
  return template;
}

function createHarness(overrides = {}) {
  const calls = {
    radarTemplates: 0,
    templatePercentiles: 0,
  };
  let benchmarkMode = overrides.benchmarkMode || "position";
  const records = new Map(
    (overrides.records || [{ id: "record-1", name: "Ada Forward" }]).map((record) => [record.id, record])
  );
  const shell = overrides.shell || createShell();
  const root = {
    querySelectorAll(selector) {
      return selector === "[data-scouting-mini-radar-shell]" ? [shell] : [];
    },
  };
  const service = createScoutingMiniRadarService({
    escapeHtml,
    getBenchmarkMode: () => benchmarkMode,
    getRadarTemplate: () => {
      calls.radarTemplates += 1;
      return overrides.template ?? createTemplate([
        { id: "pace", label: "Progressive carries p90", percentile: 72 },
        { id: "press", label: "Pressure volume", percentile: 61 },
        { id: "touch", label: "Box touches", percentile: 83 },
      ]);
    },
    getRecordById: (recordId) => records.get(recordId) || null,
    getRecordId: (record) => record?.id || "",
    getRoot: () => root,
    getTemplatePercentile: (_record, item) => {
      calls.templatePercentiles += 1;
      return item.percentile;
    },
    normalizeText,
  });
  return {
    calls,
    records,
    service,
    setBenchmarkMode(nextMode) {
      benchmarkMode = nextMode;
    },
    shell,
  };
}

test("Scouting mini radar service shortens noisy metric labels", () => {
  const harness = createHarness();

  expect(harness.service.getShortLabel("Progressive carries p90")).toBe("Progr carri");
  expect(harness.service.getShortLabel("Minutes weighted role use")).toBe("Minut weigh");
  expect(harness.service.getShortLabel("")).toBe("Metric");
  expect(harness.service.getShortLabel("xG")).toBe("xG");
});

test("Scouting mini radar service renders and caches markup per benchmark mode", () => {
  const harness = createHarness();

  const firstMarkup = harness.service.getMarkup({ id: "record-1" });
  const secondMarkup = harness.service.getMarkup({ id: "record-1" });
  harness.setBenchmarkMode("league");
  const leagueMarkup = harness.service.getMarkup({ id: "record-1" });

  expect(firstMarkup).toContain("scouting-mini-radar");
  expect(firstMarkup).toContain("Wide role");
  expect(firstMarkup).toContain("P72");
  expect(secondMarkup).toBe(firstMarkup);
  expect(leagueMarkup).toContain("scouting-mini-radar");
  expect(harness.calls.radarTemplates).toBe(2);
  expect(harness.calls.templatePercentiles).toBe(6);
  expect(harness.service.getCacheSize()).toBe(2);

  harness.service.resetCache();
  expect(harness.service.getCacheSize()).toBe(0);
});

test("Scouting mini radar service caches empty states for records without templates", () => {
  const harness = createHarness({ template: [] });

  expect(harness.service.getMarkup({ id: "record-1" })).toBe(`<div class="scouting-mini-radar-empty">No data</div>`);
  expect(harness.service.getMarkup({ id: "record-1" })).toBe(`<div class="scouting-mini-radar-empty">No data</div>`);
  expect(harness.calls.radarTemplates).toBe(1);
  expect(harness.service.getCacheSize()).toBe(1);
});

test("Scouting mini radar service hydrates valid shells and fails closed for missing pieces", () => {
  const harness = createHarness();

  expect(harness.service.hydrateShell(harness.shell)).toEqual({ changed: true, recordId: "record-1", status: "hydrated" });
  expect(harness.shell.dataset.scoutingMiniRadarLoaded).toBe("1");
  expect(harness.shell.popover.innerHTML).toContain("scouting-mini-radar");

  expect(harness.service.hydrateShell(harness.shell)).toEqual({ changed: false, status: "skipped" });
  const missingIdHarness = createHarness({ shell: createShell({ recordId: "" }) });
  expect(missingIdHarness.service.hydrateShell(missingIdHarness.shell)).toEqual({
    changed: false,
    status: "missing-record-id",
  });
  const missingRecordHarness = createHarness({ shell: createShell({ recordId: "missing" }) });
  expect(missingRecordHarness.service.hydrateShell(missingRecordHarness.shell)).toEqual({
    changed: false,
    recordId: "missing",
    status: "missing-record",
  });
  const missingPopoverHarness = createHarness({ shell: createShell({ popover: false }) });
  expect(missingPopoverHarness.service.hydrateShell(missingPopoverHarness.shell)).toEqual({
    changed: false,
    recordId: "record-1",
    status: "missing-popover",
  });
});

test("Scouting mini radar service binds hover and focus hydration once per shell", () => {
  const harness = createHarness();

  expect(harness.service.bindShells()).toBe(1);
  expect(harness.service.bindShells()).toBe(1);
  expect(harness.shell.dataset.scoutingMiniRadarBound).toBe("1");
  expect(harness.shell.listeners.mouseenter).toHaveLength(1);
  expect(harness.shell.listeners.focusin).toHaveLength(1);
  expect(harness.shell.listeners.mouseenter[0].options).toEqual({ passive: true });

  harness.shell.listeners.mouseenter[0].handler();
  expect(harness.shell.dataset.scoutingMiniRadarLoaded).toBe("1");
  expect(harness.shell.popover.innerHTML).toContain("scouting-mini-radar");
});
