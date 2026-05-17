import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const fsdb = require("../api/_lib/football-science-db.js");
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

test("Scouting database view can search Football Science DB through the server API", () => {
  const workspace = readFileSync(resolve(projectRoot, "scouting-workspace.js"), "utf8");

  expect(workspace).toContain("/api/football-science-db");
  expect(workspace).toContain("footballSciencePlayerToScoutingRecord");
  expect(workspace).toContain('source: "fsdb"');
  expect(workspace).toContain('data-scouting-load-fsdb');
  expect(workspace).toContain('data-scouting-page-cursor');
  expect(workspace).toContain("renderScoutingFootballScienceDbPanel");
  expect(workspace).toContain("Spider stays locked until trusted stats exist");
});

test("Scouting bridge exposes safe FSDB identity helpers for server linking", () => {
  expect(typeof fsdb.fetchFootballScienceProfileForScoutingRecord).toBe("function");
  expect(fsdb.normalizePersonNameForMatch("Álex Morgan")).toBe("alex morgan");
  expect(fsdb.buildStrongPlayerDedupeKey({
    name: "Alex Morgan",
    dateOfBirth: "1989-07-02",
    nationality: "United States",
    genderSegment: "women",
  })).toContain("name:alex morgan");
});
