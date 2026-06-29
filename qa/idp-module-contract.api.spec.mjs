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
    "src/modules/idp/idp-player-board-renderer.mjs",
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

test("idp evidence edits and deletes stay behind the server-owned database boundary", () => {
  const apiService = read("src/modules/idp/services/idp-api-service.mjs");
  const databaseSource = read("api/_lib/idp-database.js");

  expect(apiService).toContain('action: "update-evidence"');
  expect(apiService).toContain('action: "delete-evidence"');
  expect(databaseSource).toContain("async function updateEvidence");
  expect(databaseSource).toContain("async function deleteEvidence");
  expect(databaseSource).toContain('patchRows("idp_evidence"');
  expect(databaseSource).toContain("deleted_at: new Date().toISOString()");
  expect(databaseSource).toContain("deleted_by: scope.actorId");
  expect(databaseSource).not.toContain('deleteRows("idp_evidence"');
});

test("idp player board interventions are IDP-owned and server-versioned", () => {
  const apiService = read("src/modules/idp/services/idp-api-service.mjs");
  const databaseSource = read("api/_lib/idp-database.js");
  const migration = read("supabase/migrations/20260621230015_add_idp_development_interventions.sql");
  const playerBoardRenderer = read("src/modules/idp/idp-player-board-renderer.mjs");
  const idpRuntime = read("src/modules/idp/index.mjs");

  expect(apiService).toContain('action: "create-intervention"');
  expect(apiService).toContain('action: "update-intervention"');
  expect(apiService).toContain('action: "archive-intervention"');
  expect(apiService).toContain('action: "create-goal"');
  expect(databaseSource).toContain("idp_development_interventions");
  expect(databaseSource).toContain("async function createDevelopmentIntervention");
  expect(databaseSource).toContain("async function updateDevelopmentIntervention");
  expect(databaseSource).toContain("async function archiveDevelopmentIntervention");
  expect(databaseSource).toContain("row_version");
  expect(databaseSource).toContain("insertAuditEvent");
  expect(databaseSource).toContain("requireOwnedFocus");
  expect(databaseSource).toContain("requireOwnedGoal");
  expect(databaseSource).toContain("Development goal belongs to a different focus.");
  expect(databaseSource).toContain("OPTIONAL_MIGRATION_TABLES");
  expect(databaseSource).toContain("isMissingOptionalTable");
  expect(databaseSource).toContain("normalizeBoardLineStyle");
  expect(databaseSource).toContain("lineWidth");
  expect(databaseSource).toContain("goal_id");
  expect(databaseSource).toContain("success_criteria");
  expect(migration).toContain("create table if not exists public.idp_development_interventions");
  expect(migration).toContain("board_state jsonb");
  expect(migration).toContain("alter table public.idp_development_interventions enable row level security");
  expect(migration).toContain("revoke all on public.idp_development_interventions from anon, authenticated");
  expect(migration).toContain("grant select, insert, update, delete on public.idp_development_interventions to service_role");
  expect(migration).toContain("idp_development_interventions_prevent_hard_delete");
  expect(playerBoardRenderer).toContain("data-idp-player-board-open");
  expect(playerBoardRenderer).toContain("data-idp-save-intervention");
  expect(playerBoardRenderer).toContain("data-idp-board-tool");
  expect(playerBoardRenderer).toContain("data-idp-board-tool=\"run\"");
  expect(playerBoardRenderer).toContain("data-idp-board-tool=\"cone\"");
  expect(playerBoardRenderer).toContain("data-idp-board-color-choice");
  expect(playerBoardRenderer).toContain("data-idp-board-editor-pitch");
  expect(playerBoardRenderer).toContain("Linked goal");
  expect(playerBoardRenderer).toContain("Success criteria");
  expect(idpRuntime).toContain("applyBoardPitchPoint");
  expect(idpRuntime).toContain("selectBoardTool");
  expect(idpRuntime).toContain("setBoardArrowPreset");
  expect(playerBoardRenderer).not.toContain("data-session-");
});

test("idp development goals are IDP-owned, measurable and server-versioned", () => {
  const apiService = read("src/modules/idp/services/idp-api-service.mjs");
  const databaseSource = read("api/_lib/idp-database.js");
  const migration = read("supabase/migrations/20260627030412_idp_development_goals.sql");
  const renderer = read("src/modules/idp/idp-renderer.mjs");
  const idpRuntime = read("src/modules/idp/index.mjs");

  expect(migration).toContain("create table if not exists public.idp_development_goals");
  expect(migration).toContain("create table if not exists public.idp_goal_checkins");
  expect(migration).toContain("goal_role text not null default 'supporting'");
  expect(migration).toContain("metric_type text not null default 'observation'");
  expect(migration).toContain("row_version integer not null default 1");
  expect(migration).toContain("deleted_at timestamptz");
  expect(migration).toContain("alter table public.idp_development_goals enable row level security");
  expect(migration).toContain("alter table public.idp_goal_checkins enable row level security");
  expect(migration).toContain("revoke all on public.idp_development_goals from anon, authenticated");
  expect(migration).toContain("grant select, insert, update, delete on public.idp_development_goals to service_role");
  expect(migration).toContain("idp_development_goals_prevent_hard_delete");
  expect(migration).toContain("idp_goal_checkins_prevent_hard_delete");
  expect(migration).toContain("idp_development_goals_player_status_idx");
  expect(migration).toContain("idp_goal_checkins_goal_recent_idx");
  expect(migration).toContain("add column if not exists goal_id");

  expect(apiService).toContain('action: "create-goal"');
  expect(apiService).toContain('action: "update-goal"');
  expect(apiService).toContain('action: "archive-goal"');
  expect(apiService).toContain('action: "add-goal-checkin"');
  expect(databaseSource).toContain("async function createDevelopmentGoal");
  expect(databaseSource).toContain("async function updateDevelopmentGoal");
  expect(databaseSource).toContain("async function archiveDevelopmentGoal");
  expect(databaseSource).toContain("async function addGoalCheckin");
  expect(databaseSource).toContain("requireOwnedFocus(scope, playerId");
  expect(databaseSource).toContain("requireOwnedGoal(scope, playerId");
  expect(databaseSource).toContain("idp_development_goals");
  expect(databaseSource).toContain("idp_goal_checkins");
  expect(databaseSource).toContain("OPTIONAL_MIGRATION_TABLES");
  expect(databaseSource).toContain("development_goal.checkin_added");
  expect(renderer).toContain('data-idp-profile-view="goals"');
  expect(renderer).toContain("Goals & Leadership");
  expect(renderer).toContain("data-idp-save-goal");
  expect(renderer).toContain("data-idp-add-goal-checkin");
  expect(idpRuntime).toContain("data-idp-edit-goal");
  expect(idpRuntime).toContain("data-idp-goal-checkin");
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
  state.playerDetail.evidence = Array.from({ length: 8 }, (_, index) => ({
    id: `evidence-${index + 1}`,
    playerId: "p1",
    focusId: "legacy-focus-p1",
    evidenceType: "Coach Note",
    note: index === 7 ? "Observation eight is visible." : `Observation ${index + 1}`,
    createdAt: "2026-06-16T10:00:00.000Z",
  }));
  state.playerDetail.milestones = Array.from({ length: 7 }, (_, index) => ({
    id: `milestone-${index + 1}`,
    playerId: "p1",
    focusId: "legacy-focus-p1",
    milestoneType: index === 0 ? "First Evidence Added" : "Current Focus Updated",
    title: index === 0 ? "Evidence added" : `Timeline update ${index + 1}`,
    occurredOn: `2026-06-${String(16 - index).padStart(2, "0")}`,
    sourceModule: "idp",
    createdBy: "coach-1",
  }));
  const overviewHtml = renderIdpWorkspace(state, staffOptions);

  expect(overviewHtml).toContain("data-idp-player=\"p1\"");
  expect(overviewHtml).toContain("Squad number 19");
  expect(overviewHtml).toContain("data-idp-filter=\"status\"");
  expect(overviewHtml).toContain("data-idp-filter=\"owner\"");
  expect(overviewHtml).toContain("All IDP Coaches");
  expect(overviewHtml).toContain("Mak Lind");
  expect(overviewHtml).not.toContain("Video Analyst");
  expect(overviewHtml).toContain("Player Development");
  expect(overviewHtml).toContain("North Carolina Courage");
  expect(overviewHtml).toContain("Current Focus");
  expect(overviewHtml).toContain("Next Action");
  expect(overviewHtml).toContain("Observations");
  expect(overviewHtml).not.toContain("data-idp-action=\"focus\"");
  expect(overviewHtml).not.toContain("Development Timeline");

  const profileState = { ...state, ui: { ...state.ui, selectedPlayerId: "p1" } };
  const profileHtml = renderIdpWorkspace(profileState, staffOptions);

  expect(profileHtml).toContain("data-idp-back-overview");
  expect(profileHtml).toContain('data-idp-profile-view="development"');
  expect(profileHtml).toContain('data-idp-profile-view="goals"');
  expect(profileHtml).toContain('data-idp-profile-view="player-board"');
  expect(profileHtml).toContain('data-idp-profile-view="clip-bank"');
  expect(profileHtml).toContain("idp-profile-menu");
  expect(profileHtml).toContain("idp-stage-actions");
  expect(profileHtml.indexOf("idp-stage-actions")).toBeLessThan(profileHtml.indexOf("data-idp-back-overview"));
  expect(profileHtml.indexOf("data-idp-back-overview")).toBeLessThan(profileHtml.indexOf('data-idp-profile-view="development"'));
  expect(profileHtml.indexOf('data-idp-profile-view="development"')).toBeLessThan(profileHtml.indexOf('data-idp-profile-view="goals"'));
  expect(profileHtml.indexOf("idp-profile-menu")).toBeLessThan(profileHtml.indexOf("Current Focus"));
  expect(profileHtml).toContain("data-idp-action=\"ownership\"");
  expect(profileHtml).toContain("data-idp-action=\"focus\"");
  expect(profileHtml).toContain("data-idp-action=\"evidence\"");
  expect(profileHtml).toContain("Quick actions");
  expect(profileHtml).toContain("Assign Coach");
  expect(profileHtml).toContain("Update Focus");
  expect(profileHtml).toContain("New Goal");
  expect(profileHtml).toContain("Leadership Goal");
  expect(profileHtml).toContain("Add Observation");
  expect(profileHtml).toContain("Complete Review");
  expect(profileHtml).not.toContain("idp-profile-actions-deck");
  expect(profileHtml).not.toContain("idp-summary-strip");
  expect(profileHtml).not.toContain("Player development overview");
  expect(profileHtml).not.toContain("Player Development Profile");
  expect(profileHtml).not.toContain("Player Snapshot");
  expect(profileHtml).toContain('class="idp-status-pill is-good">Active');
  expect(profileHtml).toContain("idp-focus-clarity-card");
  expect(profileHtml).toContain("Coach cue");
  expect(profileHtml).not.toContain("Receive under pressure so the player");
  expect(profileHtml).toContain("Player Board");
  expect(profileHtml).not.toContain("idp-player-board-panel");
  expect(profileHtml).not.toContain("idp-stage-scoreboard");
  expect(profileHtml).not.toContain("Player development pulse");
  expect(profileHtml).toContain("Success Criteria");
  expect(profileHtml).toContain("Goals & Responsibility");
  expect(profileHtml).toContain("data-idp-edit-goal");
  expect(profileHtml).toContain("data-idp-goal-checkin");
  expect(profileHtml).not.toContain("idp-intelligence-board");
  expect(profileHtml).not.toContain("Development Lens");
  expect(profileHtml).not.toContain("idp-lens-compass");
  expect(profileHtml).not.toContain("Signal Map");
  expect(profileHtml).toContain("Player Voice");
  expect(profileHtml).toContain("idp-focus-coach-cue");
  expect(profileHtml).not.toContain("data-idp-player-board-open");
  expect(profileHtml).not.toContain("idp-player-board-boardbar");
  expect(profileHtml).not.toContain("idp-player-board-exercise-bank");
  expect(profileHtml).not.toContain("data-session-");
  expect(profileHtml).not.toContain("New Exercise");
  expect(profileHtml).not.toContain("Edit Board");
  expect(profileHtml).not.toContain("Link Clip");
  expect(profileHtml).not.toContain("Progress Pulse");
  expect(profileHtml).toContain("Observations");
  expect(profileHtml).toContain("8 captured signals");
  expect(profileHtml).toContain("Observation eight is visible.");
  expect(profileHtml).toContain('data-idp-edit-evidence="evidence-1"');
  expect(profileHtml).toContain('data-idp-delete-evidence="evidence-1"');
  expect(profileHtml).not.toContain('data-idp-action="evidence" title="Add observation" disabled');
  expect(profileHtml).toContain("Clip Bank");
  expect(profileHtml).not.toContain("idp-clip-bank-organizer");
  expect(profileHtml).toContain("Development Timeline");
  expect(profileHtml).toContain("5 latest updates");
  expect(profileHtml).toContain("data-idp-timeline-more");
  expect(profileHtml).toContain("idp-workflow-more");
  expect(profileHtml).toContain("Show more");
  expect(profileHtml).toContain("<strong>2</strong>");
  expect(profileHtml).toContain("By Mak Lind");
  expect(profileHtml).toContain("Observation added");
  expect(profileHtml).not.toContain("idp-ownership-studio");
  expect(profileHtml).not.toContain("Primary IDP Coach");
  expect(profileHtml).not.toContain("Current Focus Owner");

  const richWorkflowHtml = renderIdpWorkspace({
    ...profileState,
    playerDetail: {
      ...profileState.playerDetail,
      evidence: [
        ...profileState.playerDetail.evidence,
        ...Array.from({ length: 6 }, (_, index) => ({
          id: `reflection-${index + 1}`,
          playerId: "p1",
          focusId: "legacy-focus-p1",
          evidenceType: "Player Reflection",
          note: `Player reflection ${index + 1}`,
          createdAt: `2026-06-${String(25 - index).padStart(2, "0")}T10:00:00.000Z`,
        })),
      ],
      reviews: Array.from({ length: 6 }, (_, index) => ({
        id: `review-${index + 1}`,
        playerId: "p1",
        focusId: "legacy-focus-p1",
        progressSummary: `Review summary ${index + 1}`,
        createdAt: `2026-06-${String(25 - index).padStart(2, "0")}T10:00:00.000Z`,
      })),
    },
  }, staffOptions);
  expect(richWorkflowHtml).toContain("5 latest reflections");
  expect(richWorkflowHtml).toContain("5 latest reviews");
  expect((richWorkflowHtml.match(/<span>Show more<\/span>/g) || []).length).toBeGreaterThanOrEqual(4);

  const playerBoardHtml = renderIdpWorkspace({
    ...profileState,
    ui: { ...profileState.ui, profileView: "player-board" },
  }, staffOptions);
  expect(playerBoardHtml).toContain("idp-profile-player-board-page");
  expect(playerBoardHtml).toContain("Player Board");
  expect(playerBoardHtml).toContain("individual exercises");
  expect(playerBoardHtml).toContain('class="idp-profile-menu"');
  expect(playerBoardHtml).toContain('data-idp-profile-view="player-board"');
  expect(playerBoardHtml).toContain('data-idp-profile-view="development"');
  expect((playerBoardHtml.match(/data-idp-profile-view="development"/g) || []).length).toBe(1);
  expect(playerBoardHtml).toContain("IDP Player Board");
  expect(playerBoardHtml).toContain("data-idp-player-board-open");
  expect(playerBoardHtml).toContain("idp-player-board-boardbar");
  expect(playerBoardHtml).toContain("idp-player-board-exercise-bank");
  expect(playerBoardHtml).toContain("idp-player-board-bank-item");
  expect(playerBoardHtml).toContain("Exercise Bank");
  expect(playerBoardHtml).toContain("idp-player-board-player-name");
  expect(playerBoardHtml).not.toContain("idp-player-board-insight-row");
  expect(playerBoardHtml).toContain("New Exercise");
  expect(playerBoardHtml).toContain("Edit Board");
  expect(playerBoardHtml).toContain("Link Clip");
  expect(playerBoardHtml).not.toContain("idp-focus-clarity-card");
  expect(playerBoardHtml).not.toContain("idp-workflow-board");
  expect(playerBoardHtml).not.toContain("idp-clip-bank-organizer");

  const clipBankHtml = renderIdpWorkspace({
    ...profileState,
    ui: { ...profileState.ui, profileView: "clip-bank" },
  }, staffOptions);
  expect(clipBankHtml).toContain("idp-profile-clip-bank-page");
  expect(clipBankHtml).toContain("Player Clip Bank");
  expect(clipBankHtml).toContain("idp-clip-bank-organizer");
  expect(clipBankHtml).toContain("Search clips");
  expect(clipBankHtml).toContain('data-idp-profile-view="development"');
  expect((clipBankHtml.match(/data-idp-profile-view="development"/g) || []).length).toBe(1);
  expect(clipBankHtml).not.toContain("idp-focus-clarity-card");
  expect(clipBankHtml).not.toContain("idp-workflow-board");

  const goalsHtml = renderIdpWorkspace({
    ...profileState,
    ui: { ...profileState.ui, profileView: "goals" },
  }, staffOptions);
  expect(goalsHtml).toContain("idp-profile-goals-page");
  expect(goalsHtml).toContain("Goals & Leadership");
  expect(goalsHtml).toContain("Development Goals");
  expect(goalsHtml).toContain("Leadership & Responsibility");
  expect(goalsHtml).toContain("data-idp-action=\"goal\"");
  expect(goalsHtml).toContain("data-idp-action=\"leadership-goal\"");
  expect((goalsHtml.match(/data-idp-profile-view="development"/g) || []).length).toBe(1);
  expect(goalsHtml).not.toContain("idp-workflow-board");

  const assignmentHtml = renderIdpWorkspace({ ...profileState, ui: { ...profileState.ui, actionMode: "ownership" } }, staffOptions);
  expect(assignmentHtml).toContain("data-idp-assign-owner");
  expect(assignmentHtml).toContain("Assign IDP Coach");
  expect(assignmentHtml).toContain("Primary IDP Coach");
  expect(assignmentHtml).toContain("Save assignment");
  expect(assignmentHtml).not.toContain("Video Analyst");
  expect(renderIdpWorkspace({ ...profileState, ui: { ...profileState.ui, actionMode: "focus" } }, staffOptions)).toContain("data-idp-create-focus");
  const observationHtml = renderIdpWorkspace({ ...profileState, ui: { ...profileState.ui, actionMode: "evidence" } }, staffOptions);
  expect(observationHtml).toContain("data-idp-add-evidence");
  expect(observationHtml).toContain("Observation type");
  expect(observationHtml).toContain("Add observation");
  expect(observationHtml).not.toContain("<button type=\"submit\" disabled>Add observation</button>");
  const editObservationHtml = renderIdpWorkspace(
    { ...profileState, ui: { ...profileState.ui, actionMode: "edit-evidence", editEvidenceId: "evidence-2" } },
    staffOptions
  );
  expect(editObservationHtml).toContain("data-idp-update-evidence");
  expect(editObservationHtml).toContain('name="evidenceId" value="evidence-2"');
  expect(editObservationHtml).toContain("Observation 2");
  expect(editObservationHtml).toContain("Save observation");
  const goalFormHtml = renderIdpWorkspace({ ...profileState, ui: { ...profileState.ui, actionMode: "goal" } }, staffOptions);
  expect(goalFormHtml).toContain("data-idp-save-goal");
  expect(goalFormHtml).toContain("Measurable player goal");
  expect(goalFormHtml).toContain("Metric type");
  const leadershipGoalHtml = renderIdpWorkspace({ ...profileState, ui: { ...profileState.ui, actionMode: "leadership-goal" } }, staffOptions);
  expect(leadershipGoalHtml).toContain("Create leadership goal");
  expect(leadershipGoalHtml).toContain("Leadership moments");
  const goalCheckinHtml = renderIdpWorkspace(
    { ...profileState, ui: { ...profileState.ui, actionMode: "goal-checkin", editGoalId: profileState.playerDetail.goals[0].id } },
    staffOptions
  );
  expect(goalCheckinHtml).toContain("data-idp-add-goal-checkin");
  expect(goalCheckinHtml).toContain("Current value");
  const readOnlyHtml = renderIdpWorkspace(profileState, { ...staffOptions, canEdit: false });
  expect(readOnlyHtml).not.toContain("data-idp-edit-evidence");
  expect(readOnlyHtml).not.toContain("data-idp-delete-evidence");
  const boardHtml = renderIdpWorkspace(
    { ...profileState, ui: { ...profileState.ui, playerBoardOpen: true, playerBoardInterventionId: "__new" } },
    staffOptions
  );
  expect(boardHtml).toContain("data-idp-player-board-layer");
  expect(boardHtml).toContain("data-idp-save-intervention");
  expect(boardHtml).toContain("data-idp-board-editor-pitch");
  expect(boardHtml).toContain("data-idp-board-tool=\"player\"");
  expect(boardHtml).toContain("data-idp-board-tool=\"run\"");
  expect(boardHtml).toContain("data-idp-board-tool=\"pass\"");
  expect(boardHtml).toContain("data-idp-board-tool=\"cone\"");
  expect(boardHtml).toContain("idp-player-board-toolbox");
  expect(boardHtml).toContain("idp-player-board-canvas-wrap");
  expect(boardHtml).toContain("idp-player-board-inspector");
  expect(boardHtml).toContain("Movement colour");
  expect(boardHtml).toContain("Linked clip ids");
  expect(renderIdpWorkspace({ ...profileState, ui: { ...profileState.ui, actionMode: "review" } }, staffOptions)).toContain("data-idp-complete-review");
});

test("idp observation creates a saved focus when the player only has a Squad fallback focus", async () => {
  const player = {
    id: "p1",
    name: "Kailen Sheridan",
    position: "Goalkeeper",
    primaryRole: "GK",
    idp: { primaryFocus: "Distribution under pressure", nextAction: "Add observation" },
  };
  const store = createIdpStore({
    ui: { selectedPlayerId: "p1" },
    playerDetail: buildLegacyPlayerDetail(player),
  });
  const createdFocuses = [];
  const evidencePayloads = [];
  const api = {
    createFocus: async (payload) => {
      createdFocuses.push(payload);
      return {
        schema: "footballscience-idp-v1",
        focus: {
          id: "server-focus",
          player_id: payload.playerId,
          title: payload.title,
          category: payload.category,
          status: payload.status,
        },
      };
    },
    addEvidence: async (payload) => {
      evidencePayloads.push(payload);
      return {
        schema: "footballscience-idp-v1",
        evidence: {
          id: "evidence-1",
          player_id: payload.playerId,
          focus_id: payload.focusId,
          evidence_type: payload.evidenceType,
          note: payload.note,
        },
      };
    },
    loadDashboard: async () => ({
      schema: "footballscience-idp-v1",
      players: [
        {
          profile: { id: "profile-p1", player_id: "p1" },
          focus: { id: "server-focus", player_id: "p1", title: "Distribution under pressure", status: "Active" },
          evidenceCount: 1,
          newClipCount: 0,
          nextAction: "Review focus",
          overallStatus: "On Track",
        },
      ],
    }),
    loadPlayer: async () => ({
      schema: "footballscience-idp-v1",
      profile: { id: "profile-p1", player_id: "p1" },
      focuses: [{ id: "server-focus", player_id: "p1", title: "Distribution under pressure", status: "Active" }],
      clipBank: [],
      evidence: [{ id: "evidence-1", player_id: "p1", focus_id: "server-focus", evidence_type: "Coach Note", note: "Stayed composed." }],
      reviews: [],
      nextActions: [],
      milestones: [],
      ownership: [],
    }),
  };
  const actions = createIdpActions({
    store,
    api,
    context: { getPlayerProfilesState: () => ({ players: [player] }) },
  });

  await actions.addEvidence({
    get: (key) => {
      if (key === "evidenceType") return "Coach Note";
      if (key === "note") return "Stayed composed.";
      return "";
    },
  });

  expect(createdFocuses).toHaveLength(1);
  expect(createdFocuses[0]).toMatchObject({
    playerId: "p1",
    title: "Distribution under pressure",
    category: "Tactical",
    status: "Active",
  });
  expect(evidencePayloads[0]).toMatchObject({
    playerId: "p1",
    focusId: "server-focus",
    evidenceType: "Coach Note",
    note: "Stayed composed.",
    sourceModule: "idp",
  });
  expect(store.getState().ui.message).toBe("Observation added.");
});

test("idp observation edit and delete stay server-owned and refresh the selected player", async () => {
  const player = {
    id: "p1",
    name: "Kailen Sheridan",
    position: "Goalkeeper",
    primaryRole: "GK",
    idp: { primaryFocus: "Distribution under pressure", nextAction: "Add observation" },
  };
  const detail = buildLegacyPlayerDetail(player);
  detail.focuses = [{ id: "server-focus", playerId: "p1", title: "Distribution under pressure", status: "Active" }];
  detail.evidence = [{ id: "evidence-1", playerId: "p1", focusId: "server-focus", evidenceType: "Coach Note", note: "Original note" }];
  const store = createIdpStore({
    ui: { selectedPlayerId: "p1" },
    playerDetail: detail,
  });
  const updatePayloads = [];
  const deletePayloads = [];
  let loadPlayerCalls = 0;
  const api = {
    updateEvidence: async (payload) => {
      updatePayloads.push(payload);
      return { schema: "footballscience-idp-v1", evidence: { ...payload, evidence_type: payload.evidenceType } };
    },
    deleteEvidence: async (payload) => {
      deletePayloads.push(payload);
      return { schema: "footballscience-idp-v1", evidence: { id: payload.id, player_id: payload.playerId, deleted_at: "2026-06-16T11:00:00.000Z" } };
    },
    loadDashboard: async () => ({ schema: "footballscience-idp-v1", players: [] }),
    loadPlayer: async () => {
      loadPlayerCalls += 1;
      return {
        schema: "footballscience-idp-v1",
        profile: { id: "profile-p1", player_id: "p1" },
        focuses: [{ id: "server-focus", player_id: "p1", title: "Distribution under pressure", status: "Active" }],
        clipBank: [],
        evidence: [],
        reviews: [],
        nextActions: [],
        milestones: [],
        ownership: [],
      };
    },
  };
  const actions = createIdpActions({
    store,
    api,
    context: { getPlayerProfilesState: () => ({ players: [player] }) },
  });

  await actions.updateEvidence({
    get: (key) => {
      if (key === "evidenceId") return "evidence-1";
      if (key === "evidenceType") return "Coach Note";
      if (key === "note") return "Edited note";
      return "";
    },
  });
  await actions.deleteEvidence("evidence-1");

  expect(updatePayloads[0]).toMatchObject({ id: "evidence-1", playerId: "p1", evidenceType: "Coach Note", note: "Edited note" });
  expect(deletePayloads[0]).toMatchObject({ id: "evidence-1", playerId: "p1" });
  expect(loadPlayerCalls).toBe(2);
  expect(store.getState().ui.message).toBe("Observation deleted.");
});

test("idp individual exercise save and archive stay behind the server boundary", async () => {
  const player = {
    id: "p1",
    name: "Kailen Sheridan",
    position: "Goalkeeper",
    primaryRole: "GK",
    idp: { primaryFocus: "Distribution under pressure", nextAction: "Add observation" },
  };
  const detail = buildLegacyPlayerDetail(player);
  detail.focuses = [{ id: "server-focus", playerId: "p1", title: "Distribution under pressure", status: "Active" }];
  detail.interventions = [{ id: "intervention-1", playerId: "p1", focusId: "server-focus", title: "Existing board", rowVersion: 3, boardState: { player: { x: 50, y: 70 } } }];
  const store = createIdpStore({
    ui: { selectedPlayerId: "p1" },
    playerDetail: detail,
  });
  const createPayloads = [];
  const updatePayloads = [];
  const archivePayloads = [];
  const api = {
    createIntervention: async (payload) => {
      createPayloads.push(payload);
      return { schema: "footballscience-idp-v1", intervention: { id: "intervention-2", row_version: 1, ...payload } };
    },
    updateIntervention: async (payload) => {
      updatePayloads.push(payload);
      return { schema: "footballscience-idp-v1", intervention: { id: payload.id, row_version: 4, ...payload } };
    },
    archiveIntervention: async (payload) => {
      archivePayloads.push(payload);
      return { schema: "footballscience-idp-v1", intervention: { id: payload.id, status: "archived" } };
    },
    loadDashboard: async () => ({ schema: "footballscience-idp-v1", players: [] }),
    loadPlayer: async () => ({
      schema: "footballscience-idp-v1",
      profile: { id: "profile-p1", player_id: "p1" },
      focuses: [{ id: "server-focus", player_id: "p1", title: "Distribution under pressure", status: "Active" }],
      clipBank: [],
      evidence: [],
      reviews: [],
      nextActions: [],
      milestones: [],
      ownership: [],
      interventions: [{ id: "intervention-1", player_id: "p1", focus_id: "server-focus", title: "Existing board", row_version: 3, board_state: { player: { x: 50, y: 70 } } }],
    }),
  };
  const actions = createIdpActions({
    store,
    api,
    context: { getPlayerProfilesState: () => ({ players: [player] }) },
  });
  const form = new Map([
    ["interventionId", "intervention-1"],
    ["focusId", "server-focus"],
    ["goalId", "goal-1"],
    ["rowVersion", "3"],
    ["title", "Distribution board"],
    ["objective", "Rehearse claiming space."],
    ["coachingCue", "Scan, claim, release."],
    ["successCriteria", "Early body shape\nClear first pass"],
    ["pitchMode", "box"],
    ["status", "active"],
    ["playerX", "50"],
    ["playerY", "82"],
    ["referenceLabel", "CB"],
    ["referenceX", "45"],
    ["referenceY", "58"],
    ["zoneLabel", "Claiming zone"],
    ["zoneX", "34"],
    ["zoneY", "28"],
    ["zoneWidth", "32"],
    ["zoneHeight", "28"],
    ["arrowLabel", "Attack ball"],
    ["arrowType", "run"],
    ["arrowColor", "#38bdf8"],
    ["arrowLineStyle", "dashed"],
    ["arrowLineWidth", "3.25"],
    ["arrowFromX", "50"],
    ["arrowFromY", "82"],
    ["arrowToX", "58"],
    ["arrowToY", "42"],
    ["cone1X", "44"],
    ["cone1Y", "60"],
    ["cone2X", "56"],
    ["cone2Y", "60"],
    ["cone3X", "50"],
    ["cone3Y", "44"],
    ["noteText", "Start from match cue."],
    ["noteX", "12"],
    ["noteY", "14"],
    ["frameLabel", "Frame one"],
    ["linkedClipIds", "clip-1, clip-2"],
  ]);

  await actions.saveIntervention(form);
  await actions.archiveIntervention("intervention-1");

  expect(createPayloads).toHaveLength(0);
  expect(updatePayloads[0]).toMatchObject({
    id: "intervention-1",
    playerId: "p1",
    focusId: "server-focus",
    goalId: "goal-1",
    rowVersion: "3",
    pitchMode: "box",
    coachingCue: "Scan, claim, release.",
    successCriteria: ["Early body shape", "Clear first pass"],
  });
  expect(updatePayloads[0].boardState).toMatchObject({
    player: { x: 50, y: 82 },
    cones: [
      { id: "cone-1", x: 44, y: 60 },
      { id: "cone-2", x: 56, y: 60 },
      { id: "cone-3", x: 50, y: 44 },
    ],
    arrows: [{ type: "run", color: "#38bdf8", lineStyle: "dashed", lineWidth: 3.25 }],
    linkedClipIds: ["clip-1", "clip-2"],
  });
  expect(archivePayloads[0]).toMatchObject({ id: "intervention-1", playerId: "p1", rowVersion: 3 });
});

test("idp development goal save, check-in and archive stay behind the server boundary", async () => {
  const player = {
    id: "p1",
    name: "Kailen Sheridan",
    position: "Goalkeeper",
    primaryRole: "GK",
    idp: { primaryFocus: "Distribution under pressure", nextAction: "Add observation" },
  };
  const detail = buildLegacyPlayerDetail(player);
  detail.focuses = [{ id: "server-focus", playerId: "p1", title: "Distribution under pressure", status: "Active" }];
  detail.goals = [{
    id: "goal-1",
    playerId: "p1",
    focusId: "server-focus",
    title: "Improve first pass",
    goalRole: "supporting",
    category: "Tactical",
    metricLabel: "Successful actions",
    metricType: "count",
    targetValue: 8,
    currentValue: 3,
    status: "active",
    rowVersion: 2,
  }];
  const store = createIdpStore({
    ui: { selectedPlayerId: "p1" },
    playerDetail: detail,
  });
  const createdGoals = [];
  const checkins = [];
  const archivedGoals = [];
  const api = {
    createGoal: async (payload) => {
      createdGoals.push(payload);
      return { schema: "footballscience-idp-v1", goal: { id: "goal-2", row_version: 1, ...payload } };
    },
    addGoalCheckin: async (payload) => {
      checkins.push(payload);
      return { schema: "footballscience-idp-v1", checkin: { id: "checkin-1", ...payload } };
    },
    archiveGoal: async (payload) => {
      archivedGoals.push(payload);
      return { schema: "footballscience-idp-v1", goal: { id: payload.id, status: "archived" } };
    },
    loadDashboard: async () => ({ schema: "footballscience-idp-v1", players: [] }),
    loadPlayer: async () => ({
      schema: "footballscience-idp-v1",
      profile: { id: "profile-p1", player_id: "p1" },
      focuses: [{ id: "server-focus", player_id: "p1", title: "Distribution under pressure", status: "Active" }],
      clipBank: [],
      evidence: [],
      reviews: [],
      nextActions: [],
      goals: [],
      goalCheckins: [],
      milestones: [],
      ownership: [],
      interventions: [],
    }),
  };
  const actions = createIdpActions({
    store,
    api,
    context: { getPlayerProfilesState: () => ({ players: [player] }) },
  });

  await actions.saveGoal(new Map([
    ["focusId", "server-focus"],
    ["goalRole", "supporting"],
    ["category", "Tactical"],
    ["title", "Win first action"],
    ["description", "Cleaner first action under pressure."],
    ["metricLabel", "Successful actions"],
    ["metricType", "count"],
    ["baselineValue", "3"],
    ["currentValue", "4"],
    ["targetValue", "8"],
    ["unit", ""],
    ["cadence", "weekly"],
    ["dueOn", "2026-07-10"],
    ["status", "active"],
  ]));
  store.setState({ playerDetail: detail });
  await actions.addGoalCheckin(new Map([
    ["goalId", "goal-1"],
    ["value", "5"],
    ["confidence", "4"],
    ["note", "Better first pass after scan."],
    ["statusSnapshot", "active"],
    ["checkinOn", "2026-06-27"],
  ]));
  store.setState({ playerDetail: detail });
  await actions.archiveGoal("goal-1");

  expect(createdGoals[0]).toMatchObject({
    playerId: "p1",
    focusId: "server-focus",
    title: "Win first action",
    metricLabel: "Successful actions",
    targetValue: "8",
  });
  expect(checkins[0]).toMatchObject({
    playerId: "p1",
    goalId: "goal-1",
    value: "5",
    confidence: "4",
    note: "Better first pass after scan.",
  });
  expect(archivedGoals[0]).toMatchObject({ id: "goal-1", playerId: "p1", rowVersion: 2 });
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
      profileView: "clip-bank",
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

test("idp sync does not close the player board editor while an exercise is being edited", async () => {
  const squadPlayers = [
    {
      id: "p1",
      name: "Kailen Sheridan",
      position: "Goalkeeper",
      primaryRole: "GK",
      idp: { primaryFocus: "Distribution under pressure" },
    },
  ];
  const store = createIdpStore({
    ui: {
      selectedPlayerId: "p1",
      profileView: "player-board",
      playerBoardOpen: true,
      playerBoardInterventionId: "intervention-1",
    },
    playerDetail: buildLegacyPlayerDetail(squadPlayers[0]),
    sync: { revision: "2026-06-15T10:00:00.000Z" },
  });
  let syncLoads = 0;
  let dashboardLoads = 0;
  let playerLoads = 0;
  const actions = createIdpActions({
    store,
    api: {
      loadSync: async () => {
        syncLoads += 1;
        return {
          schema: "footballscience-idp-v1",
          sync: { revision: "2026-06-15T10:05:00.000Z", updatedAt: "2026-06-15T10:05:00.000Z" },
        };
      },
      loadDashboard: async () => {
        dashboardLoads += 1;
        return { schema: "footballscience-idp-v1", players: [] };
      },
      loadPlayer: async () => {
        playerLoads += 1;
        return { schema: "footballscience-idp-v1" };
      },
    },
    context: { getPlayerProfilesState: () => ({ players: squadPlayers }) },
  });

  await expect(actions.checkForExternalUpdates()).resolves.toBe(false);

  expect(syncLoads).toBe(0);
  expect(dashboardLoads).toBe(0);
  expect(playerLoads).toBe(0);
  expect(store.getState().ui).toMatchObject({
    selectedPlayerId: "p1",
    profileView: "player-board",
    playerBoardOpen: true,
    playerBoardInterventionId: "intervention-1",
  });
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
  expect(html).toContain('class="idp-status-pill is-neutral">No Active IDP');
  expect(html).toContain("IDP is inactive from Squad Room");
  expect(html).toContain("No active IDP");
  expect(html).not.toContain("Old active focus");
  expect(html).not.toContain("data-idp-action=\"focus\"");

  const playerBoardHtml = renderIdpWorkspace(
    { ...state, ui: { ...state.ui, selectedPlayerId: "p-injured", profileView: "player-board" } },
    { canEdit: true, users: [] }
  );
  expect(playerBoardHtml).toContain("idp-profile-player-board-page");
  expect(playerBoardHtml).toContain("No Active IDP");
  expect(playerBoardHtml).not.toContain("idp-player-board-insight-row");
  expect(playerBoardHtml).not.toContain("Old active focus");
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

test("idp profile overview navigation is not blocked by stale filter state", async () => {
  const indexSource = read("src/modules/idp/index.mjs");
  expect(indexSource.indexOf("const backTrigger = event?.target?.closest?.(\"[data-idp-back-overview]\")"))
    .toBeLessThan(indexSource.indexOf("const openFilterMenu = runtime?.store.getState?.()?.ui?.openFilterMenu"));
  expect(indexSource).toContain(".idp-stage-actions[open]");
  expect(indexSource).toContain('openFilterMenu: "", selectedPlayerId: "", profileView: "development", actionMode: "", editEvidenceId: "", editGoalId: "", playerBoardOpen: false, playerBoardInterventionId: "", error: "", message: ""');

  const store = createIdpStore({ ui: { openFilterMenu: "owner" } });
  const actions = createIdpActions({
    store,
    api: {
      loadPlayer: async () => ({
        profile: { playerId: "p1", playerName: "Player One", position: "FW", role: "9" },
        focuses: [],
        clipBank: [],
        evidence: [],
        reviews: [],
        nextActions: [],
        milestones: [],
        ownership: [],
      }),
    },
    context: {
      getPlayerProfilesState: () => ({ players: [{ id: "p1", name: "Player One", position: "FW", primaryRole: "9" }] }),
    },
  });

  await actions.selectPlayer("p1");

  expect(store.getState().ui.selectedPlayerId).toBe("p1");
  expect(store.getState().ui.openFilterMenu).toBe("");
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
