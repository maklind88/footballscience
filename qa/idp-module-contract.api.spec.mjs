import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildIdpDashboardFromSquadState, buildLegacyPlayerDetail } from "../src/modules/idp/idp-adapter.mjs";
import { createIdpActions } from "../src/modules/idp/idp-actions.mjs";
import { renderIdpWorkspace } from "../src/modules/idp/idp-renderer.mjs";
import { createIdpStore } from "../src/modules/idp/idp-state.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleDir = path.join(rootDir, "src/modules/idp");

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

test("idp module keeps the required isolated file structure", () => {
  for (const relativePath of [
    "src/modules/idp/index.mjs",
    "src/modules/idp/idp-actions.mjs",
    "src/modules/idp/idp-adapter.mjs",
    "src/modules/idp/idp-clip-bank-renderer.mjs",
    "src/modules/idp/idp-clip-preview-controller.mjs",
    "src/modules/idp/idp-renderer.mjs",
    "src/modules/idp/idp-state.mjs",
    "src/modules/idp/idp.css",
    "src/modules/idp/idp-clip-bank.css",
    "src/modules/idp/idp-profile-focus.css",
    "src/modules/idp/constants/idp-options.mjs",
    "src/modules/idp/domain/idp.models.mjs",
    "src/modules/idp/services/idp-api-service.mjs",
  ]) {
    expect(fs.existsSync(path.join(rootDir, relativePath)), relativePath).toBe(true);
  }
});

test("idp UI modules avoid direct database access and use only the API service for network calls", () => {
  for (const file of fs.readdirSync(moduleDir).filter((entry) => entry.endsWith(".mjs"))) {
    const source = read(`src/modules/idp/${file}`);
    expect(source, file).not.toMatch(/supabase|service_role|SUPABASE|from\(["'`]/i);
    if (file !== "idp-actions.mjs") {
      expect(source, file).not.toMatch(/fetch\(/);
    }
  }

  expect(read("src/modules/idp/services/idp-api-service.mjs")).toContain("/api/idp");
  expect(read("api/idp.js")).toContain('route: "/api/idp"');
  expect(read("api/idp.js")).toContain('moduleId: "idp"');
});

test("idp renderer separates the overview from the player development profile", () => {
  const state = {
    ui: { statusFilter: "All", categoryFilter: "All", searchQuery: "" },
    dashboardPlayers: [
      {
        profile: { playerId: "p1", playerName: "Player One", squadNumber: "19", position: "FW", role: "9" },
        focus: { title: "Receive under pressure", category: "Tactical", status: "Active" },
        evidenceCount: 1,
        newClipCount: 2,
        overallStatus: "New Clips To Review",
        nextAction: "Review clip bank",
      },
    ],
    playerDetail: buildLegacyPlayerDetail({
      id: "p1",
      name: "Player One",
      position: "FW",
      primaryRole: "9",
      idp: { primaryFocus: "Receive under pressure", nextAction: "Add evidence" },
    }),
  };
  const staffOptions = {
    canEdit: true,
    teamName: "North Carolina Courage",
    users: [
      { id: "coach-1", name: "Mak Lind", role: "coach" },
      { id: "analyst-1", name: "Video Analyst", role: "analyst" },
    ],
  };
  state.dashboardPlayers[0].profile.ownerId = "coach-1";
  state.playerDetail.profile.ownerId = "coach-1";
  state.playerDetail.ownership = [{ owner_id: "coach-1", ownership_type: "player-owner", status: "active" }];
  const overviewHtml = renderIdpWorkspace(state, staffOptions);

  expect(overviewHtml).toContain("data-idp-player=\"p1\"");
  expect(overviewHtml).toContain("Squad number 19");
  expect(overviewHtml).toContain("data-idp-filter=\"status\"");
  expect(overviewHtml).toContain("data-idp-filter=\"owner\"");
  expect(overviewHtml).toContain("All IDP Coaches");
  expect(overviewHtml).toContain("Mak Lind");
  expect(overviewHtml).toContain("Player Development");
  expect(overviewHtml).toContain("North Carolina Courage");
  expect(overviewHtml).toContain("Current Focus");
  expect(overviewHtml).toContain("Next Action");
  expect(overviewHtml).toContain("Observations");
  expect(overviewHtml).not.toContain("data-idp-action=\"focus\"");
  expect(overviewHtml).not.toContain("Development Timeline");

  const profileState = { ...state, ui: { ...state.ui, selectedPlayerId: "p1" } };
  const profileHtml = renderIdpWorkspace(profileState, staffOptions);

  expect(profileHtml).toContain("Player Development Profile");
  expect(profileHtml).toContain("data-idp-back-overview");
  expect(profileHtml).toContain("data-idp-action=\"ownership\"");
  expect(profileHtml).toContain("data-idp-action=\"focus\"");
  expect(profileHtml).toContain("data-idp-action=\"evidence\"");
  expect(profileHtml).toContain("Quick actions");
  expect(profileHtml).not.toContain("idp-summary-strip");
  expect(profileHtml).not.toContain("Player development overview");
  expect(profileHtml).toContain("Player Snapshot");
  expect(profileHtml).toContain("idp-focus-clarity-card");
  expect(profileHtml).toContain("Coach cue");
  expect(profileHtml).not.toContain("Receive under pressure so the player");
  expect(profileHtml).toContain("Progress Pulse");
  expect(profileHtml).not.toContain("idp-stage-scoreboard");
  expect(profileHtml).not.toContain("Player development pulse");
  expect(profileHtml).toContain("Success Criteria");
  expect(profileHtml).toContain("Development Lens");
  expect(profileHtml).toContain("Signal Map");
  expect(profileHtml).toContain("Player Voice");
  expect(profileHtml).toContain("idp-focus-coach-cue");
  expect(profileHtml).toContain("Add observation");
  expect(profileHtml).toContain("Observations");
  expect(profileHtml).toContain("Clip Bank");
  expect(profileHtml).toContain("Development Timeline");
  expect(profileHtml).toContain("Primary IDP Coach");
  expect(profileHtml).toContain("Current Focus Owner");

  const assignmentHtml = renderIdpWorkspace({ ...profileState, ui: { ...profileState.ui, actionMode: "ownership" } }, staffOptions);
  expect(assignmentHtml).toContain("data-idp-assign-owner");
  expect(assignmentHtml).toContain("Assign IDP Coach");
  expect(assignmentHtml).toContain("Save assignment");
  expect(renderIdpWorkspace({ ...profileState, ui: { ...profileState.ui, actionMode: "focus" } }, staffOptions)).toContain("data-idp-create-focus");
  const observationHtml = renderIdpWorkspace({ ...profileState, ui: { ...profileState.ui, actionMode: "evidence" } }, staffOptions);
  expect(observationHtml).toContain("data-idp-add-evidence");
  expect(observationHtml).toContain("Observation type");
  expect(observationHtml).toContain("Add observation");
  expect(renderIdpWorkspace({ ...profileState, ui: { ...profileState.ui, actionMode: "review" } }, staffOptions)).toContain("data-idp-complete-review");
});

test("idp clip bank is a date-sorted organizer with play queue metadata", () => {
  const profileState = {
    dashboardPlayers: [],
    playerDetail: {
      profile: { playerId: "p1", playerName: "Player One", position: "CM", role: "8" },
      focuses: [],
      clipBank: [
        {
          id: "bank-old",
          clipInstanceId: "b8f41622-57b5-4ed6-908f-b6d6d1e5fe30",
          matchTitle: "Training + Lift",
          matchDate: "2026-06-15",
          eventType: "training",
          startMs: 930000,
          endMs: 945000,
          phase: "In Possession",
          subPhase: "Build With GK",
          miniGamePrinciples: [{ label: "Third Player", value: "third-player" }],
          status: "New",
        },
        {
          id: "bank-new",
          clipInstanceId: "d6b00c58-9f33-4a0e-814c-30288b24fc21",
          matchTitle: "NCC - Louisville",
          matchDate: "2026-06-27",
          eventType: "match",
          startMs: 1178000,
          endMs: 1193000,
          phase: "In Possession",
          subPhase: "Build Up",
          miniGamePrinciples: [{ label: "Counterpress 5s", value: "counterpress-5s" }],
          outcome: "Positive",
          status: "New",
        },
      ],
      evidence: [],
      reviews: [],
      nextActions: [],
      milestones: [],
      ownership: [],
    },
    sync: {},
    ui: {
      selectedPlayerId: "p1",
      selectedClipBankIds: ["bank-new"],
      clipBankSearchQuery: "Louisville",
      clipPreviewOpen: true,
      clipPreviewQueueIds: ["bank-new", "bank-old"],
      clipPreviewActiveIndex: 0,
      clipPreviewStatus: "ready",
      clipPreviewObjectUrl: "blob:local-video-preview",
    },
  };

  const html = renderIdpWorkspace(profileState, { canEdit: true, teamName: "North Carolina Courage" });
  expect(html).toContain("data-idp-clip-search");
  expect(html).toContain("1 of 2 clips");
  expect(html).toContain("Find clip, player, date or principle");
  expect(html).toContain("data-idp-clip-play-selected");
  expect(html).toContain("Play selected (1)");
  expect(html).toContain("data-idp-clip-play=\"bank-new\"");
  expect(html).toContain("NCC - Louisville");
  expect(html).not.toContain("Training + Lift");
  expect(html).toContain("2026-06-27");
  expect(html).toContain("Build Up / In Possession");
  expect(html).toContain("Counterpress 5s");
  expect(html).toContain("data-idp-clip-preview-video");
  expect(html).toContain("1 of 2");
  expect(html).not.toContain("b8f41622-57b5-4ed6-908f-b6d6d1e5fe30");
});

test("idp adapter derives read-only fallback from Squad state", () => {
  const dashboard = buildIdpDashboardFromSquadState({
    players: [
      {
        id: "p1",
        name: "Player One",
        number: "18",
        position: "CM",
        primaryRole: "8",
        idp: { primaryFocus: "Scan before receive", nextAction: "Add evidence" },
      },
      { id: "p2", name: "Hidden Player", countsInSquad: false },
      {
        id: "p3",
        name: "Injured Player",
        position: "FW",
        primaryRole: "ST",
        idp: { status: "none" },
      },
    ],
  });

  expect(dashboard).toHaveLength(2);
  expect(dashboard[0].profile).toMatchObject({ playerId: "p1", playerName: "Player One", squadNumber: "18" });
  expect(dashboard[0].focus.title).toBe("Scan before receive");
  expect(dashboard[0].nextAction).toBe("Add evidence");
  expect(dashboard[1]).toMatchObject({
    profile: { playerId: "p3", playerName: "Injured Player", status: "none" },
    focus: null,
    nextAction: "IDP inactive",
    overallStatus: "No Active IDP",
  });
  expect(buildLegacyPlayerDetail({ id: "p3", name: "Injured Player", idp: { status: "none" } })).toMatchObject({
    profile: { playerId: "p3", status: "none" },
    focuses: [],
    nextActions: [],
  });
});

test("idp assignment refresh preserves the full squad roster and player identity", async () => {
  const squadPlayers = [
    {
      id: "p1",
      name: "Kailen Sheridan",
      number: "1",
      position: "Goalkeeper",
      primaryRole: "GK",
      idp: { primaryFocus: "Distribution under pressure", nextAction: "Add evidence" },
    },
    {
      id: "p2",
      name: "Madison White",
      number: "21",
      position: "Goalkeeper",
      primaryRole: "GK",
      idp: { primaryFocus: "Create current focus" },
    },
  ];
  const store = createIdpStore({
    ui: { selectedPlayerId: "p1" },
    playerDetail: buildLegacyPlayerDetail(squadPlayers[0]),
  });
  const assignedPayloads = [];
  const api = {
    assignOwner: async (payload) => {
      assignedPayloads.push(payload);
      return { schema: "footballscience-idp-v1", ownerId: payload.ownerId };
    },
    loadDashboard: async () => ({
      schema: "footballscience-idp-v1",
      players: [
        {
          profile: { id: "idp-profile-p1", player_id: "p1", primary_owner_id: "coach-1" },
          focus: null,
          evidenceCount: 2,
          newClipCount: 1,
          nextAction: "Set review date",
          overallStatus: "On Track",
        },
      ],
    }),
    loadPlayer: async () => ({
      schema: "footballscience-idp-v1",
      profile: { id: "idp-profile-p1", player_id: "p1", primary_owner_id: "coach-1" },
      focuses: [],
      clipBank: [],
      evidence: [],
      reviews: [],
      nextActions: [],
      milestones: [],
      ownership: [{ owner_id: "coach-1", ownership_type: "player-owner", status: "active" }],
    }),
  };
  const actions = createIdpActions({
    store,
    api,
    context: { getPlayerProfilesState: () => ({ players: squadPlayers }) },
  });

  await actions.assignOwner({ get: (key) => (key === "ownerId" ? "coach-1" : "") });

  const state = store.getState();
  expect(assignedPayloads[0]).toMatchObject({ playerId: "p1", ownerId: "coach-1" });
  expect(state.dashboardPlayers.map((entry) => entry.profile.playerName)).toEqual(["Kailen Sheridan", "Madison White"]);
  expect(state.dashboardPlayers).toHaveLength(2);
  expect(state.dashboardPlayers[0].profile).toMatchObject({
    playerId: "p1",
    playerName: "Kailen Sheridan",
    ownerId: "coach-1",
    position: "Goalkeeper",
    squadNumber: "1",
  });
  expect(state.dashboardPlayers[0].focus.title).toBe("Distribution under pressure");
  expect(state.playerDetail.profile).toMatchObject({
    playerId: "p1",
    playerName: "Kailen Sheridan",
    ownerId: "coach-1",
    position: "Goalkeeper",
    squadNumber: "1",
  });
  expect(state.playerDetail.focuses[0].title).toBe("Distribution under pressure");
});

test("idp sync refreshes overview and selected player after an external central update", async () => {
  const squadPlayers = [
    {
      id: "p1",
      name: "Kailen Sheridan",
      position: "Goalkeeper",
      primaryRole: "GK",
      idp: { primaryFocus: "Distribution under pressure", nextAction: "Add observation" },
    },
  ];
  const store = createIdpStore({
    ui: { selectedPlayerId: "p1" },
    playerDetail: buildLegacyPlayerDetail(squadPlayers[0]),
    sync: { revision: "2026-06-15T10:00:00.000Z" },
  });
  let dashboardLoads = 0;
  let playerLoads = 0;
  const api = {
    loadSync: async () => ({
      schema: "footballscience-idp-v1",
      sync: { revision: "2026-06-15T10:05:00.000Z", updatedAt: "2026-06-15T10:05:00.000Z" },
    }),
    loadDashboard: async () => {
      dashboardLoads += 1;
      return {
        schema: "footballscience-idp-v1",
        sync: { revision: "2026-06-15T10:05:00.000Z", updatedAt: "2026-06-15T10:05:00.000Z" },
        players: [
          {
            profile: { id: "idp-profile-p1", player_id: "p1", primary_owner_id: "coach-1" },
            focus: {
              id: "server-focus",
              player_id: "p1",
              title: "Distribution after teammate review",
              category: "Tactical",
              status: "Reviewed",
            },
            evidenceCount: 3,
            newClipCount: 0,
            nextAction: "Create next focus",
            overallStatus: "On Track",
          },
        ],
      };
    },
    loadPlayer: async () => {
      playerLoads += 1;
      return {
        schema: "footballscience-idp-v1",
        sync: { revision: "2026-06-15T10:05:00.000Z", updatedAt: "2026-06-15T10:05:00.000Z" },
        profile: { id: "idp-profile-p1", player_id: "p1", primary_owner_id: "coach-1" },
        focuses: [
          {
            id: "server-focus",
            player_id: "p1",
            title: "Distribution after teammate review",
            category: "Tactical",
            status: "Reviewed",
          },
        ],
        clipBank: [],
        evidence: [],
        reviews: [
          {
            id: "review-1",
            player_id: "p1",
            focus_id: "server-focus",
            progress_summary: "Updated by another coach",
          },
        ],
        nextActions: [],
        milestones: [],
        ownership: [{ owner_id: "coach-1", ownership_type: "player-owner", status: "active" }],
      };
    },
  };
  const actions = createIdpActions({
    store,
    api,
    context: { getPlayerProfilesState: () => ({ players: squadPlayers }) },
  });

  await expect(actions.checkForExternalUpdates()).resolves.toBe(true);

  const state = store.getState();
  expect(dashboardLoads).toBe(1);
  expect(playerLoads).toBe(1);
  expect(state.sync.revision).toBe("2026-06-15T10:05:00.000Z");
  expect(state.dashboardPlayers[0].focus.title).toBe("Distribution after teammate review");
  expect(state.playerDetail.reviews[0].progressSummary).toBe("Updated by another coach");
});

test("idp profile shows Squad-owned inactive IDP status", async () => {
  const injuredPlayer = {
    id: "p-injured",
    name: "Long Term Injury",
    position: "Forward",
    primaryRole: "ST",
    status: "injured",
    idp: { status: "none" },
  };
  const store = createIdpStore();
  const actions = createIdpActions({
    store,
    api: {
      loadDashboard: async () => ({
        schema: "footballscience-idp-v1",
        players: [
          {
            profile: { id: "idp-profile-injured", player_id: "p-injured", status: "active" },
            focus: { id: "server-focus", player_id: "p-injured", title: "Old active focus", status: "Active" },
            nextAction: "Add evidence",
            overallStatus: "On Track",
          },
        ],
      }),
      loadPlayer: async () => ({
        schema: "footballscience-idp-v1",
        profile: { id: "idp-profile-injured", player_id: "p-injured", status: "active" },
        focuses: [{ id: "server-focus", player_id: "p-injured", title: "Old active focus", status: "Active" }],
        clipBank: [],
        evidence: [],
        reviews: [],
        nextActions: [{ player_id: "p-injured", title: "Add evidence", status: "open" }],
        milestones: [],
        ownership: [],
      }),
    },
    context: { getPlayerProfilesState: () => ({ players: [injuredPlayer] }) },
  });

  await actions.loadDashboard();
  await actions.selectPlayer("p-injured");

  const state = store.getState();
  expect(state.dashboardPlayers[0]).toMatchObject({
    profile: { playerId: "p-injured", playerName: "Long Term Injury", status: "none" },
    focus: null,
    nextAction: "IDP inactive",
    overallStatus: "No Active IDP",
  });
  expect(state.playerDetail).toMatchObject({
    profile: { playerId: "p-injured", playerName: "Long Term Injury", status: "none" },
    focuses: [],
    nextActions: [],
  });

  const html = renderIdpWorkspace(
    { ...state, ui: { ...state.ui, selectedPlayerId: "p-injured" } },
    { canEdit: true, users: [] }
  );
  expect(html).toContain("No Active IDP");
  expect(html).toContain("IDP is inactive from Squad Room");
  expect(html).toContain("No active IDP");
  expect(html).toContain("No IDP action required");
  expect(html).not.toContain("Old active focus");
  expect(html).not.toContain("data-idp-action=\"focus\"");
});

test("fs player syncs saved player clips to idp clip bank through the server boundary", () => {
  const videoApi = read("api/_lib/video-analysis-database.js");
  expect(videoApi).toContain('require("./idp-database.js")');
  expect(videoApi).toContain("syncClipPlayersToIdp");
  expect(videoApi).toContain("upsertClipBankItem");
  expect(videoApi).toContain("idpClipBank");
});

test("idp module exports the workspace runtime handlers", async () => {
  const module = await import(pathToFileURL(path.join(moduleDir, "index.mjs")).href);
  for (const exportName of ["render", "handleClick", "handleInput", "handleChange", "handleSubmit"]) {
    expect(typeof module[exportName], exportName).toBe("function");
  }
});

test("idp search keeps focus and cursor position while filtering rerenders the overview", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({
    ok: true,
    schema: "footballscience-idp-v1",
    dashboardPlayers: [],
  });
  const imported = await import(`${pathToFileURL(path.join(moduleDir, "index.mjs")).href}?search-focus=${Date.now()}`);
  const documentRef = {
    activeElement: null,
    addEventListener() {},
    hidden: false,
  };
  const root = {
    isConnected: true,
    rendered: "",
    searchInput: null,
    querySelector(selector) {
      if (selector === "[data-idp-search]") return this.searchInput;
      if (selector === ".idp-player-profile, .idp-overview-board") return null;
      return null;
    },
    set innerHTML(value) {
      this.rendered = String(value || "");
      const [, searchValue = ""] = this.rendered.match(/data-idp-search value="([^"]*)"/) || [];
      const nextInput = {
        selectionEnd: 0,
        selectionStart: 0,
        value: searchValue,
        focus() {
          documentRef.activeElement = nextInput;
        },
        matches(selector) {
          return selector === "[data-idp-search]";
        },
        setSelectionRange(start, end) {
          this.selectionStart = start;
          this.selectionEnd = end;
        },
      };
      this.searchInput = nextInput;
    },
    get innerHTML() {
      return this.rendered;
    },
  };
  const context = {
    ui: { idpWorkspace: root },
    win: {
      addEventListener() {},
      document: documentRef,
      requestAnimationFrame(callback) {
        callback();
      },
      setInterval() {
        return 0;
      },
    },
    canEdit: () => true,
    getAuthToken: () => "test-token",
  };

  try {
    imported.render(context);
    const activeSearch = {
      selectionEnd: 3,
      selectionStart: 3,
      value: "Mad",
      matches(selector) {
        return selector === "[data-idp-search]";
      },
    };
    documentRef.activeElement = activeSearch;

    imported.handleInput({ target: activeSearch });

    expect(root.searchInput.value).toBe("Mad");
    expect(documentRef.activeElement).toBe(root.searchInput);
    expect(root.searchInput.selectionStart).toBe(3);
    expect(root.searchInput.selectionEnd).toBe(3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("idp runtime checks central sync while mounted and when the browser becomes active", () => {
  const indexSource = read("src/modules/idp/index.mjs");
  const apiSource = read("src/modules/idp/services/idp-api-service.mjs");
  expect(indexSource).toContain("IDP_SYNC_INTERVAL_MS");
  expect(indexSource).toContain("checkForExternalUpdates");
  expect(indexSource).toContain("visibilitychange");
  expect(indexSource).toContain("focus");
  expect(apiSource).toContain("action=sync");
  expect(apiSource).toContain("loadSync");
});
