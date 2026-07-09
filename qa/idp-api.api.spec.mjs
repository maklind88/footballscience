import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const api = require("../api/_lib/idp-database.js");
const core = require("../api/_lib/idp-database-core.js");
const moments = require("../api/_lib/idp-clip-bank-moments.js");

const actor = {
  id: "coach-1",
  clubId: "club-ncc",
  teamId: "team-ncc-first",
};

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

test("idp status endpoint is server-owned and does not require database access", async () => {
  const res = createJsonResponse();
  await api.handleIdpRequest({ method: "GET", url: "/api/idp?action=status" }, res, actor);
  const payload = JSON.parse(res.body);

  expect(res.statusCode).toBe(200);
  expect(payload).toMatchObject({
    ok: true,
    schema: api.IDP_SCHEMA,
    mode: "player-development-system",
    ownsPlayerIdentity: false,
    ownsClipMetadata: false,
    evidenceIsCurated: true,
  });
  expect(payload.scope).toMatchObject({ organizationId: "club-ncc", teamId: "team-ncc-first" });
});

test("idp dashboard status prioritizes clips, evidence gaps, review dates, and completion", () => {
  expect(api.dashboardStatus({}, null, 0)).toBe("No Active Focus");
  expect(api.dashboardStatus({}, { status: "Active", evidence_status: "Has Evidence" }, 2)).toBe("New Clips To Review");
  expect(api.dashboardStatus({}, { status: "Active", evidence_status: "Needs Evidence" }, 0)).toBe("Needs Evidence");
  expect(api.dashboardStatus({}, { status: "Active", evidence_status: "Has Evidence", review_date: "2000-01-01" }, 0)).toBe("Review Due");
  expect(api.dashboardStatus({}, { status: "Completed", evidence_status: "Has Evidence" }, 0)).toBe("Completed");
});

test("idp normalization keeps scope bounded and safe", () => {
  expect(api.normalizeCategory("Technical")).toBe("Technical");
  expect(api.normalizeCategory("unknown category")).toBe("Tactical");
  expect(core.normalizeUuid("2a4e615e-f3e7-4fc7-bb70-a02db63c9152")).toBe("2a4e615e-f3e7-4fc7-bb70-a02db63c9152");
  expect(core.normalizeUuid("not-a-uuid")).toBe("");
  expect(core.actorScope({ id: "coach-2", teamId: "team-a" })).toMatchObject({
    actorId: "coach-2",
    organizationId: "club-ncc",
    teamId: "team-a",
  });
});

test("idp actor scope maps current NCC platform aliases to the shared IDP tenant", () => {
  expect(core.actorScope({
    id: "coach-2",
    clubId: "club-north-carolina-courage",
    teamId: "team-north-carolina-courage",
  })).toMatchObject({
    actorId: "coach-2",
    organizationId: "club-ncc",
    clubId: "club-ncc",
    teamId: "team-ncc-first",
  });

  expect(core.actorScope({ id: "admin-1" })).toMatchObject({
    actorId: "admin-1",
    organizationId: "club-ncc",
    teamId: "team-ncc-first",
  });
});

test("idp api exposes a server-owned assignment action", () => {
  const source = fs.readFileSync(new URL("../api/_lib/idp-database.js", import.meta.url), "utf8");
  expect(source).toContain('action === "assign-owner"');
  expect(source).toContain("primary_owner_id");
  expect(source).toContain("idp_staff_ownership");
  expect(typeof api.assignOwner).toBe("function");
});

test("idp api exposes server-owned clip bank removal without hard delete", () => {
  const source = fs.readFileSync(new URL("../api/_lib/idp-database.js", import.meta.url), "utf8");
  expect(source).toContain('action === "remove-clip-bank-item"');
  expect(source).toContain("async function removeClipBankItem");
  expect(source).toContain('patchRows("idp_clip_bank_items"');
  expect(source).toContain('action: "clip_bank.removed"');
  expect(source).toContain('status: "Hidden"');
  expect(source).toContain("deleted_at: new Date().toISOString()");
  expect(source).not.toContain('deleteRows("idp_clip_bank_items"');
  expect(typeof api.removeClipBankItem).toBe("function");
});

test("idp api exposes a central sync revision endpoint", () => {
  const source = fs.readFileSync(new URL("../api/_lib/idp-database.js", import.meta.url), "utf8");
  expect(source).toContain('action === "sync"');
  expect(source).toContain("buildSyncMeta");
  expect(source).toContain("idp_reviews");
  expect(source).toContain("idp_evidence");
  expect(source).toContain("idp_staff_ownership");
  expect(source).toContain("idp_milestones");
  expect(typeof api.getSyncStatus).toBe("function");
  expect(typeof api.buildSyncMeta).toBe("function");
});

test("idp api exposes server-owned development goals and check-ins", () => {
  const source = fs.readFileSync(new URL("../api/_lib/idp-database.js", import.meta.url), "utf8");
  expect(source).toContain('action === "create-goal"');
  expect(source).toContain('action === "update-goal"');
  expect(source).toContain('action === "archive-goal"');
  expect(source).toContain('action === "add-goal-checkin"');
  expect(source).toContain("idp_development_goals");
  expect(source).toContain("idp_goal_checkins");
  expect(source).toContain("goal_role");
  expect(source).toContain("metric_label");
  expect(source).toContain("development_goal.checkin_added");
  expect(typeof api.createDevelopmentGoal).toBe("function");
  expect(typeof api.updateDevelopmentGoal).toBe("function");
  expect(typeof api.archiveDevelopmentGoal).toBe("function");
  expect(typeof api.addGoalCheckin).toBe("function");
});

test("idp clip bank enriches player clips with video metadata without storing local paths", () => {
  const source = [
    fs.readFileSync(new URL("../api/_lib/idp-database.js", import.meta.url), "utf8"),
    fs.readFileSync(new URL("../api/_lib/idp-clip-bank-metadata.js", import.meta.url), "utf8"),
    fs.readFileSync(new URL("../api/_lib/idp-clip-bank-moments.js", import.meta.url), "utf8"),
  ].join("\n");
  expect(source).toContain("enrichClipBankItems");
  expect(source).toContain("findExistingClipBankItemForMoment");
  expect(source).toContain("aggregateMiniGamePrincipleLabelsForClip");
  expect(source).toContain("video_clip_instances");
  expect(source).toContain("video_matches");
  expect(source).toContain("video_videos");
  expect(source).toContain("mini_game_principles");
  expect(source).toContain("local_video_identifier");
  expect(source).not.toMatch(/\b(video_path|local_path|file_path|storage_bucket|bucket_id|base64|bytea|data:image)\b/i);
});

test("idp clip bank groups player moments without merging timeline tags", () => {
  const playerClip = {
    id: "player-clip",
    video_id: "video-1",
    start_ms: 10000,
    end_ms: 25000,
    metadata: { momentKey: "video-1:10000" },
  };
  const principleClip = {
    id: "principle-clip",
    video_id: "video-1",
    start_ms: 11200,
    end_ms: 26200,
    metadata: { moment_key: "video-1:10000" },
  };
  const lateClip = {
    id: "late-clip",
    video_id: "video-1",
    start_ms: 15000,
    end_ms: 30000,
  };
  const nearbyClip = {
    id: "nearby-clip",
    video_id: "video-1",
    start_ms: 11800,
    end_ms: 26800,
  };
  const nearbyDifferentKeyClip = {
    id: "nearby-different-key-clip",
    video_id: "video-1",
    start_ms: 11800,
    end_ms: 26800,
    metadata: { momentKey: "video-1:11800" },
  };

  expect(moments.clipsShareIdpMoment(playerClip, principleClip)).toBe(true);
  expect(moments.clipsShareIdpMoment({ ...playerClip, metadata: {} }, nearbyClip)).toBe(true);
  expect(moments.clipsShareIdpMoment(playerClip, nearbyDifferentKeyClip)).toBe(true);
  expect(moments.clipsShareIdpMoment({ ...playerClip, metadata: {} }, lateClip)).toBe(false);
});

test("idp clip bank aggregates related MG principles onto one player moment", () => {
  const playerClip = { id: "player-clip", video_id: "video-1", start_ms: 10000, metadata: { momentKey: "video-1:10000" } };
  const relatedClips = [
    { id: "principle-a", video_id: "video-1", start_ms: 10050, metadata: { momentKey: "video-1:10000" } },
    { id: "principle-b", video_id: "video-1", start_ms: 10100, metadata: { momentKey: "video-1:10000" } },
    { id: "principle-c", video_id: "video-1", start_ms: 18000, metadata: { momentKey: "video-1:18000" } },
  ];
  const labelsByClip = new Map([
    ["principle-a", [{ value: "third-player", label: "Third Player" }]],
    ["principle-b", [{ value: "ft3", label: "FT3" }, { value: "third-player", label: "Third Player" }]],
    ["principle-c", [{ value: "late", label: "Late" }]],
  ]);

  expect(moments.aggregateMiniGamePrincipleLabelsForClip(playerClip, relatedClips, labelsByClip)).toEqual([
    { type: "mini_game_principle", value: "third-player", label: "Third Player" },
    { type: "mini_game_principle", value: "ft3", label: "FT3" },
  ]);
});
