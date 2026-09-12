import assert from "node:assert/strict";
import test from "node:test";
import { SessionAuthority } from "../candidates/shared/session-authority.mjs";

const snapshot = Object.freeze({
  state: "synthetic-offline-authorized",
  actorId: "actor-1",
  organizationId: "org-1",
  partitionKey: "partition-1",
  authEpoch: 1,
  canReadOffline: true,
});

test("concurrent consumers share one native authority read", async () => {
  let readCalls = 0;
  const authority = new SessionAuthority({ adapter: { readSnapshot: async () => {
    readCalls += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return snapshot;
  } } });
  const values = await Promise.all(Array.from({ length: 12 }, () => authority.snapshot()));
  assert.equal(readCalls, 1);
  assert.deepEqual(new Set(values), new Set([values[0]]));
});

test("context proof contains partition identity but no credentials", async () => {
  const authority = new SessionAuthority({ adapter: { readSnapshot: async () => snapshot } });
  const proof = await authority.contextProof("hosted-build-v1");
  assert.deepEqual(Object.keys(proof).sort(), ["actorId", "authEpoch", "frontendBuildId", "organizationId", "partitionKey"]);
  assert.equal(JSON.stringify(proof).toLowerCase().includes("token"), false);
});

test("adapter output containing credentials is rejected", async () => {
  const authority = new SessionAuthority({ adapter: { readSnapshot: async () => ({ ...snapshot, refreshToken: "forbidden" }) } });
  await assert.rejects(authority.snapshot(), /credential material/i);
});
