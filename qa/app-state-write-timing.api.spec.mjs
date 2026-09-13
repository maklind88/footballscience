import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createAppStateWriteTiming } = require("../api/_lib/app-state-write-timing.js");

test("save timing reports bounded phase names without logging values or changing receipts", async () => {
  let clock = 0;
  const headers = {};
  const { measure } = createAppStateWriteTiming({ setHeader: (name, value) => { headers[name] = value; } }, { now: () => clock });
  const receipt = { ok: true, value: "private coaching content", revision: 8 };
  const result = await measure("state", async () => {
    await measure("database", async () => { clock += 14; });
    await measure("compatibility", async () => { clock += 2000; });
    return receipt;
  });
  await measure("history", async () => { clock += 3000; });
  expect(result).toBe(receipt);
  expect(headers["Server-Timing"]).toBe("database;dur=14.0, compatibility;dur=2000.0, state;dur=2014.0, history;dur=3000.0");
  expect(headers["Server-Timing"]).not.toContain(receipt.value);
  await measure("untrusted\r\nheader", async () => { clock += 1; });
  expect(headers["Server-Timing"]).not.toContain("untrusted");
  await measure("authorize", async () => { clock += 3; });
  await measure("authorize", async () => { clock += 4; });
  expect(headers["Server-Timing"].match(/authorize;dur=7.0/g)).toHaveLength(1);
});

test("failed save timing preserves the original error and awaits the real write", async () => {
  let clock = 0, finish;
  const headers = {};
  const { measure } = createAppStateWriteTiming({ setHeader: (name, value) => { headers[name] = value; } }, { now: () => clock });
  const error = new Error("Database unavailable");
  const writing = measure("database", () => new Promise((_resolve, reject) => { finish = () => reject(error); }));
  expect(headers).toEqual({});
  clock = 15000;
  finish();
  await expect(writing).rejects.toBe(error);
  expect(headers["Server-Timing"]).toBe("database;dur=15000.0");
});

test("a disconnected response cannot turn a committed write into an error", async () => {
  const { measure } = createAppStateWriteTiming({ setHeader: () => { throw new Error("Headers already sent"); } });
  const receipt = { ok: true, revision: 9 };
  expect(await measure("state", async () => receipt)).toBe(receipt);
  const error = new Error("Original failure");
  await expect(measure("state", async () => { throw error; })).rejects.toBe(error);
});
