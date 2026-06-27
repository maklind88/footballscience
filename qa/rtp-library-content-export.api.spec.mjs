import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("RTP Library content export creates idempotent SQL without player medical data", () => {
  const outPath = join(tmpdir(), `rtp-library-content-${Date.now()}.sql`);
  const output = execFileSync("node", ["scripts/export-rtp-library-content-sql.mjs", "--out", outPath], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  const summary = JSON.parse(output);
  const sql = readFileSync(outPath, "utf8");

  expect(summary).toMatchObject({ profiles: 200, exercises: 72 });
  expect(summary.mappings).toBeGreaterThanOrEqual(1600);
  expect(sql).toContain("insert into public.rtp_library_profiles");
  expect(sql).toContain("insert into public.rtp_library_exercises");
  expect(sql).toContain("insert into public.rtp_library_profile_exercises");
  expect(sql).toContain("on conflict (id) do update set");
  expect(sql).toContain("on conflict (profile_id, exercise_id) do update set");
  expect(sql).toContain("delete from public.rtp_library_profile_exercises");
  expect(sql).toContain("No player medical data is included.");
  expect(sql).not.toMatch(/\b(player_id|medical_clearance|medical_confidence_level|rtp_cases)\b/i);
});

test("RTP Library content export validates canonical source counts", () => {
  const output = execFileSync("node", ["scripts/export-rtp-library-content-sql.mjs", "--check"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  expect(JSON.parse(output)).toEqual({
    profiles: 200,
    exercises: 72,
    mappings: 1614,
  });
});
