import { expect, test } from "@playwright/test";
import { runInNewContext } from "node:vm";
import { readScheduleSaveDiagnostics } from "./helpers/schedule-save-diagnostics.mjs";

const key = "football-schedule-v1";
const secret = "private-content-and-token";
function fixture({ manifest = {}, value = "", feedback = "", storageError } = {}) {
  return { evaluate: (fn, input) => runInNewContext(`(${fn})(input)`, {
    input,
    window: {
      localStorage: { getItem: name => {
        if (storageError) throw storageError;
        return name === key ? value : JSON.stringify(manifest);
      } },
      footballScienceCentralState: {
        getStatus: () => ({ hydrated: true, hydrating: false, accessToken: secret, lastWriteError: secret }),
        getReadScope: () => secret,
        getCachedValueInfo: () => ({ source: "local-write", value: secret, canEdit: true }),
      },
    },
    document: { querySelector: () => ({ textContent: feedback }) },
  }) };
}

test("Schedule diagnostics report a rejected metadata write without exporting user data", async () => {
  const report = await readScheduleSaveDiagnostics(fixture({
    value: secret, feedback: `Added ${secret} Not saved to team`,
    manifest: { lastError: "Edit was not queued: recovery metadata could not be saved.",
      entries: { [key]: { pendingCentralSync: true, localWritePrepared: true, serverRevision: 8, principalScope: secret } },
      localSaveIssues: [{ key, scope: secret, message: "Manifest quota" }, { key: "another-module", message: secret }],
    },
  }), key, "QA Live probe");
  expect(report).toMatchObject({ localContains: false, hasReadScope: true, pending: true, prepared: true,
    serverRevision: 8, lastError: "metadata", lastWriteError: "other", saveIssues: ["quota"],
    feedback: { rejected: true, saved: false, saving: false } });
  expect(JSON.stringify(report)).not.toContain(secret);
});

test("Schedule diagnostics distinguish a successful read and receipt", async () => {
  const report = await readScheduleSaveDiagnostics(fixture({ value: "QA Live probe", feedback: "Added QA Live probe Saved to team" }), key, "QA Live probe");
  expect(report).toMatchObject({ localContains: true, pending: false, prepared: false,
    feedback: { rejected: false, saved: true, saving: false } });
});

test("Schedule diagnostics remain available when browser storage throws", async () => {
  const report = await readScheduleSaveDiagnostics(fixture({ storageError: { name: "QuotaExceededError", message: secret } }), key, "QA Live probe");
  expect(report.storageError).toBe("quota");
  expect(JSON.stringify(report)).not.toContain(secret);
});
