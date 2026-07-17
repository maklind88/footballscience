import { expect, test } from "@playwright/test";
import { buildScoutingPersonClusters } from "../src/modules/scouting/index.mjs";

function createDeps() {
  return {
    getAliasKey: (record) => record.alias || "",
    getNameKey: (record) => record.name || "",
    getSoftKey: (record) => record.soft || "",
    getStrongKey: (record) => record.strong || "",
    isHardKey: (key) => String(key).startsWith("source:"),
    isSamePerson: (first, second) =>
      Boolean(
        (first.name && first.name === second.name) ||
        (first.alias && first.alias === second.alias)
      ),
  };
}

test("Scouting person clustering preserves strong, soft, and alias identity boundaries", () => {
  const records = [
    { id: "a-2025", name: "alex smith", alias: "a smith", soft: "a smith|se", strong: "source:a" },
    { id: "a-2026", name: "a smith", alias: "a smith", soft: "a smith|se", strong: "source:a" },
    { id: "b-2026", name: "alex smith", alias: "a smith", soft: "a smith|se", strong: "source:b" },
    { id: "c-2026", name: "casey jones", alias: "c jones", soft: "c jones|us", strong: "" },
    { id: "c-2025", name: "c jones", alias: "c jones", soft: "c jones|us", strong: "" },
  ];

  const clusters = buildScoutingPersonClusters(records, createDeps());

  expect(clusters.map((cluster) => cluster.records.map((record) => record.id))).toEqual([
    ["a-2025", "a-2026"],
    ["b-2026"],
    ["c-2026", "c-2025"],
  ]);
});

test("Scouting person clustering stays linear enough for the full 24k-row database", () => {
  const records = Array.from({ length: 24061 }, (_, index) => ({
    id: `player-${index}`,
    name: `player ${index}`,
    alias: `p ${index}`,
    soft: `p ${index}|country-${index % 50}`,
    strong: "",
  }));
  const startedAt = performance.now();

  const clusters = buildScoutingPersonClusters(records, createDeps());
  const durationMs = performance.now() - startedAt;

  expect(clusters).toHaveLength(records.length);
  expect(durationMs).toBeLessThan(2000);
});
