import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const permissionMatrix = require("../src/core/permission-matrix.cjs");
const rtp = require("../api/_lib/rtp-database.js");
const rtpLibrary = require("../api/_lib/rtp-library-database.js");

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

async function withoutSupabaseConfig(callback) {
  const keys = ["SUPABASE_URL", "SUPABASE_PROJECT_REF", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  keys.forEach((key) => {
    delete process.env[key];
  });
  try {
    return await callback();
  } finally {
    keys.forEach((key) => {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    });
  }
}

test("RTP Library registers as a separate permission contract", () => {
  const contract = permissionMatrix.getModulePermissionContract("rtp-library");

  expect(contract).toBeTruthy();
  expect(contract.routes).toContain("/api/rtp");
  expect(permissionMatrix.hasModulePermission({ role: "medical" }, "rtp-library", "read")).toBe(true);
  expect(permissionMatrix.hasModulePermission({ role: "performance" }, "rtp-library", "read")).toBe(true);
  expect(permissionMatrix.hasModulePermission({ role: "coach" }, "rtp-library", "read")).toBe(false);
  expect(permissionMatrix.hasModulePermission({ role: "medical" }, "rtp-library", "write")).toBe(true);
  expect(permissionMatrix.hasModulePermission({ role: "performance" }, "rtp-library", "write")).toBe(false);
});

test("RTP Library migration creates read-only profile and exercise tables", () => {
  const migration = fs.readFileSync(
    new URL("../supabase/migrations/20260627053116_rtp_library_database_api_foundation.sql", import.meta.url),
    "utf8"
  );

  expect(migration).toContain("create table if not exists public.rtp_library_profiles");
  expect(migration).toContain("create table if not exists public.rtp_library_exercises");
  expect(migration).toContain("create table if not exists public.rtp_library_profile_exercises");
  expect(migration).toContain("alter table public.rtp_library_profiles enable row level security");
  expect(migration).toContain("revoke all on public.rtp_library_profiles from anon, authenticated");
  expect(migration).toContain("app_private.can_read_rtp_library()");
  expect(migration).toContain("'rtp-library', 'read'");
  expect(migration).toContain("requires_organization_scope");
  expect(migration).toContain("requires_team_scope");
  expect(migration).toContain("description");
  expect(migration).not.toContain("audit_required");
  expect(migration).not.toContain("excluded.notes");
  expect(migration).not.toContain("create policy \"rtp library profiles are writable");
});

test("RTP Exercise Bank migration adds professional catalog media fields safely", () => {
  const migration = fs.readFileSync(
    new URL("../supabase/migrations/20260629143000_rtp_exercise_bank_professional_catalog.sql", import.meta.url),
    "utf8"
  );

  expect(migration).toContain("alter table public.rtp_library_exercises");
  expect(migration).toContain("add column if not exists body_regions");
  expect(migration).toContain("add column if not exists mechanism_tags");
  expect(migration).toContain("add column if not exists position_demands");
  expect(migration).toContain("add column if not exists program_builder jsonb");
  expect(migration).toContain("add column if not exists thumbnail_storage_path");
  expect(migration).toContain("add column if not exists primary_video_storage_path");
  expect(migration).toContain("create table if not exists public.rtp_library_exercise_media");
  expect(migration).toContain("alter table public.rtp_library_exercise_media enable row level security");
  expect(migration).toContain("app_private.can_read_rtp_library()");
  expect(migration).toContain("'simple'::regconfig");
  expect(migration).not.toContain("array_to_string(");
  expect(migration).toContain("footballscience-rtp-exercise-media");
  expect(migration).toContain("public, file_size_limit, allowed_mime_types");
  expect(migration).not.toContain("'rtp-library', 'media-read'");
  expect(migration).not.toContain("'rtp-library', 'media-write'");
  expect(migration).not.toContain("create policy \"rtp library exercise media is writable");
  expect(migration).not.toContain("drop table");
});

test("RTP Library API serves lightweight profile lists through /api/rtp", async () => {
  await withoutSupabaseConfig(async () => {
    const res = createJsonResponse();
    await rtp.handleRtpRequest(
      { method: "GET", url: "/api/rtp?view=library-profiles&search=hamstring&movement=sprint" },
      res,
      { id: "medical-1", role: "medical", organizationId: "org-1", teamId: "team-1" }
    );

    const payload = JSON.parse(res.body);
    expect(res.statusCode).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      schema: rtpLibrary.RTP_LIBRARY_SCHEMA,
      view: "library-profiles",
      source: "module-fallback",
      writesEnabled: false,
    });
    expect(payload.profiles.length).toBeGreaterThan(0);
    expect(payload.profiles.map((profile) => profile.id)).toContain("hamstring-strain");
    expect(payload.profiles[0]).not.toHaveProperty("goldStandardSections");
  });
});

test("RTP Library API serves selected profile detail with mapped exercises", async () => {
  await withoutSupabaseConfig(async () => {
    const res = createJsonResponse();
    await rtp.handleRtpRequest(
      { method: "GET", url: "/api/rtp?view=library-profile&profileId=hamstring-strain" },
      res,
      { id: "medical-1", role: "medical", organizationId: "org-1", teamId: "team-1" }
    );

    const payload = JSON.parse(res.body);
    expect(res.statusCode).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      schema: rtpLibrary.RTP_LIBRARY_SCHEMA,
      view: "library-profile",
      source: "module-fallback",
      writesEnabled: false,
      profile: {
        id: "hamstring-strain",
        name: "Hamstring Strain",
      },
    });
    expect(payload.profile.goldStandardSections.length).toBeGreaterThanOrEqual(27);
    expect(payload.exercises.length).toBeGreaterThanOrEqual(4);
    expect(payload.exerciseSummary.total).toBe(payload.exercises.length);
    expect(payload.exercises[0]).toHaveProperty("programBuilder");
    expect(payload.exercises[0]).toHaveProperty("thumbnail");
    expect(payload.exercises[0]).toHaveProperty("mediaSummary");
  });
});

test("RTP Library API serves a lightweight professional Exercise Bank catalog", async () => {
  await withoutSupabaseConfig(async () => {
    const res = createJsonResponse();
    await rtp.handleRtpRequest(
      { method: "GET", url: "/api/rtp?view=library-exercises&search=sprint&phase=full&limit=20" },
      res,
      { id: "medical-1", role: "medical", organizationId: "org-1", teamId: "team-1" }
    );

    const payload = JSON.parse(res.body);
    expect(res.statusCode).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      schema: rtpLibrary.RTP_LIBRARY_SCHEMA,
      view: "library-exercises",
      source: "module-fallback",
      writesEnabled: false,
    });
    expect(payload.exercises.length).toBeGreaterThan(0);
    expect(payload.exercises.length).toBeLessThanOrEqual(20);
    expect(payload.exercises[0]).toHaveProperty("programBuilder");
    expect(payload.exercises[0]).toHaveProperty("mediaSummary");
    expect(payload.exercises[0]).toHaveProperty("thumbnail");
    expect(payload.exercises[0]).not.toHaveProperty("medicalNotes");
    expect(payload.exercises[0].programBuilder.gateCriteria.length).toBeGreaterThan(0);
  });
});

test("RTP Library API serves selected exercise detail with professional builder fields", async () => {
  await withoutSupabaseConfig(async () => {
    const res = createJsonResponse();
    await rtp.handleRtpRequest(
      { method: "GET", url: "/api/rtp?view=library-exercise&exerciseId=nordic-hamstring-progression" },
      res,
      { id: "medical-1", role: "medical", organizationId: "org-1", teamId: "team-1" }
    );

    const payload = JSON.parse(res.body);
    expect(res.statusCode).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      schema: rtpLibrary.RTP_LIBRARY_SCHEMA,
      view: "library-exercise",
      source: "module-fallback",
      writesEnabled: false,
      exercise: {
        id: "nordic-hamstring-progression",
        mediaStatus: "placeholder",
      },
    });
    expect(payload.exercise.programBuilder.gateCriteria.length).toBeGreaterThanOrEqual(2);
    expect(payload.exercise.thumbnail.diagramKey).toBeTruthy();
    expect(payload.exercise.mediaSummary.hasDiagram).toBe(true);
  });
});

test("RTP Library API prefers database rows when the Library tables are populated", async () => {
  const previousFetch = global.fetch;
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SECRET_KEY;
  const requests = [];
  process.env.SUPABASE_URL = "https://rtp-library-test.supabase.co";
  process.env.SUPABASE_SECRET_KEY = "service-role-test";
  global.fetch = async (url) => {
    requests.push(String(url));
    return new Response(
      JSON.stringify([
        {
          id: "database-profile",
          status: "published",
          name: "Database Profile",
          system: "Muscle",
          body_area: "Posterior thigh",
          family: "muscle",
          evidence_level: "Moderate",
          summary: "Database summary",
          evidence_summary: "Database evidence",
          experience_summary: "Database consensus",
          symptoms: ["sprint pain"],
          positions: ["winger"],
          movement_planes: ["sprint"],
          risk_tags: ["sprint exposure gap"],
          season: ["in-season"],
          sex: ["all"],
          level: ["professional"],
          content: {},
          sort_order: 1,
        },
      ]),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  try {
    const payload = await rtpLibrary.buildRtpLibraryProfilesResponse(
      { id: "medical-1", role: "medical" },
      { search: "database" }
    );
    expect(payload).toMatchObject({
      ok: true,
      source: "database",
      total: 1,
      profiles: [
        {
          id: "database-profile",
          name: "Database Profile",
          bodyArea: "Posterior thigh",
        },
      ],
    });
    expect(requests[0]).toContain("/rest/v1/rtp_library_profiles");
    expect(decodeURIComponent(requests[0])).not.toContain("content");
  } finally {
    global.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = previousKey;
  }
});

test("RTP Library API blocks coach access to Medical knowledge layer", async () => {
  const res = createJsonResponse();
  await rtp.handleRtpRequest(
    { method: "GET", url: "/api/rtp?view=library-profiles" },
    res,
    { id: "coach-1", role: "coach", organizationId: "org-1", teamId: "team-1" }
  );

  const payload = JSON.parse(res.body);
  expect(res.statusCode).toBe(403);
  expect(payload).toMatchObject({
    ok: false,
    reason: "RTP Library is visible to Medical, Performance and platform administrators.",
  });
});
