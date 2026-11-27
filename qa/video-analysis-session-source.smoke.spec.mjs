import { expect, test } from "@playwright/test";
import { basename } from "node:path";
import { registeredMp4Source } from "./helpers/video-analysis-media.mjs";

const pagePath = "/qa/video-analysis-browser-smoke.html?session-source=1";
const seattleFile = process.env.FS_PLAYER_SEATTLE_SOURCE;
const trainingFile = process.env.FS_PLAYER_TRAINING_SOURCE;
const makeDay = (id, title, match_date, event_type, file, clip_count) => ({
  id, title, match_date, event_type, clip_count, video_count: 1,
  latest_video: { id: `${id}-video`, match_id: id, title: file ? basename(file) : `${id}.mp4` },
  latest_source: {
    id: `${id}-source`, match_id: id, video_id: `${id}-video`,
    display_name: file ? basename(file) : `${id}.mp4`,
    local_video_identifier: file ? registeredMp4Source(file) : `${id}-file`,
  },
});
const seattle = makeDay("match-seattle", "NCC - Seattle Reign", "2026-07-04", "match", seattleFile, 38);
const training = makeDay("training-session", "MD-2 Training", "2026-09-16", "training", trainingFile, 0);
const originals = Array.from({ length: 38 }, (_, index) => ({
  id: `clip-${index}`, match_id: seattle.id, video_id: seattle.latest_video.id,
  start_ms: (index + 1) * 12000, end_ms: (index + 1) * 12000 + 15000,
  sub_phase: index < 3 ? "High Press" : "Build Up", phase: "Out of Possession", outcome: "Neutral",
}));
const timeline = page => page.locator("[data-video-analysis-timeline-module]");
const header = page => page.locator(".video-analysis-player h2");
const tagCount = (page, count) => expect(timeline(page)).toHaveAttribute("data-video-analysis-timeline-clip-count", String(count));
async function openDay(page, day) {
  await page.getByRole("searchbox", { name: "Search day, video, match, team or date" }).fill(day.match_date);
  await page.locator(`[data-video-analysis-open-library-item="match:${day.id}"]`).first().click({ timeout: 10000 });
}
const overview = page => page.getByRole("button", { name: "Overview", exact: true }).click();

async function setup(page) {
  await page.addInitScript(({ days, originals }) => {
    window.__videoAnalysisSmokeMatches = days;
    window.__videoAnalysisSmokeClips = originals;
    window.__videoAnalysisSmokeMediaAngles = [{
      id: days[0].latest_source.id,
      matchId: days[0].id,
      videoId: days[0].latest_video.id,
      label: days[0].latest_source.display_name,
      role: "primary",
      primary: true,
    }];
    Object.defineProperty(window, "showOpenFilePicker", { value: undefined, configurable: true });
  }, { days: [seattle, training], originals });
  await page.goto(pagePath);
}

test("first opening Seattle loads tags without waiting for a local file handle", async ({ page }) => {
  await setup(page);
  // Model a browser with a pending local handle request, not an API failure.
  await page.evaluate(() => {
    const open = indexedDB.open.bind(indexedDB);
    indexedDB.open = (name, ...args) => name === "football-science-video-handles" ? {} : open(name, ...args);
  });
  await openDay(page, seattle);
  await expect(header(page)).toHaveText(seattle.latest_video.title);
  await tagCount(page, 38);
  await expect(timeline(page).getByRole("button", { name: "High Press (3)", exact: true })).toBeVisible();
});

test("a previous session's delayed clips and cameras cannot replace the newly selected session", async ({ page }) => {
  await setup(page);
  await page.evaluate(matchId => {
    const hold = new Promise(resolve => { window.releaseSeattleClips = resolve; });
    window.__videoAnalysisSmokeRequest = async url => {
      if (url.searchParams.get("action") !== "clips" || url.searchParams.get("matchId") !== matchId) return;
      window.seattleClipsRequested = true;
      await hold;
    };
  }, seattle.id);
  await openDay(page, seattle);
  await expect.poll(() => page.evaluate(() => window.seattleClipsRequested)).toBe(true);
  await expect(page.getByRole("combobox", { name: "Timeline view" })).toBeDisabled();
  await expect(page.getByRole("option", { name: "Loading tags..." })).toBeAttached();
  await page.getByRole("button", { name: "Cameras and media", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Cameras and media", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await overview(page);
  await openDay(page, training);
  await expect(header(page)).toHaveText(training.latest_video.title);
  await tagCount(page, 0);
  await page.evaluate(async () => {
    window.releaseSeattleClips();
    await new Promise(resolve => requestAnimationFrame(resolve));
  });
  await tagCount(page, 0);
  await expect.poll(() => page.evaluate(() => window.__videoAnalysisRequests.filter(r => r.action === "clips").length)).toBeGreaterThanOrEqual(2);
  // A fresh read after switching views must also retain training's clip scope.
  await page.getByRole("button", { name: "Clip Library", exact: true }).click();
  await expect(page.getByText("No clips found", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "FS Player", exact: true }).click();
  await expect(header(page)).toHaveText(training.latest_video.title);
  await tagCount(page, 0);
});

test("reload and reconnect each real file without rewriting any registered metadata", async ({ page, context }) => {
  test.skip(!seattleFile || !trainingFile, "Provide the July 4 Seattle and September 16 training recordings.");
  await context.route(/^https?:\/\/(?!127\.0\.0\.1[:/])/, route => route.abort());
  await setup(page);
  for (const [day, file, wrongFile] of [[seattle, seattleFile, trainingFile], [training, trainingFile, seattleFile]]) {
    await openDay(page, day);
    await tagCount(page, day.clip_count);
    await expect(header(page)).toHaveText(day.latest_video.title);
    if (day === seattle) {
      const wrongChoice = page.waitForEvent("filechooser");
      await page.getByRole("button", { name: "Reconnect local file", exact: true }).click();
      await (await wrongChoice).setFiles(wrongFile);
      await expect(page.getByText("This file does not match the linked video.", { exact: true })).toBeVisible();
      await expect(page.locator("[data-video-analysis-video]")).toHaveCount(0);
    }
    const choice = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Reconnect local file", exact: true }).click();
    await (await choice).setFiles(file);
    const video = page.locator("[data-video-analysis-video]");
    await expect(video).toHaveCount(1);
    await expect.poll(() => video.evaluate(el => el.readyState)).toBeGreaterThanOrEqual(2);
    const duration = await video.evaluate(el => el.duration);
    expect(duration).toBeGreaterThan(30);
    if (day === seattle) expect(duration).toBeCloseTo(7167.23, 0);
    await tagCount(page, day.clip_count);
    expect(await page.evaluate(() => window.__videoAnalysisRequests.filter(r => /^(create-local-video-source|save-|archive-)/.test(r.action)))).toEqual([]);
    await page.reload();
    await openDay(page, day);
    await expect(header(page)).toHaveText(day.latest_video.title);
    await tagCount(page, day.clip_count);
    if (day === seattle) await overview(page);
  }
});
