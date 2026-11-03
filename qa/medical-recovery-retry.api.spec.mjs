import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { retryMedicalRecoveryCopy, sameMedicalRetryBaseline } from "../src/modules/medical/medical-recovery-retry.mjs";
const { checkMedicalRecoveryRetry } = createRequire(import.meta.url)("../api/_lib/medical-recovery-retry.js");
const key = "football-medical-team-v1", protocol = "medical-recovery-retry-v1";
const value = '{"records":[{"id":"new"}]}', baseline = '{"records":[]}';
function setup(mode = "success") {
  const state = { scope: "owner", token: "token", allowed: true, current: true, posts: [] };
  const copy = { id: "copy-1", scope: "owner", value, previousValue: baseline, baseRevision: 7, retryProtocol: protocol };
  if (mode === "historical") delete copy.retryProtocol;
  if (mode === "unknown-base") copy.baseRevision = null;
  if (mode === "foreign") copy.scope = "other";
  const options = { copy, getScope: () => state.scope, getToken: () => state.token, canWrite: () => state.allowed,
    isCurrent: () => state.current, path: "/write", readPath: "/read", timeoutMs: 100,
    apiRequest: async (path, init) => {
      if (path === "/read") {
        if (mode === "scope") state.scope = "other";
        if (mode === "permission") state.allowed = false;
        if (mode === "token") state.token = "new";
        if (mode === "generation") state.current = false;
        return { ok: true, payload: { ok: true, entries: { [key]: mode === "already-saved" ? value : mode === "changed-value" ? '{"other":true}' : baseline },
          metadata: { [key]: { revision: ["changed-revision", "already-saved"].includes(mode) ? 8 : 7 } },
          medicalRecoveryRead: { private: mode !== "coach", ...(mode === "old-server" ? {} : { retryProtocol: protocol }) } } };
      }
      state.posts.push(JSON.parse(init.body));
      if (mode === "lost-reply") throw new Error("private data must not escape");
      if (mode === "late-scope") state.scope = "other";
      if (mode === "late-generation") state.current = false;
      if (mode === "race") return { ok: false, status: 409 };
      return { ok: true, payload: { ok: true, key, value: mode === "wrong-value" ? baseline : value,
        metadata: { revision: mode === "wrong-revision" ? 7 : 8 },
        medicalRetry: { id: mode === "wrong-id" ? "another" : copy.id, protocol: mode === "wrong-protocol" ? "old" : protocol } } };
    } };
  return { state, copy, options };
}
for (const mode of ["success", "historical", "unknown-base", "foreign", "scope", "permission", "token", "generation", "coach", "old-server",
  "changed-value", "changed-revision", "already-saved", "race", "lost-reply", "late-scope", "late-generation", "wrong-value", "wrong-revision", "wrong-id", "wrong-protocol"]) {
  test(`a durable Medical retry respects exact ownership, baseline and receipt: ${mode}`, async () => {
    const { state, options } = setup(mode);
    const result = await retryMedicalRecoveryCopy(options);
    expect(result.ok).toBe(["success", "already-saved"].includes(mode));
    const sends = ["success", "race", "lost-reply", "late-scope", "late-generation", "wrong-value", "wrong-revision", "wrong-id", "wrong-protocol"].includes(mode);
    expect(state.posts).toHaveLength(sends ? 1 : 0);
    if (sends) expect(state.posts[0]).toEqual({ key, value, baseRevision: 7, medicalRetry: { id: "copy-1", protocol, baseRevision: 7 } });
    expect(JSON.stringify(result)).not.toContain("private data");
  });
}
test("a stalled Medical retry expires and invalidates a late receipt", async () => {
  const f = setup(); const request = f.options.apiRequest; let current, finish;
  f.options.timeoutMs = 10;
  f.options.apiRequest = (path, init) => path === "/read" ? request(path, init)
    : new Promise(resolve => { current = init.isCurrent; finish = resolve; });
  expect((await retryMedicalRecoveryCopy(f.options)).ok).toBe(false);
  expect(current()).toBe(false); finish({ ok: true });
});
for (const mode of ["normal", "valid", "stale", "future", "removed", "absent", "storage", "wrong-key", "bad-id", "bad-protocol", "missing-base", "mismatch-base"]) {
  test(`server exact Medical retry guard: ${mode}`, () => {
    const options = { key, clientBaseRevision: 7, databaseEnabled: mode !== "storage", previousEntry: { revision: 7 },
      request: mode === "normal" ? undefined : { protocol, id: "copy-1", baseRevision: 7 } };
    if (mode === "stale") options.previousEntry.revision = 8;
    if (mode === "future") options.previousEntry.revision = 6;
    if (mode === "removed") options.previousEntry.removed = true;
    if (mode === "absent") options.previousEntry = null;
    if (mode === "wrong-key") options.key = "football-schedule-v1";
    if (mode === "bad-id") options.request.id = "";
    if (mode === "bad-protocol") options.request.protocol = "old";
    if (mode === "missing-base") options.request.baseRevision = null;
    if (mode === "mismatch-base") options.clientBaseRevision = 8;
    expect(checkMedicalRecoveryRetry(options).ok).toBe(["normal", "valid"].includes(mode));
  });
}

 test("baseline comparison ignores only established tab-local selections", () => {
   expect(sameMedicalRetryBaseline(baseline, '{"selectedDate":"2026-11-02","records":[],"selectedPlayerId":"player"}')).toBe(true);
   for (const other of ['{"records":[],"unknown":true}', value, '[]', 'null', 'invalid']) {
     expect(sameMedicalRetryBaseline(baseline, other)).toBe(false);
   }
 });
