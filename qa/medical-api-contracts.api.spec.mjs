import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const medicalDatabase = require("../api/_lib/medical-database.js");
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectionMigrationPath = resolve(
  __dirname,
  "../supabase/migrations/20260825024500_medical_sync_event_projection.sql"
);
const planProjectionMigrationPath = resolve(
  __dirname,
  "../supabase/migrations/20260901103202_medical_plan_canonical_projection.sql"
);

test.describe.configure({ mode: "serial" });

function createResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: "",
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value;
    },
    end(chunk = "") {
      this.body += chunk;
    },
  };
}

function createJsonRequest(body) {
  return {
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(JSON.stringify(body));
    },
  };
}

function configureMedicalDatabaseTestEnv() {
  process.env.MEDICAL_STORAGE_MODE = "database";
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-test-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
}

function snapshotMedicalTestEnv() {
  return Object.fromEntries([
    "MEDICAL_STORAGE_MODE",
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  ].map((key) => [key, process.env[key]]));
}

function restoreMedicalTestEnv(snapshot) {
  Object.entries(snapshot).forEach(([key, value]) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  });
}

test("medical database adapter remains feature flagged", () => {
  const previousStorageMode = process.env.MEDICAL_STORAGE_MODE;
  const previousDatabaseMode = process.env.MEDICAL_DATABASE_MODE;
  const previousDualWriteMode = process.env.MEDICAL_DUAL_WRITE_MODE;
  delete process.env.MEDICAL_STORAGE_MODE;
  delete process.env.MEDICAL_DATABASE_MODE;
  delete process.env.MEDICAL_DUAL_WRITE_MODE;

  expect(medicalDatabase.isMedicalDatabaseEnabled()).toBe(false);

  process.env.MEDICAL_STORAGE_MODE = "dual-write";
  expect(medicalDatabase.isMedicalDatabaseEnabled()).toBe(true);

  process.env.MEDICAL_STORAGE_MODE = "legacy";
  expect(medicalDatabase.isMedicalDatabaseEnabled()).toBe(false);

  if (previousStorageMode === undefined) {
    delete process.env.MEDICAL_STORAGE_MODE;
  } else {
    process.env.MEDICAL_STORAGE_MODE = previousStorageMode;
  }
  if (previousDatabaseMode === undefined) {
    delete process.env.MEDICAL_DATABASE_MODE;
  } else {
    process.env.MEDICAL_DATABASE_MODE = previousDatabaseMode;
  }
  if (previousDualWriteMode === undefined) {
    delete process.env.MEDICAL_DUAL_WRITE_MODE;
  } else {
    process.env.MEDICAL_DUAL_WRITE_MODE = previousDualWriteMode;
  }
});

test("medical database writes stay medical-side only", () => {
  expect(medicalDatabase.canWriteMedicalDatabase({ role: "guest" })).toBe(false);
  expect(medicalDatabase.canWriteMedicalDatabase({ role: "coach" })).toBe(false);
  expect(medicalDatabase.canWriteMedicalDatabase({ role: "analyst" })).toBe(false);
  expect(medicalDatabase.canWriteMedicalDatabase({ role: "medical" })).toBe(true);
  expect(medicalDatabase.canWriteMedicalDatabase({ role: "performance" })).toBe(true);
  expect(medicalDatabase.canWriteMedicalDatabase({ role: "admin" })).toBe(true);
});

test("medical sync events normalize to an idempotent database row", () => {
  const first = medicalDatabase.normalizeSyncEventBody(
    {
      eventType: "recommendation-saved",
      playerId: "legacy-player-7",
      payload: {
        record: {
          id: "record-1",
          playerId: "legacy-player-7",
          participation: 50,
          comment: "Private medical note",
          coachNote: "Modified team only",
        },
      },
    },
    { id: "0f9a1865-0b2e-4a28-b933-87e137f7e3a4", role: "medical" }
  );
  const second = medicalDatabase.normalizeSyncEventBody(
    {
      eventType: "recommendation-saved",
      playerId: "legacy-player-7",
      payload: {
        record: {
          coachNote: "Modified team only",
          comment: "Private medical note",
          id: "record-1",
          participation: 50,
          playerId: "legacy-player-7",
        },
      },
    },
    { id: "0f9a1865-0b2e-4a28-b933-87e137f7e3a4", role: "medical" }
  );

  expect(first.ok).toBe(true);
  expect(first.row.event_type).toBe("recommendation-saved");
  expect(first.row.legacy_player_id).toBe("legacy-player-7");
  expect(first.row.actor_id).toBe("0f9a1865-0b2e-4a28-b933-87e137f7e3a4");
  expect(first.row.payload_hash).toBe(second.row.payload_hash);
  expect(first.row.idempotency_key).toBe(second.row.idempotency_key);
});

test("projected medical events reject unsafe or incomplete canonical records", () => {
  const actor = { id: "0f9a1865-0b2e-4a28-b933-87e137f7e3a4", role: "medical" };
  const unsafe = medicalDatabase.normalizeSyncEventBody({
    eventType: "recommendation-saved",
    payload: {
      record: {
        id: "record-unsafe",
        playerId: "player-1",
        date: "2026-08-25",
        participation: 50,
        comment: "<script>alert(1)</script>",
      },
    },
  }, actor);
  const missingDate = medicalDatabase.normalizeSyncEventBody({
    eventType: "recommendation-saved",
    payload: { record: { id: "record-no-date", playerId: "player-1", participation: 50 } },
  }, actor);

  expect(medicalDatabase._private.validateProjectedMedicalEvent(unsafe.row)).toMatchObject({
    ok: false,
    status: 400,
  });
  expect(medicalDatabase._private.validateProjectedMedicalEvent(missingDate.row)).toMatchObject({
    ok: false,
    status: 400,
  });
});

test("medical recommendation POST confirms the canonical projection before returning saved", async () => {
  const envSnapshot = snapshotMedicalTestEnv();
  const originalFetch = global.fetch;
  const requests = [];
  configureMedicalDatabaseTestEnv();
  global.fetch = async (url, options = {}) => {
    const requestUrl = String(url);
    requests.push({ url: requestUrl, options });
    if (requestUrl.includes("/rest/v1/medical_state_sync_events?")) {
      const [row] = JSON.parse(String(options.body || "[]"));
      return new Response(JSON.stringify([{
        ...row,
        id: "6d7d9565-e90a-4f88-b58b-2a048f14bd8e",
        processing_status: "pending",
      }]), { status: 201 });
    }
    if (requestUrl.endsWith("/rest/v1/rpc/project_medical_state_sync_events")) {
      return new Response(JSON.stringify([{
        processed_count: 1,
        failed_count: 0,
        revision: 10450,
        canonical_stored: true,
      }]), { status: 200 });
    }
    return new Response("{}", { status: 500 });
  };

  try {
    const req = createJsonRequest({
      eventType: "recommendation-saved",
      playerId: "player-1",
      payload: {
        record: {
          id: "record-1",
          playerId: "player-1",
          date: "2026-08-25",
          participation: 50,
          createdAt: "2026-08-25T02:00:00.000Z",
          updatedAt: "2026-08-25T02:00:00.000Z",
        },
      },
    });
    const res = createResponse();
    await medicalDatabase._private.handleMedicalPost(req, res, {
      id: "0f9a1865-0b2e-4a28-b933-87e137f7e3a4",
      role: "medical",
    });
    const payload = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      stored: true,
      canonicalStored: true,
      processingStatus: "processed",
      revision: 10450,
    });
    const rpcRequest = requests.find((request) => request.url.endsWith("/rest/v1/rpc/project_medical_state_sync_events"));
    expect(JSON.parse(rpcRequest.options.body)).toEqual({
      p_event_ids: ["6d7d9565-e90a-4f88-b58b-2a048f14bd8e"],
    });
  } finally {
    global.fetch = originalFetch;
    restoreMedicalTestEnv(envSnapshot);
  }
});

test("medical recommendation POST fails closed when canonical projection is unavailable", async () => {
  const envSnapshot = snapshotMedicalTestEnv();
  const originalFetch = global.fetch;
  configureMedicalDatabaseTestEnv();
  global.fetch = async (url, options = {}) => {
    const requestUrl = String(url);
    if (requestUrl.includes("/rest/v1/medical_state_sync_events?")) {
      const [row] = JSON.parse(String(options.body || "[]"));
      return new Response(JSON.stringify([{
        ...row,
        id: "9c61d0ac-d024-47ab-89be-b6e9ddc25286",
        processing_status: "pending",
      }]), { status: 201 });
    }
    if (requestUrl.endsWith("/rest/v1/rpc/project_medical_state_sync_events")) {
      return new Response(JSON.stringify({ message: "projection unavailable" }), { status: 503 });
    }
    return new Response("{}", { status: 500 });
  };

  try {
    const req = createJsonRequest({
      eventType: "recommendation-saved",
      playerId: "player-1",
      payload: {
        record: {
          id: "record-2",
          playerId: "player-1",
          date: "2026-08-25",
          participation: 75,
        },
      },
    });
    const res = createResponse();
    await medicalDatabase._private.handleMedicalPost(req, res, {
      id: "0f9a1865-0b2e-4a28-b933-87e137f7e3a4",
      role: "medical",
    });
    const payload = JSON.parse(res.body);

    expect(res.statusCode).toBe(503);
    expect(payload).toMatchObject({
      ok: false,
      stored: true,
      canonicalStored: false,
      eventId: "9c61d0ac-d024-47ab-89be-b6e9ddc25286",
    });
  } finally {
    global.fetch = originalFetch;
    restoreMedicalTestEnv(envSnapshot);
  }
});

test("medical availability plan POST is projected into canonical Medical state", async () => {
  const envSnapshot = snapshotMedicalTestEnv();
  const originalFetch = global.fetch;
  const requests = [];
  configureMedicalDatabaseTestEnv();
  global.fetch = async (url, options = {}) => {
    const requestUrl = String(url);
    requests.push({ url: requestUrl, options });
    if (requestUrl.includes("/rest/v1/medical_state_sync_events?")) {
      const [row] = JSON.parse(String(options.body || "[]"));
      return new Response(JSON.stringify([{
        ...row,
        id: "4a19192d-c315-463f-a95d-4b8a12c20a21",
        processing_status: "pending",
      }]), { status: 201 });
    }
    if (requestUrl.endsWith("/rest/v1/rpc/project_medical_state_sync_events")) {
      return new Response(JSON.stringify([{
        processed_count: 1,
        failed_count: 0,
        revision: 11789,
        canonical_stored: true,
      }]), { status: 200 });
    }
    return new Response("{}", { status: 500 });
  };

  try {
    const req = createJsonRequest({
      eventType: "availability-plan-created",
      playerId: "player-1",
      payload: {
        plan: {
          id: "plan-1",
          playerId: "player-1",
          startDate: "2026-09-01",
          endDate: "2026-12-01",
          participation: 0,
          updatedAt: "2026-09-01T10:00:00.000Z",
        },
      },
    });
    const res = createResponse();
    await medicalDatabase._private.handleMedicalPost(req, res, {
      id: "0f9a1865-0b2e-4a28-b933-87e137f7e3a4",
      role: "medical",
    });
    const payload = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      stored: true,
      canonicalStored: true,
      processingStatus: "processed",
      revision: 11789,
    });
    expect(requests.some((request) => request.url.endsWith("/rest/v1/rpc/project_medical_state_sync_events"))).toBe(true);
  } finally {
    global.fetch = originalFetch;
    restoreMedicalTestEnv(envSnapshot);
  }
});

test("duplicate medical recommendation retries the same durable event projection", async () => {
  const envSnapshot = snapshotMedicalTestEnv();
  const originalFetch = global.fetch;
  const requests = [];
  configureMedicalDatabaseTestEnv();
  global.fetch = async (url, options = {}) => {
    const requestUrl = String(url);
    requests.push({ url: requestUrl, options });
    if (requestUrl.includes("/rest/v1/medical_state_sync_events?") && String(options.method || "GET") === "POST") {
      return new Response("[]", { status: 201 });
    }
    if (requestUrl.includes("/rest/v1/medical_state_sync_events?")) {
      const insertedBody = JSON.parse(String(requests[0].options.body || "[]"));
      return new Response(JSON.stringify([{
        id: "aa9771ce-9b6f-4d2f-9a86-f7fc8f6123d5",
        event_type: "recommendation-saved",
        processing_status: "pending",
        payload_hash: insertedBody[0].payload_hash,
        created_at: "2026-08-25T02:00:00.000Z",
      }]), { status: 200 });
    }
    if (requestUrl.endsWith("/rest/v1/rpc/project_medical_state_sync_events")) {
      return new Response(JSON.stringify([{
        processed_count: 1,
        failed_count: 0,
        revision: 10451,
        canonical_stored: true,
      }]), { status: 200 });
    }
    return new Response("{}", { status: 500 });
  };

  try {
    const req = createJsonRequest({
      eventType: "recommendation-saved",
      idempotencyKey: "recommendation-saved:record-duplicate",
      payload: {
        record: {
          id: "record-duplicate",
          playerId: "player-1",
          date: "2026-08-25",
          participation: 100,
        },
      },
    });
    const res = createResponse();
    await medicalDatabase._private.handleMedicalPost(req, res, {
      id: "0f9a1865-0b2e-4a28-b933-87e137f7e3a4",
      role: "medical",
    });
    const payload = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      stored: true,
      canonicalStored: true,
      duplicate: true,
      eventId: "aa9771ce-9b6f-4d2f-9a86-f7fc8f6123d5",
    });
    expect(requests.some((request) => request.url.includes("idempotency_key=eq."))).toBe(true);
  } finally {
    global.fetch = originalFetch;
    restoreMedicalTestEnv(envSnapshot);
  }
});

test("medical projection migration serializes canonical state and journal updates", () => {
  const migration = readFileSync(projectionMigrationPath, "utf8");
  expect(migration).toContain("for update;");
  expect(migration).toContain("project_medical_state_sync_events");
  expect(migration).toContain("working_state := event_state;");
  expect(migration).toContain("set processing_status = 'processed'");
  expect(migration).toContain("set revision = records.revision + 1");
  expect(migration).toContain("grant execute on function public.project_medical_state_sync_events(uuid[]) to service_role");
  expect(migration).toContain("revoke all on function public.project_medical_state_sync_events(uuid[]) from public, anon, authenticated");
});

test("medical plan projection migration restores canonical plans and only automatic roster archives", () => {
  const migration = readFileSync(planProjectionMigrationPath, "utf8");
  expect(migration).toContain("app_private.upsert_medical_compat_plan");
  expect(migration).toContain("'medical-board-updated'");
  expect(migration).toContain("'clearance-saved'");
  expect(migration).toContain("archiveReason' = 'Player removed from Squad Room'");
  expect(migration).toContain("row_number() over");
  expect(migration).toContain("Superseded by newer canonical Medical Plan data.");
  expect(migration).not.toContain("Erica Parkinson");
  expect(migration).not.toContain("Vilde Bøe Rise");
  expect(migration).not.toContain("Maycee Bell");
});

test("medical archive events are first-class sync events", () => {
  const recordArchive = medicalDatabase.normalizeSyncEventBody(
    {
      eventType: "record-archived",
      playerId: "legacy-player-7",
      payload: {
        recordId: "record-1",
        record: {
          id: "record-1",
          playerId: "legacy-player-7",
          archivedAt: "2026-05-20T12:00:00.000Z",
          archiveReason: "Manual archive from Medical Room",
        },
      },
    },
    { id: "0f9a1865-0b2e-4a28-b933-87e137f7e3a4", role: "medical" }
  );
  const planArchive = medicalDatabase.normalizeSyncEventBody(
    {
      eventType: "availability-plan-archived",
      playerId: "legacy-player-7",
      payload: {
        planId: "plan-1",
        plan: {
          id: "plan-1",
          playerId: "legacy-player-7",
          archivedAt: "2026-05-20T12:00:00.000Z",
          archiveReason: "Manual archive from Medical Room",
        },
      },
    },
    { id: "0f9a1865-0b2e-4a28-b933-87e137f7e3a4", role: "medical" }
  );

  expect(recordArchive.ok).toBe(true);
  expect(recordArchive.row.event_type).toBe("record-archived");
  expect(planArchive.ok).toBe(true);
  expect(planArchive.row.event_type).toBe("availability-plan-archived");
  expect(
    medicalDatabase.normalizeSyncEventBody(
      {
        eventType: "availability-plan-updated",
        playerId: "legacy-player-7",
        payload: { planId: "plan-1", plan: { id: "plan-1", playerId: "legacy-player-7", participation: 0 } },
      },
      { id: "0f9a1865-0b2e-4a28-b933-87e137f7e3a4", role: "medical" }
    ).row.event_type
  ).toBe("availability-plan-updated");
  expect(
    medicalDatabase.normalizeSyncEventBody(
      {
        eventType: "player-archived",
        playerId: "legacy-player-7",
        payload: { player: { id: "legacy-player-7", archivedAt: "2026-05-20T12:00:00.000Z" } },
      },
      { id: "0f9a1865-0b2e-4a28-b933-87e137f7e3a4", role: "medical" }
    ).row.event_type
  ).toBe("player-archived");
});

test("medical room archives clinical items instead of hard deleting them", () => {
  const appSource = readFileSync(resolve(__dirname, "../app-runtime.js"), "utf8");
  const writeServiceSource = readFileSync(resolve(__dirname, "../src/modules/medical/medical-runtime-write-service.mjs"), "utf8");
  const helpersSource = readFileSync(resolve(__dirname, "../src/modules/medical/medical-runtime-helpers.mjs"), "utf8");
  expect(appSource).toContain("createWorkspaceRuntimeComposition({");
  expect(writeServiceSource).toContain("archiveReason: \"Manual archive from Medical Room\"");
  expect(writeServiceSource).toContain("record-archived");
  expect(writeServiceSource).toContain("availability-plan-archived");
  expect(writeServiceSource).toContain("availability-plan-updated");
  expect(writeServiceSource).toContain("player-archived");
  expect(helpersSource).toContain("footballscience-medical-data-safety-v1");
  expect(writeServiceSource).not.toContain("medicalState.records = medicalState.records.filter((record) => record.id !== recordId)");
  expect(writeServiceSource).not.toContain("medicalState.injuryPlans = medicalState.injuryPlans.filter((plan) => plan.id !== planId)");
});

test("medical API route is auth protected and delegates to database handler", () => {
  const route = readFileSync(resolve(__dirname, "../api/medical.js"), "utf8");
  expect(route).toContain("getCurrentActor");
  expect(route).toContain("handleMedicalDatabaseRequest");
  expect(route).toContain("You must be signed in.");
});
