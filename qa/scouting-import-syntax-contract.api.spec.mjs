import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { expect, test } from "@playwright/test";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scoutingImportFiles = [
  "scouting-import-parser-worker.js",
  "api/_lib/scouting-dataset-import.js",
  "api/_lib/scouting-identity-crosswalk.js",
  "src/modules/scouting/scouting-database-loader.mjs",
  "src/modules/scouting/scouting-database-refresh-controller.mjs",
  "src/modules/scouting/scouting-database.mjs",
  "src/modules/scouting/scouting-football-science-db-client.mjs",
  "src/modules/scouting/scouting-database-capability.mjs",
  "src/modules/scouting/scouting-dataset-import-client.mjs",
  "src/modules/scouting/scouting-import-artifact-client.mjs",
  "src/modules/scouting/scouting-import-parser-client.mjs",
  "src/modules/scouting/scouting-import-database-builder.mjs",
  "src/modules/scouting/scouting-import-preview-service.mjs",
];

test("Scouting import runtime files pass Node syntax checks", () => {
  const failures = scoutingImportFiles.flatMap((relativePath) => {
    const result = spawnSync(process.execPath, ["--check", path.join(projectRoot, relativePath)], {
      encoding: "utf8",
    });
    if (result.status === 0) return [];
    return [{ relativePath, status: result.status, stderr: String(result.stderr || "").trim() }];
  });

  expect(failures).toEqual([]);
});
