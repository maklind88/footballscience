import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleDir = path.join(rootDir, "src/modules/video-analysis");

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

test("video analysis module keeps the required isolated file structure", () => {
  for (const relativePath of [
    "src/modules/video-analysis/index.js",
    "src/modules/video-analysis/video-analysis.routes.js",
    "src/modules/video-analysis/video-analysis.state.js",
    "src/modules/video-analysis/video-analysis.store.js",
    "src/modules/video-analysis/components/VideoPlayer.js",
    "src/modules/video-analysis/components/CodingPanel.js",
    "src/modules/video-analysis/components/Timeline.js",
    "src/modules/video-analysis/components/ClipList.js",
    "src/modules/video-analysis/components/ClipFilters.js",
    "src/modules/video-analysis/components/PlaylistBuilder.js",
    "src/modules/video-analysis/components/PlayerClipDrawer.js",
    "src/modules/video-analysis/services/videoPlaybackService.js",
    "src/modules/video-analysis/services/clipInstanceService.js",
    "src/modules/video-analysis/services/taggingService.js",
    "src/modules/video-analysis/services/playlistService.js",
    "src/modules/video-analysis/services/localVideoBridgeService.js",
    "src/modules/video-analysis/repositories/videoRepository.js",
    "src/modules/video-analysis/repositories/clipRepository.js",
    "src/modules/video-analysis/repositories/playlistRepository.js",
    "src/modules/video-analysis/domain/clipInstance.model.js",
    "src/modules/video-analysis/domain/codingSchema.model.js",
    "src/modules/video-analysis/domain/playlist.model.js",
    "src/modules/video-analysis/domain/videoSource.model.js",
  ]) {
    expect(fs.existsSync(path.join(rootDir, relativePath)), relativePath).toBe(true);
  }
});

test("video player stays playback-only and components avoid direct data access", () => {
  const videoPlayer = read("src/modules/video-analysis/components/VideoPlayer.js");
  expect(videoPlayer).not.toMatch(/Supabase|fetch\(|\/api\/|principle|playlist|playerId|player_id|playerLabel/i);

  for (const file of fs.readdirSync(path.join(moduleDir, "components")).filter((entry) => entry.endsWith(".js"))) {
    const source = read(`src/modules/video-analysis/components/${file}`);
    expect(source, file).not.toMatch(/fetch\(|supabase|\/api\/video-analysis/i);
  }

  expect(read("src/modules/video-analysis/video-analysis.routes.js")).toContain("/api/video-analysis");
  for (const file of fs.readdirSync(path.join(moduleDir, "repositories")).filter((entry) => entry.endsWith(".js"))) {
    const source = read(`src/modules/video-analysis/repositories/${file}`);
    if (file !== "playlistRepository.js") {
      expect(source, file).toContain("buildVideoAnalysisApiUrl");
      expect(source, file).toContain("fetch(");
    }
  }
});

test("video analysis constants preserve Football Science language", () => {
  const phases = read("src/modules/video-analysis/constants/phases.js");
  const subPhases = read("src/modules/video-analysis/constants/subPhases.js");
  const outcomes = read("src/modules/video-analysis/constants/outcomes.js");

  for (const value of ["In Possession", "Out of Possession", "Offensive Transition", "Defensive Transition", "Set Pieces"]) {
    expect(phases).toContain(value);
  }
  for (const value of ["Build With GK", "Build Up", "Creating Phase", "Finishing Phase", "High Press vs GK", "High Press", "Block Defending", "Box Defending", "Defensive Set Pieces", "Offensive Set Pieces", "Throw-ins"]) {
    expect(subPhases).toContain(value);
  }
  expect(outcomes).toContain("Positive");
  expect(outcomes).toContain("Development");
  expect(outcomes).toContain("Neutral");
});

test("video analysis module exports the runtime handlers", async () => {
  const module = await import(pathToFileURL(path.join(moduleDir, "index.js")).href);
  for (const exportName of ["render", "handleClick", "handleInput", "handleChange", "handleSubmit"]) {
    expect(typeof module[exportName], exportName).toBe("function");
  }
});
