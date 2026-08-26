import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createScoutingImportParserClient } from "../src/modules/scouting/scouting-import-parser-client.mjs";

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

class FakeWorker {
  constructor({ reply = true } = {}) {
    this.reply = reply;
    this.terminated = false;
    this.messages = [];
  }

  postMessage(message, transfer) {
    this.messages.push({ message, transfer });
    if (this.reply && message.type === "parse-xlsx") {
      queueMicrotask(() => this.onmessage?.({
        data: {
          requestId: message.requestId,
          ok: true,
          phase: "ready",
          sheets: [{ name: "Players", headers: ["Player"], rowCount: 2, rowFormat: "columns" }],
        },
      }));
    } else if (this.reply && message.type === "read-xlsx-chunk") {
      const rows = message.offset === 0 ? [["Ada"]] : [["Bea"]];
      queueMicrotask(() => this.onmessage?.({
        data: {
          requestId: message.requestId,
          ok: true,
          phase: "chunk",
          sheetIndex: 0,
          rows,
          nextOffset: message.offset + rows.length,
          sheetDone: message.offset > 0,
        },
      }));
    }
  }

  terminate() {
    this.terminated = true;
  }
}

test("Scouting import parser transfers the workbook buffer off the main thread", async () => {
  const worker = new FakeWorker();
  const client = createScoutingImportParserClient({ createWorker: () => worker, schedule: queueMicrotask });
  const buffer = new ArrayBuffer(16);
  const result = await client.parseXlsx(buffer);

  expect(result).toMatchObject({ ok: true, sheets: [{ name: "Players" }] });
  expect(result.sheets[0].rows).toEqual([["Ada"], ["Bea"]]);
  expect(worker.messages).toHaveLength(3);
  expect(worker.messages[0].message.type).toBe("parse-xlsx");
  expect(worker.messages[0].message.excludedSheetNames).toContain("NWSL (Statsbomb)");
  expect(worker.messages[0].transfer).toHaveLength(1);
  expect(worker.messages.slice(1).every((entry) => entry.message.type === "read-xlsx-chunk")).toBe(true);
  expect(worker.terminated).toBe(true);
});

test("Scouting import parser cancels stale workbook work", async () => {
  const worker = new FakeWorker({ reply: false });
  const client = createScoutingImportParserClient({ createWorker: () => worker });
  const pending = client.parseXlsx(new ArrayBuffer(8));
  client.cancel();

  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  expect(worker.terminated).toBe(true);
});

test("Scouting workbook worker returns columnar rows instead of cloning repeated header keys", () => {
  const source = fs.readFileSync(path.join(projectRoot, "scouting-import-parser-worker.js"), "utf8");
  expect(source).toContain('rowFormat: "columns"');
  expect(source).toContain("headerPlan.includedColumns.map");
  expect(source).toContain('return "League"');
  expect(source).toContain('return "Season"');
  expect(source).toContain("excludedSheetNames");
  expect(source).not.toContain("ok: true, sheets: objectRows");
});
