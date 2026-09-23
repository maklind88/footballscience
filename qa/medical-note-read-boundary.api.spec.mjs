import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

// CI wiring/contract checks complement, not replace, the actual PostgreSQL suite.
const migration = readFileSync(new URL("../supabase/migrations/20260911185738_medical_coach_note_read_boundary.sql", import.meta.url), "utf8");
const sql = migration.replace(/--[^\n]*/g, "").trim();
const surfaces = [
  { table: "medical_availability_recommendations", view: "medical_coach_availability", fn: "medical_coach_recommendation_note", alias: "recommendation", lifecycle: "deleted_at" },
  { table: "medical_availability_plans", view: "medical_coach_availability_plans", fn: "medical_coach_plan_note", alias: "plan", lifecycle: "archived_at" },
];

for (const { table, view, fn, alias, lifecycle } of surfaces) {
  test(`${table}: direct note access is revoked without granting private or write columns`, () => {
    expect(sql).toContain(`revoke select on public.${table} from public, anon, authenticated;`);
    expect(sql).toContain(`revoke select (coach_note) on public.${table} from public, anon, authenticated;`);
    const columns = sql.match(new RegExp(`grant select \\(([^)]+)\\) on public\\.${table} to authenticated;`, "g"));
    expect(columns).toHaveLength(1);
    const allowed = columns[0].match(/\(([^)]+)\)/)[1].split(",").map((column) => column.trim());
    const dates = alias === "plan" ? ["starts_on", "ends_on"] : ["recommendation_date"];
    expect(allowed).toEqual([
      "id", "organization_id", "team_id", "season_id", "player_id", "roster_membership_id",
      ...dates, "status", "recommended_participation", "rtp_phase", "share_with_coach",
      ...(alias === "plan" ? [] : ["source"]), "created_at", "updated_at", lifecycle,
    ]);
  });

  test(`${fn}: private accessor rechecks team, sharing and lifecycle with a pinned path`, () => {
    const start = sql.indexOf(`create or replace function app_private.${fn}(target_id uuid)`);
    expect(start).toBeGreaterThan(-1);
    const body = sql.slice(start, sql.indexOf("$$;", start));
    expect(body).toContain("stable\nsecurity definer\nset search_path = ''");
    expect(body).toContain(`${alias}.id = target_id`);
    expect(body).toContain(`${alias}.${lifecycle} is null`);
    expect(body).toContain(`and ${alias}.share_with_coach`);
    expect(body).toContain("pg_catalog.current_setting('role', true) = 'service_role'");
    expect(body).toContain("app_private.is_medical_staff()");
    expect(body).toContain(`and app_private.is_medical_team_member(${alias}.team_id)`);
    expect(sql).toContain(`revoke all on function app_private.${fn}(uuid) from public, anon, authenticated;`);
    expect(sql).toContain(`grant execute on function app_private.${fn}(uuid) to authenticated, service_role;`);
  });

  test(`${view}: invoker view preserves the shared-note projection and row filter`, () => {
    const start = sql.indexOf(`create or replace view public.${view}\n`);
    expect(start).toBeGreaterThan(-1);
    const definition = sql.slice(start, sql.indexOf(";", start));
    expect(definition).toContain("with (security_invoker = true)");
    expect(definition).toContain(`case when ${alias}.share_with_coach`);
    expect(definition).toContain(`then app_private.${fn}(${alias}.id)`);
    expect(definition).toContain("else null::text end as coach_note");
    expect(definition).toContain(`where ${alias}.${lifecycle} is null`);
    expect(definition).not.toContain(`${alias}.coach_note`);
    expect(definition).not.toContain("internal_note");
  });
}

test("Medical read boundary is atomic, bounded, and does not edit clinical data or policies", () => {
  expect(sql).toMatch(/^begin;/);
  expect(sql).toMatch(/commit;$/);
  expect(sql).toContain("set local lock_timeout = '3s';");
  expect(sql).toContain("set local statement_timeout = '30s';");
  expect(sql).not.toMatch(/\b(insert\s+into|update\s+public\.|delete\s+from|truncate|drop|create\s+policy|alter\s+policy|disable\s+row\s+level)\b/i);
  expect(sql).not.toMatch(/grant\s+(insert|update|delete|all)\b/i);
  expect(sql).not.toContain("user_metadata");
});
