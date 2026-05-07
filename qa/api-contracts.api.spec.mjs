import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const clientConfigHandler = require("../api/client-config.js");
const appStateHandler = require("../api/app-state.js");
const appStateBackupHandler = require("../api/app-state-backup.js");

const supabaseEnvKeys = [
  "CRON_SECRET",
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_PROJECT_REF",
  "SUPABASE_PROJECT_ID",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE",
];

function snapshotEnv(keys) {
  return Object.fromEntries(keys.map((key) => [key, process.env[key]]));
}

function restoreEnv(snapshot) {
  Object.entries(snapshot).forEach(([key, value]) => {
    if (value === undefined) {
      delete process.env[key];
      return;
    }
    process.env[key] = value;
  });
}

function clearEnv(keys) {
  keys.forEach((key) => {
    delete process.env[key];
  });
}

function createMockResponse() {
  const response = {
    statusCode: 200,
    headers: {},
    body: "",
    setHeader(name, value) {
      response.headers[String(name).toLowerCase()] = value;
    },
    end(chunk = "") {
      response.body += chunk;
    },
  };
  return response;
}

async function callHandler(handler, req = {}) {
  const res = createMockResponse();
  await handler(
    {
      method: "GET",
      url: "/",
      headers: {},
      ...req,
    },
    res
  );

  const payload = res.body ? JSON.parse(res.body) : {};
  return {
    status: res.statusCode,
    headers: res.headers,
    payload,
  };
}

test("client-config fails loudly when Supabase browser config is missing", async () => {
  const env = snapshotEnv(supabaseEnvKeys);
  clearEnv(supabaseEnvKeys);

  try {
    const response = await callHandler(clientConfigHandler);
    expect(response.status).toBe(500);
    expect(response.payload).toMatchObject({
      ok: false,
    });
    expect(response.payload.reason).toContain("SUPABASE_URL");
  } finally {
    restoreEnv(env);
  }
});

test("client-config exposes only browser-safe config when configured", async () => {
  const env = snapshotEnv(supabaseEnvKeys);
  clearEnv(supabaseEnvKeys);
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-test-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";

  try {
    const response = await callHandler(clientConfigHandler);
    expect(response.status).toBe(200);
    expect(response.payload).toMatchObject({
      ok: true,
      url: "https://example.supabase.co",
      anonKey: "anon-test-key",
      hasServiceRoleKey: true,
    });
    expect(JSON.stringify(response.payload)).not.toContain("service-role-test-key");
  } finally {
    restoreEnv(env);
  }
});

test("app-state rejects unauthenticated requests before touching Supabase storage", async () => {
  const env = snapshotEnv(supabaseEnvKeys);
  clearEnv(supabaseEnvKeys);

  try {
    const response = await callHandler(appStateHandler, {
      method: "GET",
      url: "/api/app-state",
      headers: {},
    });
    expect(response.status).toBe(401);
    expect(response.payload).toMatchObject({
      ok: false,
    });
    expect(response.payload.reason).toContain("signed in");
  } finally {
    restoreEnv(env);
  }
});

test("app-state backup rejects requests without admin auth or cron secret", async () => {
  const env = snapshotEnv(supabaseEnvKeys);
  clearEnv(supabaseEnvKeys);

  try {
    const response = await callHandler(appStateBackupHandler, {
      method: "GET",
      url: "/api/app-state-backup",
      headers: {},
    });
    expect(response.status).toBe(401);
    expect(response.payload).toMatchObject({
      ok: false,
    });
    expect(response.payload.reason).toContain("Admin");
  } finally {
    restoreEnv(env);
  }
});

test("app-state backup accepts Vercel cron secret and writes a backup pointer", async () => {
  const env = snapshotEnv(supabaseEnvKeys);
  const originalFetch = global.fetch;
  clearEnv(supabaseEnvKeys);
  process.env.CRON_SECRET = "cron-test-secret";
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";

  const writes = [];
  global.fetch = async (url, options = {}) => {
    const requestUrl = String(url);
    if (requestUrl.endsWith("/storage/v1/bucket/footballscience-app-state")) {
      return new Response(JSON.stringify({ id: "footballscience-app-state" }), { status: 200 });
    }

    if (requestUrl.includes("/storage/v1/object/footballscience-app-state/global/football-schedule-v1.json")) {
      return new Response(
        JSON.stringify({
          key: "football-schedule-v1",
          value: JSON.stringify({ events: [{ title: "QA backup fixture" }] }),
          updatedAt: "2026-05-07T00:00:00.000Z",
        }),
        { status: 200 }
      );
    }

    if (requestUrl.includes("/storage/v1/object/footballscience-app-state/global/")) {
      return new Response("{}", { status: 404 });
    }

    if (requestUrl.includes("/storage/v1/object/footballscience-app-state/backups/app-state/")) {
      writes.push({
        url: requestUrl,
        method: options.method,
        body: String(options.body || ""),
      });
      return new Response(JSON.stringify({ Key: "backup" }), { status: 200 });
    }

    return new Response(JSON.stringify({ message: `Unexpected request: ${requestUrl}` }), { status: 500 });
  };

  try {
    const response = await callHandler(appStateBackupHandler, {
      method: "GET",
      url: "/api/app-state-backup",
      headers: {
        authorization: "Bearer cron-test-secret",
      },
    });
    expect(response.status).toBe(200);
    expect(response.payload).toMatchObject({
      ok: true,
      entryCount: 1,
    });
    expect(response.payload.path).toContain("backups/app-state/");
    expect(writes.some((write) => write.url.endsWith("/backups/app-state/latest.json"))).toBe(true);
    expect(writes.some((write) => write.body.includes("QA backup fixture"))).toBe(true);
    expect(JSON.stringify(writes)).not.toContain("service-role-test-key");
  } finally {
    global.fetch = originalFetch;
    restoreEnv(env);
  }
});
