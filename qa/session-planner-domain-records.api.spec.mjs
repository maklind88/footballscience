import { createRequire } from "node:module";
import { test, expect } from "@playwright/test";

const require = createRequire(import.meta.url);
const {
  SESSION_PLANNER_MAX_BLOCK_PAYLOAD_BYTES,
  compareSessionPlannerStates,
  composeSessionPlannerLegacyState,
  extractSessionPlannerDomainRecords,
  hashJsonValue,
} = require("../api/_lib/session-planner-domain-records.js");

const organizationId = "11111111-1111-4111-8111-111111111111";
const teamId = "22222222-2222-4222-8222-222222222222";

function createLegacyState() {
  return {
    selectedDate: "2026-07-22",
    blockReductionGuard: { "2026-07-22": 1784750000000 },
    blockDeletionTombstones: {
      "2026-07-21": { "archived-block": "2026-07-21T12:00:00.000Z" },
    },
    sessions: {
      "2026-07-21": {
        id: "session-2026-07-21",
        date: "2026-07-21",
        title: "Training/IDP",
        theme: "High press",
        selectedBlockId: "block-2",
        blocks: [
          {
            id: "block-1",
            label: "Block 1",
            title: "1v1 Def/Off",
            minutes: 15,
            phase: ["In Possession", "Out of Possession"],
            fieldUpdatedAt: { title: "2026-07-21T12:00:00.000Z" },
          },
          {
            id: "block-2",
            label: "Block 2",
            title: "German Possession",
            minutes: 20,
            tacticalFrames: [
              { id: "frame-1", label: "Start", elements: [{ id: "player-1", type: "player", x: 20, y: 30 }] },
            ],
            playerBoardPositions: { "player-1": { x: 40, y: 50 } },
            visualImage: "https://example.invalid/session-visual.png",
          },
        ],
      },
      "2026-07-22": {
        id: "session-2026-07-22",
        date: "2026-07-22",
        title: "Recovery",
        theme: "",
        selectedBlockId: "recovery",
        blocks: [{ id: "recovery", label: "Block 1", title: "Recovery flow", minutes: 25 }],
      },
    },
  };
}

test("Session Planner domain records preserve the existing shared state exactly", () => {
  const legacyState = createLegacyState();
  const records = extractSessionPlannerDomainRecords(legacyState, { organizationId, teamId });
  const restoredState = composeSessionPlannerLegacyState(records, {
    organizationId,
    teamId,
    selectedDate: legacyState.selectedDate,
  });

  expect(records.counts).toEqual({ sessions: 2, blocks: 3 });
  expect(records.sessions.every((session) => session.organizationId === organizationId && session.teamId === teamId)).toBe(true);
  expect(records.blocks.every((block) => block.organizationId === organizationId && block.teamId === teamId)).toBe(true);
  expect(compareSessionPlannerStates(legacyState, restoredState)).toMatchObject({ equal: true, sessionCount: 2 });
  expect(restoredState.selectedDate).toBe("2026-07-22");
});

test("Session Planner domain extraction is deterministic and excludes browser-only state", () => {
  const legacyState = createLegacyState();
  const first = extractSessionPlannerDomainRecords(legacyState, { organizationId, teamId });
  const second = extractSessionPlannerDomainRecords(legacyState, { organizationId, teamId });
  const serialized = JSON.stringify(first);

  expect(first).toEqual(second);
  expect(first.sessions.map((session) => session.id)).toEqual(second.sessions.map((session) => session.id));
  expect(first.blocks.map((block) => block.payloadHash)).toEqual(second.blocks.map((block) => block.payloadHash));
  expect(serialized).not.toContain("selectedDate");
  expect(serialized).not.toContain("blockReductionGuard");
  expect(serialized).not.toContain("blockDeletionTombstones");
});

test("Session Planner domain hashes ignore object key ordering without weakening payload comparison", () => {
  expect(hashJsonValue({ title: "Press", minutes: 20 })).toBe(hashJsonValue({ minutes: 20, title: "Press" }));
  expect(hashJsonValue({ title: "Press", minutes: 20 })).not.toBe(hashJsonValue({ title: "Press", minutes: 25 }));
});

test("Session Planner domain extraction rejects duplicate block identity", () => {
  const legacyState = createLegacyState();
  legacyState.sessions["2026-07-21"].blocks[1].id = "block-1";

  expect(() => extractSessionPlannerDomainRecords(legacyState, { organizationId, teamId })).toThrow(
    "duplicate block id block-1"
  );
});

test("Session Planner domain composition rejects cross-tenant rows", () => {
  const records = extractSessionPlannerDomainRecords(createLegacyState(), { organizationId, teamId });
  records.blocks[0].teamId = "33333333-3333-4333-8333-333333333333";

  expect(() => composeSessionPlannerLegacyState(records, { organizationId, teamId })).toThrow(
    "belongs to a different tenant scope"
  );
});

test("Session Planner domain extraction enforces bounded block records", () => {
  const legacyState = createLegacyState();
  legacyState.sessions["2026-07-21"].blocks[0].organization = "x".repeat(
    SESSION_PLANNER_MAX_BLOCK_PAYLOAD_BYTES + 1
  );

  expect(() => extractSessionPlannerDomainRecords(legacyState, { organizationId, teamId })).toThrow(
    `exceeds ${SESSION_PLANNER_MAX_BLOCK_PAYLOAD_BYTES} bytes`
  );
});
