import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const handler = require("../api/app-state.js");
const { rateLimitBuckets } = require("../api/_lib/platform-security.js");
const key = "football-medical-team-v1";
const value = JSON.stringify({ players: [], records: [{ id: "synthetic", playerId: "synthetic", date: "2026-10-09", comment: "Private synthetic note" }], injuryPlans: [] });
const envKeys = ["APP_STATE_DATABASE_MODE", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY", "SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY"];

test.describe.configure({ mode: "serial" });
for (const role of ["admin", "medical", "performance", "coach", "guest"]) {
  for (const present of [true, false]) {
    test(`Medical recovery read evidence follows actual server role ${role} and presence ${present}`, async () => {
      const originalFetch = global.fetch, previous = Object.fromEntries(envKeys.map(k => [k, process.env[k]]));
      envKeys.forEach(k => delete process.env[k]);
      Object.assign(process.env, { APP_STATE_DATABASE_MODE: "database", SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "synthetic-key", SUPABASE_ANON_KEY: "synthetic-anon" });
      rateLimitBuckets.clear(); const writes = [];
      global.fetch = async (url, options = {}) => {
        const u = new URL(url), method = options.method || "GET";
        if (method !== "GET") writes.push(u.pathname);
        if (u.pathname === "/auth/v1/user") return Response.json({ id: `recovery-${role}-${present}`, app_metadata: { role, status: "active" } });
        if (u.pathname === "/rest/v1/platform_app_state_records") return Response.json(present ? [{ organization_id: "global", state_key: key, revision: 12, value, removed: false }] : []);
        if (u.pathname === "/storage/v1/bucket/footballscience-app-state") return Response.json({ id: "footballscience-app-state" });
        if (u.pathname.startsWith("/storage/v1/object/")) return new Response("{}", { status: 404 });
        throw new Error(`Unexpected synthetic request ${u.pathname}`);
      };
      try {
        const res = { statusCode: 200, setHeader() {}, end(body) { this.body = JSON.parse(body); } };
        await handler({ method: "GET", url: `/api/app-state?fresh=1&keys=${key}`, headers: { authorization: `Bearer synthetic-${role}-${present}` } }, res);
        expect(res.statusCode).toBe(200);
        expect(res.body.medicalRecoveryRead).toEqual({ private: present && ["admin", "medical", "performance"].includes(role) });
        if (res.body.medicalRecoveryRead.private) {
          expect(res.body.entries[key]).toBe(value); expect(res.body.metadata[key].revision).toBe(12);
        }
        expect(writes).toEqual([]);
      } finally {
        global.fetch = originalFetch;
        envKeys.forEach(k => previous[k] === undefined ? delete process.env[k] : process.env[k] = previous[k]);
      }
    });
  }
}
