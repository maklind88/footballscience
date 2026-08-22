import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { protectGameplanStateWrite } = require("../api/_lib/gameplan-state-authorization.js");

function stateWithPlans() {
  return {
    schemaVersion: 6,
    activeGameplanId: "plan-1",
    gameplans: [
      { id: "plan-1", title: "First plan", archivedAt: "", archivedBy: "" },
      { id: "plan-2", title: "Second plan", archivedAt: "", archivedBy: "" },
    ],
  };
}

test("Gameplan server policy lets analysts edit but rejects deletion", () => {
  const previous = stateWithPlans();
  const edited = structuredClone(previous);
  edited.gameplans[0].title = "Edited plan";
  expect(
    protectGameplanStateWrite({ id: "analyst-1", role: "analyst" }, JSON.stringify(edited), {
      previousValue: JSON.stringify(previous),
    })
  ).toMatchObject({ ok: true });

  const archived = structuredClone(previous);
  archived.gameplans[0].archivedAt = "2026-08-22T10:00:00.000Z";
  expect(
    protectGameplanStateWrite({ id: "analyst-1", role: "analyst" }, JSON.stringify(archived), {
      previousValue: JSON.stringify(previous),
    })
  ).toMatchObject({ ok: false, status: 403 });
});

test("Gameplan server policy converts coach deletion into protected archive metadata", () => {
  const previous = stateWithPlans();
  const archived = structuredClone(previous);
  archived.gameplans[0].archivedAt = "client-time";
  archived.gameplans[0].archivedBy = "spoofed-user";

  const result = protectGameplanStateWrite({ id: "coach-1", role: "coach" }, JSON.stringify(archived), {
    previousValue: JSON.stringify(previous),
    now: "2026-08-22T12:00:00.000Z",
  });
  expect(result).toMatchObject({ ok: true, archivedPlanIds: ["plan-1"] });
  expect(JSON.parse(result.value).gameplans[0]).toMatchObject({
    archivedAt: "2026-08-22T12:00:00.000Z",
    archivedBy: "coach-1",
  });
});

test("Gameplan server policy rejects hard removal and preserves archived history", () => {
  const previous = stateWithPlans();
  const hardRemoved = structuredClone(previous);
  hardRemoved.gameplans = [hardRemoved.gameplans[1]];
  expect(
    protectGameplanStateWrite({ id: "coach-1", role: "coach" }, JSON.stringify(hardRemoved), {
      previousValue: JSON.stringify(previous),
    })
  ).toMatchObject({ ok: false, status: 400 });

  const archivedPrevious = stateWithPlans();
  archivedPrevious.gameplans[0].archivedAt = "2026-08-21T12:00:00.000Z";
  archivedPrevious.gameplans[0].archivedBy = "coach-1";
  const tampered = structuredClone(archivedPrevious);
  tampered.gameplans[0].title = "Changed after archive";
  const result = protectGameplanStateWrite({ id: "analyst-1", role: "analyst" }, JSON.stringify(tampered), {
    previousValue: JSON.stringify(archivedPrevious),
  });
  expect(result.ok).toBe(true);
  expect(JSON.parse(result.value).gameplans[0].title).toBe("First plan");

  expect(
    protectGameplanStateWrite({ id: "coach-1", role: "coach" }, "", {
      removed: true,
      previousValue: JSON.stringify(previous),
    })
  ).toMatchObject({ ok: false, status: 400 });
});
