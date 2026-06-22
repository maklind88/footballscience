import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const permissionMatrix = require("../src/core/permission-matrix.cjs");
const rtp = require("../api/_lib/rtp-database.js");

function createJsonResponse() {
  return {
    body: "",
    headers: {},
    statusCode: 0,
    end(value) {
      this.body += value || "";
    },
    setHeader(key, value) {
      this.headers[key.toLowerCase()] = value;
    },
  };
}

test("rtp permission matrix registers guarded operating spine access", () => {
  const contract = permissionMatrix.getModulePermissionContract("rtp");

  expect(contract).toBeTruthy();
  expect(contract.routes).toContain("/api/rtp");
  expect(permissionMatrix.apiRouteSecurity["/api/rtp"]).toMatchObject({
    moduleId: "rtp",
    enforcePermission: true,
  });
  expect(permissionMatrix.hasModulePermission({ role: "coach" }, "rtp", "read")).toBe(true);
  expect(permissionMatrix.hasModulePermission({ role: "coach" }, "rtp", "write")).toBe(false);
  expect(permissionMatrix.hasModulePermission({ role: "performance" }, "rtp", "write")).toBe(true);
  expect(permissionMatrix.hasModulePermission({ role: "medical" }, "rtp", "write")).toBe(true);
  expect(permissionMatrix.hasModulePermission({ role: "guest" }, "rtp", "read")).toBe(false);
});

test("rtp api route is guarded and delegates to the operating spine handler", () => {
  const route = fs.readFileSync(new URL("../api/rtp.js", import.meta.url), "utf8");
  expect(route).toContain("getCurrentActor");
  expect(route).toContain("guardApiRequest");
  expect(route).toContain('route: "/api/rtp"');
  expect(route).toContain("handleRtpRequest");
  expect(route).toContain("You must be signed in.");
});

test("rtp empty state exposes no cases, no writes, and no coach medical confidence", async () => {
  const res = createJsonResponse();
  await rtp.handleRtpRequest(
    { method: "GET", url: "/api/rtp?playerId=player-1" },
    res,
    { id: "coach-1", role: "coach", organizationId: "org-1", teamId: "team-1" }
  );

  const payload = JSON.parse(res.body);
  expect(res.statusCode).toBe(200);
  expect(payload).toMatchObject({
    ok: true,
    schema: rtp.RTP_SCHEMA,
    moduleId: "rtp",
    writesEnabled: false,
    canRead: true,
    canWrite: false,
    playerId: "player-1",
    cases: [],
    activeCase: null,
    coachSafe: true,
  });
  expect(payload.medicalConfidenceLevels).toEqual([]);
  expect(payload.exclusions).toMatchObject({
    ui: true,
    aiDecisionEngine: true,
    matchdayIntegration: true,
    injuryProfileImport: true,
    medicalCaseIntegration: true,
    playerPlanAutomation: true,
    frontendSupabaseWrites: true,
  });
});

test("rtp Sprint 1 writes remain intentionally disabled", async () => {
  const res = createJsonResponse();
  await rtp.handleRtpRequest(
    { method: "POST", url: "/api/rtp" },
    res,
    { id: "medical-1", role: "medical", organizationId: "org-1", teamId: "team-1" }
  );

  expect(res.statusCode).toBe(501);
  expect(JSON.parse(res.body)).toMatchObject({
    ok: false,
    schema: rtp.RTP_SCHEMA,
    writesEnabled: false,
    reason: "RTP writes are intentionally disabled in Sprint 1.",
  });
});
