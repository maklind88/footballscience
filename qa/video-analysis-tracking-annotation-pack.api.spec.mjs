import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function moduleUrl(relativePath) {
  return pathToFileURL(path.join(rootDir, relativePath)).href;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function annotationPlan(overrides = {}) {
  return {
    version: 1,
    protocol: "football-science-tracking-annotation-plan-v1",
    pack: {
      id: "local-real-match-pilot",
      revision: 1,
      datasetName: "Football Science local match",
      datasetVersion: "review-1",
      angleId: "main-camera",
    },
    output: { width: 1920, height: 1080, frameRate: 30, crf: 18 },
    cases: [
      { id: "attack", startMs: 600_000, durationMs: 120_000, scenarioTags: ["crowded-box", "occlusion"] },
      { id: "restart", startMs: 1_200_000, durationMs: 120_000, scenarioTags: ["set-piece", "camera-motion"] },
      { id: "unit", startMs: 1_800_000, durationMs: 120_000, scenarioTags: ["compact-unit", "occlusion"] },
      { id: "transition", startMs: 2_400_000, durationMs: 120_000, scenarioTags: ["transition", "camera-motion"] },
      { id: "visuals", startMs: 3_000_000, durationMs: 120_000, scenarioTags: ["difficult-visuals", "compact-unit"] },
    ],
    ...overrides,
  };
}

async function fixture(directory) {
  const source = Buffer.from("private-real-match-source");
  const ffmpeg = Buffer.from("sealed-ffmpeg-runtime");
  const planPath = path.join(directory, "plan.json");
  const sourcePath = path.join(directory, "match.mp4");
  const ffmpegPath = path.join(directory, "ffmpeg");
  await fs.writeFile(planPath, JSON.stringify(annotationPlan()));
  await fs.writeFile(sourcePath, source);
  await fs.writeFile(ffmpegPath, ffmpeg);
  return { ffmpeg, ffmpegPath, planPath, source, sourcePath };
}

test("annotation plan requires ten non-overlapping minutes and every football scenario", async () => {
  const service = await import(moduleUrl("scripts/fs-player-tracking-benchmark-prepare.mjs"));
  const normalized = service.normalizeTrackingAnnotationPlan(annotationPlan());
  expect(normalized.summary).toEqual({
    caseCount: 5,
    uniqueDurationMs: 600_000,
    scenarioIds: ["camera-motion", "compact-unit", "crowded-box", "difficult-visuals", "occlusion", "set-piece", "transition"],
  });

  const overlapping = annotationPlan();
  overlapping.cases[1].startMs = overlapping.cases[0].startMs + 1_000;
  expect(() => service.normalizeTrackingAnnotationPlan(overlapping)).toThrow(/must not overlap/);

  const incomplete = annotationPlan();
  incomplete.cases = incomplete.cases.map((entry) => ({ ...entry, scenarioTags: ["transition"] }));
  expect(() => service.normalizeTrackingAnnotationPlan(incomplete)).toThrow(/missing scenarios/);

  const duplicate = annotationPlan();
  duplicate.cases[0].scenarioTags = ["occlusion", "occlusion"];
  expect(() => service.normalizeTrackingAnnotationPlan(duplicate)).toThrow(/unknown or duplicate/);
});

test("annotation pack binds private clips without leaking the local source path or pre-attesting review", async () => {
  const service = await import(moduleUrl("scripts/fs-player-tracking-benchmark-prepare.mjs"));
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "fs-tracking-annotation-pack-"));
  const outputDir = path.join(directory, "pack");
  try {
    const values = await fixture(directory);
    const result = await service.prepareTrackingAnnotationPack({ ...values, outputDir }, {
      now: () => "2026-08-31T20:00:00.000Z",
      extractClip: async ({ destination, case: entry, output }) => {
        await fs.writeFile(destination, `clip:${entry.id}:${entry.startMs}`);
        return Math.round((entry.durationMs / 1000) * output.frameRate);
      },
    });
    expect(result.pack).toMatchObject({
      protocol: "football-science-tracking-annotation-pack-v1",
      source: { bytes: values.source.byteLength, sha256: sha256(values.source) },
      extraction: { ffmpegSha256: sha256(values.ffmpeg), frameRate: 30 },
      summary: { caseCount: 5, uniqueDurationMs: 600_000, reviewStatus: "not-reviewed" },
    });
    expect(result.pack.cases).toHaveLength(5);
    expect(JSON.stringify(result.pack)).not.toContain(directory);
    expect(JSON.stringify(result.pack)).not.toMatch(/sourcePath|filePath|videoUrl|blobUrl/);

    const template = JSON.parse(await fs.readFile(path.join(outputDir, "mot-import.template.json"), "utf8"));
    expect(template).toMatchObject({
      dataset: { videoUseReviewed: false, annotationUseReviewed: false, localBenchmarkOnly: true },
      review: { attested: false, exhaustiveSceneAttested: false },
    });
    expect(template.sequences).toHaveLength(5);
    expect(template.sequences[0]).toMatchObject({
      sourceFile: "clips/attack.mp4",
      annotationFile: "annotations/attack.txt",
      sourceStartMs: 600_000,
      sequenceLengthFrames: 3600,
      trackMap: {},
    });
    expect((await fs.stat(path.join(outputDir, "annotations/attack.txt"))).size).toBe(0);
    await expect(service.prepareTrackingAnnotationPack({ ...values, outputDir }, {
      extractClip: async () => 3600,
    })).rejects.toMatchObject({ code: "TRACKING_ANNOTATION_OUTPUT_EXISTS" });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("annotation pack removes partial output when the match source changes during extraction", async () => {
  const service = await import(moduleUrl("scripts/fs-player-tracking-benchmark-prepare.mjs"));
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "fs-tracking-annotation-source-change-"));
  const outputDir = path.join(directory, "pack");
  try {
    const values = await fixture(directory);
    await expect(service.prepareTrackingAnnotationPack({ ...values, outputDir }, {
      extractClip: async ({ destination, case: entry, output }) => {
        await fs.writeFile(destination, "partial-clip");
        await fs.writeFile(values.sourcePath, "changed-private-real-match-source");
        return Math.round((entry.durationMs / 1000) * output.frameRate);
      },
    })).rejects.toMatchObject({ code: "TRACKING_ANNOTATION_FILE_CHANGED" });
    await expect(fs.lstat(outputDir)).rejects.toMatchObject({ code: "ENOENT" });
    expect((await fs.readdir(directory)).some((entry) => entry.startsWith(".tracking-annotation-pack-"))).toBe(false);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("annotation pack CLI accepts exactly plan, source, output, and optional JSON", async () => {
  const service = await import(moduleUrl("scripts/fs-player-tracking-benchmark-prepare.mjs"));
  expect(service.parseTrackingAnnotationPackArguments([
    "--plan", "/tmp/plan.json",
    "--source", "/tmp/match.mp4",
    "--output", "/tmp/pack",
    "--json",
  ])).toEqual({
    json: true,
    outputDir: "/tmp/pack",
    planPath: "/tmp/plan.json",
    sourcePath: "/tmp/match.mp4",
  });
  expect(() => service.parseTrackingAnnotationPackArguments(["--source", "/tmp/match.mp4"]))
    .toThrow(/required/);
  expect(() => service.parseTrackingAnnotationPackArguments(["--force"]))
    .toThrow(/Unknown argument/);
});
