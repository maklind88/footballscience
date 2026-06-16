import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const api = require("../api/_lib/video-analysis-database.js");
const presentationApi = require("../api/_lib/video-analysis-presentation-database.js");
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const actor = {
  id: "6cf3a58f-7f5e-4fc7-9a22-8840a9d8aa41",
  clubId: "club-ncc",
  teamId: "team-ncc-first",
};

test("video analysis payloads reject local paths, raw files, and inline video data", () => {
  expect(api.containsForbiddenVideoPayload({ filePath: "/Users/coach/match.mp4" })).toMatchObject({
    reason: "forbidden_video_payload_key",
  });
  expect(api.containsForbiddenVideoPayload({ source: "file:///Users/coach/match.mp4" })).toMatchObject({
    reason: "local_video_path_or_inline_video",
  });
  expect(api.containsForbiddenVideoPayload({ nested: { VideoBytes: "abc" } })).toMatchObject({
    reason: "forbidden_video_payload_key",
  });
  expect(() => api.rejectForbiddenPayload({ videoPath: "C:\\video\\match.mp4" })).toThrow(/must not be sent/i);
});

test("video analysis clip normalization keeps millisecond precision and football language", () => {
  const clip = api.normalizeClipPayload(
    {
      matchId: "2a4e615e-f3e7-4fc7-bb70-a02db63c9152",
      videoId: "26c70a43-5ee1-43f7-9e56-8e1c1be3a725",
      startMs: 1234.4,
      endMs: 6789.6,
      phase: "In Possession",
      subPhase: "Build Up",
      teamPrincipleId: "create-free-player",
      miniGamePrincipleId: "third-player",
      outcome: "Positive",
      codingMode: "instant",
      preRollMs: 4000,
      postRollMs: 6000,
      players: [{ playerId: "p1", playerLabel: "Player One", role: "secondary" }],
      tags: ["press", "wide"],
      descriptors: [
        { type: "unit", value: "Midfield" },
        { type: "pitch-zone", value: "Final Third" },
      ],
      note: "Good timing.",
    },
    actor
  );

  expect(clip.startMs).toBe(1234);
  expect(clip.endMs).toBe(6790);
  expect(clip.outcome).toBe("Positive");
  expect(clip.codingMode).toBe("instant");
  expect(clip.preRollMs).toBe(4000);
  expect(clip.players[0]).toMatchObject({ playerId: "p1", role: "secondary" });
  expect(clip.descriptors).toEqual([
    { type: "unit", value: "Midfield", label: null },
    { type: "pitch_zone", value: "Final Third", label: null },
  ]);
  expect(clip.tags).toEqual(["press", "wide"]);
});

test("video analysis clip search params are team-scoped and bounded", () => {
  const params = api.buildClipSearchParams(
    { phase: "Set Pieces", outcome: "Development", limit: 9999 },
    { organizationId: "club-ncc", teamId: "team-ncc-first" }
  );

  expect(params.get("organization_id")).toBe("eq.club-ncc");
  expect(params.get("team_id")).toBe("eq.team-ncc-first");
  expect(params.get("phase")).toBe("eq.Set Pieces");
  expect(params.get("outcome")).toBe("eq.Development");
  expect(params.get("limit")).toBe("200");
});

test("video analysis clip search params support bounded presentation date match sets", () => {
  const params = api.buildClipSearchParams(
    {
      matchIds: [
        "2a4e615e-f3e7-4fc7-bb70-a02db63c9152",
        "26c70a43-5ee1-43f7-9e56-8e1c1be3a725",
        "not-a-uuid",
      ],
      limit: 80,
    },
    { organizationId: "club-ncc", teamId: "team-ncc-first" }
  );

  expect(params.get("match_id")).toBe("in.(2a4e615e-f3e7-4fc7-bb70-a02db63c9152,26c70a43-5ee1-43f7-9e56-8e1c1be3a725)");
  expect(params.get("limit")).toBe("80");
});

test("video analysis clip search params support bounded timeline pagination", () => {
  const params = api.buildClipSearchParams(
    { limit: 200, offset: 400 },
    { organizationId: "club-ncc", teamId: "team-ncc-first" }
  );
  const capped = api.buildClipSearchParams(
    { limit: 9999, offset: 99999 },
    { organizationId: "club-ncc", teamId: "team-ncc-first" }
  );

  expect(params.get("limit")).toBe("200");
  expect(params.get("offset")).toBe("400");
  expect(capped.get("limit")).toBe("200");
  expect(capped.get("offset")).toBe("10000");
});

test("video analysis library API supports schedule candidates and autosaved match links", () => {
  const source = fs.readFileSync(path.join(rootDir, "api/_lib/video-analysis-database.js"), "utf8");
  const librarySource = fs.readFileSync(path.join(rootDir, "api/_lib/video-analysis-library-database.js"), "utf8");

  expect(source).toContain('action === "matches"');
  expect(source).toContain('action === "update-match-link"');
  expect(librarySource).toContain("scheduleCandidates");
  expect(librarySource).toContain("scheduleEventId");
  expect(librarySource).toContain("scheduleDayKey");
  expect(librarySource).toContain("linkedFrom");
  expect(source).toContain("rejectForbiddenPayload(payload)");
});

test("video analysis presentation API normalizes metadata and blocks video payloads", () => {
  expect(() => presentationApi.normalizePresentationPayload({
    title: "Team meeting",
    sections: [{ title: "Build up", items: [] }],
    localPath: "/Users/coach/match.mp4",
  }, actor)).toThrow(/must not be sent/i);

  const presentation = presentationApi.normalizePresentationPayload({
    title: "Team meeting",
    purpose: "team-meeting",
    notes: "Coach prep",
    sections: [{
      id: "not-a-real-id",
      title: "Build up",
      sectionType: "team",
      items: [{
        clipId: "6b9a0aa2-7da2-4eb0-8d29-599647c9fe5a",
        startMs: 1200.4,
        endMs: 9200.6,
        drawings: [{
          timestampMs: 2400.4,
          durationMs: 1800.1,
          tool: "spotlight",
          geometry: { cx: 52, cy: 46, rx: 18, ry: 13 },
          style: { color: "#ffffff" },
          text: "Freeze cue",
        }],
      }],
    }],
    shareTargets: [{ targetType: "player", targetId: "player-9", accessLevel: "present" }],
  }, actor);

  expect(presentation.organizationId).toBe("club-ncc");
  expect(presentation.teamId).toBe("team-ncc-first");
  expect(presentation.sections[0].items[0]).toMatchObject({
    clipId: "6b9a0aa2-7da2-4eb0-8d29-599647c9fe5a",
    startMs: 1200,
    endMs: 9201,
  });
  expect(presentation.sections[0].items[0].drawings[0]).toMatchObject({
    timestampMs: 2400,
    durationMs: 1800,
    tool: "spotlight",
    text: "Freeze cue",
  });
  expect(presentation.shareTargets[0]).toMatchObject({ targetType: "player", targetId: "player-9", accessLevel: "present" });
});

test("video analysis smart collections behave like shareable clip playlists", () => {
  const collection = presentationApi.normalizeSmartCollection({
    title: "High press wins",
    description: "Auto-updating clips for the next team meeting.",
    visibility: "coach-analyst",
    sortMode: "match-date",
    search: {
      phase: "Out of Possession",
      outcome: "Positive",
      tag: "press",
    },
    shareTargets: [
      { targetType: "role", targetId: "coach", accessLevel: "edit" },
      { targetType: "role", targetId: "analyst", accessLevel: "edit" },
    ],
  }, actor);

  expect(collection).toMatchObject({
    title: "High press wins",
    description: "Auto-updating clips for the next team meeting.",
    visibility: "coach-analyst",
    sortMode: "match-date",
    collectionType: "smart",
  });
  expect(collection.searchJson).toMatchObject({ tag: "press" });
  expect(collection.shareTargets).toHaveLength(2);
  expect(collection.shareTargets[0]).toMatchObject({ targetType: "role", targetId: "coach", accessLevel: "edit" });
});

test("video analysis API exposes presentation builder actions behind the service layer", () => {
  const source = fs.readFileSync(path.join(rootDir, "api/_lib/video-analysis-database.js"), "utf8");
  const presentationSource = fs.readFileSync(path.join(rootDir, "api/_lib/video-analysis-presentation-database.js"), "utf8");

  for (const action of [
    "list-presentations",
    "get-presentation",
    "list-presentation-clips",
    "save-presentation",
    "archive-presentation",
    "save-smart-collection",
    "save-smart-collection-share-targets",
    "save-drawing-layer",
    "save-share-targets",
  ]) {
    expect(source).toContain(action);
  }
  expect(presentationSource).toContain("normalizePresentationPayload");
  expect(presentationSource).toContain("normalizeDrawingLayer");
  expect(presentationSource).toContain("rejectForbiddenPayload(payload)");
  expect(presentationSource).toContain("video_presentations");
  expect(presentationSource).toContain("video_drawing_layers");
  expect(presentationSource).not.toMatch(/\b(video_path|local_path|file_path|storage_bucket|bucket_id|base64|bytea)\b/i);
});

test("video analysis coding template save archives removed buttons and links", () => {
  const templateSource = fs.readFileSync(path.join(rootDir, "api/_lib/video-analysis-coding-template-database.js"), "utf8");

  expect(templateSource).toMatch(/archiveMissingCodingRows\(\s*"video_coding_buttons"/);
  expect(templateSource).toMatch(/archiveMissingCodingRows\(\s*"video_coding_button_links"/);
  expect(templateSource).toContain('params.set("status", "eq.active")');
  expect(templateSource).toContain('status: "archived"');
  expect(templateSource).toContain("archived_at: new Date().toISOString()");
  expect(templateSource).toContain("savedLinks.map((row) => row.id).filter(Boolean)");
  expect(templateSource).not.toContain("rowList(savedLinks)");
});
