import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { createVideoAnalysisNativeDatabase, videoAnalysisTestRest } from "./helpers/video-analysis-native-database.mjs";

const require = createRequire(import.meta.url);
const { handleVideoAnalysisRequest } = require("../api/_lib/video-analysis-database.js");
const actor = { id: "test-coach", clubId: "test-club", teamId: "test-team" };
const matchId = "10000000-0000-4000-8000-000000000001";
const videoId = "10000000-0000-4000-8000-000000000002";
const clipId = "10000000-0000-4000-8000-000000000003";

async function request(body, method = "POST") {
  const req = { method, url: "/api/video-analysis", async *[Symbol.asyncIterator]() { yield JSON.stringify(body); } };
  const result = {};
  const res = { setHeader() {}, end(value) { result.status = this.statusCode; result.body = JSON.parse(value); } };
  await handleVideoAnalysisRequest(req, res, actor);
  return result;
}

// Diagnostic characterization, not proof that saving works. It intentionally proves the live defect.
test("FS clip persistence: current database-backed failure and archive behavior", async t => {
  const db = createVideoAnalysisNativeDatabase();
  const previousFetch = global.fetch;
  const oldUrl = process.env.SUPABASE_URL, oldKey = process.env.SUPABASE_SECRET_KEY;
  const calls = [];
  process.env.SUPABASE_URL = "https://fs-clip-test.invalid";
  process.env.SUPABASE_SECRET_KEY = "synthetic-test-key";
  global.fetch = videoAnalysisTestRest(db, calls);
  try {
    db.sql(`insert into video_matches (id, organization_id, team_id, title) values ('${matchId}', 'test-club', 'test-team', 'Synthetic Seattle');
      insert into video_videos (id, organization_id, team_id, match_id, title, local_video_identifier)
        values ('${videoId}', 'test-club', 'test-team', '${matchId}', 'Synthetic video', 'synthetic-video');
      insert into video_clip_instances (id, organization_id, team_id, match_id, video_id, start_ms, end_ms, phase, sub_phase, created_by)
        values ('${clipId}', 'test-club', 'test-team', '${matchId}', '${videoId}', 57076, 72076, 'In Possession', 'In Possession', 'test-coach');
      insert into video_clip_labels (organization_id, team_id, clip_instance_id, label_type, label_value)
        values ('test-club', 'test-team', '${clipId}', 'phase', 'In Possession');
      insert into video_clip_notes (organization_id, team_id, clip_instance_id, note)
        values ('test-club', 'test-team', '${clipId}', 'Original note');`);
    const payload = { id: clipId, matchId, videoId, expectedRevision: 1, startMs: 58000, endMs: 73000,
      phase: "In Possession", subPhase: "In Possession", outcome: "Neutral", note: "Testing" };
    await t.test("Save is blocked by the real hard-delete trigger", async () => {
      const result = await request({ action: "save-clip", clip: payload });
      assert.equal(result.status, 400);
      assert.match(result.body.reason, /must be archived, not hard-deleted/);
      assert.ok(calls.some(call => call.method === "DELETE" && call.table === '"video_clip_labels"'));
    });
    await t.test("failed save already changed timing/revision but did not save the note", () => {
      const clip = JSON.parse(db.sql(`select to_jsonb(c) from video_clip_instances c where id='${clipId}'`));
      assert.equal(clip.start_ms, 58000);
      assert.equal(clip.revision, 2);
      assert.equal(db.sql(`select note from video_clip_notes where clip_instance_id='${clipId}'`), "Original note");
    });
    await t.test("retry with the still-open draft hits a revision conflict", async () => {
      const result = await request({ action: "save-clip", clip: payload });
      assert.equal(result.status, 409);
      assert.match(result.body.reason, /revision conflict/i);
    });
    await t.test("confirmed Delete archives the clip and keeps its relations", async () => {
      const before = calls.length;
      const result = await request({ action: "archive-clip", id: clipId }, "PATCH");
      assert.equal(result.status, 200);
      assert.equal(db.sql(`select status from video_clip_instances where id='${clipId}'`), "archived");
      assert.equal(db.sql(`select count(*) from video_clip_labels where clip_instance_id='${clipId}'`), "1");
      assert.equal(calls.slice(before).some(call => call.method === "DELETE"), false);
    });
    await t.test("Undo restores the archived clip without deleting its note", async () => {
      const result = await request({ action: "restore-clips", ids: [clipId] }, "PATCH");
      assert.equal(result.status, 200);
      assert.equal(db.sql(`select status from video_clip_instances where id='${clipId}'`), "active");
      assert.equal(db.sql(`select note from video_clip_notes where clip_instance_id='${clipId}'`), "Original note");
    });
  } finally {
    global.fetch = previousFetch;
    if (oldUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_SECRET_KEY; else process.env.SUPABASE_SECRET_KEY = oldKey;
    db.close();
  }
});
