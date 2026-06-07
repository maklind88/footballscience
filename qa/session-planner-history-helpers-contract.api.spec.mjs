import { expect, test } from "@playwright/test";
import {
  formatSessionPlannerHistoryTime,
  getSessionPlannerHistoryActionLabel,
  getSessionPlannerHistoryActorLabel,
} from "../src/modules/session-planner/index.mjs";

test("Session Planner history helpers preserve labels and safe fallbacks", () => {
  expect(formatSessionPlannerHistoryTime("not-a-date")).toBe("");
  expect(formatSessionPlannerHistoryTime("2026-06-07T15:30:00Z")).toContain("07 Jun");
  expect(getSessionPlannerHistoryActorLabel({ actor: { name: "Mak", email: "mak@example.com" } })).toBe("Mak");
  expect(getSessionPlannerHistoryActorLabel({ actor: { email: "coach@example.com" } })).toBe("coach@example.com");
  expect(getSessionPlannerHistoryActorLabel({})).toBe("Staff");
  expect(getSessionPlannerHistoryActionLabel("session.created")).toBe("Created");
  expect(getSessionPlannerHistoryActionLabel("unknown.action")).toBe("Updated");
});
