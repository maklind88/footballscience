import { expect, test } from "@playwright/test";
import { handleScoutingWorkspaceClick } from "../src/modules/scouting/index.mjs";

function createEvent(target) {
  return {
    target,
    prevented: 0,
    stopped: 0,
    preventDefault() {
      this.prevented += 1;
    },
    stopPropagation() {
      this.stopped += 1;
    },
  };
}

function createTarget(matches = {}) {
  return {
    closest(selector) {
      return Object.prototype.hasOwnProperty.call(matches, selector) ? matches[selector] : null;
    },
  };
}

test("Scouting click router manages record action menus before module handlers", () => {
  const closedMenus = [];
  const currentMenu = { open: false, removeAttribute: (name) => closedMenus.push(["current", name]) };
  const otherMenu = { removeAttribute: (name) => closedMenus.push(["other", name]) };
  const trigger = {
    dataset: { toggleScoutingRecordMoreMenu: " record-7 " },
    closest: (selector) => (selector === ".scouting-record-more-menu" ? currentMenu : null),
  };
  const event = createEvent(createTarget({ "[data-toggle-scouting-record-more-menu]": trigger }));
  const opened = [];

  const handled = handleScoutingWorkspaceClick(event, {
    getWorkspaceRoot: () => ({
      querySelectorAll: () => [currentMenu, otherMenu],
    }),
    handleModuleClick: () => {
      throw new Error("Module click should not run for menu toggles.");
    },
    normalizeText: (value) => String(value || "").trim(),
    setOpenRecordActionMenuId: (recordId) => opened.push(recordId),
  });

  expect(handled).toBe(true);
  expect(opened).toEqual(["record-7"]);
  expect(closedMenus).toEqual([["other", "open"]]);
});

test("Scouting click router lets tab clicks stop propagation and switch tab", () => {
  const tabTrigger = { dataset: { scoutingTab: "lists" } };
  const event = createEvent(createTarget({ "[data-scouting-tab]": tabTrigger }));
  const calls = [];

  const handled = handleScoutingWorkspaceClick(event, {
    handleModuleClick: () => {
      throw new Error("Tab clicks should not run module click handlers.");
    },
    setActiveTab: (tabId) => calls.push(tabId),
  });

  expect(handled).toBe(true);
  expect(event.prevented).toBe(1);
  expect(event.stopped).toBe(1);
  expect(calls).toEqual(["lists"]);
});

test("Scouting click router prioritizes tab module handlers before global record actions", () => {
  const favoriteTrigger = { dataset: { toggleScoutingFavorite: "record-2" } };
  const event = createEvent(createTarget({ "[data-toggle-scouting-favorite]": favoriteTrigger }));
  const calls = [];

  const handled = handleScoutingWorkspaceClick(event, {
    handleModuleClick: () => {
      calls.push("module");
      return true;
    },
    toggleFavorite: () => calls.push("favorite"),
  });

  expect(handled).toBe(true);
  expect(calls).toEqual(["module"]);
});

test("Scouting click router opens record rows unless the click starts inside controls", () => {
  const rowTrigger = { dataset: { scoutingRecordRow: "record-9" } };
  const calls = [];

  const rowEvent = createEvent(createTarget({ "[data-scouting-record-row]": rowTrigger }));
  expect(handleScoutingWorkspaceClick(rowEvent, { handleModuleClick: () => false, openRecordProfile: (id) => calls.push(id) })).toBe(true);
  expect(calls).toEqual(["record-9"]);

  const controlEvent = createEvent(createTarget({ "[data-scouting-record-row]": rowTrigger, "button, a, input, select, textarea, details, summary": {} }));
  expect(handleScoutingWorkspaceClick(controlEvent, { handleModuleClick: () => false, openRecordProfile: (id) => calls.push(id) })).toBe(false);
  expect(calls).toEqual(["record-9"]);
});
