import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { validPairCalibration } from "../../src/modules/video-analysis/services/playerPairCalibrationService.js";

// Packages already image-checked geometry. Does not approve a camera or infer geometry.
const [evidencePath, originalVideoPath] = process.argv.slice(2);
if (!evidencePath || !originalVideoPath) throw new Error("Expected checked evidence JSON and original video path");
const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
const hash = createHash("sha256");
for await (const chunk of createReadStream(originalVideoPath)) hash.update(chunk);
const sourceSha256 = hash.digest("hex");
if (sourceSha256 !== "58f51dda5c540feaa75bf09004149eee3e95e1eda04b083998289e19e2b30be6") throw new Error("Unexpected Seattle source");
if (evidence.frames.length !== 451 || evidence.validation.failed || evidence.validation.negativeControlsAccepted) throw new Error("Incomplete frame validation");
const firstSourceMs = 2726395 / 15360 * 1000;
const profile = {
  schema: "fs-player-pair-calibration/1", status: "image-checked-estimate", sourceSha256,
  imageWidth: 1920, imageHeight: 1080, fps: 30, validFromMs: 177515, validToMs: 192515,
  pitchLengthM: 109.728, pitchWidthM: 68.58, independentMetricValidation: false,
  provenance: {
    reference: "Published stadium dimensions and IFAB circle/penalty dimensions; not a match-day survey",
    method: "Manual initial line fit; background LK/RANSAC; bounded paint correction; every-frame paint check",
    sourceFirstPts: 2726395, sourceTimeBase: "1/15360", sourceFrameCount: 451,
    evidenceSha256: createHash("sha256").update(await readFile(evidencePath)).digest("hex"),
    maximumPaintDistancePx: 6, minimumLineSupport: .75, minimumVisibleSamples: 40,
    negativeControls: ["30px horizontal + 20px vertical camera displacement", "20% world-scale error"],
  },
  validation: evidence.validation,
  frames: evidence.frames.map((frame, index) => ({
    atMs: Number((firstSourceMs + index * 1000 / 30).toFixed(6)),
    matrix: frame.matrix, support: frame.support, accepted: frame.accepted,
    paintChecks: frame.checks.slice(0, 4).map(check => [check.count, check.support, check.p90Px]),
  })),
};
if (!validPairCalibration(profile, sourceSha256)) throw new Error("Invalid calibration profile");
const directory = new URL("../../src/modules/video-analysis/calibration/", import.meta.url);
await mkdir(directory, { recursive: true });
const bytes = `${JSON.stringify(profile)}\n`;
await writeFile(new URL("seattle-177515-192515.json", directory), bytes);
console.log(JSON.stringify({ frames: profile.frames.length, bytes: Buffer.byteLength(bytes), sourceSha256,
  profileSha256: createHash("sha256").update(bytes).digest("hex") }));
