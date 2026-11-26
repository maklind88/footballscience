import { expect, test } from "@playwright/test";
import { generateKeyPairSync } from "node:crypto";
import { createRequire } from "node:module";
import { verifySessionsOfflineGrant } from "../src/core/sessions-offline-access/grant.mjs";

const require = createRequire(import.meta.url);
const root = "https://synthetic-sessions-offline.invalid";
const user = "11111111-1111-4111-8111-111111111111";
const org = "22222222-2222-4222-8222-222222222222";
const club = "33333333-3333-4333-8333-333333333333";
const team = "44444444-4444-4444-8444-444444444444";
const date = "2026-11-25";
const actorOwner = JSON.stringify([user, org, club, team, "coach"]);
const keysFor = (publicKey) => ({ qa: publicKey.export({ type: "spki", format: "der" }).toString("base64") });

function response() {
  return {
    statusCode: 200, headers: {}, body: "",
    setHeader(key, value) { this.headers[key] = value; },
    end(value) { this.body += value || ""; },
  };
}

test("Sessions offline app-state preparation authenticates current membership and reads policy only", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const keys = keysFor(publicKey);
  const env = {
    SUPABASE_URL: root, SUPABASE_ANON_KEY: "synthetic-anon", SUPABASE_SERVICE_ROLE_KEY: "synthetic-service",
    APP_STATE_DATABASE_MODE: "database",
    FS_SESSIONS_OFFLINE_PRIVATE_KEY: privateKey.export({ type: "pkcs8", format: "pem" }),
    FS_SESSIONS_OFFLINE_PUBLIC_KEYS: JSON.stringify(keys), FS_SESSIONS_OFFLINE_ORIGIN: root,
  };
  const originalEnv = Object.fromEntries(Object.keys(env).map(k => [k, process.env[k]]));
  const originalFetch = globalThis.fetch;
  const calls = [];
  let policyPresent = true;
  let teamStatus = "active";
  let unexpectedRequest = false;
  const tokenClaims = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 1200 })).toString("base64url");
  const token = ["qa", tokenClaims, "synthetic"].join(".");
  const handler = require("../api/app-state.js");
  const request = (owner = actorOwner, selectedDate = date) => ({
    method: "GET", url: "/api/app-state", headers: { authorization: "Bearer " + token },
    query: { owner, date: selectedDate, sessionOfflineGrant: "1" },
  });
  try {
    Object.assign(process.env, env);
    globalThis.fetch = async (input, options = {}) => {
      const url = new URL(input);
      const method = options.method || "GET";
      calls.push({ path: url.pathname, method });
      if (url.origin !== root || method !== "GET") {
        unexpectedRequest = true;
        throw new Error("Unexpected request");
      }
      let payload;
      if (url.pathname.startsWith("/auth/v1/")) {
        payload = { id: user, app_metadata: { role: "coach", status: "active" },
          user_metadata: { role: "admin", profileImageUrl: "data:image/png;base64,AAAA" } };
      } else if (url.pathname.endsWith("/platform_memberships")) {
        payload = [{ id: "55555555-5555-4555-8555-555555555555", user_id: user,
          organization_id: org, club_id: club, team_id: team, role: "coach", status: "active",
          scope: "team", accepted_at: "2026-01-01" }];
      } else if (url.pathname.endsWith("/platform_user_profiles")) {
        payload = [{ user_id: user, primary_organization_id: org, primary_club_id: club,
          primary_team_id: team, status: "active" }];
      } else if (url.pathname.endsWith("/platform_module_migration_checkpoints")) {
        payload = [];
      } else if (url.pathname.endsWith("/platform_organizations")) {
        payload = [{ id: org, status: "active" }];
      } else if (url.pathname.endsWith("/platform_clubs")) {
        payload = [{ id: club, organization_id: org, status: "active" }];
      } else if (url.pathname.endsWith("/platform_teams")) {
        payload = [{ id: team, organization_id: org, club_id: club, status: teamStatus }];
      } else if (url.pathname.endsWith("/platform_app_state_records") &&
          url.searchParams.get("state_key") === "eq.football-workspace-hub-v3") {
        const access = { view: ["coach", "admin"], edit: ["admin"] };
        payload = policyPresent ? [{ state_key: "football-workspace-hub-v3", organization_id: "global", revision: 1,
          value: JSON.stringify({ workspaceAccess: { "session-planner": access } }) }] : [];
      } else {
        unexpectedRequest = true;
        throw new Error("Unexpected data path");
      }
      return Response.json(payload);
    };
    const allowed = response();
    await handler(request(), allowed);
    expect(allowed.statusCode, allowed.body).toBe(200);
    expect(allowed.headers["Cache-Control"]).toBe("no-store");
    const { grant } = JSON.parse(allowed.body);
    const permission = await verifySessionsOfflineGrant(grant, keys, { origin: root });
    expect(permission).toMatchObject({ date, owner: actorOwner, action: "read-local-session-date" });
    expect(permission.expiresAt).toBe(JSON.parse(Buffer.from(tokenClaims, "base64url")).exp * 1000);

    const spoofedRole = response();
    await handler(request(actorOwner.replace("coach", "admin")), spoofedRole);
    expect(spoofedRole.statusCode, spoofedRole.body).toBe(403);
    const wrongTeam = response();
    await handler(request(actorOwner.replace(team, "synthetic-other-team")), wrongTeam);
    expect(wrongTeam.statusCode, wrongTeam.body).toBe(403);
    const wrongDate = response();
    await handler(request(actorOwner, "2026-02-30"), wrongDate);
    expect(wrongDate.statusCode, wrongDate.body).toBe(400);

    policyPresent = false;
    const denied = response();
    await handler(request(), denied);
    expect(denied.statusCode, denied.body).toBe(403);
    expect(JSON.parse(denied.body)).not.toHaveProperty("grant");

    policyPresent = true;
    teamStatus = "paused";
    const paused = response();
    await handler(request(), paused);
    expect(paused.statusCode, paused.body).toBe(403);

    expect(unexpectedRequest).toBe(false);
    expect(calls.some(call => call.path.endsWith("/platform_memberships"))).toBe(true);
    expect(calls.every(call => call.method === "GET")).toBe(true);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
