import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildScoutingDatasetVersionHash,
  buildScoutingDatasetChunks,
  createScoutingDatasetImportClient,
} from "../src/modules/scouting/scouting-dataset-import-client.mjs";

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function makeDatabase(count = 321) {
  return {
    fileName: "players.xlsx",
    sheets: ["Players"],
    metrics: [{ id: "minutes", label: "Minutes" }],
    records: Array.from({ length: count }, (_, index) => [String(index), `Player ${index}`]),
    importSignature: "signature-1",
  };
}

function createHarness({ versionStatus = "staged", validationStatus = "validated" } = {}) {
  const calls = [];
  const client = createScoutingDatasetImportClient({
    artifactClient: {
      prepare: async () => ({
        ok: true,
        artifact: { id: "11111111-1111-4111-8111-111111111111", file_name: "players.xlsx" },
        checksumSha256: "a".repeat(64),
      }),
    },
    sendAction: async (payload, options) => {
      calls.push({ payload, options });
      if (payload.action === "startDatasetImport") {
        return {
          ok: true,
          result: {
            datasetVersion: {
              id: "22222222-2222-4222-8222-222222222222",
              import_batch_id: "33333333-3333-4333-8333-333333333333",
              status: versionStatus,
            },
          },
        };
      }
      if (payload.action === "stageDatasetChunk") return { ok: true, result: { stored: true } };
      if (payload.action === "validateDatasetImport") {
        return {
          ok: true,
          result: {
            validation: { status: validationStatus, rowCount: 321, blockerCount: validationStatus === "blocked" ? 1 : 0 },
            checks: [{ validation_code: "row_count.exact", status: validationStatus === "blocked" ? "failed" : "passed" }],
          },
        };
      }
      if (payload.action === "publishDatasetImport") return { ok: true, result: { datasetVersionId: payload.datasetVersionId } };
      if (payload.action === "rollbackDatasetVersion") return { ok: true, result: { datasetVersionId: payload.datasetVersionId } };
      return { ok: false, reason: "unexpected" };
    },
    stageConcurrency: 3,
  });
  return { calls, client };
}

test("Scouting dataset chunks stay within row and payload limits", () => {
  const plan = buildScoutingDatasetChunks(makeDatabase(321).records);
  expect(plan.ok).toBe(true);
  expect(plan.chunks.map((chunk) => chunk.length)).toEqual([160, 160, 1]);

  const payloadPlan = buildScoutingDatasetChunks([["x".repeat(80_000)], ["y".repeat(80_000)]], {
    maxRecords: 160,
    maxCharacters: 100_000,
  });
  expect(payloadPlan.chunks).toHaveLength(2);
});

test("Scouting dataset versions include the import definition in their secure identity", async () => {
  const database = makeDatabase(2);
  const artifactChecksum = "a".repeat(64);
  const first = await buildScoutingDatasetVersionHash(database, artifactChecksum, {
    columnMapping: { player: "Player" },
  });
  const same = await buildScoutingDatasetVersionHash(database, artifactChecksum, {
    columnMapping: { player: "Player" },
  });
  const remapped = await buildScoutingDatasetVersionHash(database, artifactChecksum, {
    columnMapping: { player: "Name" },
  });

  expect(first).toMatch(/^[a-f0-9]{64}$/);
  expect(same).toBe(first);
  expect(remapped).not.toBe(first);
  expect(first).not.toBe(artifactChecksum);
});

test("Scouting dataset staging uploads every chunk and publishes only after validation", async () => {
  const harness = createHarness();
  const signal = new AbortController().signal;
  const result = await harness.client.stage({ database: makeDatabase(), file: { name: "players.xlsx" }, signal });

  expect(result.ok).toBe(true);
  expect(result.status).toBe("validated");
  const chunks = harness.calls.filter((call) => call.payload.action === "stageDatasetChunk");
  expect(chunks).toHaveLength(3);
  expect(chunks.flatMap((call) => call.payload.records)).toHaveLength(321);
  expect(chunks.filter((call) => call.payload.metrics.length)).toHaveLength(1);
  expect(chunks.every((call) => call.options.signal === signal)).toBe(true);
  expect(harness.calls.some((call) => call.payload.action === "publishDatasetImport")).toBe(false);
  expect(harness.calls.find((call) => call.payload.action === "startDatasetImport").payload.dataHash).toMatch(/^[a-f0-9]{64}$/);

  await expect(harness.client.publish(result.version.id)).resolves.toMatchObject({ ok: true, status: "active" });
  expect(harness.calls.at(-1).payload.action).toBe("publishDatasetImport");
});

test("Scouting dataset client resumes validation and fails closed for blocked or historical versions", async () => {
  const validating = createHarness({ versionStatus: "validating" });
  await expect(validating.client.stage({ database: makeDatabase(), file: {} })).resolves.toMatchObject({ ok: true, status: "validated" });
  expect(validating.calls.some((call) => call.payload.action === "stageDatasetChunk")).toBe(false);

  const blocked = createHarness({ validationStatus: "blocked" });
  await expect(blocked.client.stage({ database: makeDatabase(), file: {} })).resolves.toMatchObject({ ok: false, status: "blocked" });

  const historical = createHarness({ versionStatus: "superseded" });
  await expect(historical.client.stage({ database: makeDatabase(), file: {} })).resolves.toMatchObject({ ok: false, status: "superseded" });
  expect(historical.calls.some((call) => call.payload.action === "stageDatasetChunk")).toBe(false);
});

test("Scouting event wiring gives the delegated import handler its admin guard", () => {
  const workspaceSource = fs.readFileSync(path.join(projectRoot, "scouting-workspace.js"), "utf8");
  const eventDeps = workspaceSource.slice(workspaceSource.indexOf("function getScoutingEventDeps()"));
  expect(eventDeps).toContain("canAdministerData: canAdministerScoutingData");
  expect(eventDeps.indexOf("canAdministerData: canAdministerScoutingData")).toBeLessThan(eventDeps.lastIndexOf("return scoutingEventDeps"));
});
