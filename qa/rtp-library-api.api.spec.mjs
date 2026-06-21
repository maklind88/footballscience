import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const api = require("../api/_lib/rtp-library-database.js");

function createJsonResponse() {
  return {
    body: "",
    headers: {},
    statusCode: 0,
    end(value) {
      this.body = value;
    },
    setHeader(key, value) {
      this.headers[key] = value;
    },
  };
}

const medicalActor = {
  id: "medical-1",
  role: "medical",
  clubId: "club-ncc",
  teamId: "team-ncc-first",
};

test("rtp library status endpoint is inert and server-owned in phase 1", async () => {
  const res = createJsonResponse();
  await api.handleRtpLibraryRequest({ method: "GET", url: "/api/rtp-library?action=status" }, res, medicalActor);
  const payload = JSON.parse(res.body);

  expect(res.statusCode).toBe(200);
  expect(payload).toMatchObject({
    ok: true,
    schema: api.RTP_LIBRARY_SCHEMA,
    moduleId: "rtp-library",
    mode: "library-foundation",
    phase: "foundation",
    writesEnabled: false,
    ownsInjuryContent: true,
    ownsPlayerMedicalData: false,
    ownsPlayerPlans: false,
    medicalConnection: "contract-only",
    canRead: true,
    canWrite: true,
  });
  expect(payload.scope).toMatchObject({ organizationId: "club-ncc", teamId: "team-ncc-first" });
  expect(payload.emptyState).toMatchObject({ profiles: 0, exercises: 0, progressions: 0, criteriaSets: 0 });
});

test("rtp library exposes empty collection and profile payloads without database access", async () => {
  const collectionRes = createJsonResponse();
  await api.handleRtpLibraryRequest({ method: "GET", url: "/api/rtp-library?action=profiles" }, collectionRes, medicalActor);
  expect(collectionRes.statusCode).toBe(200);
  expect(JSON.parse(collectionRes.body)).toMatchObject({
    schema: api.RTP_LIBRARY_SCHEMA,
    collection: "profiles",
    items: [],
    count: 0,
  });

  const profileRes = createJsonResponse();
  await api.handleRtpLibraryRequest({ method: "GET", url: "/api/rtp-library?action=profile&id=template-1" }, profileRes, medicalActor);
  expect(profileRes.statusCode).toBe(200);
  expect(JSON.parse(profileRes.body)).toMatchObject({
    profile: null,
    sections: [],
    protocols: [],
    exercises: [],
    progressions: [],
    criteriaSets: [],
  });
});

test("rtp library write methods are explicitly disabled in phase 1", async () => {
  const res = createJsonResponse();
  await api.handleRtpLibraryRequest({ method: "POST", url: "/api/rtp-library" }, res, medicalActor);
  const payload = JSON.parse(res.body);

  expect(res.statusCode).toBe(501);
  expect(payload).toMatchObject({
    ok: false,
    schema: api.RTP_LIBRARY_SCHEMA,
    moduleId: "rtp-library",
    writesEnabled: false,
  });
  expect(payload.reason).toContain("not enabled");
});

test("rtp library role helpers match the approved ownership matrix", () => {
  expect(api.canReadRtpLibrary({ role: "coach" })).toBe(true);
  expect(api.canReadRtpLibrary({ role: "analyst" })).toBe(true);
  expect(api.canReadRtpLibrary({ role: "guest" })).toBe(false);
  expect(api.canWriteRtpLibrary({ role: "medical" })).toBe(true);
  expect(api.canWriteRtpLibrary({ role: "performance" })).toBe(true);
  expect(api.canWriteRtpLibrary({ role: "coach" })).toBe(false);
  expect(api.statusPayload({ role: "coach" }).coachSafeOnly).toBe(true);
});

test("rtp library API source has no direct database writes or private medical links", () => {
  const source = [
    fs.readFileSync(new URL("../api/rtp-library.js", import.meta.url), "utf8"),
    fs.readFileSync(new URL("../api/_lib/rtp-library-database.js", import.meta.url), "utf8"),
  ].join("\n");

  expect(source).toContain('route: "/api/rtp-library"');
  expect(source).toContain('moduleId: "rtp-library"');
  expect(source).toContain("guardApiRequest");
  expect(source).not.toMatch(/\b(selectRows|insertRow|patchRows|buildSupabaseKeyHeaders|readConfig|from\(["'`]|service_role|medical_cases|medical_availability|player_id|rtp_player_plan)\b/i);
});
