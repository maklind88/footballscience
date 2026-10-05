import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const window = {};
vm.runInNewContext(readFileSync(new URL("../medical-merge.js", import.meta.url), "utf8"), { window });
const merge = window.createCentralMedicalStateMerger({ parseCentralObjectStateValue: JSON.parse,
  preserveCentralStateMediaFields: record => ({ record }) });

for (const field of ["records", "injuryPlans", "players"]) {
  for (const kind of ["future date", "equal time", "sync bookkeeping", "archive", "delete", "newer edit"]) {
    test(`Medical recovery ${field}: ${kind}`, () => {
      const central = { id: "item-1", date: "2026-10-20", startDate: "2026-10-20", participation: 25,
        updatedAt: "2026-10-03T11:00:00Z", createdAt: "2026-10-01T09:00:00Z" };
      const local = { ...central, participation: 100, updatedAt: "2026-10-03T10:00:00Z" };
      if (kind === "equal time") local.updatedAt = central.updatedAt;
      if (kind === "sync bookkeeping") local.lastDatabaseSyncAt = "2026-10-04T12:00:00Z";
      if (kind === "archive" || kind === "delete") {
        const key = kind === "archive" ? "archivedAt" : "deletedAt";
        central[key] = "2026-10-03T11:00:00Z";
        local[key] = "";
        local.updatedAt = "2026-10-04T12:00:00Z";
      }
      if (kind === "newer edit") local.updatedAt = "2026-10-03T12:00:00Z";
      const merged = JSON.parse(merge(JSON.stringify({ [field]: [local] }), JSON.stringify({ [field]: [central] })).value)[field][0];
      expect(merged.participation).toBe(kind === "newer edit" ? 100 : 25);
      if (kind === "archive") expect(merged.archivedAt).toBe(central.archivedAt);
      if (kind === "delete") expect(merged.deletedAt).toBe(central.deletedAt);
    });
  }
}

test("Medical recovery retains independent local and central additions", () => {
  const merged = JSON.parse(merge(JSON.stringify({ records: [{ id: "local" }] }), JSON.stringify({ records: [{ id: "central" }] })).value);
  expect(merged.records.map(record => record.id)).toEqual(["central", "local"]);
});
