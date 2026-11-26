import assert from "node:assert/strict";
import { test } from "node:test";
import { createVideoAnalysisNativeDatabase } from "./helpers/video-analysis-native-database.mjs";
import { normalizePlaylistEdits } from "../src/modules/video-analysis/timeline/timeline.playlist-clips.js";

const match = "20000000-0000-4000-8000-000000000001";
const video = "20000000-0000-4000-8000-000000000002";
const first = "20000000-0000-4000-8000-000000000003";
const second = "20000000-0000-4000-8000-000000000004";
const literal = value => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
const drawing = { tool: "arrow", atMs: 1520, sourceId: `local-video-${"a".repeat(40)}`, geometry: { x1: 20, y1: 25, x2: 60, y2: 65 } };

test("existing timeline RPC saves independent playlist versions atomically", async t => {
  const db = createVideoAnalysisNativeDatabase();
  try {
    db.sql(`insert into video_matches (id, organization_id, team_id, title) values ('${match}', 'club', 'team', 'Playlist test');
      insert into video_videos (id, organization_id, team_id, match_id, title, local_video_identifier)
        values ('${video}', 'club', 'team', '${match}', 'Video', '${drawing.sourceId}');
      insert into video_clip_instances (id, organization_id, team_id, match_id, video_id, start_ms, end_ms, phase, sub_phase, created_by)
        values ('${first}', 'club', 'team', '${match}', '${video}', 1000, 2000, 'In Possession', 'Build Up', 'coach'),
        ('${second}', 'club', 'team', '${match}', '${video}', 3000, 4000, 'Out of Possession', 'High Press', 'coach');
      insert into video_clip_notes (organization_id, team_id, clip_instance_id, note) values ('club', 'team', '${first}', 'Original');`);
    const original = db.sql("select jsonb_agg(c order by id) from video_clip_instances c");
    let requestNumber = 0;
    const save = value => JSON.parse(db.sql(`select public.video_analysis_save_timeline('club', 'team', 'coach', ${literal(value)}, 'playlist-local-test-${++requestNumber}')`));
    const other = { id: "other-playlist", kind: "manual", label: "Other playlist", clipIds: [first], sortOrder: 1,
      query: { source: "fs-player-playlist", playlistKey: "other-staff", clipEdits: { [first]: { note: "Other note" } } } };
    const candidate = { id: "", title: "Match timeline", matchId: match, expectedRevision: 1, rows: [{
      id: "playlist-test", kind: "manual", label: "Team meeting", clipIds: [second, first], sortOrder: 0,
      query: { source: "fs-player-playlist", playlistKey: "local-test", clipEdits: { [first]: normalizePlaylistEdits({
        note: "Playlist note", tags: ["review"], startMs: 500, endMs: 1800, phase: "Out of Possession", subPhase: "High Press", drawings: [drawing],
      }) } },
    }, other] };
    let saved;
    await t.test("ordered clip references and per-playlist edits survive the SQL snapshot", () => {
      saved = save(candidate);
      assert.deepEqual(saved.rows[0].clipIds, [second, first]);
      assert.equal(saved.rows[0].query.clipEdits[first].note, "Playlist note");
      assert.deepEqual(saved.rows[0].query.clipEdits[first].drawings, [drawing]);
      assert.equal(saved.rows[0].label, "Team meeting");
      assert.equal(db.sql("select jsonb_agg(c order by id) from video_clip_instances c"), original);
      assert.equal(db.sql(`select note from video_clip_notes where clip_instance_id='${first}'`), "Original");
    });
    await t.test("editing a drawing on the same source clip leaves the other playlist independent", () => {
      const rows = structuredClone(saved.rows);
      const updated = { ...drawing, tool: "line", atMs: 1650 };
      rows[0].query.clipEdits[first].drawings.push(updated);
      const retained = rows[1].query;
      saved = save({ ...saved, expectedRevision: saved.revision, rows });
      const reopened = JSON.parse(db.sql(`select app_private.video_analysis_timeline_snapshot('${saved.id}', 'team')`));
      assert.deepEqual(reopened.rows[0].query.clipEdits[first].drawings, [drawing, updated]);
      assert.deepEqual(reopened.rows[1].query, retained);
      assert.deepEqual(reopened.rows[1].clipIds, [first]);
      assert.equal(db.sql("select jsonb_agg(c order by id) from video_clip_instances c"), original);
    });
    await t.test("rename and removal change only the saved playlist", () => {
      saved = save({ ...saved, expectedRevision: saved.revision, rows: [{ ...saved.rows[0], label: "Player meeting", clipIds: [first] }, saved.rows[1]] });
      assert.equal(saved.rows[0].label, "Player meeting");
      assert.deepEqual(saved.rows[0].clipIds, [first]);
      assert.equal(db.sql("select jsonb_agg(c order by id) from video_clip_instances c"), original);
    });
    await t.test("stale revision rejects all row and metadata changes", () => {
      const before = db.sql(`select app_private.video_analysis_timeline_snapshot('${saved.id}', 'team')`);
      assert.throws(() => save({ ...saved, expectedRevision: 1, rows: [] }), /revision conflict/);
      assert.equal(db.sql(`select app_private.video_analysis_timeline_snapshot('${saved.id}', 'team')`), before);
    });
    await t.test("another team cannot access the match through playlist persistence", () => {
      assert.throws(() => db.sql(`select public.video_analysis_save_timeline('club', 'other-team', 'coach', ${literal(candidate)}, 'playlist-cross-team-check')`), /Match not found/);
      assert.equal(db.sql("select jsonb_agg(c order by id) from video_clip_instances c"), original);
    });
  } finally { db.close(); }
});
