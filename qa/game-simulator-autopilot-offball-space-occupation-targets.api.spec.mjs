import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotOffballSpaceOccupationTargets } from "../src/modules/game-simulator/autopilot-offball-space-occupation-targets.mjs";

const pitch = { length: 105, width: 68 };

function createSpaceOccupationDeps(overrides = {}) {
  const players = overrides.players ?? [
    { id: "H2", team: "home", roleKey: "wideBack", position: { x: 42, y: 10 } },
    { id: "H3", team: "home", roleKey: "wideBack", position: { x: 43, y: 58 } },
    { id: "H7", team: "home", roleKey: "wideForward", position: { x: 55, y: 58 } },
    { id: "H8", team: "home", roleKey: "connector", position: { x: 52, y: 18 } },
    { id: "H10", team: "home", roleKey: "connector", position: { x: 51, y: 50 } },
    { id: "H13", team: "home", roleKey: "connector", position: { x: 49, y: 52 } },
    { id: "H6", team: "home", roleKey: "pivot", position: { x: 46, y: 30 } },
    { id: "H9", team: "home", roleKey: "striker", position: { x: 63, y: 34 } },
    { id: "H12", team: "home", roleKey: "secondStriker", position: { x: 60, y: 36 } },
    { id: "H99", team: "home", roleKey: "rest", position: { x: 37, y: 34 } },
  ];
  let lineDepths = overrides.lineDepths ?? { forward: 30, midfield: 47, back: 65 };
  let gameSpaceKey = overrides.gameSpaceKey ?? "space2";
  const getWideSideSign = (pointOrPlayer) => {
    const y = Number.isFinite(pointOrPlayer?.y) ? pointOrPlayer.y : pointOrPlayer?.position?.y;
    return y < pitch.width / 2 ? -1 : 1;
  };
  const pickPlayer = (teamId, roleKeys, targets, excludedIds = new Set(), preferredSide = 0) => {
    const desiredSide = Math.sign(preferredSide);
    return players.find((player) => {
      if (player.team !== teamId || excludedIds.has(player.id) || !targets.has(player.id)) {
        return false;
      }
      if (!roleKeys.includes(player.roleKey)) {
        return false;
      }
      return !desiredSide || getWideSideSign(player) === desiredSide;
    }) ?? null;
  };

  return {
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    clampToPitch: (point, inset = 0) => ({
      x: Math.max(inset, Math.min(pitch.length - inset, point.x)),
      y: Math.max(inset, Math.min(pitch.width - inset, point.y)),
    }),
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getAttackingDepth: (point, teamId) => (teamId === "home" ? point.x : pitch.length - point.x),
    getAttackingGameSpaceProfile: () => ({
      key: gameSpaceKey,
      lineDepths,
      nextLineDepth: lineDepths.back,
    }),
    getDepthPoint: (teamId, depth, overridesForPoint = {}) => ({
      x: teamId === "home" ? depth : pitch.length - depth,
      y: overridesForPoint.y ?? pitch.width / 2,
    }),
    getMovableAutopilotPlayerByRoles: pickPlayer,
    getMovableAutopilotPlayerByRolesOnSide: (teamId, roleKeys, targets, excludedIds, sideSign) =>
      pickPlayer(teamId, roleKeys, targets, excludedIds, sideSign),
    getOpponentBlockReadProfile: () => overrides.block ?? {
      ballSide: -1,
      compactCenter: 0.68,
      ballSideCompression: 0.52,
      lineGap: 0.5,
      highLine: 0.46,
      deepBlock: 0.1,
      nearBallPressure: 0.28,
      lineDepths,
    },
    getOpponentLineDepthsForAttackingTeam: () => lineDepths,
    getPitchThreatProfile: () => overrides.threat ?? { box: 0.08, cutbackZone: 0.08 },
    getWideSideSign,
    isTransitionAttackStyle: (styleKey) => styleKey === "transition",
    isWidePrincipleZone: (point) => Math.abs(point.y - pitch.width / 2) >= 17,
    lerp: (start, end, weight) => start + (end - start) * weight,
    pitch,
    players,
    setAutopilotPrincipleTarget: (targets, player, target) => {
      if (!player || !target) {
        return false;
      }
      targets.set(player.id, target);
      return true;
    },
    setGameSpaceKey(nextKey) {
      gameSpaceKey = nextKey;
    },
    setLineDepths(nextLineDepths) {
      lineDepths = nextLineDepths;
    },
    uniquePrincipleLabels: (labels = []) => [...new Set(labels.filter(Boolean))],
    ...overrides,
  };
}

function createTargets(players) {
  return new Map(players.map((player) => [player.id, { ...player.position }]));
}

const profile = {
  crossBias: 0.62,
  directness: 0.66,
  lineBreakBias: 0.62,
  overlapBias: 0.62,
  phaseKey: "openPlay",
  restBehind: 22,
  runnerBoost: 8,
  shortSupport: 0.66,
  styleKey: "balanced",
  switchBias: 0.58,
  tempo: 0.64,
  width: 60,
  widthDiscipline: 0.7,
};

test("game simulator autopilot offball space occupation targets expose moved contracts", () => {
  const spaceOccupation = createGameSimulatorAutopilotOffballSpaceOccupationTargets(createSpaceOccupationDeps());

  expect(typeof spaceOccupation.getOpponentBlockOccupationTarget).toBe("function");
  expect(typeof spaceOccupation.applyOpponentBlockResponsiveTargets).toBe("function");
  expect(typeof spaceOccupation.getGameSpaceOffBallTarget).toBe("function");
  expect(typeof spaceOccupation.applyGameSpaceOffBallPrincipleTargets).toBe("function");
});

test("game simulator autopilot offball space occupation targets read live line depth data", () => {
  const deps = createSpaceOccupationDeps();
  const spaceOccupation = createGameSimulatorAutopilotOffballSpaceOccupationTargets(deps);
  const ballPoint = { x: 52, y: 20 };

  const defaultRun = spaceOccupation.getOpponentBlockOccupationTarget("home", ballPoint, "highLineRun", null, -1, profile);
  deps.setLineDepths({ forward: 34, midfield: 60, back: 84 });
  const highLineRun = spaceOccupation.getOpponentBlockOccupationTarget("home", ballPoint, "highLineRun", null, -1, profile);

  expect(highLineRun.x).toBeGreaterThan(defaultRun.x + 15);
});

test("game simulator autopilot offball space occupation targets preserve opponent block labels", () => {
  const deps = createSpaceOccupationDeps();
  const spaceOccupation = createGameSimulatorAutopilotOffballSpaceOccupationTargets(deps);
  const targets = createTargets(deps.players);
  const excludedIds = new Set();

  const labels = spaceOccupation.applyOpponentBlockResponsiveTargets(
    "home",
    targets,
    { x: 54, y: 20 },
    {},
    profile,
    excludedIds
  );

  expect(labels).toContain("Block read: stretch compact centre");
  expect(labels).toContain("Block read: weak-side release");
  expect(labels).toContain("Block read: threaten high line");
  expect(labels).toContain("Block read: rest-defence balance");
  expect(targets.get("H9").x).toBeGreaterThan(70);
  expect(excludedIds.size).toBeGreaterThan(5);
});

test("game simulator autopilot offball space occupation targets preserve game-space support labels", () => {
  const deps = createSpaceOccupationDeps();
  const spaceOccupation = createGameSimulatorAutopilotOffballSpaceOccupationTargets(deps);
  const targets = createTargets(deps.players);

  const labels = spaceOccupation.applyGameSpaceOffBallPrincipleTargets(
    "home",
    targets,
    { x: 57, y: 18 },
    { actionType: "dribble" },
    profile,
    new Set()
  );

  expect(labels).toContain("Spelyta: bounce support");
  expect(labels).toContain("Spelyta: run beyond");
  expect(labels).toContain("Spelyta: rest-defence lock");
  expect(labels).toContain("Spelyta: far rest cover");
  expect(targets.get("H9").x).toBeGreaterThan(70);
});
