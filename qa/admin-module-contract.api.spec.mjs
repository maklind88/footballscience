import { expect, test } from "@playwright/test";
import {
  adminDepartmentSuggestions,
  adminTitleSuggestions,
  formatAdminDateTime,
  formatAuditActionLabel,
  formatAuditActor,
  formatAuditTarget,
  getAdminUserInitials,
} from "../src/modules/admin/index.mjs";

test("Admin display helpers own stable labels, suggestions, and initials", () => {
  expect(adminTitleSuggestions).toContain("Sporting Director");
  expect(adminDepartmentSuggestions).toContain("Performance");
  expect(formatAdminDateTime("")).toBe("Never");
  expect(formatAdminDateTime("not-a-date")).toBe("Never");
  expect(formatAdminDateTime("2026-05-31T11:14:00Z")).toMatch(/31 May/);
  expect(formatAuditActor({ actor: { name: "Mak Lind" } })).toBe("Mak Lind");
  expect(formatAuditActor({ actor: { email: "coach@example.com" } })).toBe("coach@example.com");
  expect(formatAuditActor({})).toBe("System");
  expect(formatAuditTarget({ target: { name: "Scout" } })).toBe("Scout");
  expect(formatAuditActionLabel("user.created")).toBe("User created");
  expect(formatAuditActionLabel("custom.action")).toBe("custom.action");
  expect(
    getAdminUserInitials(
      { firstName: "Mak", lastName: "Lind" },
      {
        formatUserName: () => "Mak Lind",
        normalizeText: (value, fallback = "") => String(value || fallback).trim(),
      }
    )
  ).toBe("ML");
});
