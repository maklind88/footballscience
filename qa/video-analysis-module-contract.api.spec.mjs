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
    "src/modules/video-analysis/video-analysis.presentation.css",
    "src/modules/video-analysis/video-analysis.routes.js",
    "src/modules/video-analysis/video-analysis.library-controller.js",
    "src/modules/video-analysis/video-analysis.state.js",
    "src/modules/video-analysis/video-analysis.store.js",
    "src/modules/video-analysis/controllers/drawingController.js",
    "src/modules/video-analysis/controllers/presentationController.js",
    "src/modules/video-analysis/controllers/presenterController.js",
    "src/modules/video-analysis/controllers/thumbnailController.js",
    "api/_lib/video-analysis-library-database.js",
    "src/modules/video-analysis/components/VideoPlayer.js",
    "src/modules/video-analysis/components/VideoLibrary.js",
    "src/modules/video-analysis/components/CodingPanel.js",
    "src/modules/video-analysis/components/Timeline.js",
    "src/modules/video-analysis/components/ClipList.js",
    "src/modules/video-analysis/components/ClipFilters.js",
    "src/modules/video-analysis/components/ClipIntelligence.js",
    "src/modules/video-analysis/components/CodingTemplateBuilder.js",
    "src/modules/video-analysis/components/PresentationModule.js",
    "src/modules/video-analysis/components/PresentationSources.js",
    "src/modules/video-analysis/components/PresentationOutline.js",
    "src/modules/video-analysis/components/SelectedClipInspector.js",
    "src/modules/video-analysis/components/DrawingCanvas.js",
    "src/modules/video-analysis/components/PresenterMode.js",
    "src/modules/video-analysis/components/PlaylistBuilder.js",
    "src/modules/video-analysis/components/PlayerClipDrawer.js",
    "src/modules/video-analysis/services/videoPlaybackService.js",
    "src/modules/video-analysis/services/videoLibraryService.js",
    "src/modules/video-analysis/services/clipInstanceService.js",
    "src/modules/video-analysis/services/codingInteractionService.js",
    "src/modules/video-analysis/services/footballLanguageService.js",
    "src/modules/video-analysis/services/taggingService.js",
    "src/modules/video-analysis/services/playlistService.js",
    "src/modules/video-analysis/services/localVideoBridgeService.js",
    "src/modules/video-analysis/services/localVideoHandleStore.js",
    "src/modules/video-analysis/services/localVideoSessionService.js",
    "src/modules/video-analysis/services/codingTemplateService.js",
    "src/modules/video-analysis/services/presentationService.js",
    "src/modules/video-analysis/services/presentationSmartCollectionService.js",
    "src/modules/video-analysis/services/timelineService.js",
    "src/modules/video-analysis/services/clipIntelligenceService.js",
    "src/modules/video-analysis/services/reviewSessionService.js",
    "src/modules/video-analysis/services/keyboardShortcutService.js",
    "src/modules/video-analysis/repositories/videoRepository.js",
    "src/modules/video-analysis/repositories/clipRepository.js",
    "src/modules/video-analysis/repositories/codingTemplateRepository.js",
    "src/modules/video-analysis/repositories/playlistRepository.js",
    "src/modules/video-analysis/repositories/presentationRepository.js",
    "src/modules/video-analysis/domain/clipInstance.model.js",
    "src/modules/video-analysis/domain/codingSchema.model.js",
    "src/modules/video-analysis/domain/playlist.model.js",
    "src/modules/video-analysis/domain/videoSource.model.js",
    "src/modules/video-analysis/timeline/index.js",
    "src/modules/video-analysis/timeline/timeline.constants.js",
    "src/modules/video-analysis/timeline/timeline.interaction.js",
    "src/modules/video-analysis/timeline/timeline.renderer.js",
    "src/modules/video-analysis/timeline/timeline.selectors.js",
    "src/modules/video-analysis/timeline/timeline.service.js",
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
  expect(read("src/modules/video-analysis/video-analysis.css")).toContain("video-analysis.presentation.css");
  expect(read("src/modules/video-analysis/controllers/drawingController.js")).toContain("createDrawingController");
  expect(read("src/modules/video-analysis/controllers/presentationController.js")).toContain("createPresentationController");
  expect(read("src/modules/video-analysis/controllers/presenterController.js")).toContain("createPresenterController");
  expect(read("src/modules/video-analysis/controllers/thumbnailController.js")).toContain("createThumbnailController");
  expect(read("src/modules/video-analysis/components/VideoLibrary.js")).toContain("data-video-analysis-open-library-item");
  expect(read("src/modules/video-analysis/video-analysis.library-controller.js")).toContain("updateMatchLink");
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
  for (const exportName of ["render", "handleClick", "handleContextMenu", "handleInput", "handleChange", "handleSubmit", "handleKeydown", "handlePointerDown"]) {
    expect(typeof module[exportName], exportName).toBe("function");
  }
});

test("video analysis player tag panel only includes current squad players", async () => {
  const stateModule = await import(pathToFileURL(path.join(moduleDir, "video-analysis.state.js")).href);
  const players = stateModule.normalizeVideoAnalysisPlayers({
    players: [
      { id: "p1", name: "Squad One", number: "1", rosterType: "squad", countsInSquad: true },
      { id: "p2", name: "Training Guest", number: "99", rosterType: "guest", countsInSquad: false },
      { id: "p3", name: "Academy Player", rosterType: "academy" },
      { id: "p4", name: "Trialist Player", playerType: "trialist" },
      { id: "p5", name: "Loan Player", squadType: "loan" },
      { id: "p6", name: "Legacy Guest", counts_in_squad: "false" },
      { id: "p7", name: "Squad Seven", shirtNumber: "7" },
    ],
  });

  expect(players.map((player) => player.id)).toEqual(["p1", "p7"]);
  expect(players.map((player) => player.name)).toEqual(["Squad One", "Squad Seven"]);
  expect(players[1].number).toBe("7");
});

test("video analysis timeline uses unique readable h:mm:ss ticks", async () => {
  const timelineService = await import(pathToFileURL(path.join(moduleDir, "timeline/timeline.service.js")).href);
  const playbackService = await import(pathToFileURL(path.join(moduleDir, "services/videoPlaybackService.js")).href);

  const fiveSecondTicks = timelineService.buildTimelineTicks(5000);
  const fiveSecondLabels = fiveSecondTicks.map((tick) => playbackService.formatVideoTime(tick.ms));
  expect(fiveSecondTicks.map((tick) => tick.ms)).toEqual([0, 1000, 2000, 3000, 4000, 5000]);
  expect(new Set(fiveSecondLabels).size).toBe(fiveSecondLabels.length);

  const unknownDurationLabels = timelineService.buildTimelineTicks(1).map((tick) => playbackService.formatVideoTime(tick.ms));
  expect(unknownDurationLabels).toEqual(["0:00:00"]);

  const matchTicks = timelineService.buildTimelineTicks(7267240);
  const matchLabels = matchTicks.map((tick) => playbackService.formatVideoTime(tick.ms));
  expect(matchTicks[0]).toMatchObject({ ms: 0, left: 0 });
  expect(matchTicks.at(-1)).toMatchObject({ ms: 7267240, left: 100 });
  expect(matchLabels).toContain("2:01:07");
  expect(matchLabels).toContain("0:15:00");
  expect(new Set(matchLabels).size).toBe(matchLabels.length);
});

test("video analysis timeline indexes 500 clips for dense workstations", async () => {
  const timelineService = await import(pathToFileURL(path.join(moduleDir, "timeline/timeline.service.js")).href);
  const phases = ["In Possession", "Out of Possession", "Offensive Transition", "Defensive Transition", "Set Pieces"];
  const clips = Array.from({ length: 500 }, (_, index) => ({
    id: `clip-${index + 1}`,
    startMs: index * 14000,
    endMs: index * 14000 + 15000,
    phase: phases[index % phases.length],
    outcome: index % 3 === 0 ? "Positive" : index % 3 === 1 ? "Development" : "Neutral",
  }));

  const index = timelineService.buildTimelineIndex(clips, "phase");
  const density = timelineService.getTimelineDensity(index, 7267240);

  expect(index.clipCount).toBe(500);
  expect(index.laneCount).toBe(5);
  expect(index.maxClipsInLane).toBe(100);
  expect(index.clipsById.get("clip-250").startMs).toBe(3486000);
  expect(index.clipIdsByLane.get("In Possession")).toHaveLength(100);
  expect(index.lanes[0]).toMatchObject({ label: "In Possession", clipCount: 100 });
  expect(density).toMatchObject({ isDense: true, clipCount: 500, laneCount: 5, maxClipsInLane: 100 });
});

test("video player transport time follows timeline duration and live video time updates", async () => {
  const player = await import(pathToFileURL(path.join(moduleDir, "components/VideoPlayer.js")).href);
  const timelineInteraction = read("src/modules/video-analysis/timeline/timeline.interaction.js");
  const html = player.renderVideoPlayer({
    videoRef: { objectUrl: "blob:match-video", durationMs: 0, displayName: "Match #11" },
    timeline: { playheadMs: 39000 },
    clips: [],
    allClips: [
      { id: "clip-1", startMs: 0, endMs: 3357000 },
    ],
  });

  expect(html).toContain("data-video-analysis-player-current-time");
  expect(html).toContain("data-video-analysis-player-duration-time");
  expect(html).toContain("data-video-analysis-player-meta-duration");
  expect(html).toContain("data-video-analysis-play-label");
  expect(html).toContain("data-video-analysis-play-icon");
  expect(html).toContain("video-analysis-player-nudge__glyph");
  expect(html).toContain("video-analysis-player-nudge__amount");
  expect(html).not.toContain("<strong>5s</strong>");
  expect(html).not.toContain(">+5<");
  expect(html).not.toContain(">-5<");
  expect(html).toContain("0:00:39");
  expect(html).toContain("/ 0:55:57");
  expect(timelineInteraction).toContain("data-video-analysis-player-current-time");
  expect(timelineInteraction).toContain("data-video-analysis-player-duration-time");
});

test("video analysis workstation keeps controls out of the video player", () => {
  const shell = read("src/modules/video-analysis/index.js");
  const templateBuilder = read("src/modules/video-analysis/components/CodingTemplateBuilder.js");
  const panelBuilderOverlay = read("src/modules/video-analysis/components/PanelBuilderOverlay.js");
  const codingTemplateService = read("src/modules/video-analysis/services/codingTemplateService.js");
  const codingTemplateLayoutService = read("src/modules/video-analysis/services/codingTemplateLayoutService.js");
  const timelineInteraction = read("src/modules/video-analysis/timeline/timeline.interaction.js");
  const timelineWrapper = read("src/modules/video-analysis/components/Timeline.js");
  const timeline = read("src/modules/video-analysis/timeline/timeline.renderer.js");
  const intelligence = read("src/modules/video-analysis/components/ClipIntelligence.js");
  expect(shell).not.toContain("renderCodingPanel");
  expect(templateBuilder).toContain("data-video-analysis-code-button");
  expect(templateBuilder).toContain("data-video-analysis-panel-mode");
  expect(templateBuilder).toContain("renderPanelBuilderOverlay");
  expect(templateBuilder).toContain("data-video-analysis-player-tag");
  expect(templateBuilder).not.toContain("data-video-analysis-descriptor-button");
  expect(panelBuilderOverlay).toContain("data-video-analysis-save-template");
  expect(panelBuilderOverlay).toContain("data-video-analysis-template-field");
  expect(panelBuilderOverlay).toContain("data-video-analysis-template-builder-field");
  expect(panelBuilderOverlay).toContain("data-video-analysis-add-button-group");
  expect(panelBuilderOverlay).toContain("data-video-analysis-add-code-button");
  expect(panelBuilderOverlay).toContain("data-video-analysis-duplicate-code-button");
  expect(panelBuilderOverlay).toContain("data-video-analysis-remove-code-button");
  expect(panelBuilderOverlay).toContain("data-video-analysis-template-drag-group");
  expect(panelBuilderOverlay).toContain("data-video-analysis-template-drag-button");
  expect(panelBuilderOverlay).toContain("data-video-analysis-template-move-group");
  expect(panelBuilderOverlay).toContain("data-video-analysis-template-move-button");
  expect(panelBuilderOverlay).toContain("data-video-analysis-button-color-preset");
  expect(panelBuilderOverlay).toContain("data-video-analysis-button-ms-field");
  expect(panelBuilderOverlay).toContain("targetFieldOptions");
  expect(panelBuilderOverlay).toContain("Lead sec");
  expect(panelBuilderOverlay).toContain("End after click");
  expect(panelBuilderOverlay).toContain("Unsaved changes");
  expect(panelBuilderOverlay).toContain("Saving...");
  expect(panelBuilderOverlay).toContain("Preview");
  expect(codingTemplateService).toContain("buildCodingButtonAction");
  expect(codingTemplateService).toContain("addCodingButtonToTemplate");
  expect(codingTemplateService).toContain("duplicateCodingButtonInTemplate");
  expect(codingTemplateService).toContain("removeCodingButtonFromTemplate");
  expect(codingTemplateService).toContain("updateCodingButtonField");
  expect(codingTemplateService).toContain('defaultButtonBehavior = "create_tag"');
  expect(codingTemplateService).toContain("defaultClipDurationMs = 15000");
  expect(codingTemplateService).toContain("activeButtonDatabaseId");
  expect(codingTemplateLayoutService).toContain("groupCodingTemplateButtons");
  expect(codingTemplateLayoutService).toContain("moveCodingTemplateGroup");
  expect(codingTemplateLayoutService).toContain("moveCodingButtonInTemplate");
  expect(codingTemplateLayoutService).toContain("templateHotkeyIssues");
  expect(codingTemplateLayoutService).toContain("reservedCodingHotkeys");
  expect(timelineWrapper).toContain("../timeline/index.js");
  expect(timeline).toContain("data-video-analysis-timeline-module");
  expect(timeline).toContain("data-video-analysis-timeline-lane");
  expect(timeline).toContain("buildTemplateButtonLookup");
  expect(timeline).toContain("buildTimelineIndex");
  expect(timeline).toContain("data-video-analysis-timeline-density");
  expect(timeline).toContain("data-video-analysis-timeline-scrub");
  expect(timeline).toContain("data-video-analysis-timeline-scrub-surface");
  expect(timeline).toContain("data-video-analysis-timeline-scrub-time");
  expect(timeline).not.toContain("data-video-analysis-timeline-trim-edge");
  expect(timeline).toContain("data-video-analysis-timeline-category-step");
  expect(timeline).toContain("data-video-analysis-timeline-category-add-selected");
  expect(timeline).toContain("video-analysis-timeline-category-menu");
  expect(shell).toContain("contextmenu: handleContextMenu");
  expect(timeline).not.toContain('role="slider"');
  expect(timeline).not.toContain("video-analysis-timeline-header");
  expect(timeline).not.toContain("video-analysis-timeline-summary");
  expect(timeline).toContain("data-video-analysis-timeline-track");
  expect(timelineInteraction).toContain("createTimelineScrubController");
  expect(timelineInteraction).toContain("pointermove");
  expect(timelineInteraction).toContain("requestAnimationFrame");
  expect(timelineInteraction).toContain("lockScrollPosition");
  expect(timelineInteraction).toContain("syncScrubTimes");
  expect(timelineInteraction).not.toContain("onClipTrimCommit");
  expect(timelineInteraction).not.toContain("is-trimming");
  expect(timeline).toContain("video-analysis-clip-block");
  expect(timeline).not.toContain("data-video-analysis-zoom");
  expect(timeline).not.toContain("video-analysis-timeline-controls");
  expect(timeline).toContain('function renderLaneSelector(activeLaneMode = "phase", totalMs = 1, clipCount = 0)');
  expect(timeline).toContain("${renderTimelineStatus(totalMs, clipCount)}");
  expect(timeline).toContain("${renderLaneSelector(laneMode, totalMs, density.clipCount)}");
  expect(timeline).toContain("${renderLaneSelector(laneMode, totalMs, density.clipCount)}\n            ${renderTimelineRuler(ticks, totalMs)}");
  expect(timeline).not.toContain("${renderLaneSelector(laneMode)}\n            ${renderTimelineStatus(totalMs, density.clipCount)}");
  expect(timeline).not.toContain("</div>\n          ${renderTimelineRuler(ticks, totalMs)}");
  const timelineStyles = read("src/modules/video-analysis/video-analysis.css");
  expect(timelineStyles).toContain(".video-analysis-timeline-view-select .video-analysis-timeline-status");
  expect(timelineStyles).toContain(".video-analysis-timeline-toolbar .video-analysis-timeline-ruler");
  expect(timelineStyles).toContain("text-transform: none");
  expect(read("src/modules/video-analysis/timeline/timeline.constants.js")).toContain('id: "tags"');
  expect(intelligence).toContain("Phase x Outcome");
  expect(intelligence).toContain("Principle x Player");
  expect(intelligence).toContain("Principle x Unit");
});

test("coding tag panel creates 15 second button-owned clip actions", async () => {
  const service = await import(pathToFileURL(path.join(moduleDir, "services/codingTemplateService.js")).href);
  const template = service.createDefaultCodingTemplate();
  const button = template.buttons.find((item) => item.value === "Build Up");
  const action = service.buildCodingButtonAction({
    template,
    draft: {
      startMs: 0,
      endMs: 15000,
      phase: "In Possession",
      subPhase: "Build Up",
      teamPrincipleId: "secure-first-pass",
      miniGamePrincipleId: "third-player",
      outcome: "Neutral",
    },
    codingSession: { mode: template.defaultMode, defaultClipDurationMs: template.defaultClipDurationMs },
  }, button, 831000);

  expect(template.defaultMode).toBe("instant");
  expect(button.buttonBehavior).toBe("create_tag");
  expect(button.defaultDurationMs).toBe(15000);
  expect(button.targetField).toBe("subPhase");
  expect(button.databaseId).toBe("");
  const defaultGroups = service.groupCodingTemplateButtons(template);
  expect(defaultGroups.map((group) => group.label)).toEqual(["Phase", "Sub-phase", "Outcome"]);
  expect(defaultGroups.map((group) => group.sortOrder)).toEqual([0, 1, 2]);
  expect(defaultGroups[1].buttons.map((item) => item.sortOrder).slice(0, 3)).toEqual([0, 1, 2]);
  expect(action.shouldCreateClip).toBe(true);
  expect(action.nextDraft.startMs).toBe(831000);
  expect(action.nextDraft.endMs).toBe(846000);
  expect(action.nextDraft.miniGamePrincipleId).toBe("third-player");
  expect(action.nextDraft.miniGamePrincipleIds || []).toEqual([]);
  expect(action.nextSession.mode).toBe("instant");
});

test("sub-phase buttons own phase assignment for coaching language", async () => {
  const templateService = await import(pathToFileURL(path.join(moduleDir, "services/codingTemplateService.js")).href);
  const clipService = await import(pathToFileURL(path.join(moduleDir, "services/clipInstanceService.js")).href);
  const languageService = await import(pathToFileURL(path.join(moduleDir, "services/footballLanguageService.js")).href);
  const templateBuilder = await import(pathToFileURL(path.join(moduleDir, "components/CodingTemplateBuilder.js")).href);
  const template = templateService.createDefaultCodingTemplate();
  const buttonByValue = (value) => template.buttons.find((item) => item.value === value);
  const actionFor = (value) => templateService.buildCodingButtonAction({
    template,
    draft: {
      startMs: 0,
      endMs: 15000,
      phase: "Out of Possession",
      subPhase: "High Press",
      outcome: "Neutral",
    },
    codingSession: { mode: template.defaultMode, defaultClipDurationMs: template.defaultClipDurationMs },
  }, buttonByValue(value), 10000);

  expect(languageService.phaseForSubPhase("Build Up With GK")).toBe("In Possession");
  expect(actionFor("Build With GK").nextDraft.phase).toBe("In Possession");
  expect(actionFor("Build Up").nextDraft.phase).toBe("In Possession");
  expect(actionFor("High Press").nextDraft.phase).toBe("Out of Possession");
  expect(actionFor("Offensive Set Pieces").nextDraft.phase).toBe("Set Pieces");
  expect(templateService.findButtonByHotkey(template, "1")).toBeNull();

  const payload = clipService.buildClipPayload({
    match: { id: "match-1" },
    video: { id: "video-1" },
    template,
    players: [],
    codingSession: { mode: "instant" },
    draft: {
      startMs: 20000,
      endMs: 35000,
      phase: "Out of Possession",
      subPhase: "Build Up",
      outcome: "Neutral",
    },
  });
  expect(payload).toMatchObject({ phase: "In Possession", subPhase: "Build Up" });
  expect(clipService.applyCodingButtonToClip({ id: "clip-1", phase: "In Possession" }, buttonByValue("Box Defending"))).toMatchObject({
    phase: "Out of Possession",
    subPhase: "Box Defending",
  });

  const panelHtml = templateBuilder.renderCodingTemplateBuilder({
    template,
    codingSession: { panelMode: "use" },
    draft: { subPhase: "Build Up" },
    players: [],
  });
  expect(panelHtml).not.toContain('data-video-analysis-code-group="Phase"');
  expect(panelHtml).not.toContain('data-video-analysis-code-button="phase-');
});

test("dependent tag actions only target clips under the current playhead", async () => {
  const service = await import(pathToFileURL(path.join(moduleDir, "services/codingInteractionService.js")).href);
  const state = {
    selectedClipId: "old-selected",
    codingSession: { lastClipId: "old-last" },
    timeline: { playheadMs: 10500, selectedCategory: { activeClipId: "old-category" } },
    clips: [
      { id: "old-selected", startMs: 1000, endMs: 3000, subPhase: "Build Up" },
      { id: "old-category", startMs: 3500, endMs: 4500, subPhase: "High Press" },
      { id: "old-last", startMs: 5000, endMs: 6500, subPhase: "Finishing Phase" },
      { id: "current", startMs: 10000, endMs: 16000, subPhase: "Creating Phase" },
    ],
  };

  expect(service.resolveCodingTargetClip(state, 10500)?.id).toBe("current");
  expect(service.resolveCurrentCodingTargetClip(state)?.id).toBe("current");
  expect(service.resolveCodingTargetClip(state, 50000)).toBeNull();
});

test("dependent tag actions keep an explicit selection only while the playhead is inside it", async () => {
  const service = await import(pathToFileURL(path.join(moduleDir, "services/codingInteractionService.js")).href);
  const state = {
    selectedClipId: "selected",
    codingSession: { lastClipId: "shorter-overlap" },
    clips: [
      { id: "selected", startMs: 10000, endMs: 30000 },
      { id: "shorter-overlap", startMs: 12000, endMs: 18000 },
      { id: "next", startMs: 40000, endMs: 55000 },
    ],
  };

  expect(service.resolveCodingTargetClip(state, 15000)?.id).toBe("selected");
  expect(service.resolveCodingTargetClip(state, 42000)?.id).toBe("next");
});

test("coding tag panel builder creates custom timeline tag buttons", async () => {
  const service = await import(pathToFileURL(path.join(moduleDir, "services/codingTemplateService.js")).href);
  const template = service.createDefaultCodingTemplate();
  const withGroup = service.addCodingButtonGroupToTemplate(template, "Pressing Triggers");
  const customButton = withGroup.buttons.find((item) => item.group === "Pressing Triggers");
  const initialGroupOrder = service.groupCodingTemplateButtons(withGroup).map((group) => group.label);

  expect(customButton).toMatchObject({
    buttonType: "custom",
    targetField: "tags",
    buttonBehavior: "create_tag",
    createsClip: true,
    defaultDurationMs: 15000,
    startOffsetMs: 0,
    endOffsetMs: 15000,
  });
  expect(initialGroupOrder.at(-1)).toBe("Pressing Triggers");

  const movedGroup = service.moveCodingGroupByStep(withGroup, "Pressing Triggers", -1);
  const movedGroups = service.groupCodingTemplateButtons(movedGroup);
  const movedGroupOrder = movedGroups.map((group) => group.label);
  const pressingGroupIndex = movedGroupOrder.indexOf("Pressing Triggers");
  expect(pressingGroupIndex).toBe(initialGroupOrder.indexOf("Pressing Triggers") - 1);
  expect(movedGroups[pressingGroupIndex].buttons.every((item) => item.groupSortOrder === pressingGroupIndex)).toBe(true);

  const renamed = service.updateCodingButtonField(withGroup, customButton.id, "label", "Jump press");
  const renamedButton = renamed.buttons.find((item) => item.id === customButton.id);
  expect(renamedButton.label).toBe("Jump press");
  expect(renamedButton.value).toBe("Jump press");

  const conflictingHotkey = service.updateCodingButtonField(renamed, customButton.id, "hotkey", "1");
  expect(service.templateHotkeyIssues(conflictingHotkey, customButton.id).map((issue) => issue.type)).toContain("duplicate");

  const colored = service.updateCodingButtonField(renamed, customButton.id, "color", "#d92d20");
  const withLead = service.updateCodingButtonMsField(colored, customButton.id, "startOffsetMs", 2, "lead");
  const shorter = service.updateCodingButtonMsField(withLead, customButton.id, "endOffsetMs", 10);
  const action = service.buildCodingButtonAction({
    template: shorter,
    draft: {
      startMs: 0,
      endMs: 15000,
      phase: "In Possession",
      subPhase: "Build Up",
      teamPrincipleId: "secure-first-pass",
      miniGamePrincipleId: "third-player",
      outcome: "Neutral",
      tags: "",
    },
    codingSession: { mode: "instant", defaultClipDurationMs: 15000 },
  }, service.findTemplateButton(shorter, customButton.id), 12000);

  expect(action.shouldCreateClip).toBe(true);
  expect(action.nextDraft.tags).toBe("Jump press");
  expect(action.nextDraft.startMs).toBe(10000);
  expect(action.nextDraft.endMs).toBe(22000);
  expect(action.nextSession.preRollMs).toBe(2000);
  expect(action.nextSession.postRollMs).toBe(10000);

  const duplicated = service.duplicateCodingButtonInTemplate(shorter, customButton.id);
  expect(duplicated.buttons).toHaveLength(shorter.buttons.length + 1);
  expect(duplicated.buttons.at(-1).databaseId).toBe("");
  expect(duplicated.buttons.at(-1).hotkey).toBe("");
  const movedButton = service.moveCodingButtonByStep(duplicated, duplicated.buttons.at(-1).id, -1);
  const pressingButtons = service.groupCodingTemplateButtons(movedButton).find((group) => group.label === "Pressing Triggers").buttons;
  expect(pressingButtons[0].id).toBe(duplicated.buttons.at(-1).id);

  const removed = service.removeCodingButtonFromTemplate(duplicated, customButton.id);
  expect(removed.buttons.some((item) => item.id === customButton.id)).toBe(false);
});

test("coding template API preserves panel builder group and button ordering metadata", async () => {
  const service = await import(pathToFileURL(path.join(moduleDir, "services/codingTemplateService.js")).href);
  const apiModule = await import(pathToFileURL(path.join(rootDir, "api/_lib/video-analysis-coding-template-database.js")).href);
  const normalize = apiModule.normalizeCodingTemplatePayload || apiModule.default?.normalizeCodingTemplatePayload;
  const template = service.moveCodingGroupByStep(
    service.addCodingButtonGroupToTemplate(service.createDefaultCodingTemplate(), "Pressing Triggers"),
    "Pressing Triggers",
    -1
  );
  const pressingButton = template.buttons.find((item) => item.group === "Pressing Triggers");
  const pressingGroup = service.groupCodingTemplateButtons(template).find((group) => group.label === "Pressing Triggers");
  const payload = normalize(template, { id: "coach-1", clubId: "club-ncc", teamId: "team-ncc-first" });
  const savedPressingButton = payload.buttons.find((item) => item.clientId === pressingButton.id);

  expect(typeof normalize).toBe("function");
  expect(savedPressingButton.group).toBe("Pressing Triggers");
  expect(savedPressingButton.groupSortOrder).toBe(pressingGroup.sortOrder);
  expect(savedPressingButton.sortOrder).toBe(0);
  expect(payload.buttons.filter((item) => item.group === "Sub-phase").map((item) => item.sortOrder).slice(0, 3)).toEqual([0, 1, 2]);
});

test("coding template persistence stays behind repositories and API actions", () => {
  const repository = read("src/modules/video-analysis/repositories/codingTemplateRepository.js");
  const clipRepository = read("src/modules/video-analysis/repositories/clipRepository.js");
  const shell = read("src/modules/video-analysis/index.js");
  const api = read("api/_lib/video-analysis-database.js");
  const templateApi = read("api/_lib/video-analysis-coding-template-database.js");

  expect(repository).toContain("coding-templates");
  expect(repository).toContain("save-coding-template");
  expect(repository).toContain("buildVideoAnalysisApiUrl");
  expect(shell).toContain("createCodingTemplateRepository");
  expect(shell).toContain("loadCodingTemplates");
  expect(shell).toContain("saveCodingTemplate");
  expect(api).toContain("listCodingTemplates");
  expect(api).toContain("saveCodingTemplate");
  expect(clipRepository).toContain("trim-clip");
  expect(clipRepository).toContain("share-clip");
  expect(clipRepository).toContain("archive-clips");
  expect(api).toContain("trimClip");
  expect(api).toContain("shareClip");
  expect(api).toContain("archiveClips");
  expect(api).toContain('action === "trim-clip"');
  expect(api).toContain('action === "share-clip"');
  expect(api).toContain('action === "archive-clips"');
  expect(api).toContain("clipSourceMetadata");
  expect(api).toContain("match_title");
  expect(api).toContain("video_title");
  expect(templateApi).toContain("normalizeCodingTemplatePayload");
  expect(templateApi).toContain("rejectForbiddenPayload(payload)");
  expect(templateApi).toContain("video_coding_templates");
  expect(templateApi).toContain("video_coding_buttons");
  expect(templateApi).toContain("groupSortOrder");
  expect(templateApi).toContain("isMissingColumn");
  expect(templateApi).toContain("omitColumns(row, TEMPLATE_BEHAVIOR_COLUMNS)");
  expect(templateApi).toContain("writeCodingButtonRow");
  expect(templateApi).toContain("defaultClipDurationMs: template.defaultClipDurationMs");
  expect(templateApi).toContain("defaultDurationMs: button.defaultDurationMs");
  expect(api).not.toMatch(/\b(video_path|local_path|file_path|storage_bucket|bucket_id|base64|bytea)\b/i);
  expect(templateApi).not.toMatch(/\b(video_path|local_path|file_path|storage_bucket|bucket_id|base64|bytea)\b/i);
});

test("analysis room tabs use icons without status labels", () => {
  const source = read("src/modules/video-analysis/index.js");
  const presentation = read("src/modules/video-analysis/components/PresentationModule.js");
  const clipLibrary = read("src/modules/video-analysis/components/ClipLibrary.js");
  const clipLibraryPreview = read("src/modules/video-analysis/components/ClipLibraryPreview.js");
  const miniGamePicker = read("src/modules/video-analysis/components/MiniGamePrinciplePicker.js");
  const miniGamePrinciples = read("src/modules/video-analysis/constants/miniGamePrinciples.js");
  const clipLibraryService = read("src/modules/video-analysis/services/clipLibraryService.js");
  const presentationSources = read("src/modules/video-analysis/components/PresentationSources.js");
  const presentationOutline = read("src/modules/video-analysis/components/PresentationOutline.js");
  const selectedClip = read("src/modules/video-analysis/components/SelectedClipInspector.js");
  const drawing = read("src/modules/video-analysis/components/DrawingCanvas.js");
  const presenter = read("src/modules/video-analysis/components/PresenterMode.js");
  const presentationRepository = read("src/modules/video-analysis/repositories/presentationRepository.js");
  const presentationService = read("src/modules/video-analysis/services/presentationService.js");
  expect(source).toContain("analysis-room-tab-icon");
  expect(source).toContain("FS Player");
  expect(source).toContain("Team Performance");
  expect(source).toContain("TEAM_PERFORMANCE_DASHBOARD_URL");
  expect(source).toContain("https://ncskunk-harris.github.io/Team_Match_Performance_Dashboard/");
  expect(source).toContain('sandbox="allow-scripts allow-modals allow-same-origin"');
  expect(source).toContain('referrerpolicy="no-referrer"');
  expect(source).toContain("Presentation");
  expect(source).toContain("Clip Library");
  expect(source).toContain("renderClipLibrary");
  expect(source).toContain("clipMatchesLibraryGroup");
  expect(source).not.toContain("Briefs");
  expect(source).not.toContain("renderPlaylistBuilder");
  expect(clipLibrary).toContain("data-video-analysis-clip-library");
  expect(clipLibrary).toContain("data-video-analysis-clip-library-group");
  expect(clipLibrary).toContain("data-video-analysis-clip-library-add-group");
  expect(clipLibrary).toContain("data-video-analysis-clip-library-play");
  expect(clipLibrary).toContain("data-video-analysis-clip-library-select");
  expect(clipLibrary).toContain("data-video-analysis-clip-library-play-selected");
  expect(clipLibraryPreview).toContain("data-video-analysis-clip-library-preview");
  expect(clipLibraryPreview).toContain("data-video-analysis-clip-library-video");
  expect(source).toContain("setupClipLibraryPreview");
  expect(clipLibraryService).toContain("buildClipLibraryGroups");
  expect(clipLibraryService).toContain("buildClipLibraryClipOrder");
  expect(clipLibraryService).toContain("clipMatchesLibraryGroup");
  expect(miniGamePrinciples).toContain("hiddenMiniGamePrinciplePickerGroupIds");
  expect(miniGamePicker).toContain("miniGamePrinciplePickerGroups");
  expect(miniGamePicker).toContain("data-video-analysis-mg-principle-search");
  expect(miniGamePicker).toContain("MG Principles");
  expect(miniGamePicker).toContain("Suggested for");
  expect(miniGamePicker).not.toContain("Clip principles");
  expect(miniGamePicker).not.toContain("Stored as suggestions");
  expect(miniGamePicker).not.toContain("miniGamePrincipleGroups.map");
  expect(presentation).toContain("data-video-analysis-presentation-module");
  expect(presentation).toContain("renderPresentationSources");
  expect(presentation).toContain("renderPresentationOutline");
  expect(presentation).toContain("renderSelectedClipInspector");
  expect(presentation).toContain("renderDrawingCanvas");
  expect(presentation).toContain("renderPresenterMode");
  expect(presentationSources).toContain("data-video-analysis-presentation-filter");
  expect(presentationSources).toContain("data-video-analysis-smart-save");
  expect(presentationOutline).toContain("data-video-analysis-presentation-drag-item");
  expect(presentationOutline).toContain("data-video-analysis-presentation-drop-section");
  expect(selectedClip).toContain("data-video-analysis-presentation-item-note");
  expect(drawing).toContain("data-video-analysis-drawing-add");
  expect(drawing).toContain("data-video-analysis-drawing-save");
  expect(presenter).toContain("data-video-analysis-presenter-next");
  expect(presenter).toContain("data-video-analysis-presenter-fullscreen");
  expect(presentationRepository).toContain("save-presentation");
  expect(presentationRepository).toContain("save-drawing-layer");
  expect(presentationService).toContain("buildPresentationPayload");
  expect(presentationService).toContain("movePresentationItemToSection");
  expect(source).not.toContain('state: "Room"');
  expect(source).not.toContain('state: "Active"');
  expect(source).not.toContain('state: "Next"');
});

test("local video architecture remains browser-first with bridge fallback only", () => {
  const handleStore = read("src/modules/video-analysis/services/localVideoHandleStore.js");
  const sessionService = read("src/modules/video-analysis/services/localVideoSessionService.js");
  const player = read("src/modules/video-analysis/components/VideoPlayer.js");

  expect(handleStore).toContain("showOpenFilePicker");
  expect(handleStore).toContain("indexedDB.open");
  expect(handleStore).toContain("userId");
  expect(sessionService).toContain("userId");
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

test("production CSP allows only the narrow local video bridge and Team Performance endpoints", () => {
  const vercel = JSON.parse(read("vercel.json"));
  const csp = vercel.headers
    .flatMap((entry) => entry.headers || [])
    .find((header) => header.key === "Content-Security-Policy")?.value || "";
  expect(csp).toContain("http://127.0.0.1:47831");
  expect(csp).toContain("http://localhost:47831");
  expect(csp).toContain("media-src 'self' blob: http://127.0.0.1:47831 http://localhost:47831");
  expect(csp).toContain("frame-src 'self' https://ncskunk-harris.github.io");
  expect(csp).not.toMatch(/http:\/\/localhost:\*/);
  expect(csp).not.toMatch(/http:\/\/127\.0\.0\.1:\*/);
  expect(csp).not.toMatch(/frame-src[^;]*\*/);
});
