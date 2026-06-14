import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const api = require("../api/_lib/video-analysis-database.js");

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
