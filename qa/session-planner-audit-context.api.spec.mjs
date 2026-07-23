import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = fs.readFileSync(
  path.join(rootDir, "supabase/migrations/20260722235545_session_planner_audit_context_hardening.sql"),
  "utf8"
);

test("Session Planner audit context preserves server actor attribution", () => {
  expect(migration).toContain("create or replace function app_private.session_planner_current_actor()");
  expect(migration).toContain("current_setting('app.session_planner_actor_id', true)");
  expect(migration).toContain("new.updated_by = coalesce(app_private.session_planner_current_actor(), new.updated_by)");
  expect(migration).toContain("create or replace function app_private.session_planner_log_record_version()");
  expect(migration).toMatch(/audit_actor_id\s*:=\s*coalesce\([\s\S]*session_planner_current_actor\(\)[\s\S]*next_action = 'archive'[\s\S]*new\.updated_by[\s\S]*new\.created_by/s);
  expect(migration).toMatch(/actor_id,\s*request_id[\s\S]*audit_actor_id,\s*audit_request_id/s);
});

test("Session Planner audit context captures bounded request correlation", () => {
  expect(migration).toContain("current_setting('app.session_planner_request_id', true)");
  expect(migration).toContain("current_setting('request.headers', true)");
  expect(migration).toContain("request_headers ->> 'x-request-id'");
  expect(migration).toContain("request_headers ->> 'x-correlation-id'");
  expect(migration).toContain("), 180), '')");
});

test("Session Planner audit hardening is additive and does not widen access", () => {
  expect(migration).not.toMatch(/\b(drop table|truncate table|create table)\b/i);
  expect(migration).not.toMatch(/grant\s+.*\s+to\s+(anon|authenticated)/i);
  expect(migration).toContain(
    "revoke all on function app_private.session_planner_log_record_version() from public, anon, authenticated"
  );
  expect(migration).toContain(
    "revoke all on function app_private.session_planner_current_actor() from public, anon, authenticated"
  );
  expect(migration).toContain("grant usage on schema app_private to service_role");
  for (const functionName of [
    "session_planner_current_actor",
    "session_planner_validate_scope",
    "session_planner_touch_record",
    "session_planner_log_record_version",
    "session_planner_prevent_hard_delete",
  ]) {
    expect(migration).toContain(
      "grant execute on function app_private." + functionName + "() to service_role"
    );
  }
});
