import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotOffballPressEscapeTargets } from "../src/modules/game-simulator/autopilot-offball-press-escape-targets.mjs";

function createPressEscapeDeps(overrides = {}) {
  const pitch = { length: 105, width: 68 };
  const state = overrides.state || {
    ball: {
      ownerPlayerId: "H10",
      carrierPlayerId: "H10",
      receiverPlayerId: null,
      initiatorPlayerId: "H10",
    },
  };
  const players = overrides.players || [
    { id: "H6", team: "home", roleKey: "pivot", position: { x: 42, y: 30 } },
    { id: "H8", team: "home", roleKey: "connector", position: { x: 49, y: 22 } },
    { id: "H11", team: "home", roleKey: "wideForward", position: { x: 60, y: 18 } },
    { id: "H7", team: "home", roleKey: "wideForward", position: { x: 58, y: 52 } },
    { id: "H4", team: "home", roleKey: "rest", position: { x: 34, y: 35 } },
    { id: "H3", team: "home", roleKey: "wideBack", position: { x: 38, y: 13 } },
    { id: "A2", team: "away", roleKey: "back", position: { x: 61, y: 17 } },
  ];
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const distance = (first, second) => Math.hypot(first.x - second.x, first.y - second.y);
  const getWideSideSign = (pointOrPlayer) => {
    const y = Number.isFinite(pointOrPlayer?.y) ? pointOrPlayer.y : pointOrPlayer?.position?.y;
    if (!Number.isFinite(y)) {
      return 0;
    }
    return y < pitch.width / 2 ? -1 : 1;
  };
  const pickByRoles = (teamId, roleKeys, targets, excludedIds = new Set(), sideSign = 0, referencePoint = null) => {
    const roleSet = new Set(roleKeys);
    const desiredSide = sideSign === 0 ? 0 : Math.sign(sideSign);
    return players
      .filter((player) => {
        if (player.team !== teamId || excludedIds.has(player.id) || !targets.has(player.id)) {
          return false;
        }
        if (!roleSet.has(player.roleKey)) {
          return false;
        }
        if (desiredSide && getWideSideSign(player) !== desiredSide) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        const aRoleFit = roleKeys.indexOf(a.roleKey);
        const bRoleFit = roleKeys.indexOf(b.roleKey);
        if (aRoleFit !== bRoleFit) {
          return aRoleFit - bRoleFit;
        }
        if (referencePoint) {
          return distance(a.position, referencePoint) - distance(b.position, referencePoint);
        }
        return a.id.localeCompare(b.id);
      })[0] ?? null;
  };
  return {
    clamp,
    clampToPitch: (point) => ({
      x: clamp(point.x, 0, pitch.length),
      y: clamp(point.y, 0, pitch.width),
    }),
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getAttackingDepth: (point, teamId) => (teamId === "home" ? point.x : pitch.length - point.x),
    getDepthPoint: (teamId, depth, overrides = {}) => ({
      x: teamId === "home" ? depth : pitch.length - depth,
      y: overrides.y ?? pitch.width / 2,
    }),
    getMovableAutopilotPlayerByRoles: (teamId, roleKeys, targets, excludedIds, referencePoint) =>
      pickByRoles(teamId, roleKeys, targets, excludedIds, 0, referencePoint),
    getMovableAutopilotPlayerByRolesOnSide: (teamId, roleKeys, targets, excludedIds, sideSign, referencePoint) =>
      pickByRoles(teamId, roleKeys, targets, excludedIds, sideSign, referencePoint),
    getNearestOpponentGapToPoint: () => 2.8,
    getOpponentPressureAtPoint: () => 0.64,
    getPitchThreatProfile: () => ({ betweenLines: 0.34, centralPocket: 0.3 }),
    getWideSideSign,
    isWidePrincipleZone: (point) => point.y <= 20 || point.y >= 48,
    lerp: (start, end, weight) => start + (end - start) * weight,
    pitch,
    setAutopilotPrincipleTarget: (targets, player, target) => {
      if (!player || !target || !targets.has(player.id)) {
        return false;
      }
      targets.set(player.id, target);
      return true;
    },
    state,
    uniquePrincipleLabels: (labels = []) => [...new Set(labels.filter(Boolean))],
    players,
    ...overrides,
  };
}

function createTargetMap(players) {
  return new Map(players.filter((player) => player.team === "home").map((player) => [player.id, { ...player.position }]));
}

test("game simulator autopilot offball press escape targets expose moved contracts", () => {
  const deps = createPressEscapeDeps();
  const pressEscape = createGameSimulatorAutopilotOffballPressEscapeTargets(deps);

  expect(typeof pressEscape.getPressResistanceEscapeTarget).toBe("function");
  expect(typeof pressEscape.applyPressResistanceEscapeSupportTargets).toBe("function");
  expect(typeof pressEscape.getPressEscapeContinuationTarget).toBe("function");
  expect(typeof pressEscape.applyPressEscapeContinuationTargets).toBe("function");
});

test("game simulator autopilot offball press escape targets calculate escape slots", () => {
  const deps = createPressEscapeDeps();
  const pressEscape = createGameSimulatorAutopilotOffballPressEscapeTargets(deps);
  const ballPoint = { x: 52, y: 16 };

  const under = pressEscape.getPressResistanceEscapeTarget("home", ballPoint, "underEscape", -1, {
    supportCompactness: 0.7,
  });
  const switchOutlet = pressEscape.getPressResistanceEscapeTarget("home", ballPoint, "switchOutlet", -1, {
    switchBias: 0.7,
  });

  expect(under.x).toBeLessThan(ballPoint.x);
  expect(switchOutlet.y).toBeGreaterThan(34);
});

test("game simulator autopilot offball press escape targets assign pressure support", () => {
  const deps = createPressEscapeDeps();
  const pressEscape = createGameSimulatorAutopilotOffballPressEscapeTargets(deps);
  const targetMap = createTargetMap(deps.players);
  const ballPoint = { x: 52, y: 16 };

  const result = pressEscape.applyPressResistanceEscapeSupportTargets(
    "home",
    targetMap,
    ballPoint,
    { actionType: "pass", autoPrinciples: ["Secure under pressure"], carrierPlayerId: "H10" },
    { supportCompactness: 0.68, switchBias: 0.72, directness: 0.66 }
  );

  expect(result.labels).toContain("Press escape: support under ball");
  expect(result.labels).toContain("Press escape: third-player outlet");
  expect(result.labels).toContain("Press escape: switch outlet");
  expect(result.labels).toContain("Press escape: safety behind ball");
  expect(result.protectedIds.has("H6")).toBe(true);
  expect(targetMap.get("H6").x).toBeLessThan(52);
});

test("game simulator autopilot offball press escape targets assign continuation options", () => {
  const deps = createPressEscapeDeps();
  const pressEscape = createGameSimulatorAutopilotOffballPressEscapeTargets(deps);
  const targetMap = createTargetMap(deps.players);
  const ballPoint = { x: 54, y: 18 };

  const result = pressEscape.applyPressEscapeContinuationTargets(
    "home",
    targetMap,
    ballPoint,
    { actionType: "pass", offensiveAutopilot: { principleLabel: "Press escape" } },
    { directness: 0.7, overlapBias: 0.7, switchBias: 0.72, width: 60 }
  );

  expect(result.labels).toContain("Escape continuation: exit lane");
  expect(result.labels).toContain("Escape continuation: wall release");
  expect(result.labels).toContain("Escape continuation: wide exit");
  expect(result.labels).toContain("Escape continuation: weak-side switch");
  expect(result.labels).toContain("Escape continuation: rest lock");
  expect(result.protectedIds.size).toBeGreaterThanOrEqual(5);
});
