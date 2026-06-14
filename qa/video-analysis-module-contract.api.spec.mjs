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
    "src/modules/video-analysis/components/ClipIntelligence.js",
    "src/modules/video-analysis/components/CodingTemplateBuilder.js",
    "src/modules/video-analysis/components/PlaylistBuilder.js",
    "src/modules/video-analysis/components/PlayerClipDrawer.js",
    "src/modules/video-analysis/services/videoPlaybackService.js",
    "src/modules/video-analysis/services/clipInstanceService.js",
    "src/modules/video-analysis/services/taggingService.js",
    "src/modules/video-analysis/services/playlistService.js",
    "src/modules/video-analysis/services/localVideoBridgeService.js",
    "src/modules/video-analysis/services/localVideoHandleStore.js",
    "src/modules/video-analysis/services/localVideoSessionService.js",
    "src/modules/video-analysis/services/codingTemplateService.js",
    "src/modules/video-analysis/services/timelineService.js",
    "src/modules/video-analysis/services/clipIntelligenceService.js",
    "src/modules/video-analysis/services/reviewSessionService.js",
    "src/modules/video-analysis/services/keyboardShortcutService.js",
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
  for (const exportName of ["render", "handleClick", "handleInput", "handleChange", "handleSubmit", "handleKeydown"]) {
    expect(typeof module[exportName], exportName).toBe("function");
  }
});

test("video analysis workstation keeps controls out of the video player", () => {
  const templateBuilder = read("src/modules/video-analysis/components/CodingTemplateBuilder.js");
  const timeline = read("src/modules/video-analysis/components/Timeline.js");
  const intelligence = read("src/modules/video-analysis/components/ClipIntelligence.js");
  expect(templateBuilder).toContain("data-video-analysis-code-button");
  expect(templateBuilder).toContain("data-video-analysis-mode");
  expect(timeline).toContain("video-analysis-clip-block");
  expect(timeline).toContain("data-video-analysis-zoom");
  expect(intelligence).toContain("Phase x Outcome");
  expect(intelligence).toContain("Principle x Player");
  expect(intelligence).toContain("Mini-game x Unit");
});

test("local video architecture remains browser-first with bridge fallback only", () => {
  const handleStore = read("src/modules/video-analysis/services/localVideoHandleStore.js");
  const sessionService = read("src/modules/video-analysis/services/localVideoSessionService.js");
  const player = read("src/modules/video-analysis/components/VideoPlayer.js");

  expect(handleStore).toContain("showOpenFilePicker");
  expect(handleStore).toContain("indexedDB.open");
  for (const exportName of ["saveVideoHandle", "getVideoHandle", "removeVideoHandle", "listVideoHandlesForMatch", "verifyPermission", "requestPermission"]) {
    expect(handleStore).toContain(`export async function ${exportName}`);
  }
  expect(sessionService).toContain("restoreLocalVideoHandleForState");
  expect(sessionService).toContain("persistLocalVideoHandle");
  expect(sessionService).not.toContain("createPlayableLocalCopy");
  expect(player).toContain("data-video-analysis-prepare-playback");
  expect(player).toContain("bridgeFallbackRecommended");
  expect(read("src/modules/video-analysis/components/VideoPlayer.js")).not.toMatch(/showOpenFilePicker|indexedDB|createPlayableLocalCopy|fetch\(/);
});

test("production CSP allows only the narrow local video bridge endpoints", () => {
  const vercel = JSON.parse(read("vercel.json"));
  const csp = vercel.headers
    .flatMap((entry) => entry.headers || [])
    .find((header) => header.key === "Content-Security-Policy")?.value || "";
  expect(csp).toContain("http://127.0.0.1:47831");
  expect(csp).toContain("http://localhost:47831");
  expect(csp).not.toMatch(/http:\/\/localhost:\*/);
  expect(csp).not.toMatch(/http:\/\/127\.0\.0\.1:\*/);
});
