import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { Readable } from "node:stream";
import test from "node:test";

const require = createRequire(import.meta.url);
const { createDesktopSessionSyncHandler } = require("../../../api/desktop-session-sync.js");

const actor = Object.freeze({
  id: "00000000-0000-4000-8000-000000000101",
  organizationId: "00000000-0000-4000-8000-000000000201",
  teamId: "00000000-0000-4000-8000-000000000401",
  role: "coach",
  status: "active",
});

function body(overrides = {}) {
  return {
    schema: "fs-desktop-session-sync-request-v1",
    syncProtocolVersion: 1,
    clientInstanceId: "00000000-0000-4000-8000-000000009001",
    authEpoch: 1,
    operation: {
      operationId: randomUUID(),
      operationType: "session.rename",
      operationVersion: 1,
      sessionId: "00000000-0000-4000-8000-000000001001",
      baseRevision: 7,
      payload: { title: "Synthetic MD-1 Updated" },
    },
    ...overrides,
  };
}

function request(payload, { method = "POST", url = "/api/desktop-session-sync" } = {}) {
  const req = Readable.from(payload === undefined ? [] : [Buffer.from(JSON.stringify(payload))]);
  req.method = method;
  req.url = url;
  req.headers = { authorization: "Bearer synthetic-local-token", "x-request-id": "local-request-001" };
  req.socket = { remoteAddress: "127.0.0.1" };
  return req;
}

function response() {
  return {
    statusCode: 200,
    headers: {},
    setHeader(name, value) { this.headers[name.toLowerCase()] = String(value); },
    end(value = "") { this.body = value ? JSON.parse(value) : null; },
  };
}

function dependencies(overrides = {}) {
  return {
    getCurrentActor: async () => actor,
    guardApiRequest: (_req, _res, options) => ({
      ok: true,
      context: { requestId: "local-request-001", actorId: options.actor.id },
    }),
    ...overrides,
  };
}

test("handler derives actor and tenant scope server-side and returns a correlated acknowledgement", async () => {
  let applied;
  const handler = createDesktopSessionSyncHandler(dependencies({
    applyOperation: async (value) => {
      applied = value;
      return {
        acknowledgement: "accepted",
        acknowledgement_id: "00000000-0000-4000-8000-000000008001",
        resulting_revision: 8,
        operation_result: { title: value.payload.title },
      };
    },
  }));
  const res = response();
  await handler(request(body()), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.acknowledgement, "accepted");
  assert.equal(res.body.requestId, "local-request-001");
  assert.equal(applied.actorId, actor.id);
  assert.equal(applied.organizationId, actor.organizationId);
  assert.equal(applied.teamId, actor.teamId);
  assert.match(applied.payloadSha256, /^[a-f0-9]{64}$/);
  assert.equal("serviceRoleKey" in applied, false);
});

test("snapshot read derives scope server-side and returns only the bounded selected slice", async () => {
  let scope;
  const handler = createDesktopSessionSyncHandler(dependencies({
    readSnapshot: async (value) => {
      scope = value;
      return {
        schema: "fs-desktop-session-snapshot-v1",
        session: {
          id: "00000000-0000-4000-8000-000000001001",
          title: "Synthetic MD-1 Session",
          sessionDate: "2026-09-01",
          revision: 7,
          content: { source: "synthetic-selected-slice" },
        },
        blocks: [{
          id: "00000000-0000-4000-8000-000000001101",
          sortOrder: 1,
          revision: 7,
          payload: { title: "Dynamic activation", durationMinutes: 15 },
        }],
      };
    },
  }));
  const res = response();
  await handler(request(undefined, {
    method: "GET",
    url: "/api/desktop-session-sync?sessionId=00000000-0000-4000-8000-000000001001&syncProtocolVersion=1",
  }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.schema, "fs-desktop-session-snapshot-response-v1");
  assert.equal(res.body.snapshot.session.revision, 7);
  assert.equal(scope.actorId, actor.id);
  assert.equal(scope.organizationId, actor.organizationId);
  assert.equal(scope.teamId, actor.teamId);
  assert.equal("accessToken" in res.body, false);
});

test("client-supplied scope, unsupported commands and malformed payloads fail closed", async () => {
  const handler = createDesktopSessionSyncHandler(dependencies({ applyOperation: async () => assert.fail("must not run") }));
  for (const payload of [
    body({ organizationId: actor.organizationId }),
    body({ operation: { ...body().operation, operationType: "sql.execute" } }),
    body({ operation: { ...body().operation, payload: { title: "ok", extra: true } } }),
  ]) {
    const res = response();
    await handler(request(payload), res);
    assert.equal(res.statusCode, 400);
  }
});

test("authentication, method and unconfigured backend failures are sanitized", async () => {
  const noAuth = createDesktopSessionSyncHandler(dependencies({ getCurrentActor: async () => null }));
  let res = response();
  await noAuth(request(body()), res);
  assert.equal(res.statusCode, 401);

  res = response();
  await noAuth(request(undefined, { method: "DELETE" }), res);
  assert.equal(res.statusCode, 405);

  const unconfigured = createDesktopSessionSyncHandler(dependencies());
  res = response();
  await unconfigured(request(body()), res);
  assert.equal(res.statusCode, 503);
  assert.doesNotMatch(JSON.stringify(res.body), /database|sql|secret/i);

  const failed = createDesktopSessionSyncHandler(dependencies({
    applyOperation: async () => { throw new Error("private SQL payload and secret details"); },
  }));
  res = response();
  await failed(request(body()), res);
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body.reason, "Desktop synchronization failed.");
});

test("oversized bodies and operation batches fail before the database boundary", async () => {
  const tooLarge = createDesktopSessionSyncHandler(dependencies({
    parseJsonBody: async () => {
      const error = new Error("synthetic oversized body");
      error.code = "BODY_TOO_LARGE";
      throw error;
    },
    applyOperation: async () => assert.fail("database must not run"),
  }));
  let res = response();
  await tooLarge(request(body()), res);
  assert.equal(res.statusCode, 413);
  assert.equal(res.body.reason, "Request body is too large.");

  const singleOnly = createDesktopSessionSyncHandler(dependencies({
    applyOperation: async () => assert.fail("database must not run"),
  }));
  res = response();
  await singleOnly(request({ ...body(), operations: [body().operation], operation: undefined }), res);
  assert.equal(res.statusCode, 400);
});
