import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
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
  expect(sql).toContain("body_regions");
  expect(sql).toContain("program_builder");
  expect(sql).toContain("media_status");
  expect(sql).toContain("diagram_key");
  expect(sql).toContain("'diagram'");
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
    mappings: 1651,
  });
});

test("RTP Library content export can write Supabase-safe SQL chunks", () => {
  const outDir = join(tmpdir(), `rtp-library-content-chunks-${Date.now()}`);
  const output = execFileSync("node", ["scripts/export-rtp-library-content-sql.mjs", "--out-dir", outDir], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  const summary = JSON.parse(output);
  const files = readdirSync(outDir).filter((file) => file.endsWith(".sql")).sort();
  const firstSql = readFileSync(join(outDir, files[0]), "utf8");
  const exerciseSql = readFileSync(join(outDir, files.find((file) => file.includes("exercises_001"))), "utf8");
  const mappingSql = readFileSync(join(outDir, files.find((file) => file.includes("profile_exercises_001"))), "utf8");

  expect(summary).toMatchObject({ profiles: 200, exercises: 72, mappings: 1651 });
  expect(files.length).toBeGreaterThan(40);
  expect(files[0]).toBe("001_profiles_001.sql");
  expect(firstSql).toContain("insert into public.rtp_library_profiles");
  expect(exerciseSql).toContain("body_regions");
  expect(exerciseSql).toContain("program_builder");
  expect(exerciseSql).toContain("diagram_key");
  expect(mappingSql).toContain("delete from public.rtp_library_profile_exercises");
  expect(summary.files).toEqual(files);
});
