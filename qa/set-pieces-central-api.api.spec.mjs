import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { createSetPiecePlay, normalizeSetPiecesState } from "../src/modules/set-pieces-room/state.mjs";
import { createSetPiecePlayChanges } from "../src/modules/set-pieces-room/set-pieces-save-protocol.mjs";

const require = createRequire(import.meta.url);
const handler = require("../api/app-state.js");
const key = "football-set-pieces-room-v1";
const envKeys = ["APP_STATE_DATABASE_MODE", "SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"];
let previousFetch, previousEnv, record;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const hash = (value) => createHash("sha256").update(value).digest("hex");
const row = () => ({ organization_id: "global", state_key: key, module_id: "set-pieces-room",
  merge_policy: "field-timestamp-merge", revision: record.revision, value: record.value,
  removed: false, updated_by: record.actor, updated_at: "2026-10-02T12:00:00Z", value_hash: hash(record.value), metadata: {} });

test.beforeEach(() => {
  previousFetch = global.fetch;
  previousEnv = Object.fromEntries(envKeys.map((name) => [name, process.env[name]]));
  Object.assign(process.env, { APP_STATE_DATABASE_MODE: "database", SUPABASE_URL: "https://set-pieces-test.supabase.co",
    SUPABASE_ANON_KEY: "test-only", SUPABASE_SERVICE_ROLE_KEY: "test-only" });
  record = { revision: 1, actor: "coach-a", value: JSON.stringify(normalizeSetPiecesState({
    plays: [createSetPiecePlay({ id: "corner-api", title: "Corner" })], activePlayId: "corner-api",
  })) };
  global.fetch = async (url, options = {}) => {
    const parsed = new URL(url), method = options.method || "GET";
    if (parsed.pathname.includes("/auth/v1/")) {
      const actor = String(options.headers?.Authorization || options.headers?.authorization || "").includes("coach-b") ? "coach-b" : "coach-a";
      return json({ id: actor, email: `${actor}@example.com`, app_metadata: { role: "coach", status: "active" } });
    }
    if (parsed.pathname === "/rest/v1/platform_app_state_records") {
      const filter = parsed.searchParams.get("state_key");
      return json(!filter || filter.includes(key) ? [row()] : []);
    }
    if (parsed.pathname === "/rest/v1/rpc/write_platform_app_state_record") {
      const body = JSON.parse(options.body);
      if (body.p_expected_revision !== record.revision) return json([{ ...row(), applied: false }]);
      record = { value: body.p_value, revision: record.revision + 1, actor: body.p_updated_by };
      return json([{ ...row(), applied: true }]);
    }
    if (parsed.pathname.includes("/storage/v1/bucket/")) return json({ id: "footballscience-app-state" });
    if (parsed.pathname.includes("/storage/v1/object/")) return json(method === "GET" ? {} : { ok: true }, method === "GET" ? 404 : 200);
    return json({ message: `Unexpected synthetic request: ${parsed.pathname}` }, 500);
  };
});

test.afterEach(() => {
  global.fetch = previousFetch;
  for (const [name, value] of Object.entries(previousEnv)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

async function save(change, actor = "coach-a", baseRevision = 1) {
  let body = "";
  const response = { statusCode: 200, setHeader() {}, end(value = "") { body += value; } };
  const request = { method: "POST", url: "/api/app-state", headers: { authorization: `Bearer ${actor}` },
    async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify({ key, baseRevision, setPieceChange: change })); } };
  await handler(request, response);
  return { status: response.statusCode, payload: JSON.parse(body) };
}

test("two coaches merge independent edits through the real Set Pieces API handler", async () => {
  const baseline = JSON.parse(record.value);
  const first = structuredClone(baseline), second = structuredClone(baseline);
  first.plays[0].title = "Near-post corner";
  second.plays[0].objective = "Win the second ball";
  const a = createSetPiecePlayChanges(baseline, first, () => "api-a")[0];
  const b = createSetPiecePlayChanges(baseline, second, () => "api-b")[0];
  expect((await save(a)).status).toBe(200);
  const result = await save(b, "coach-b");
  expect(result.status).toBe(200);
  expect(result.payload.setPieceChange).toMatchObject({ id: "api-b", playId: "corner-api",
    value: { title: "Near-post corner", objective: "Win the second ball" } });
  expect(JSON.parse(record.value).plays[0]).toMatchObject({ title: "Near-post corner", objective: "Win the second ball" });
});

test("the Set Pieces API rejects a same-field collision without replacing the team version", async () => {
  const baseline = JSON.parse(record.value);
  const first = structuredClone(baseline), second = structuredClone(baseline);
  first.plays[0].title = "First title";
  second.plays[0].title = "Conflicting title";
  await save(createSetPiecePlayChanges(baseline, first, () => "collision-a")[0]);
  const result = await save(createSetPiecePlayChanges(baseline, second, () => "collision-b")[0], "coach-b");
  expect(result.status).toBe(409);
  expect(result.payload.conflicts).toContain("play.corner-api.title");
  expect(JSON.parse(record.value).plays[0].title).toBe("First title");
});
