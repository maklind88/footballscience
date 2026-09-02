import { expect, test } from "@playwright/test";
import { createPresentationModeRenderer } from "../src/modules/presentation-mode/presentation-mode-renderer.mjs";
import { createPresentationBirthdaySlide } from "../src/modules/presentation-mode/presentation-birthday-slide.mjs";
import { presentationThemeOptions } from "../src/modules/presentation-mode/presentation-mode-themes.mjs";
import { presentationLineupFormationOptions } from "../src/modules/presentation-mode/presentation-lineup-contract.mjs";

const photo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const video = "data:video/mp4;base64,AAAA";
const renderer = createPresentationModeRenderer({
  renderExerciseVisual: () => '<div class="qa-exercise-visual" aria-label="Exercise visual"></div>',
});

function parseCssColor(value = "") {
  const match = String(value).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/i);
  return match ? {
    red: Number(match[1]),
    green: Number(match[2]),
    blue: Number(match[3]),
    alpha: match[4] === undefined ? 1 : Number(match[4]),
  } : null;
}

function compositeColor(foreground, background) {
  const alpha = foreground.alpha + background.alpha * (1 - foreground.alpha);
  const channel = (key) => (
    foreground[key] * foreground.alpha + background[key] * background.alpha * (1 - foreground.alpha)
  ) / alpha;
  return { red: channel("red"), green: channel("green"), blue: channel("blue"), alpha };
}

function contrastRatio(first, second) {
  const luminance = (color) => {
    const channel = (value) => {
      const normalized = value / 255;
      return normalized <= .03928 ? normalized / 12.92 : ((normalized + .055) / 1.055) ** 2.4;
    };
    return .2126 * channel(color.red) + .7152 * channel(color.green) + .0722 * channel(color.blue);
  };
  const firstLuminance = luminance(first);
  const secondLuminance = luminance(second);
  return (Math.max(firstLuminance, secondLuminance) + .05) / (Math.min(firstLuminance, secondLuminance) + .05);
}

function createPlayers(count = 23) {
  const positions = ["Goalkeeper", "Defender", "Midfielder", "Forward"];
  return Array.from({ length: count }, (_, index) => ({
    id: `player-${index + 1}`,
    playerId: `player-${index + 1}`,
    name: index === 8 ? "Alexandra Very Long Player Surname" : `Player Surname ${index + 1}`,
    number: String(index + 1),
    position: positions[index % positions.length],
    photoUrl: photo,
  }));
}

function createLineup(players) {
  const formation = presentationLineupFormationOptions.find((option) => option.id === "4-3-3");
  return {
    formation: "4-3-3",
    formationId: "4-3-3",
    formationOptions: presentationLineupFormationOptions.map(({ id, label }) => ({ id, label })),
    playerOptions: players,
    slots: formation.slots.map((slot, index) => ({
      ...slot,
      playerId: players[index].id,
      player: players[index],
    })),
    matchContext: { opponentLabel: "Houston", dateLabel: "Saturday, 5 September 2026" },
  };
}

function createSetPiece() {
  const phases = Array.from({ length: 4 }, (_, index) => ({
    id: `phase-${index + 1}`,
    title: ["Starting Shape", "First Movement", "Delivery", "Second Ball"][index],
    cue: ["Organize", "Block and run", "Attack zones", "Secure edge"][index],
    durationMs: 1800,
    elements: [
      ...Array.from({ length: 6 }, (__, playerIndex) => ({
        id: `home-${playerIndex + 1}`,
        kind: "home-player",
        x: 68 + playerIndex * 4,
        y: 18 + playerIndex * 6,
        label: `P${playerIndex + 1}`,
        playerName: `Player ${playerIndex + 1}`,
        photoUrl: photo,
      })),
      ...Array.from({ length: 5 }, (__, playerIndex) => ({
        id: `opponent-${playerIndex + 1}`,
        kind: "opponent",
        x: 78 + playerIndex * 3,
        y: 20 + playerIndex * 7,
        label: String(playerIndex + 1),
      })),
      { id: "ball", kind: "ball", x: 86, y: 61 },
    ],
    drawings: [{ id: `run-${index}`, type: "run", startX: 72, startY: 30, endX: 92, endY: 34, label: "Near-post run" }],
  }));
  return {
    available: true,
    playTitle: "Attacking Corner",
    variantTitle: "Near-post overload",
    restart: "corner",
    moment: "attacking",
    opponent: "Houston",
    pitchView: "attacking-half",
    playerMarkerMode: "photo",
    phases,
    activePhaseId: phases[0].id,
    playback: { isPlaying: false, progress: 0, speed: 1, loop: false },
    catalog: [],
  };
}

function createScenarios() {
  const players = createPlayers();
  const base = (id, type, label, theme) => ({ id, type, label, style: { theme } });
  const standings = createPlayers(35).map((player, index) => ({
    ...player,
    points: Math.max(1, 30 - index),
    rank: index + 1,
  }));
  const birthday = createPresentationBirthdaySlide({
    dateValue: "2026-09-05",
    meetingType: "team",
    birthdayCalendar: {
      items: [{ id: "birthday-1", name: "Evelyn Ijeh", nextBirthday: "2026-09-05", daysUntil: 0, turningAge: 25 }],
    },
  });
  return [
    { name: "cover", slide: base("cover", "cover", "Cover", "classic"), boxes: ".presentation-cover-mark, .presentation-cover-copy", primary: ".presentation-cover-copy h1" },
    { name: "title-subtitle", slide: { ...base("title", "info", "Title", "matchday"), infoSlide: { id: "title", layout: "title-subtitle", title: "Matchday Standards", body: "Clarity, intensity and collective responsibility.", fontSize: "64" } }, boxes: ".presentation-info-title, .presentation-info-body", primary: ".presentation-info-title, .presentation-info-body" },
    { name: "bullets", slide: { ...base("bullets", "info", "Bullets", "blueprint"), infoSlide: { id: "bullets", layout: "bullets", title: "Team Information", body: "Arrive ready\nBring GPS\nReview first-action responsibilities\nOwn the transition moment", fontSize: "48" } }, boxes: ".presentation-info-title, .presentation-info-body", primary: ".presentation-info-title, .presentation-info-body" },
    { name: "image", slide: { ...base("image", "info", "Image", "stadium"), infoSlide: { id: "image", layout: "media", title: "Opponent Shape", body: "Recognize the weak-side space.", mediaKind: "image", mediaSrc: photo, mediaName: "Opponent shape", fontSize: "44" } }, boxes: ".presentation-info-title, .presentation-info-body, .presentation-info-media-panel", primary: ".presentation-info-title, .presentation-info-body" },
    { name: "split", slide: { ...base("split", "info", "Split", "tactical"), infoSlide: { id: "split", layout: "split", title: "Build-up Reference", body: "Create the free player behind the first line.\nProtect the next action.", mediaKind: "image", mediaSrc: photo, mediaName: "Build-up", fontSize: "40" } }, boxes: ".presentation-info-title, .presentation-info-body, .presentation-info-media-panel", primary: ".presentation-info-title, .presentation-info-body" },
    { name: "video", slide: { ...base("video", "info", "Video", "recovery"), infoSlide: { id: "video", layout: "video", title: "Video Review", body: "Pause, scrub and compare the line height.", mediaKind: "video", mediaSrc: video, mediaName: "Pressing clip", fontSize: "40" } }, boxes: ".presentation-info-title, .presentation-info-body, .presentation-info-media-panel", primary: ".presentation-info-title, .presentation-info-body" },
    { name: "birthday", teamOnly: true, slide: birthday, boxes: ".presentation-info-title, .presentation-info-body", primary: ".presentation-info-title, .presentation-info-body" },
    { name: "match-squad", slide: { ...base("squad", "match-squad", "Match Squad", "filmroom"), infoSlide: { id: "squad", title: "Match Squad" }, matchSquad: { selectedPlayers: players.slice(0, 20), selectedIds: players.slice(0, 20).map((player) => player.id), playerOptions: players, matchContext: { opponentLabel: "Houston", dateLabel: "Saturday, 5 September 2026" } } }, boxes: ".presentation-match-squad-card", primary: ".presentation-match-squad-heading h2, .presentation-match-squad-card strong", support: ".presentation-match-squad-card small" },
    { name: "starting-xi", slide: { ...base("lineup", "lineup", "Starting XI", "whiteboard"), infoSlide: { id: "lineup", title: "Starting XI" }, lineup: createLineup(players) }, boxes: ".presentation-lineup-slot", primary: ".presentation-lineup-heading h2, .presentation-lineup-slot strong" },
    { name: "set-piece", slide: { ...base("set-piece", "set-piece", "Set Piece", "medical"), infoSlide: { id: "set-piece" }, setPiece: createSetPiece() }, boxes: ".presentation-set-piece-heading, .presentation-set-piece-board, .presentation-set-piece-phases, .presentation-set-piece-playback", primary: ".presentation-set-piece-heading h2", support: ".presentation-set-piece-heading p, .presentation-set-piece-phases span, .presentation-set-piece-phases small, .presentation-set-piece-counter" },
    { name: "overview", slide: base("overview", "overview", "Overview", "clean"), boxes: ".presentation-overview-metric, .presentation-day-overview, .presentation-block-flow, .presentation-medical-overview", primary: ".presentation-overview-metric strong, .presentation-day-overview strong, .presentation-block-flow strong, .presentation-medical-player strong", support: ".presentation-overview-metric > span, .presentation-day-overview span, .presentation-medical-player > span:last-child" },
    { name: "block", slide: { ...base("block", "block", "Block 1", "classic"), block: { id: "block-1", label: "Block 1", title: "High-intensity positional game", phase: "In Possession, Out of Possession", subPhase: "Build Up, High Press, Block Defending", objective: "Connect through pressure while protecting central access.", organization: "Eight versus eight plus three neutral players on a two-thirds pitch.", principles: "Scan before receiving. Play forward when open. Counterpress immediately after loss." }, playerSummary: { nonParticipants: players.slice(0, 8).map((player) => ({ player, participation: 0, statusLabel: "Unavailable" })) } }, boxes: ".presentation-block-visual, .presentation-block-copy, .presentation-block-players", primary: ".presentation-block-copy h2, .presentation-detail-text", support: ".presentation-block-copy .presentation-section-heading p, .presentation-player-chip strong" },
    { name: "leaderboard", slide: { ...base("leaderboard", "leaderboard", "Leaderboard", "matchday"), infoSlide: { id: "leaderboard", title: "Leaderboard" }, leaderboard: { status: "ready", monthLabel: "September 2026", standings } }, boxes: ".presentation-leaderboard-podium-player, .presentation-leaderboard-standing", primary: ".presentation-leaderboard-title, .presentation-leaderboard-player-copy strong", support: ".presentation-leaderboard-player-copy span, .presentation-leaderboard-standing-points span" },
  ];
}

function createModel(slide, meetingType, presenting) {
  const players = createPlayers(18);
  return {
    presenting,
    meetingType,
    slideIndex: 0,
    slides: [slide],
    accentColor: "#22c55e",
    brand: { teamName: "North Carolina Courage", logoUrl: "" },
    teamName: "North Carolina Courage",
    sessionTitle: meetingType === "technical" ? "Technical Staff Meeting" : "Team Meeting",
    dateLabel: "Saturday, 5 September 2026",
    loadLabel: "Hard",
    pitchLabel: "Two-thirds pitch",
    periodization: {
      physicalLoad: "Hard",
      pitchSize: "Two-thirds pitch",
      matchDay: "Match Day -1",
      preTrainingVideo: "Houston build-up clips",
      preTrainingNotes: "Press trigger and weak-side cover",
      matchPhases: ["In Possession", "Out of Possession", "Offensive Transition", "Defensive Transition"],
      subPhases: ["Build Up", "Creating Phase", "High Press", "Block Defending"],
    },
    blocks: Array.from({ length: 4 }, (_, index) => ({ id: `block-${index + 1}`, label: `Block ${index + 1}`, title: `Training exercise ${index + 1}` })),
    medicalRecommendations: players.map((player, index) => ({ player, participation: index % 5 === 0 ? 0 : index % 4 === 0 ? 75 : 100 })),
  };
}

function getMarkup(scenario, meetingType, presenting) {
  const model = createModel(scenario.slide, meetingType, presenting);
  return renderer.render(model);
}

async function mountStyles(page, baseURL) {
  await page.setContent(`<!doctype html><html><head>
    <link rel="stylesheet" href="${baseURL}/styles.css">
    <link rel="stylesheet" href="${baseURL}/presentation-mode.css">
    <link rel="stylesheet" href="${baseURL}/src/modules/set-pieces-room/set-pieces-room.css">
    <link rel="stylesheet" href="${baseURL}/src/modules/set-pieces-room/set-pieces-board.css">
    <link rel="stylesheet" href="${baseURL}/src/modules/presentation-mode/presentation-mode-set-pieces.css">
    <link rel="stylesheet" href="${baseURL}/src/modules/presentation-mode/presentation-mode-leaderboard.css">
    <link rel="stylesheet" href="${baseURL}/src/modules/presentation-mode/presentation-birthday-slide.css">
    <style>
      html, body, #matrix-root { width:100%; height:100%; margin:0; overflow:hidden; background:#050b10; }
      #matrix-root { display:grid; place-items:center; }
      .qa-exercise-visual { width:100%; height:100%; background:linear-gradient(135deg,#136b45,#1f8b59); }
    </style>
  </head><body><div id="matrix-root"></div></body></html>`);
  await page.waitForFunction(() => [...document.styleSheets].every((sheet) => {
    try { return sheet.cssRules.length > 0; } catch { return true; }
  }));
}

async function inspectLayout(page, scenario) {
  return page.evaluate(({ boxes, primary, support }) => {
    const slide = document.querySelector(".presentation-slide");
    const body = document.querySelector(".presentation-slide-body");
    if (!slide || !body) return null;
    const slideRect = slide.getBoundingClientRect();
    const bodyRect = body.getBoundingClientRect();
    const boxNodes = [...document.querySelectorAll(boxes)];
    const boxRects = boxNodes.map((node) => node.getBoundingClientRect()).filter((rect) => rect.width > 0 && rect.height > 0);
    const overlaps = boxRects.flatMap((first, firstIndex) => boxRects.flatMap((second, secondIndex) => (
      secondIndex > firstIndex
      && Math.min(first.right, second.right) - Math.max(first.left, second.left) > 2
      && Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top) > 2
        ? [[firstIndex, secondIndex]]
        : []
    )));
    const selectVisible = (selector) => selector
      ? [...document.querySelectorAll(selector)].filter((node) => node.getBoundingClientRect().width > 0)
      : [];
    const primaryNodes = selectVisible(primary);
    const supportNodes = selectVisible(support);
    const fontSizes = (nodes) => nodes.map((node) => Number.parseFloat(getComputedStyle(node).fontSize)).filter(Number.isFinite);
    const textNodes = [...primaryNodes, ...supportNodes];
    const safeX = slideRect.width * .01;
    const safeY = slideRect.height * .01;
    return {
      slideAspect: slideRect.width / slideRect.height,
      slideInsideViewport: slideRect.left >= -1 && slideRect.top >= -1 && slideRect.right <= innerWidth + 1 && slideRect.bottom <= innerHeight + 1,
      bodyOverflowX: body.scrollWidth - body.clientWidth,
      bodyOverflowY: body.scrollHeight - body.clientHeight,
      boxesInsideBody: boxRects.every((rect) => rect.left >= bodyRect.left - 2 && rect.right <= bodyRect.right + 2 && rect.top >= bodyRect.top - 2 && rect.bottom <= bodyRect.bottom + 2),
      overlaps,
      primaryCount: primaryNodes.length,
      primaryMin: Math.min(...fontSizes(primaryNodes), 999),
      supportMin: supportNodes.length ? Math.min(...fontSizes(supportNodes), 999) : 999,
      textInsideOverscanSafeArea: textNodes.every((node) => {
        const rect = node.getBoundingClientRect();
        return rect.left >= slideRect.left + safeX - 1
          && rect.right <= slideRect.right - safeX + 1
          && rect.top >= slideRect.top + safeY - 1
          && rect.bottom <= slideRect.bottom - safeY + 1;
      }),
    };
  }, { boxes: scenario.boxes, primary: scenario.primary, support: scenario.support });
}

const presentationFormats = [
  { name: "720p", width: 1280, height: 720 },
  { name: "1080p", width: 1920, height: 1080 },
  { name: "4k", width: 3840, height: 2160 },
  { name: "16-10", width: 1920, height: 1200 },
  { name: "projector", width: 1024, height: 768 },
];

const scenarioFilter = String(process.env.PRESENTATION_MATRIX_SCENARIO || "").trim();
const formatFilter = String(process.env.PRESENTATION_MATRIX_FORMAT || "").trim();
const screenshotPath = String(process.env.PRESENTATION_MATRIX_SCREENSHOT || "").trim();

test("all Presentation Mode slide families fit presentation screens and themes", async ({ page, baseURL }) => {
  await mountStyles(page, baseURL);
  const scenarios = createScenarios();
  expect(new Set(scenarios.map((scenario) => scenario.slide.style?.theme).filter(Boolean))).toEqual(
    new Set(presentationThemeOptions.map((theme) => theme.value)),
  );

  for (const meetingType of ["team", "technical"]) {
    const formats = (meetingType === "team" ? presentationFormats : [presentationFormats[0], presentationFormats[3], presentationFormats[4]])
      .filter((format) => !formatFilter || format.name === formatFilter);
    for (const format of formats) {
      await page.setViewportSize({ width: format.width, height: format.height });
      for (const scenario of scenarios.filter((item) => (
        (meetingType === "team" || !item.teamOnly)
        && (!scenarioFilter || item.name === scenarioFilter)
      ))) {
        await page.locator("#matrix-root").evaluate((root, markup) => { root.innerHTML = markup; }, getMarkup(scenario, meetingType, true));
        const result = await inspectLayout(page, scenario);
        const label = `${meetingType}/${scenario.name}/${format.name}`;
        if (screenshotPath && meetingType === "team") await page.screenshot({ path: screenshotPath, fullPage: true });
        expect.soft(result, label).not.toBeNull();
        expect.soft(result.slideAspect, label).toBeGreaterThan(1.76);
        expect.soft(result.slideAspect, label).toBeLessThan(1.79);
        expect.soft(result.slideInsideViewport, label).toBe(true);
        expect.soft(result.bodyOverflowX, label).toBeLessThanOrEqual(2);
        expect.soft(result.bodyOverflowY, label).toBeLessThanOrEqual(2);
        expect.soft(result.boxesInsideBody, label).toBe(true);
        expect.soft(result.overlaps, label).toEqual([]);
        expect.soft(result.primaryCount, label).toBeGreaterThan(0);
        expect.soft(result.primaryMin, label).toBeGreaterThanOrEqual(14);
        expect.soft(result.supportMin, label).toBeGreaterThanOrEqual(12);
        expect.soft(result.textInsideOverscanSafeArea, label).toBe(true);
      }
    }
  }
});

test("all editable slide families remain inside compact edit previews", async ({ page, baseURL }) => {
  await mountStyles(page, baseURL);
  const scenarios = createScenarios().filter((scenario) => !scenario.teamOnly && (!scenarioFilter || scenario.name === scenarioFilter));
  for (const format of [{ name: "desktop-edit", width: 1450, height: 767 }, { name: "compact-edit", width: 877, height: 752 }]
    .filter((item) => !formatFilter || item.name === formatFilter)) {
    await page.setViewportSize({ width: format.width, height: format.height });
    for (const scenario of scenarios) {
      await page.locator("#matrix-root").evaluate((root, markup) => { root.innerHTML = markup; }, getMarkup(scenario, "team", false));
      const result = await inspectLayout(page, scenario);
      const label = `${scenario.name}/${format.name}`;
      if (screenshotPath) await page.screenshot({ path: screenshotPath, fullPage: true });
      expect.soft(result.slideInsideViewport, label).toBe(true);
      expect.soft(result.bodyOverflowX, label).toBeLessThanOrEqual(2);
      if (scenario.name !== "match-squad") expect.soft(result.bodyOverflowY, label).toBeLessThanOrEqual(2);
      expect.soft(result.boxesInsideBody, label).toBe(true);
      expect.soft(result.overlaps, label).toEqual([]);
    }
  }
});

test("presentation typography scales from full HD to 4K", async ({ page, baseURL }) => {
  await mountStyles(page, baseURL);
  const scenarios = createScenarios();

  for (const scenario of scenarios) {
    const sizes = {};
    for (const format of [presentationFormats[1], presentationFormats[2]]) {
      await page.setViewportSize({ width: format.width, height: format.height });
      await page.locator("#matrix-root").evaluate((root, markup) => { root.innerHTML = markup; }, getMarkup(scenario, "team", true));
      sizes[format.name] = await inspectLayout(page, scenario);
    }

    const label = `${scenario.name}/4k-scale`;
    expect.soft(sizes["4k"].primaryMin, `${label}/primary`).toBeGreaterThanOrEqual(sizes["1080p"].primaryMin * 1.6);
    if (sizes["1080p"].supportMin < 999) {
      expect.soft(sizes["4k"].supportMin, `${label}/support`).toBeGreaterThanOrEqual(sizes["1080p"].supportMin * 1.6);
    }
  }
});

test("Starting XI player labels keep readable contrast in every theme", async ({ page, baseURL }) => {
  await mountStyles(page, baseURL);
  await page.setViewportSize({ width: 1280, height: 720 });
  const scenario = createScenarios().find((item) => item.name === "starting-xi");

  for (const theme of presentationThemeOptions) {
    const themedScenario = {
      ...scenario,
      slide: { ...scenario.slide, style: { ...scenario.slide.style, theme: theme.value } },
    };
    await page.locator("#matrix-root").evaluate((root, markup) => { root.innerHTML = markup; }, getMarkup(themedScenario, "team", true));
    const colors = await page.evaluate(() => {
      const label = document.querySelector(".presentation-lineup-slot strong");
      const card = document.querySelector(".presentation-lineup-slot");
      const slide = document.querySelector(".presentation-slide");
      return {
        label: getComputedStyle(label).color,
        card: getComputedStyle(card).backgroundColor,
        slide: getComputedStyle(slide).backgroundColor,
      };
    });
    const labelColor = parseCssColor(colors.label);
    const cardColor = parseCssColor(colors.card);
    const slideColor = parseCssColor(colors.slide);
    expect(labelColor, `${theme.value}/label-color`).not.toBeNull();
    expect(cardColor, `${theme.value}/card-color`).not.toBeNull();
    expect(slideColor, `${theme.value}/slide-color`).not.toBeNull();
    const effectiveCardColor = compositeColor(cardColor, slideColor);
    expect.soft(contrastRatio(labelColor, effectiveCardColor), theme.value).toBeGreaterThanOrEqual(4.5);
  }
});
