import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { gzipSync } from "node:zlib";
import { encodeSessionTransport, decodeSessionTransport, decodeSessionResponse } from "../src/modules/session-planner/session-state-transport.mjs";
const require = createRequire(import.meta.url);
const { encodeSessionStateValue, decodeSessionStateValue } = require("../api/_lib/session-state-transport.js");
const key = "football-session-planner-v3";
const request = { url: "/api/app-state?sessionTransport=gzip-base64-v1" };

test("large Sessions transfers preserve dates, frames, markers and Unicode in both directions", async () => {
  const value = JSON.stringify({ sessions: { "2026-09-10": {
    date: "2026-09-10", blocks: Array.from({ length: 100 }, (_, index) => ({
      id: `block-${index}`, objective: "Press, recover, repeat. ".repeat(2000),
      board: { frames: [{ items: [{ id: "one", x: 20, y: 30, label: "CB" }] }, { items: [{ id: "one", x: 70, y: 80, label: "9" }] }] },
      title: "Tr\u00e4ning", notes: "Quoted \"instructions\" and \\ backslash",
    })),
  } } });
  expect(Buffer.byteLength(JSON.stringify({ key, value }))).toBeGreaterThan(4 * 1024 * 1024);
  const encoded = await encodeSessionTransport(key, value);
  expect(encoded.encoding).toBe("gzip-base64-v1");
  expect(Buffer.byteLength(JSON.stringify({ key, value: encoded }))).toBeLessThan(4 * 1024 * 1024);
  expect(await decodeSessionStateValue(key, encoded)).toBe(value);
  const response = await encodeSessionStateValue(request, key, value);
  expect(await decodeSessionTransport(key, response)).toBe(value);
  expect((await decodeSessionResponse({ key, value: response })).value).toBe(value);
  expect((await decodeSessionResponse({ entries: { [key]: response, other: "untouched" } })).entries).toEqual({ [key]: value, other: "untouched" });
});

test("small and legacy transfers remain plain strings; other modules are not compressed", async () => {
  const small = JSON.stringify({ sessions: {} });
  expect(await encodeSessionTransport(key, small)).toBe(small);
  expect(await decodeSessionStateValue(key, small)).toBe(small);
  const large = "a".repeat(300000);
  expect(await encodeSessionStateValue({ url: "/api/app-state" }, key, large)).toBe(large);
  expect(await encodeSessionTransport("football-medical-team-v1", large)).toBe(large);
  expect(await encodeSessionStateValue(request, "football-medical-team-v1", large)).toBe(large);
  await expect(encodeSessionStateValue({ url: "/api/app-state" }, key, "x".repeat(4500000))).rejects.toMatchObject({ status: 413 });
});

test("corrupt, cross-module and oversized compressed data fail closed", async () => {
  const valid = { encoding: "gzip-base64-v1", data: gzipSync("{}").toString("base64") };
  await expect(decodeSessionStateValue("football-medical-team-v1", valid)).rejects.toThrow("Invalid session transfer");
  for (const bad of [null, {}, { ...valid, encoding: "unknown" }, { ...valid, data: "%%%" }, { ...valid, data: "e30=" }]) {
    await expect(decodeSessionStateValue(key, bad)).rejects.toThrow();
    await expect(decodeSessionTransport(key, bad)).rejects.toThrow();
  }
  const tooLarge = "x".repeat(12 * 1024 * 1024 + 1);
  await expect(encodeSessionTransport(key, tooLarge)).rejects.toThrow("storage limit");
  const bomb = { ...valid, data: gzipSync(tooLarge).toString("base64") };
  await expect(decodeSessionStateValue(key, bomb)).rejects.toMatchObject({ status: 413 });
  await expect(decodeSessionTransport(key, bomb)).rejects.toThrow("transfer limit");
});
