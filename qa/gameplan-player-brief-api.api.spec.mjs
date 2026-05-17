import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const playerBrief = require("../api/_lib/gameplan-player-brief.js");
const permissionMatrix = require("../src/core/permission-matrix.cjs");

const secret = "unit-test-gameplan-player-brief-secret";

function sampleGameplanState() {
  return {
    schemaVersion: 2,
    activeGameplanId: "plan-1",
    gameplans: [
      {
        id: "plan-1",
        title: "Final Match Plan",
        opponent: "Rivals FC",
        date: "2026-05-20",
        kickoff: "19:00",
        venue: "Home Stadium",
        opponentPlan: {
          threats: "Staff-only opponent detail",
        },
        staffResponsibilities: [
          {
            role: "Analyst",
            reportAtHalftime: "Staff-only halftime report",
          },
        ],
        playerBrief: {
          headline: "Press together",
          message: "Player-facing only.",
          focus: "Protect the rest defence.",
          individualFocus: "Scan before receiving.",
          audiencePlayerIds: ["player-1"],
          publishedAt: "2026-05-17T12:00:00.000Z",
          phases: {
            inPossession: "Find the six early.",
          },
          readReceipts: {},
        },
      },
    ],
  };
}

const samplePlayerProfilesState = {
  players: [
    {
      id: "player-1",
      name: "Selected Player",
      number: "10",
      position: "Midfielder",
    },
    {
      id: "player-2",
      name: "Blocked Player",
      number: "8",
      position: "Midfielder",
    },
  ],
};

test("Gameplan Player Brief tokens are signed, expiring, and scoped to a player", () => {
  const token = playerBrief.createPlayerBriefToken(
    { planId: "plan-1", playerId: "player-1", expiresInHours: 2 },
    { secret, nowMs: 1_000_000 }
  );
  expect(token.ok).toBe(true);

  const verified = playerBrief.verifyPlayerBriefToken(token.token, { secret, nowMs: 1_000_000 });
  expect(verified).toEqual(
    expect.objectContaining({
      ok: true,
      payload: expect.objectContaining({ planId: "plan-1", playerId: "player-1" }),
    })
  );

  const forged = playerBrief.verifyPlayerBriefToken(`${token.token.slice(0, -4)}abcd`, { secret, nowMs: 1_000_000 });
  expect(forged.ok).toBe(false);

  const expired = playerBrief.verifyPlayerBriefToken(token.token, { secret, nowMs: 1_000_000 + 3 * 60 * 60 * 1000 });
  expect(expired.ok).toBe(false);
  expect(expired.reason).toContain("expired");
});

test("Gameplan Player Brief payload returns only player-facing fields", () => {
  const payload = playerBrief.resolvePlayerBriefPayload(sampleGameplanState(), samplePlayerProfilesState, {
    planId: "plan-1",
    playerId: "player-1",
  });
  expect(payload.ok).toBe(true);
  expect(payload.brief.headline).toBe("Press together");
  expect(payload.player.name).toBe("Selected Player");
  expect(JSON.stringify(payload)).not.toContain("Staff-only");
  expect(JSON.stringify(payload)).not.toContain("staffResponsibilities");
  expect(JSON.stringify(payload)).not.toContain("opponentPlan");
});

test("Gameplan Player Brief audience and receipts stay enforced server-side", () => {
  const blocked = playerBrief.resolvePlayerBriefPayload(sampleGameplanState(), samplePlayerProfilesState, {
    planId: "plan-1",
    playerId: "player-2",
  });
  expect(blocked.ok).toBe(false);
  expect(blocked.status).toBe(403);

  const state = sampleGameplanState();
  const opened = playerBrief.upsertPlayerBriefReceipt(state, { planId: "plan-1", playerId: "player-1" });
  expect(opened.ok).toBe(true);
  expect(opened.receipt.openCount).toBe(1);

  const acknowledged = playerBrief.upsertPlayerBriefReceipt(state, {
    planId: "plan-1",
    playerId: "player-1",
    acknowledge: true,
    countOpen: false,
  });
  expect(acknowledged.ok).toBe(true);
  expect(acknowledged.receipt.acknowledgedAt).toBeTruthy();
  expect(acknowledged.receipt.openCount).toBe(1);
});

test("Gameplan Player Brief API is registered as a public signed route with staff-only signing in code", () => {
  expect(permissionMatrix.platformPermissionMatrixByModule.gameplan.routes).toContain("/api/gameplan-player-brief");
  expect(permissionMatrix.apiRouteSecurity["/api/gameplan-player-brief"]).toEqual(
    expect.objectContaining({
      moduleId: "gameplan",
      public: true,
      actions: expect.objectContaining({ GET: "read", POST: "write" }),
      enforcePermission: false,
    })
  );
});
