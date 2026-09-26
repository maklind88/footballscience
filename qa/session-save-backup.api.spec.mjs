import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
const require = createRequire(import.meta.url);
const { validateSessionSaveBackup } = require("../api/_lib/session-save-backup.js");
const key = "football-session-planner-v3";
const hash = createHash("sha256").update("{}").digest("hex");
const identity = { organization_id: "global", state_key: key, actor_id: "coach", operation_id: "operation" };
function fixture() {
  return { schema: "session-save-backup-v1", organizationId: "global",
    entry: { organization_id: "global", state_key: key, revision: 3, value: "{}", value_hash: hash },
    receipts: [{ ...identity, operation_hash: hash, session_date: "2026-09-25", accepted_revision: 2 }],
    effects: [{ ...identity, payload: { audit: { action: "data-safety.saved" } } }] };
}
test("Sessions backup accepts consistent data and empty not-yet-created state", () => {
  expect(validateSessionSaveBackup(fixture()).revision).toBe(3);
  expect(validateSessionSaveBackup({ schema: "session-save-backup-v1", organizationId: "global", entry: null, receipts: [], effects: [] })).toBe(null);
});
for (const [name, corrupt] of Object.entries({
  "missing snapshot": () => undefined,
  "wrong organization": (s) => { s.organizationId = "other"; return s; },
  "state mismatch": (s) => { s.entry.value = "unverified"; return s; },
  "missing state": (s) => { s.entry = null; return s; },
  "missing event": (s) => { s.effects = []; return s; },
  "duplicate receipt": (s) => { s.receipts.push(s.receipts[0]); s.effects.push(s.effects[0]); return s; },
  "wrong event actor": (s) => { s.effects[0].actor_id = "other"; return s; },
  "receipt ahead of state": (s) => { s.receipts[0].accepted_revision = 4; return s; },
  "truncated sentinel": (s) => { s.receipts = Array(100001).fill(s.receipts[0]); return s; },
})) test(`Sessions backup fails closed: ${name}`, () => { expect(() => validateSessionSaveBackup(corrupt(fixture()))).toThrow(); });
