import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { createVideoAnalysisNativeDatabase, videoAnalysisTestRest } from "./helpers/video-analysis-native-database.mjs";

const { handleVideoAnalysisRequest } = createRequire(import.meta.url)("../api/_lib/video-analysis-database.js");
const actor = { id: "test-coach", clubId: "test-club", teamId: "test-team" };
const matchId = "10000000-0000-4000-8000-000000000001";
const videoId = "10000000-0000-4000-8000-000000000002";
const clipId = "10000000-0000-4000-8000-000000000003";
const relations = ["players", "tags", "labels", "descriptors", "notes"];

async function request(body, method = "POST", user = actor) {
  const req = { method, url: "/api/video-analysis", async *[Symbol.asyncIterator]() { yield JSON.stringify(body); } };
  const result = {};
  const res = { setHeader() {}, end(value) { result.status = this.statusCode; result.body = JSON.parse(value); } };
  await handleVideoAnalysisRequest(req, res, user);
  return result;
}

test("original clip edits are atomic, archived and tenant-scoped", async t => {
  const db = createVideoAnalysisNativeDatabase();
  const previousFetch = global.fetch;
  const oldUrl = process.env.SUPABASE_URL, oldKey = process.env.SUPABASE_SECRET_KEY;
  const calls = [];
  process.env.SUPABASE_URL = "https://fs-clip-test.invalid";
  process.env.SUPABASE_SECRET_KEY = "synthetic-test-key";
  const rest = videoAnalysisTestRest(db, calls);
  global.fetch = rest;
  const active = table => JSON.parse(db.sql(`select coalesce(jsonb_agg(r order by id), '[]') from video_clip_${table} r where clip_instance_id='${clipId}' and archived_at is null`));
  const snapshot = () => db.sql(`select jsonb_build_object(
    'clip', (select to_jsonb(c) from video_clip_instances c where id='${clipId}'),
    ${[...relations, "revisions"].map(table => `'${table}', (select coalesce(jsonb_agg(r order by id), '[]') from video_clip_${table} r where clip_instance_id='${clipId}')`).join(",")})`);
  const revision = () => Number(db.sql(`select revision from video_clip_instances where id='${clipId}'`));
  const payload = changes => ({ id: clipId, matchId, videoId, expectedRevision: revision(), startMs: 58000, endMs: 73000,
    phase: "In Possession", subPhase: "Build Up", outcome: "Neutral", note: "Edited note", tags: ["new"],
    miniGamePrincipleId: "trigger", labels: [{ type: "mini_game_principle", value: "second-principle", label: "Second principle" }],
    descriptors: [{ type: "unit", value: "Back Line", label: "Back Line" }], ...changes });
  try {
    db.sql(`insert into video_matches (id, organization_id, team_id, title) values ('${matchId}', 'test-club', 'test-team', 'Synthetic match');
      insert into video_videos (id, organization_id, team_id, match_id, title, local_video_identifier)
        values ('${videoId}', 'test-club', 'test-team', '${matchId}', 'Synthetic video', 'synthetic-video');
      insert into video_clip_instances (id, organization_id, team_id, match_id, video_id, start_ms, end_ms, phase, sub_phase, created_by)
        values ('${clipId}', 'test-club', 'test-team', '${matchId}', '${videoId}', 57076, 72076, 'In Possession', 'In Possession', 'test-coach');
      insert into video_clip_players (organization_id, team_id, clip_instance_id, player_id) values ('test-club', 'test-team', '${clipId}', 'old-player');
      insert into video_clip_tags (organization_id, team_id, clip_instance_id, tag) values ('test-club', 'test-team', '${clipId}', 'old');
      insert into video_clip_labels (organization_id, team_id, clip_instance_id, label_type, label_value)
        values ('test-club', 'test-team', '${clipId}', 'mini_game_principle', 'old-principle');
      insert into video_clip_descriptors (organization_id, team_id, clip_instance_id, descriptor_type, descriptor_value)
        values ('test-club', 'test-team', '${clipId}', 'unit', 'Old unit');
      insert into video_clip_notes (organization_id, team_id, clip_instance_id, note)
        values ('test-club', 'test-team', '${clipId}', 'Original note');`);

    await t.test("save changes all metadata once, archives old relations and records a complete revision", async () => {
      const result = await request({ action: "save-clip", clip: payload() });
      assert.equal(result.status, 200, JSON.stringify(result.body));
      assert.equal(result.body.clip.start_ms, 58000);
      assert.equal(result.body.clip.revision, 2);
      assert.equal(result.body.clip.match_title, "Synthetic match");
      assert.deepEqual(result.body.clip.tags, ["new"]);
      assert.equal(result.body.clip.notes[0].note, "Edited note");
      assert.equal(result.body.clip.players.length, 0);
      assert.ok(result.body.clip.labels.some(label => label.label_value === "trigger"));
      assert.ok(result.body.clip.labels.some(label => label.label_value === "second-principle"));
      assert.equal(result.body.clip.labels.some(label => label.label_value === "old-principle"), false);
      for (const table of relations) assert.equal(Number(db.sql(`select count(*) from video_clip_${table} where clip_instance_id='${clipId}' and archived_at is not null`)), 1);
      const history = JSON.parse(db.sql(`select to_jsonb(r) from video_clip_revisions r where clip_instance_id='${clipId}'`));
      assert.equal(history.before_record.notes[0].note, "Original note");
      assert.equal(history.after_record.notes[0].note, "Edited note");
      assert.equal(calls.some(call => call.method === "DELETE"), false);
      assert.equal(calls.some(call => call.method === "PATCH" && call.table === '"video_clip_instances"'), false);
    });

    await t.test("a late relation error rolls back timing, revision, archival and audit; the same draft retries", async () => {
      db.sql(`create function public.test_reject_note() returns trigger language plpgsql as $$begin
        if new.note='reject-save' then raise exception 'Forced late note failure'; end if; return new; end$$;
        create trigger test_reject_note before insert on video_clip_notes for each row execute function public.test_reject_note();`);
      const before = snapshot(), originalRevision = revision();
      const draft = payload({ note: "reject-save", startMs: 60000 });
      const failed = await request({ action: "save-clip", clip: draft });
      assert.equal(failed.status, 400);
      assert.match(failed.body.reason, /Forced late note failure/);
      assert.equal(snapshot(), before);
      db.sql("drop trigger test_reject_note on video_clip_notes; drop function public.test_reject_note();");
      const retried = await request({ action: "save-clip", clip: draft });
      assert.equal(retried.status, 200);
      assert.equal(revision(), originalRevision + 1);
    });

    await t.test("stale and simultaneous edits cannot overwrite the winning revision", async () => {
      const before = snapshot();
      assert.equal((await request({ action: "save-clip", clip: payload({ expectedRevision: 1 }) })).status, 409);
      assert.equal(snapshot(), before);
      const draft = payload();
      const results = await Promise.all([request({ action: "save-clip", clip: { ...draft, note: "First" } }), request({ action: "save-clip", clip: { ...draft, note: "Second" } })]);
      assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
      assert.equal(revision(), draft.expectedRevision + 1);
      assert.equal(active("notes").length, 1);
    });

    await t.test("removing and re-adding relations leaves no duplicate active rows or stale analysis facts", async () => {
      let result = await request({ action: "save-clip", clip: payload({ tags: [], miniGamePrincipleId: null, labels: [], descriptors: [], note: "" }) });
      assert.equal(result.status, 200);
      assert.equal(active("tags").length, 0);
      assert.equal(active("notes").length, 0);
      const facts = JSON.parse(db.sql(`select to_jsonb(f) from video_clip_analysis_facts f where id='${clipId}'`));
      for (const field of ["tags", "notes", "mini_game_principles", "players", "units"]) assert.deepEqual(facts[field], []);
      result = await request({ action: "save-clip", clip: payload({ tags: ["old", "old"], miniGamePrincipleId: "old-principle", labels: [] }) });
      assert.equal(result.status, 200);
      assert.deepEqual(result.body.clip.tags, ["old"]);
      assert.equal(active("labels").filter(row => row.label_value === "old-principle").length, 1);
      const listed = await request({}, "GET");
      assert.equal(listed.status, 200, JSON.stringify(listed.body));
      assert.equal(listed.body.clips[0].notes.length, 1);
      assert.deepEqual(listed.body.clips[0].tags, ["old"]);
    });

    await t.test("foreign coding references and corrupted child scope roll back the entire edit", async () => {
      const templateId = "10000000-0000-4000-8000-000000000088";
      db.sql(`insert into video_coding_templates (id, organization_id, team_id, title)
        values ('${templateId}', 'test-club', 'other-team', 'Other team');`);
      let before = snapshot();
      assert.equal((await request({ action: "save-clip", clip: payload({ codingTemplateId: templateId }) })).status, 403);
      assert.equal(snapshot(), before);
      db.sql(`update video_clip_tags set team_id='other-team' where clip_instance_id='${clipId}' and tag='old'`);
      before = snapshot();
      assert.equal((await request({ action: "save-clip", clip: payload() })).status, 403);
      assert.equal(snapshot(), before);
      db.sql(`update video_clip_tags set team_id='test-team' where clip_instance_id='${clipId}' and tag='old'`);
    });

    await t.test("re-adding a player preserves sharing and a failed optional IDP sync does not fail Save", async () => {
      const result = await request({ action: "save-clip", clip: payload({
        players: [{ playerId: "old-player", playerLabel: "Synthetic player", role: "primary" }],
        metadata: { ownerId: "other-coach" },
      }) });
      assert.equal(result.status, 200, JSON.stringify(result.body));
      assert.equal(result.body.clip.created_by, actor.id);
      assert.equal(result.body.clip.metadata.ownerId, actor.id);
      assert.equal(result.body.clip.players.length, 1);
      assert.equal(result.body.clip.players[0].player_label, "Synthetic player");
      assert.equal(result.body.idpClipBank.failed, 1);
      assert.equal(active("players").length, 1);
    });

    await t.test("another tenant, private non-owner and source move are rejected without changes", async () => {
      const before = snapshot();
      assert.equal((await request({ action: "save-clip", clip: payload() }, "POST", { ...actor, teamId: "other-team" })).status, 404);
      assert.equal((await request({ action: "save-clip", clip: payload({ videoId: "10000000-0000-4000-8000-000000000099" }) })).status, 400);
      assert.equal(snapshot(), before);
      db.sql(`update video_clip_instances set metadata='{"visibility":"private","ownerId":"test-coach"}' where id='${clipId}'`);
      const privateBefore = snapshot();
      assert.equal((await request({ action: "save-clip", clip: payload() }, "POST", { ...actor, id: "other-coach" })).status, 403);
      const body = { ...calls.find(call => call.rpc)?.body, p_expected_revision: revision(), p_actor_id: "other-coach" };
      const direct = await rest("https://fs-clip-test.invalid/rest/v1/rpc/video_analysis_update_clip", { method: "POST", body: JSON.stringify(body) });
      assert.equal((await direct.json()).code, "42501");
      assert.equal(snapshot(), privateBefore);
    });

    await t.test("a missing RPC fails closed and optional collaboration failure does not undo a committed success", async () => {
      const before = snapshot();
      global.fetch = (url, options) => String(url).includes("/rpc/video_analysis_update_clip")
        ? Promise.resolve(Response.json({ code: "PGRST202", message: "Missing function" }, { status: 404 })) : rest(url, options);
      assert.equal((await request({ action: "save-clip", clip: payload() })).status, 503);
      assert.equal(snapshot(), before);
      global.fetch = (url, options) => String(url).includes("video_analysis_operations")
        ? Promise.reject(new Error("Synthetic audit outage")) : rest(url, options);
      const result = await request({ action: "save-clip", clip: payload() });
      assert.equal(result.status, 200);
      assert.equal(result.body.operationRecorded, false);
      assert.equal(active("notes")[0].note, "Edited note");
      global.fetch = rest;
    });

    await t.test("browser roles cannot call the write function or read archived relations", () => {
      for (const role of ["anon", "authenticated"]) {
        assert.equal(db.sql(`select has_function_privilege('${role}', 'public.video_analysis_update_clip(text,text,text,uuid,integer,jsonb,jsonb)', 'execute')`), "f");
        for (const table of relations) assert.equal(db.sql(`select has_table_privilege('${role}', 'public.video_clip_${table}', 'select')`), "f");
      }
      for (const table of ["instances", ...relations]) assert.throws(() => db.sql(`delete from video_clip_${table} where ${table === "instances" ? "id" : "clip_instance_id"}='${clipId}'`), /must be archived, not hard-deleted/);
    });

    await t.test("archive and Undo retain the latest note and all relation history", async () => {
      const count = db.sql(`select count(*) from video_clip_notes where clip_instance_id='${clipId}'`);
      assert.equal((await request({ action: "archive-clip", id: clipId }, "PATCH")).status, 200);
      assert.equal((await request({ action: "restore-clips", ids: [clipId] }, "PATCH")).status, 200);
      assert.equal(db.sql(`select status from video_clip_instances where id='${clipId}'`), "active");
      assert.equal(db.sql(`select count(*) from video_clip_notes where clip_instance_id='${clipId}'`), count);
      assert.equal(active("notes")[0].note, "Edited note");
    });

    await t.test("replaying the additive migration preserves all saved data and history", () => {
      const before = snapshot();
      db.sql(readFileSync(new URL("../supabase/migrations/20261111232205_video_analysis_atomic_clip_update.sql", import.meta.url), "utf8"));
      assert.equal(snapshot(), before);
    });

    await t.test("new live tags still use the existing create path and return active metadata", async () => {
      const rpcCount = calls.filter(call => call.rpc).length;
      const original = snapshot();
      const result = await request({ action: "save-clip", clip: payload({ id: undefined, expectedRevision: undefined, note: "New tag" }) });
      assert.equal(result.status, 200, JSON.stringify(result.body));
      assert.notEqual(result.body.clip.id, clipId);
      assert.equal(result.body.clip.revision, 1);
      assert.equal(result.body.clip.notes[0].note, "New tag");
      assert.deepEqual(result.body.clip.tags, ["new"]);
      assert.equal(calls.filter(call => call.rpc).length, rpcCount);
      assert.equal(snapshot(), original);
    });
  } finally {
    global.fetch = previousFetch;
    if (oldUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_SECRET_KEY; else process.env.SUPABASE_SECRET_KEY = oldKey;
    db.close();
  }
});
