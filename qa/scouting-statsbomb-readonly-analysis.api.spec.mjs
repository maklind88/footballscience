import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const projectRoot = new URL("../", import.meta.url);

function readProjectFile(relativePath) {
  return readFileSync(new URL(relativePath, projectRoot), "utf8");
}

test("StatsBomb analysis remains isolated, read-only, and dependency-pinned", () => {
  const source = readProjectFile("scripts/analyze-statsbomb-api.py");
  const requirements = readProjectFile("requirements-scouting-statsbomb.txt");
  const packageJson = JSON.parse(readProjectFile("package.json"));

  expect(requirements.trim()).toBe("statsbombpy==1.22.0");
  expect(packageJson.scripts["scouting:statsbomb:analyze"]).toBe("python3 scripts/analyze-statsbomb-api.py");
  expect(packageJson.scripts["scouting:statsbomb:test"]).toContain("scouting_statsbomb_readonly_analysis_test.py");
  expect(source).toContain('"writesEnabled": False');
  expect(source).toContain('"activeScoutingDatasetTouched": False');
  expect(source).toContain('"footballScienceDbTouched": False');
  expect(source).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  expect(source).not.toContain("--password");
});

test("StatsBomb fixture, redaction, determinism, and credential gates pass", () => {
  const result = spawnSync("python3", ["-m", "unittest", "qa/scouting_statsbomb_readonly_analysis_test.py"], {
    cwd: new URL(".", projectRoot),
    encoding: "utf8",
    env: process.env,
  });

  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  expect(result.stderr).toContain("Ran 3 tests");
  expect(result.stderr).toContain("OK");
});
