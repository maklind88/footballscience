import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { verifySaveAcceptanceFrontend, saveAcceptanceAssets } from "./helpers/save-acceptance-frontend.mjs";
const baseUrl = "https://staging.footballscience.xyz";
const readSource = path => Buffer.from("reviewed " + path);

test("matching public bytes are checked using read-only requests without credentials", async () => {
  const calls = [];
  const proof = await verifySaveAcceptanceFrontend({ baseUrl, readSource, fetchImpl: async (url, options) => {
    calls.push({ url, options });
    assert.equal(options.redirect, "error"); assert.equal(options.cache, "no-store");
    assert.equal(options.headers, undefined); assert.equal(options.method, undefined);
    return new Response(readSource(url.slice(baseUrl.length + 1)));
  } });
  assert.equal(calls.length, saveAcceptanceAssets.length);
  assert.equal(proof.fixturesCreated, false);
});
for (const status of [200, 404, 302]) test(`wrong staging source fails closed (HTTP ${status})`, async () => {
  let calls = 0;
  await assert.rejects(verifySaveAcceptanceFrontend({ baseUrl, readSource,
    fetchImpl: async () => { calls++; return new Response("old private response", { status }); } }),
    error => error.message.includes("No test fixtures created") && !error.message.includes("private response"));
  assert.equal(calls, 1);
});
test("credential destination and network failures are rejected without content disclosure", async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; throw new Error("secret-token"); };
  await assert.rejects(verifySaveAcceptanceFrontend({ baseUrl: "https://footballscience.xyz", readSource, fetchImpl }), /Exact staging/);
  assert.equal(calls, 0);
  await assert.rejects(verifySaveAcceptanceFrontend({ baseUrl, readSource, fetchImpl }), error => !error.message.includes("secret-token"));
});
test("deployed frontend guard precedes account and fixture creation; intentional overlays remain explicit", () => {
  const source = readFileSync(new URL("./save-acceptance.staging.spec.mjs", import.meta.url), "utf8");
  assert.ok(source.indexOf("await verifySaveAcceptanceFrontend") < source.indexOf("await createStagingAcceptance"));
  assert.ok(source.includes('SAVE_QA_CLIENT_CANDIDATE !== "1"'));
  assert.ok(saveAcceptanceAssets.includes("src/modules/medical/medical-view-preferences.mjs"));
  assert.ok(saveAcceptanceAssets.includes("src/modules/session-planner/session-save-review.mjs"));
});

for (const path of ["medical-runtime-service", "medical-working-drafts", "medical-draft-recovery", "medical-draft-store", "medical-draft-verification"]) {
  test(`stale ${path} stops acceptance before credentials and fixtures`, async () => {
    const target = `src/modules/medical/${path}.mjs`;
    assert.ok(saveAcceptanceAssets.includes(target));
    await assert.rejects(verifySaveAcceptanceFrontend({ baseUrl, readSource,
      fetchImpl: async url => new Response(url.endsWith(target) ? "old implementation" : readSource(url.slice(baseUrl.length + 1))),
    }), /differs from reviewed source/);
  });
}
