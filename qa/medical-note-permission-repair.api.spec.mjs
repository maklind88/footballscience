import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const readMigration = (name) => readFileSync(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), "utf8").replace(/--[^\n]*/g, "").trim();
const original = readMigration("20260911185738_medical_coach_note_read_boundary");
const repair = readMigration("20260923231716_restore_medical_note_read_privileges");

for (const table of ["medical_availability_recommendations", "medical_availability_plans"]) {
  test(`${table}: forward repair preserves the exact reviewed safe-column allowlist`, () => {
    const grant = new RegExp(`grant select \\([^)]+\\) on public\\.${table} to authenticated;`, "g");
    expect(repair.match(grant)).toEqual(original.match(grant));
    expect(repair.match(grant)).toHaveLength(1);
    expect(repair).toContain(`revoke select on public.${table} from public, anon, authenticated;`);
    expect(repair).toContain(`revoke select (coach_note, internal_note) on public.${table} from public, anon, authenticated;`);
  });
}

test("Medical grant repair is bounded, atomic and never edits data, policies or writers", () => {
  expect(repair).toMatch(/^begin;/);
  expect(repair).toMatch(/commit;$/);
  expect(repair).toContain("set local lock_timeout = '3s'");
  expect(repair).toContain("set local statement_timeout = '30s'");
  expect(repair).not.toMatch(/\b(insert\s+into|update\s+public\.|delete\s+from|truncate|drop|create\s+(?:or\s+replace\s+)?(?:policy|view|function)|alter\s+(?:policy|table|default))\b/i);
  expect(repair).not.toMatch(/grant\s+(insert|update|delete|all)\b/i);
  expect(repair).toContain("array['security_invoker=true']");
  expect(repair).toContain("and relrowsecurity");
  expect(repair).toContain("to_regprocedure('app_private.medical_coach_plan_note(uuid)')");
  expect(repair).toContain("array['anon', 'authenticated']");
  expect(repair).toContain("has_column_privilege(actor, relation, 'internal_note', 'SELECT')");
});
