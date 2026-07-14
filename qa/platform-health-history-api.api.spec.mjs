import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const handler = require("../api/platform-health-history.js");

const envKeys = [
  "APP_STATE_BACKUP_STATUS_TOKEN",
  "CRON_SECRET",
  "PLATFORM_HEALTH_SNAPSHOT_TOKEN",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_URL",
  "VERCEL_ENV",
  "VERCEL_GIT_COMMIT_SHA",
];

function snapshotEnv() {
  return Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
}

function restoreEnv(snapshot) {
  for (const key of envKeys) {
    if (snapshot[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = snapshot[key];
    }
  }
}

function createResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: "",
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    end(body = "") {
      this.body = String(body || "");
    },
  };
}

test("platform health history POST stores a privacy-safe server-owned snapshot", async () => {
  const originalEnv = snapshotEnv();
  const originalFetch = global.fetch;
  const writes = [];

  process.env.PLATFORM_HEALTH_SNAPSHOT_TOKEN = "snapshot-token";
  process.env.SUPABASE_URL = "https://unit.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  process.env.VERCEL_ENV = "production";
  process.env.VERCEL_GIT_COMMIT_SHA = "abcdef1234567890abcdef1234567890abcdef12";
  delete process.env.CRON_SECRET;
  delete process.env.APP_STATE_BACKUP_STATUS_TOKEN;

  global.fetch = async (url, options = {}) => {
    const href = String(url);
    if (href.includes("/api/auth-health")) {
      return new Response(JSON.stringify({ ok: true, ms: 12 }), { status: 200 });
    }
    if (href.includes("/rest/v1/platform_observability_signals")) {
      writes.push({ table: "platform_observability_signals", rows: JSON.parse(options.body) });
      return new Response("", { status: 201 });
    }
    if (href.includes("/rest/v1/platform_release_checks")) {
      writes.push({ table: "platform_release_checks", rows: JSON.parse(options.body) });
      return new Response("", { status: 201 });
    }
    return new Response(JSON.stringify({ message: "unexpected fetch" }), { status: 404 });
  };

  try {
    const req = {
      method: "POST",
      url: "/api/platform-health-history",
      headers: {
        authorization: "Bearer snapshot-token",
        host: "footballscience.xyz",
        "x-forwarded-proto": "https",
      },
      socket: { remoteAddress: "127.0.0.1" },
    };
    const res = createResponse();
    await handler(req, res);
    const payload = JSON.parse(res.body);

    expect(res.statusCode).toBe(201);
    expect(payload.ok).toBe(true);
    expect(payload.snapshot.insertedSignals).toBeGreaterThan(0);
    expect(payload.snapshot.insertedReleaseChecks).toBeGreaterThan(0);
    expect(writes.map((write) => write.table)).toEqual(
      expect.arrayContaining(["platform_observability_signals", "platform_release_checks"])
    );
    expect(writes[0].rows[0]).toMatchObject({
      source: "production-monitor",
      metadata: expect.objectContaining({
        environment: "production",
      }),
    });
    expect(JSON.stringify(writes)).not.toContain("snapshot-token");
    expect(JSON.stringify(writes)).not.toContain("service-role-key");
  } finally {
    global.fetch = originalFetch;
    restoreEnv(originalEnv);
  }
});

test("platform health history POST refuses writes without the system token", async () => {
  const originalEnv = snapshotEnv();
  const originalFetch = global.fetch;
  let fetchCount = 0;

  process.env.PLATFORM_HEALTH_SNAPSHOT_TOKEN = "snapshot-token";
  global.fetch = async () => {
    fetchCount += 1;
    return new Response("{}", { status: 200 });
  };

  try {
    const req = {
      method: "POST",
      url: "/api/platform-health-history",
      headers: {},
      socket: { remoteAddress: "127.0.0.1" },
    };
    const res = createResponse();
    await handler(req, res);
    const payload = JSON.parse(res.body);

    expect(res.statusCode).toBe(401);
    expect(payload.ok).toBe(false);
    expect(fetchCount).toBe(0);
  } finally {
    global.fetch = originalFetch;
    restoreEnv(originalEnv);
  }
});
