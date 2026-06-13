import { expect, test } from "@playwright/test";
import { createScoutingMyTeamPitchService } from "../src/modules/scouting/index.mjs";

function normalizeText(value = "", limit = 160) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function createHarness(overrides = {}) {
  const state = overrides.state || {
    myTeam: {
      positions: {},
      slots: {},
    },
  };
  const formations = new Set(["4-3-3", "4-2-3-1", "3-4-3", "3-5-2", "4-4-2"]);
  const service = createScoutingMyTeamPitchService({
    ensureState: () => state,
    getMyTeamState: (currentState = state) => currentState.myTeam,
    normalizeFormation: (value) => {
      const formation = normalizeText(value, 40);
      return formations.has(formation) ? formation : "4-3-3";
    },
    normalizeSlotPlayerIds: (slotValue) => {
      const seen = new Set();
      return (Array.isArray(slotValue) ? slotValue : [slotValue])
        .map((playerId) => normalizeText(playerId, 160))
        .filter((playerId) => {
          if (!playerId || seen.has(playerId)) {
            return false;
          }
          seen.add(playerId);
          return true;
        });
    },
    normalizeText,
  });
  return { service, state };
}

test("Scouting My Team pitch service returns formation coordinates and slot fallbacks", () => {
  const harness = createHarness();

  expect(harness.service.getSlotPitchPosition({ id: "rw", label: "RW" }, "4-2-3-1")).toEqual({ x: 87, y: 29 });
  expect(harness.service.getSlotPitchPosition({ id: "cf", label: "CF" }, "3-5-2")).toEqual({ x: 57, y: 16 });
  expect(harness.service.getSlotPitchPosition({ id: "custom", label: "Custom", x: 18, y: 44 }, "unknown")).toEqual({ x: 18, y: 44 });
  expect(harness.service.getSlotPitchPosition({ id: "custom", label: "Custom", x: 0, y: 0 }, "unknown")).toEqual({ x: 50, y: 50 });
});

test("Scouting My Team pitch service prefers saved formation overrides", () => {
  const harness = createHarness({
    state: {
      myTeam: {
        positions: {
          "4-3-3": {
            rb: { x: 101.555, y: 3.111 },
          },
        },
        slots: {},
      },
    },
  });

  expect(harness.service.getSlotPitchPosition({ id: "rb", label: "RB" }, "4-3-3")).toEqual({ x: 96, y: 4 });
});

test("Scouting My Team pitch service normalizes pointer coordinates from pitch bounds", () => {
  const harness = createHarness();
  const pitch = {
    getBoundingClientRect: () => ({ height: 200, left: 20, top: 10, width: 400 }),
  };

  expect(harness.service.getPointerPitchPosition({ clientX: 220, clientY: 60 }, pitch)).toEqual({ x: 50, y: 25 });
  expect(harness.service.getPointerPitchPosition({ clientX: -10, clientY: 300 }, pitch)).toEqual({ x: 4, y: 96 });
  expect(harness.service.getPointerPitchPosition({ clientX: 0, clientY: 0 }, { getBoundingClientRect: () => ({ height: 0, width: 200 }) })).toBeNull();
});

test("Scouting My Team pitch service previews slot position without owning DOM state", () => {
  const harness = createHarness();
  const writes = [];
  const slotElement = {
    style: {
      setProperty(name, value) {
        writes.push([name, value]);
      },
    },
  };

  expect(harness.service.previewSlotPitchPosition(slotElement, { x: 12.5, y: 77.25 })).toBe(true);
  expect(writes).toEqual([
    ["--x", "12.5%"],
    ["--y", "77.25%"],
  ]);
  expect(harness.service.previewSlotPitchPosition(null, { x: 1, y: 2 })).toBe(false);
});

test("Scouting My Team pitch service returns deduped assigned ids from normalized slots", () => {
  const harness = createHarness({
    state: {
      myTeam: {
        positions: {},
        slots: {
          cf: ["player-1", "player-2", "player-1", ""],
          rb: "player-3",
        },
      },
    },
  });

  expect([...harness.service.getAssignedIds()]).toEqual(["player-1", "player-2", "player-3"]);
});
