import { defaultMiniGamePrincipleId } from "./constants/miniGamePrinciples.js";
import { defaultVideoAnalysisOutcome } from "./constants/outcomes.js";
import { defaultVideoAnalysisPhase } from "./constants/phases.js";
import { defaultVideoAnalysisSubPhase } from "./constants/subPhases.js";
import { createDefaultCodingTemplate } from "./services/codingTemplateService.js";
import { createInitialPresentationWorkspace } from "./services/presentationService.js";
import { createReviewSections } from "./services/reviewSessionService.js";

const nonSquadRosterTypes = new Set([
  "academy",
  "external",
  "guest",
  "guestplayer",
  "guest-player",
  "inactive",
  "inactive-guest",
  "loan",
  "temp",
  "temporary",
  "training-guest",
  "trainingguest",
  "trial",
  "trialist",
]);

function normalizeRosterType(value = "") {
  return String(value || "").trim().toLowerCase().replace(/[_\s]+/g, "-");
}

function isFalseLike(value) {
  if (value === false || value === 0) return true;
  const text = String(value ?? "").trim().toLowerCase();
  return text === "false" || text === "0" || text === "no";
}

export function isVideoAnalysisSquadPlayer(player = {}) {
  if (isFalseLike(player.countsInSquad ?? player.counts_in_squad)) return false;
  const rosterType = normalizeRosterType(player.rosterType || player.roster_type || player.playerType || player.player_type || player.squadType || player.squad_type);
  if (rosterType && nonSquadRosterTypes.has(rosterType)) return false;
  return true;
}

function normalizePlayer(player = {}) {
  const id = String(player.id || player.playerId || player.player_id || "").trim();
  const name = String(player.name || player.playerName || player.player_label || "").trim();
  if (!id || !name) return null;
  return {
    id,
    name,
    number: String(player.number || player.shirtNumber || player.shirt_number || ""),
    position: String(player.position || player.primaryRole || player.role || ""),
  };
}

export function normalizeVideoAnalysisPlayers(state = {}) {
  const players = Array.isArray(state.players) ? state.players : [];
  return players.filter(isVideoAnalysisSquadPlayer).map(normalizePlayer).filter(Boolean);
}

export function createInitialVideoAnalysisState(context = {}) {
  const template = createDefaultCodingTemplate();
  const win = context.win || globalThis.window;
  const initialState = {
    status: "idle",
    view: "library",
    activeAnalysisRoomTab: "fs-player",
    canEdit: Boolean(context.canEdit?.()),
    players: normalizeVideoAnalysisPlayers(context.getPlayerProfilesState?.()),
    videoRef: null,
    playbackPreparation: {
      active: false,
      token: "",
    },
    localFileStatus: "none",
    localFileMessage: "No video linked",
    localFileHandleIdentity: null,
    fileSystemAccessSupported: typeof win?.showOpenFilePicker === "function",
    nativePlaybackReady: false,
    bridgeFallbackRecommended: false,
    match: null,
    video: null,
    source: null,
    pendingScheduleLink: null,
    library: {
      status: "idle",
      matches: [],
      scheduleCandidates: [],
      filters: {
        search: "",
        date: "",
        type: "all",
      },
      savingLinkId: "",
      error: "",
    },
    clips: [],
    savedSearches: [],
    selectedClipId: "",
    clipLibrary: {
      groupBy: "subPhase",
      selectedClipIds: [],
      previewClipId: "",
      previewQueueIds: [],
      previewActiveIndex: 0,
    },
    template,
    codingSession: {
      mode: template.defaultMode,
      panelMode: "use",
      defaultClipDurationMs: template.defaultClipDurationMs,
      preRollMs: template.preRollMs,
      postRollMs: template.postRollMs,
      activeButtonId: "",
      manualInMs: null,
      openTag: null,
      lastTaggedAtMs: null,
      lastTaggedRangeMs: null,
      templateDirty: false,
      miniGamePrinciplePickerOpen: false,
      miniGamePrincipleDraftIds: [],
      miniGamePrincipleSearch: "",
    },
    timeline: {
      zoom: 1,
      laneMode: "subPhase",
      playheadMs: 0,
      tagFilterOpen: false,
      selectedCategory: {
        laneMode: "",
        label: "",
        viewOpen: false,
      },
    },
    fsPlayer: {
      mode: "standard",
    },
    matrix: {
      mode: "phase-outcome",
      selectedRow: "",
      selectedColumn: "",
    },
    filters: {
      search: "",
      phase: "",
      subPhase: "",
      playerId: "",
      ownerId: "",
      tag: "",
      principleId: "",
      miniGamePrincipleId: "",
      outcome: "",
      unit: "",
      descriptorValue: "",
    },
    draft: {
      startMs: 0,
      endMs: 5000,
      period: "1",
      phase: defaultVideoAnalysisPhase,
      subPhase: defaultVideoAnalysisSubPhase,
      teamPrincipleId: "",
      miniGamePrincipleId: defaultMiniGamePrincipleId,
      miniGamePrincipleIds: [],
      outcome: defaultVideoAnalysisOutcome,
      playerId: "",
      playerRole: "primary",
      unit: "",
      pitchZone: "",
      pressure: "",
      decision: "",
      execution: "",
      tags: "",
      visibility: "private",
      note: "",
    },
    reviewList: [],
    reviewTitle: "Football Science Review",
    presentationMode: "build",
    presentationDrawingTool: "arrow",
    presentation: createInitialPresentationWorkspace(),
    activeReviewSectionId: "team-meeting",
    reviewSections: createReviewSections(),
    message: "",
    error: "",
  };
  return {
    ...initialState,
    ...(context.videoAnalysisInitialState || context.initialVideoAnalysisState || {}),
  };
}
