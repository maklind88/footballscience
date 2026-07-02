import { expect, test } from "@playwright/test";
import { createSquadPlayerHistoryTimeline } from "../src/modules/squad/index.mjs";

test("Squad player history falls back when actor lookup fails", () => {
  const timeline = createSquadPlayerHistoryTimeline({
    medicalRecords: [
      {
        id: "medical-1",
        createdBy: "medical-user",
        date: "2026-07-01",
        status: "full",
        updatedAt: "2026-07-01T10:00:00.000Z",
      },
    ],
    getMedicalRecordStatus: () => ({ label: "Full training" }),
    resolveActorLabel: () => {
      throw new TypeError("User index unavailable");
    },
  });

  expect(timeline).toHaveLength(1);
  expect(timeline[0].actor).toBe("Medical team");
  expect(timeline[0].title).toBe("Medical recommendation");
});
