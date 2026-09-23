import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseWebReleaseBundle } from "../tools/web-release-bundle.mjs";
import { runInNewContext } from "node:vm";

const require = createRequire(import.meta.url);
const packageRoot = resolve(import.meta.dirname, "..");
const repositoryRoot = resolve(packageRoot, "../..");
const desktopAuth = require(resolve(repositoryRoot, "api/_lib/desktop-auth.js"));
const desktopAuthRoute = require(resolve(repositoryRoot, "api/desktop-auth.js"));
const permissionMatrix = require(resolve(repositoryRoot, "src/core/permission-matrix.cjs"));

const actorId = "11111111-1111-4111-8111-111111111111";
const organizationId = "22222222-2222-4222-8222-222222222222";
const clubId = "33333333-3333-4333-8333-333333333333";
const teamId = "44444444-4444-4444-8444-444444444444";

function identityScope(overrides = {}) {
  return {
    ok: true,
    schema: "footballscience-platform-identity-scope-v1",
    actor: {
      id: actorId,
      email: "coach@example.com",
      role: "coach",
      status: "active",
      profile: { displayName: "Coach Example", firstName: "Coach", lastName: "Example" },
    },
    scope: {
      primary: { organizationId, clubId, teamId, role: "coach" },
      clubs: [{ id: clubId, name: "Test Club" }],
      teams: [{ id: teamId, name: "First Team" }],
    },
    ...overrides,
  };
}

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload),
  };
}

function dependencies(calls = []) {
  return {
    readConfig: () => ({ url: "https://test-project.supabase.co", anonKey: "test-publishable-key" }),
    findAuthUserByIdentifier: async () => ({ email: "coach@example.com" }),
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      if (String(url).includes("/logout")) return jsonResponse({}, 204);
      return jsonResponse({
        access_token: "test-access-token-generation-01",
        refresh_token: "test-refresh-token-generation-01",
        expires_at: 1_900_000_000,
      });
    },
    getCurrentActor: async () => ({ id: actorId, email: "coach@example.com" }),
    resolvePlatformActorScope: async () => identityScope(),
    sendPasswordReset: async (email, redirectTo) => {
      calls.push({ passwordReset: { email, redirectTo } });
      return { ok: true };
    },
    now: () => 1_800_000_000_000,
  };
}

test("desktop sign-in returns a server-verified partition and keeps authorization out of user metadata", async () => {
  const calls = [];
  const result = await desktopAuth.executeDesktopAuth(
    { action: "sign-in", identifier: "coach", password: "test-password" },
    "",
    dependencies(calls),
  );
  assert.equal(result.ok, true);
  assert.equal(result.payload.schema, desktopAuth.RESPONSE_SCHEMA);
  assert.deepEqual(result.payload.session.identity, {
    schema: desktopAuth.IDENTITY_SCHEMA,
    actorId,
    email: "coach@example.com",
    role: "coach",
    status: "active",
    organizationId,
    clubId,
    teamId,
    displayName: "Coach Example",
    firstName: "Coach",
    lastName: "Example",
    clubName: "Test Club",
    teamName: "First Team",
    verifiedAtUnixMs: 1_800_000_000_000,
  });
  assert.equal(calls[0].url, "https://test-project.supabase.co/auth/v1/token?grant_type=password");
  assert.equal(JSON.parse(calls[0].options.body).email, "coach@example.com");
});

test("desktop refresh rotates through the server and re-verifies active membership", async () => {
  const calls = [];
  const result = await desktopAuth.executeDesktopAuth(
    { action: "refresh", refreshToken: "test-refresh-token-generation-00" },
    "",
    dependencies(calls),
  );
  assert.equal(result.ok, true);
  assert.equal(calls[0].url, "https://test-project.supabase.co/auth/v1/token?grant_type=refresh_token");
  assert.deepEqual(JSON.parse(calls[0].options.body), { refresh_token: "test-refresh-token-generation-00" });
  assert.equal(result.payload.session.identity.teamId, teamId);
});

test("desktop authentication fails closed without an active UUID organization and team membership", async () => {
  const calls = [];
  const deps = dependencies();
  deps.fetchImpl = dependencies(calls).fetchImpl;
  deps.resolvePlatformActorScope = async () => identityScope({ scope: { primary: null, clubs: [], teams: [] } });
  const result = await desktopAuth.executeDesktopAuth(
    { action: "sign-in", identifier: "coach@example.com", password: "test-password" },
    "",
    deps,
  );
  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
  assert.match(result.reason, /organization and team membership/i);
  assert.equal(calls[1].url, "https://test-project.supabase.co/auth/v1/logout?scope=local");
});

test("desktop sign-in preserves exact password bytes and sanitizes upstream failures", async () => {
  const calls = [];
  const deps = dependencies(calls);
  const result = await desktopAuth.executeDesktopAuth(
    { action: "sign-in", identifier: "coach", password: " password with spaces " },
    "",
    deps,
  );
  assert.equal(result.ok, true);
  assert.equal(JSON.parse(calls[0].options.body).password, " password with spaces ");

  deps.fetchImpl = async () => jsonResponse({ message: "internal-project-detail" }, 500);
  const failure = await desktopAuth.executeDesktopAuth(
    { action: "sign-in", identifier: "coach", password: "bad-password" },
    "",
    deps,
  );
  assert.equal(failure.ok, false);
  assert.equal(failure.reason, "Authentication failed.");
});

test("desktop sign-out revokes only the current server session", async () => {
  const calls = [];
  const result = await desktopAuth.executeDesktopAuth(
    { action: "sign-out" },
    "Bearer test-access-token-generation-01",
    dependencies(calls),
  );
  assert.equal(result.ok, true);
  assert.equal(calls[0].url, "https://test-project.supabase.co/auth/v1/logout?scope=local");
});

test("desktop password recovery is bounded and does not enumerate accounts", async () => {
  const calls = [];
  const result = await desktopAuth.executeDesktopAuth(
    { action: "reset-password", identifier: "coach" },
    "",
    dependencies(calls),
  );
  assert.deepEqual(result, {
    ok: true,
    status: 200,
    payload: { ok: true, schema: desktopAuth.RESPONSE_SCHEMA },
  });
  assert.deepEqual(calls[0], {
    passwordReset: { email: "coach@example.com", redirectTo: "https://footballscience.xyz/" },
  });

  const deps = dependencies();
  deps.findAuthUserByIdentifier = async () => null;
  const missing = await desktopAuth.executeDesktopAuth(
    { action: "reset-password", identifier: "does-not-exist" },
    "",
    deps,
  );
  assert.equal(missing.ok, true);
  assert.equal(missing.status, 200);
});

test("desktop bridge exposes only an opaque access marker and never browser-persisted refresh material", () => {
  const bridge = readFileSync(resolve(packageRoot, "candidates/shared/desktop-auth-bridge.js"), "utf8");
  const authBoot = readFileSync(resolve(repositoryRoot, "platform-auth-boot.js"), "utf8");
  assert.match(bridge, /desktop-native-session-v1/);
  assert.match(bridge, /desktop_auth_reset_password/);
  assert.doesNotMatch(bridge, /refresh_token/);
  assert.doesNotMatch(bridge, /localStorage\.setItem/);
  assert.doesNotMatch(bridge, /cdn\.jsdelivr|supabase-js/i);
  assert.match(authBoot, /getDesktopAuthBridge/);
  assert.match(authBoot, /Desktop authentication is not connected to a test environment yet/);
});

test("desktop fetch bridge preserves JSON Request bodies and accepts empty 204 responses", async () => {
  const bridge = readFileSync(resolve(packageRoot, "candidates/shared/desktop-auth-bridge.js"), "utf8");
  const calls = [];
  const context = {
    Blob,
    Request,
    Response,
    URL,
    URLSearchParams,
    TypeError,
    location: {
      protocol: "https:",
      hostname: "fs-active.localhost",
      href: "https://fs-active.localhost/index.html",
      origin: "https://fs-active.localhost",
    },
    fetch: async () => { throw new Error("same-origin desktop API request escaped to browser fetch"); },
    __TAURI_INTERNALS__: {
      invoke: async (command, payload) => {
        calls.push({ command, payload });
        return { status: 204, body: "", contentType: "application/json; charset=utf-8" };
      },
    },
  };
  context.globalThis = context;
  runInNewContext(bridge, context, { filename: "desktop-auth-bridge.js" });
  const response = await context.fetch(new Request("https://fs-active.localhost/api/app-state", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "save" }),
  }));
  assert.equal(response.status, 204);
  assert.equal(await response.text(), "");
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [{
    command: "desktop_api_request",
    payload: {
      request: {
        path: "/api/app-state",
        method: "POST",
        body: '{"action":"save"}',
        contentType: "application/json",
      },
    },
  }]);
  await assert.rejects(
    context.fetch("https://fs-active.localhost/api/app-state", {
      method: "POST",
      body: new URLSearchParams({ action: "save" }),
    }),
    /not supported yet/,
  );
  assert.equal(calls.length, 1);
});

test("signed desktop release installs native auth routing before the web authentication boot", () => {
  const environment = JSON.parse(readFileSync(resolve(packageRoot, "generated/test-release-public-env.json"), "utf8"));
  const pack = readFileSync(resolve(packageRoot, "generated/releases", environment.releases.normal.buildId, "footballscience-web.pack"));
  const parsed = parseWebReleaseBundle(pack);
  const html = parsed.files.get("index.html").body.toString("utf8");
  const bridgeIndex = html.indexOf('src="desktop/auth-bridge.js"');
  const webAuthIndex = html.indexOf("src=platform-auth-boot.js");
  assert.ok(bridgeIndex >= 0);
  assert.ok(webAuthIndex > bridgeIndex);
});

test("desktop auth endpoint is public only for its bounded POST exchange", async () => {
  assert.deepEqual(permissionMatrix.apiRouteSecurity["/api/desktop-auth"], {
    moduleId: "auth",
    public: true,
    actions: { POST: "write" },
    rateLimits: { write: 12 },
    enforcePermission: false,
  });
  let payload;
  const handler = desktopAuthRoute.createDesktopAuthHandler({
    guardApiRequest: () => ({ ok: true }),
    parseJsonBody: async () => ({ action: "sign-out" }),
    executeDesktopAuth: async () => ({ ok: true, status: 200, payload: { ok: true, schema: desktopAuth.RESPONSE_SCHEMA } }),
    sendCorsHeaders: () => {},
    sendJson: (_res, status, body) => { payload = { status, body }; },
  });
  await handler({ method: "POST", headers: {} }, {});
  assert.deepEqual(payload, { status: 200, body: { ok: true, schema: desktopAuth.RESPONSE_SCHEMA } });

  const failingHandler = desktopAuthRoute.createDesktopAuthHandler({
    guardApiRequest: () => ({ ok: true }),
    parseJsonBody: async () => ({ action: "sign-in" }),
    executeDesktopAuth: async () => { throw new Error("private provider detail"); },
    sendCorsHeaders: () => {},
    sendJson: (_res, status, body) => { payload = { status, body }; },
  });
  await failingHandler({ method: "POST", headers: {} }, {});
  assert.deepEqual(payload, {
    status: 503,
    body: { ok: false, schema: desktopAuth.RESPONSE_SCHEMA, reason: "Desktop authentication is temporarily unavailable." },
  });
});
