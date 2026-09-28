import { test, expect } from "@playwright/test";
import { verifyFreshBackup } from "../scripts/verify-fresh-app-state-backup.mjs";
import { dataSafetyRegistry } from "../src/core/data-safety-contracts.mjs";

const sha = "a".repeat(40);
function fixture(change = () => {}) {
  const calls = [];
  const latest = { path: "backups/app-state/test.json", contentSha256: "b".repeat(64) };
  const state = {
    identity: { ok: true, buildId: sha, url: "https://pokrksgempkuraueglpu.supabase.co" },
    created: { ok: true, ...latest, createdAt: new Date().toISOString(), entryCount: 1 },
    status: { ok: true, backupMatchesPointer: true, latest, backup: latest },
    drill: { ok: true, latest, restoreDrill: {
      restorable: true, dryRun: true, restored: false, keyCount: dataSafetyRegistry.keys().length,
      entryCount: 1, declaredEntryCount: 1, pointerEntryCount: 1, parsedEntryCount: 1,
      unknownEntryKeys: [], missingEntryKeys: [], unexpectedEntryKeys: [], invalidEntries: [],
    } },
  };
  change(state);
  const options = { target: "staging", expectedBuildId: sha, username: "qa", password: "private-password",
    cronSecret: "production-must-not-be-used",
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      if (url.pathname === "/api/client-config") {
        return Response.json(init.method === "POST" ? { ok: true, session: { access_token: "qa-token" } } : state.identity);
      }
      if (state.failure) return Response.json({ reason: "private-server-data" }, { status: state.failure });
      return Response.json(init.method === "POST" ? state.created : url.search.includes("restore-drill") ? state.drill : state.status);
    },
  };
  return { state, options, calls };
}

test("fresh staging backup uses only staging credentials and never restores content", async () => {
  const f = fixture();
  expect((await verifyFreshBackup(f.options)).ok).toBe(true);
  expect(f.calls).toHaveLength(6);
  expect(f.calls.every(({ url, init }) => url.origin === "https://staging.footballscience.xyz"
    && init.redirect === "error" && init.signal)).toBeTruthy();
  expect(f.calls.filter(({ init }) => init.method === "POST").map(({ url }) => url.pathname))
    .toEqual(["/api/client-config", "/api/app-state-backup"]);
  expect(JSON.stringify(f.calls)).not.toContain("production-must-not-be-used");
});
for (const [name, change] of Object.entries({
  "wrong database": (s) => { s.identity.url = "https://bustidorxevacosqhkcz.supabase.co"; },
  "wrong deployed SHA": (s) => { s.identity.buildId = "old"; },
})) test(`identity guard stops before login or backup: ${name}`, async () => {
  const f = fixture(change);
  await expect(verifyFreshBackup(f.options)).rejects.toThrow();
  expect(f.calls).toHaveLength(1);
});
for (const [name, change] of Object.entries({
  "admin denial": (s) => { s.failure = 403; },
  "server failure": (s) => { s.failure = 500; },
  "old backup": (s) => { s.created.createdAt = "2020-01-01"; },
  "hash mismatch": (s) => { s.status.backup = { contentSha256: "c".repeat(64) }; },
  "pointer mismatch": (s) => { s.status.backupMatchesPointer = false; },
  "unexpected restore": (s) => { s.drill.restoreDrill.restored = true; },
  "missing entries": (s) => { s.drill.restoreDrill.missingEntryKeys = ["synthetic"]; },
  "count mismatch": (s) => { s.drill.restoreDrill.parsedEntryCount = 0; },
})) test(`backup verification fails closed: ${name}`, async () => {
  const f = fixture(change);
  await expect(verifyFreshBackup(f.options)).rejects.toThrow(/Backup|backup/);
});
test("production uses existing cron credential on production only", async () => {
  const f = fixture((s) => { s.identity.url = "https://bustidorxevacosqhkcz.supabase.co"; });
  await verifyFreshBackup({ ...f.options, target: "production" });
  expect(f.calls).toHaveLength(5);
  expect(f.calls.every(({ url }) => url.origin === "https://footballscience.xyz")).toBeTruthy();
  expect(f.calls[1].init.headers.Authorization).toBe("Bearer production-must-not-be-used");
});
test("prebuilt deployments can be bound to their exact Vercel deployment identity", async () => {
  const f = fixture((s) => { s.identity.buildId = "dpl_ExactReviewedDeployment"; });
  expect((await verifyFreshBackup({ ...f.options, expectedBuildId: "dpl_ExactReviewedDeployment" })).ok).toBe(true);
});
test("transport errors do not disclose credentials and never follow redirects", async () => {
  const f = fixture();
  await expect(verifyFreshBackup({ ...f.options, fetchImpl: async () => { throw new Error("private-password"); } }))
    .rejects.toThrow("Backup verification transport failed at /api/client-config.");
});
