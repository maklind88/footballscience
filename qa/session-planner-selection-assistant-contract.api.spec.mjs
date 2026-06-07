import { expect, test } from "@playwright/test";
import { createSessionPlannerSelectionAssistant } from "../src/modules/session-planner/index.mjs";

function createAssistant(overrides = {}) {
  return createSessionPlannerSelectionAssistant({
    clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
    comparePlayers: (first = {}, second = {}) => String(first.name || "").localeCompare(String(second.name || "")),
    getBridgeBestMatches: (player = {}) =>
      player.roleFit
        ? Object.entries(player.roleFit)
            .sort((first, second) => Number(second[1]) - Number(first[1]))
            .map(([role, score]) => ({ role, score: Math.round(Number(score)) }))
        : [],
    getCareerScore: (player = {}) => player.careerPhasePriority ?? 50,
    getFormationInput: () => "4-3-3",
    getImportanceScore: (player = {}) => player.squadImportance ?? 45,
    getMinutesScore: (player = {}) => player.seasonMinutes ?? 0,
    getRoleGroupForRole: (role = "") => (["CB", "LB", "RB", "GK", "6"].includes(role) ? "defender" : "attacker"),
    normalizePlayerProfileRole: (value = "") => String(value || "").trim().toUpperCase(),
    normalizeProfileKey: (value = "") => String(value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, ""),
    normalizeRoleGroupKey: (value = "") => String(value || "").trim().toLowerCase(),
    normalizeSquadStatusKey: (value = "") => String(value || "").trim().toLowerCase(),
    parseFormation: (value = "") => String(value).split("-").map((part) => Number(part)).filter(Number.isFinite),
    ...overrides,
  });
}

test("Session Planner Selection Assistant classifies block intent from coaching text", () => {
  const assistant = createAssistant();

  expect(assistant.getProfile({ title: "Final third finishing and cutback attacks" })).toMatchObject({
    key: "final-third",
    roles: ["LW", "RW", "ST", "10", "8"],
  });
  expect(assistant.getProfile({ objective: "Defensive block, compact pressing" })).toMatchObject({
    key: "defensive",
    roles: ["GK", "CB", "LB", "RB", "6", "8"],
  });
  expect(assistant.getProfile({ title: "General possession exercise" })).toMatchObject({
    key: "possession",
  });
});

test("Session Planner Selection Assistant ranks players without writing session data", () => {
  const assistant = createAssistant();
  const block = { title: "Final third attack" };
  const boardPlayers = [
    {
      participation: 100,
      player: {
        id: "p1",
        name: "Wide Creator",
        primaryRole: "LW",
        secondaryRoles: ["RW"],
        roleFit: { LW: 92, RW: 88 },
        squadStatus: "important",
        careerPhase: "peak",
        squadImportance: 100,
        careerPhasePriority: 100,
        seasonMinutes: 900,
        profileId: "profile-1",
      },
    },
    {
      participation: 75,
      player: {
        id: "p2",
        name: "Fallback Defender",
        primaryRole: "CB",
        roleGroup: "defender",
        squadImportance: 55,
        careerPhasePriority: 60,
        seasonMinutes: 200,
      },
    },
  ];

  const result = assistant.buildSelectionAssistant(block, boardPlayers);

  expect(result.targetCount).toBe(2);
  expect(result.suggestions[0].item.player.id).toBe("p1");
  expect(result.suggestions[0].reason).toContain("Role DNA LW 92%");
  expect(result.suggestions[1].reason).toContain("Fallback selection");
  expect(result.selectedRoleCoverage.some((entry) => entry.role === "LW" && entry.covered)).toBe(true);
});

test("Session Planner Selection Assistant falls back to board size when formation is empty", () => {
  const assistant = createAssistant({ getFormationInput: () => "" });
  const boardPlayers = Array.from({ length: 12 }, (_, index) => ({
    participation: 100,
    player: { id: `p${index}`, name: `Player ${index}`, primaryRole: "ST" },
  }));

  expect(assistant.getTargetCount(boardPlayers)).toBe(10);
});
