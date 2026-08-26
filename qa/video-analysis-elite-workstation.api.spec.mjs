import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

function moduleUrl(relativePath) {
  return pathToFileURL(path.join(rootDir, relativePath)).href;
}

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function clickTarget(selector) {
  return {
    closest(requested) {
      return requested === selector ? this : null;
    },
    dataset: {},
  };
}

test("exclusive coding groups clear competitors without suppressing repeatable MG principles", async () => {
  const coding = await import(moduleUrl("src/modules/video-analysis/services/codingTemplateService.js"));
  const exclusive = await import(moduleUrl("src/modules/video-analysis/services/exclusiveCodingLinkService.js"));
  const buildUp = { id: "build", value: "Build Up", targetField: "subPhase", exclusiveGroupKey: "sub-phase" };
  const highPress = { id: "press", value: "High Press", targetField: "subPhase", exclusiveGroupKey: "sub-phase" };
  const firstPrinciple = { id: "mg-1", value: "close-space", targetField: "miniGamePrincipleId" };
  const secondPrinciple = { id: "mg-2", value: "cover-shadow", targetField: "miniGamePrincipleId" };
  const template = { buttons: [buildUp, highPress, firstPrinciple, secondPrinciple], links: [] };

  const draft = coding.applyCodingButtonToDraft({ subPhase: "Build Up", phase: "In Possession" }, template, highPress);
  expect(draft).toMatchObject({ subPhase: "High Press", phase: "Out of Possession" });

  const subPhaseSelection = exclusive.applyExclusiveCodingSelection(["build", "mg-1"], template, highPress);
  expect(subPhaseSelection.selectedButtonIds).toEqual(["mg-1", "press"]);
  expect(subPhaseSelection.suppressedButtonIds).toEqual(["build"]);

  const principleSelection = exclusive.applyExclusiveCodingSelection(["mg-1", "press"], template, secondPrinciple);
  expect(principleSelection.repeatable).toBe(true);
  expect(principleSelection.selectedButtonIds).toEqual(["mg-1", "press", "mg-2"]);
});

test("timeline workspace controller batches rows, records undo and persists revisions", async () => {
  const model = await import(moduleUrl("src/modules/video-analysis/domain/timelineWorkspace.model.js"));
  const controllerModule = await import(moduleUrl("src/modules/video-analysis/timeline/timeline.workspace.controller.js"));
  const matchId = "11111111-1111-4111-8111-111111111111";
  const savedTimelineId = "22222222-2222-4222-8222-222222222222";
  let state = {
    match: { id: matchId },
    timelineWorkspace: model.createDefaultTimelineWorkspace(matchId),
  };
  const controller = controllerModule.createTimelineWorkspaceController({
    getState: () => state,
    updateState: (updater) => {
      state = typeof updater === "function" ? updater(state) : { ...state, ...updater };
    },
    saveTimeline: async (timeline) => ({
      timeline: { ...timeline, id: savedTimelineId, revision: 1 },
    }),
  });

  expect(controller.handleClick({ target: clickTarget("[data-video-analysis-workspace-row-add]") })).toBe(true);
  expect(state.timelineWorkspace.history).toHaveLength(1);
  expect(state.timelineWorkspace.dirtyTimelineIds).toEqual(["match-timeline"]);
  expect(state.timelineWorkspace.timelines[0].rows).toHaveLength(1);

  const saved = await controller.saveActiveTimeline();
  expect(saved).toMatchObject({ id: savedTimelineId, matchId, revision: 1 });
  expect(state.timelineWorkspace).toMatchObject({
    activeTimelineId: savedTimelineId,
    loadedMatchId: matchId,
    saveStatus: "ready",
    dirtyTimelineIds: [],
  });
});

test("timeline workspace preserves dirty analyst work before applying remote changes", async () => {
  const model = await import(moduleUrl("src/modules/video-analysis/domain/timelineWorkspace.model.js"));
  const controllerModule = await import(moduleUrl("src/modules/video-analysis/timeline/timeline.workspace.controller.js"));
  const matchId = "11111111-1111-4111-8111-111111111111";
  const timelineId = "22222222-2222-4222-8222-222222222222";
  const rowId = "33333333-3333-4333-8333-333333333333";
  const secondTimelineId = "44444444-4444-4444-8444-444444444444";
  const secondRowId = "55555555-5555-4555-8555-555555555555";
  let state = {
    timelineWorkspace: model.normalizeTimelineWorkspace({
      activeTimelineId: timelineId,
      dirtyTimelineIds: [timelineId, secondTimelineId],
      loadedMatchId: matchId,
      collaboration: {
        status: "connected",
        pendingRemoteChanges: 2,
      },
      timelines: [
        {
          id: timelineId,
          matchId,
          title: "Team analysis",
          revision: 4,
          isDefault: true,
          rows: [{ id: rowId, label: "My local press", clipIds: ["clip-local"] }],
        },
        {
          id: secondTimelineId,
          matchId,
          title: "Opponent analysis",
          revision: 2,
          rows: [{ id: secondRowId, label: "My local block", clipIds: ["clip-second"] }],
        },
      ],
    }),
  };
  const controller = controllerModule.createTimelineWorkspaceController({
    getState: () => state,
    updateState: (updater) => {
      state = typeof updater === "function" ? updater(state) : { ...state, ...updater };
    },
    reloadWorkspace: async () => {
      const collaboration = model.normalizeTimelineWorkspace(state.timelineWorkspace).collaboration;
      const loaded = model.normalizeTimelineWorkspace({
        activeTimelineId: timelineId,
        loadedMatchId: matchId,
        loadStatus: "ready",
        collaboration: {
          ...collaboration,
          pendingRemoteChanges: collaboration.pendingRemoteChanges + 1,
        },
        timelines: [
          {
            id: timelineId,
            matchId,
            title: "Team analysis remote",
            revision: 5,
            rows: [{ id: rowId, label: "Remote team press", clipIds: ["clip-remote"] }],
          },
          {
            id: secondTimelineId,
            matchId,
            title: "Opponent analysis remote",
            revision: 3,
            rows: [{ id: secondRowId, label: "Remote team block", clipIds: [] }],
          },
        ],
      });
      state = { ...state, timelineWorkspace: loaded };
      return loaded;
    },
  });

  expect(await controller.resolveRemoteChanges("preserve")).toBe(true);
  const workspace = model.normalizeTimelineWorkspace(state.timelineWorkspace);
  const recovery = workspace.timelines.find((timeline) => (
    timeline.settings.recoveredFromTimelineId === timelineId
  ));
  const secondRecovery = workspace.timelines.find((timeline) => (
    timeline.settings.recoveredFromTimelineId === secondTimelineId
  ));
  expect(workspace.timelines.find((timeline) => timeline.id === timelineId)).toMatchObject({
    title: "Team analysis remote",
    revision: 5,
    rows: [{ label: "Remote team press", clipIds: ["clip-remote"] }],
  });
  expect(recovery).toMatchObject({
    isDefault: false,
    revision: 1,
    rows: [{ label: "My local press", clipIds: ["clip-local"], revision: 1 }],
    settings: { recoveredFromTimelineId: timelineId },
  });
  expect(recovery.title).toContain("local recovery");
  expect(recovery.rows[0].id).not.toBe(rowId);
  expect(secondRecovery).toMatchObject({
    rows: [{ label: "My local block", clipIds: ["clip-second"], revision: 1 }],
    settings: { recoveredFromTimelineId: secondTimelineId },
  });
  expect(workspace.activeTimelineId).toBe(recovery.id);
  expect(workspace.dirtyTimelineIds).toEqual(expect.arrayContaining([recovery.id, secondRecovery.id]));
  expect(workspace.collaboration).toMatchObject({
    pendingRemoteChanges: 1,
    resolvingRemoteChanges: false,
    error: "",
  });
  expect(state.message).toBe("Local timeline copy preserved");

  state.timelineWorkspace = model.normalizeTimelineWorkspace({
    ...workspace,
    collaboration: { ...workspace.collaboration, pendingRemoteChanges: 1 },
  });
  let reloadCalls = 0;
  const denied = controllerModule.createTimelineWorkspaceController({
    getState: () => state,
    updateState: (updater) => {
      state = typeof updater === "function" ? updater(state) : { ...state, ...updater };
    },
    confirmDiscard: () => false,
    reloadWorkspace: async () => {
      reloadCalls += 1;
      return state.timelineWorkspace;
    },
  });
  expect(await denied.resolveRemoteChanges("reload")).toBe(false);
  expect(reloadCalls).toBe(0);
  expect(state.timelineWorkspace.collaboration.pendingRemoteChanges).toBe(1);
});

test("timeline workspace renderer exposes multiple timelines, row editing and save state", async () => {
  const renderer = await import(moduleUrl("src/modules/video-analysis/timeline/timeline.workspace.renderer.js"));
  const html = renderer.renderTimelineWorkspaceControls({
    activeTimelineId: "team",
    dirtyTimelineIds: ["team"],
    saveStatus: "idle",
    editorOpen: true,
    timelines: [
      { id: "team", title: "Team", rows: [{ id: "press", label: "High press", color: "#be123c" }] },
      { id: "opponent", title: "Opponent", rows: [] },
    ],
  }, true);

  expect(html).toContain("data-video-analysis-workspace-timeline=\"team\"");
  expect(html).toContain("data-video-analysis-workspace-timeline=\"opponent\"");
  expect(html).toContain("data-video-analysis-workspace-save");
  expect(html).toContain("data-video-analysis-workspace-rows-duplicate");
  expect(html).toContain("data-video-analysis-workspace-row-color=\"press\"");
  expect(html).toContain("data-video-analysis-workspace-clips-place=\"press:move\"");
  expect(html).toContain("data-video-analysis-workspace-clips-place=\"press:duplicate\"");
  expect(html).toContain("unsaved changes");
});

test("timeline clip batches move or duplicate across unlocked rows", async () => {
  const service = await import(moduleUrl("src/modules/video-analysis/services/timelineWorkspaceService.js"));
  const timeline = {
    id: "team",
    title: "Team",
    rows: [
      { id: "source", label: "Source", clipIds: ["clip-1", "clip-2"] },
      { id: "target", label: "Target", clipIds: [] },
      { id: "locked", label: "Locked", clipIds: ["clip-1"], locked: true },
    ],
  };

  const moved = service.placeClipsInTimelineRow(timeline, ["clip-1"], "target");
  expect(moved.rows.find((row) => row.id === "source").clipIds).toEqual(["clip-2"]);
  expect(moved.rows.find((row) => row.id === "target").clipIds).toEqual(["clip-1"]);
  expect(moved.rows.find((row) => row.id === "locked").clipIds).toEqual(["clip-1"]);

  const duplicated = service.placeClipsInTimelineRow(timeline, ["clip-2"], "target", { duplicate: true });
  expect(duplicated.rows.find((row) => row.id === "source").clipIds).toEqual(["clip-1", "clip-2"]);
  expect(duplicated.rows.find((row) => row.id === "target").clipIds).toEqual(["clip-2"]);
});

test("workstation API normalizes timeline writes without accepting video payloads", () => {
  const database = require(path.join(rootDir, "api/_lib/video-analysis-workstation-database.js"));
  const matchId = "11111111-1111-4111-8111-111111111111";
  const clipId = "33333333-3333-4333-8333-333333333333";
  const timeline = database.normalizeTimelinePayload({
    id: "local-timeline",
    matchId,
    title: "Team analysis",
    rows: [{ id: "press", label: "High press", kind: "coding", color: "#BE123C", clipIds: [clipId, clipId] }],
  }, { clubId: "club-a", teamId: "team-a", id: "analyst-a" });

  expect(timeline).toMatchObject({
    id: "local-timeline",
    matchId,
    organizationId: "club-a",
    teamId: "team-a",
    actorId: "analyst-a",
  });
  expect(timeline.rows[0]).toMatchObject({ id: "press", kind: "coding", color: "#be123c", clipIds: [clipId] });
  expect(() => database.normalizeTimelinePayload({
    matchId,
    title: "Unsafe",
    localVideoPath: "/Users/example/match.mov",
  })).toThrow(/video/i);
});

test("elite workstation migration is scoped, audited and service-role only", () => {
  const migration = read("supabase/migrations/20260824212110_video_analysis_elite_workstation_foundation.sql");
  for (const table of [
    "video_timelines",
    "video_timeline_lane_clips",
    "video_analysis_collaboration_sessions",
    "video_analysis_collaboration_participants",
  ]) {
    expect(migration).toContain(`alter table public.${table} enable row level security`);
    expect(migration).toContain(`revoke all on public.${table} from anon, authenticated`);
    expect(migration).toContain(`grant select, insert, update, delete on public.${table} to service_role`);
  }
  expect(migration).toContain("alter table public.video_analysis_operations enable row level security");
  expect(migration).toContain("revoke all on public.video_analysis_operations from anon, authenticated");
  expect(migration).toContain("grant select, insert on public.video_analysis_operations to service_role");
  expect(migration).not.toContain("grant select, insert, update, delete on public.video_analysis_operations");
  expect(migration).toContain("video_timelines_active_default_uidx");
  expect(migration).toContain("p_idempotency_key");
  expect(migration).toContain("expectedRevision");
  expect(migration).toContain("Timeline revision conflict");
  expect(migration).toContain("video_clip_instances_increment_revision");
  expect(migration).toContain("new.revision := old.revision + 1");
  expect(migration).toContain("inverse_payload");
  expect(migration).toContain("security invoker");
  expect(migration).not.toMatch(/grant\s+.+\s+to\s+(?:anon|authenticated)/i);
  expect(migration).not.toMatch(/(?:video_blob|video_bytes|local_video_path|file_path)/i);
  expect(migration).not.toMatch(/create\s+(?:table|function).+realtime\./i);
});

test("video analysis API routes expose workstation persistence as thin module wiring", () => {
  const api = read("api/_lib/video-analysis-database.js");
  const workstation = read("api/_lib/video-analysis-workstation-database.js");
  const collaboration = read("api/_lib/video-analysis-collaboration-database.js");
  expect(api).toContain('require("./video-analysis-workstation-database.js")');
  expect(api).toContain('action === "timelines"');
  expect(api).toContain('action === "save-timeline"');
  expect(api).toContain('action === "start-collaboration-session"');
  expect(api).toContain('action === "collaboration-state"');
  expect(api).toContain('require("./video-analysis-collaboration-database.js")');
  expect(workstation).toContain('/rpc/video_analysis_save_timeline');
  expect(workstation).not.toMatch(/video(?:Data|Bytes|Blob)|localVideoPath/i);
  expect(collaboration).toContain("video_analysis_collaboration_participants");
  expect(collaboration).toContain('operationParams.set("collaboration_session_id"');
  expect(collaboration).toContain("created_at.gt");
  expect(collaboration).toContain("recordClipAnalysisOperation");
});

test("collaboration polling deduplicates operations and ignores the current analyst", async () => {
  const collaboration = await import(moduleUrl("src/modules/video-analysis/services/collaborationPollingService.js"));
  const joined = [];
  const left = [];
  const remoteOperations = [];
  const presenceSnapshots = [];
  const statuses = [];
  const timerHost = {
    setInterval: () => 7,
    clearInterval: () => {},
  };
  let stateCalls = 0;
  const service = collaboration.createCollaborationPollingService({
    repository: {
      joinCollaborationSession: async (payload) => joined.push(payload),
      leaveCollaborationSession: async (payload) => left.push(payload),
      collaborationState: async () => {
        stateCalls += 1;
        return {
          nextCursor: "2026-08-24T20:00:01.000Z",
          participants: [{ id: "presence-1", actor_id: "analyst-b", actor_name: "Analyst B" }],
          operations: [
            { id: "operation-1", actor_id: "analyst-a", entity_type: "clip", operation_type: "clip.create" },
            { id: "operation-2", actor_id: "analyst-b", entity_type: "timeline", operation_type: "timeline.save" },
          ],
        };
      },
    },
    getActor: () => ({ id: "analyst-a", name: "Analyst A" }),
    onOperation: (operation) => remoteOperations.push(operation),
    onPresence: (participants) => presenceSnapshots.push(participants),
    onStatus: (status) => statuses.push(status),
    timerHost,
  });

  await service.join({ id: "11111111-1111-4111-8111-111111111111" });
  await service.poll();
  expect(joined).toHaveLength(1);
  expect(stateCalls).toBe(2);
  expect(remoteOperations.map((operation) => operation.id)).toEqual(["operation-2"]);
  expect(presenceSnapshots.at(-1)[0]).toMatchObject({ actorId: "analyst-b", name: "Analyst B" });
  expect(statuses).toContain("connected");

  await service.disconnect();
  expect(left).toHaveLength(1);
  expect(statuses.at(-1)).toBe("disconnected");
});

test("two analysts exchange operations, presence and disconnect without duplicate replay", async () => {
  const collaboration = await import(moduleUrl("src/modules/video-analysis/services/collaborationPollingService.js"));
  const session = { id: "11111111-1111-4111-8111-111111111111" };
  const participants = new Map();
  const operations = [];
  const timerHost = { setInterval: () => 1, clearInterval: () => {} };
  const repositoryFor = (actorId) => ({
    async joinCollaborationSession(payload) {
      participants.set(payload.clientId, {
        id: `presence-${actorId}`,
        actor_id: actorId,
        actor_name: payload.actorName,
        client_id: payload.clientId,
        last_seen_at: new Date().toISOString(),
      });
    },
    async leaveCollaborationSession(payload) {
      participants.delete(payload.clientId);
    },
    async collaborationState() {
      return {
        nextCursor: new Date().toISOString(),
        participants: [...participants.values()],
        operations: [...operations],
      };
    },
  });
  const receivedA = [];
  const receivedB = [];
  const presenceA = [];
  const presenceB = [];
  const analystA = collaboration.createCollaborationPollingService({
    repository: repositoryFor("analyst-a"),
    getActor: () => ({ id: "analyst-a", name: "Analyst A" }),
    onOperation: (operation) => receivedA.push(operation.id),
    onPresence: (snapshot) => presenceA.push(snapshot),
    timerHost,
  });
  const analystB = collaboration.createCollaborationPollingService({
    repository: repositoryFor("analyst-b"),
    getActor: () => ({ id: "analyst-b", name: "Analyst B" }),
    onOperation: (operation) => receivedB.push(operation.id),
    onPresence: (snapshot) => presenceB.push(snapshot),
    timerHost,
  });

  await analystA.join(session);
  await analystB.join(session);
  operations.push({
    id: "operation-b",
    actor_id: "analyst-b",
    entity_type: "timeline",
    operation_type: "timeline.save",
  });
  await analystA.poll();
  await analystB.poll();
  operations.push({
    id: "operation-a",
    actor_id: "analyst-a",
    entity_type: "clip",
    operation_type: "clip.create",
  });
  await analystA.poll();
  await analystB.poll();
  await analystA.poll();
  await analystB.poll();

  expect(receivedA).toEqual(["operation-b"]);
  expect(receivedB).toEqual(["operation-a"]);
  expect(presenceA.at(-1).map((participant) => participant.actorId).sort()).toEqual(["analyst-a", "analyst-b"]);
  expect(presenceB.at(-1).map((participant) => participant.actorId).sort()).toEqual(["analyst-a", "analyst-b"]);

  await analystB.disconnect();
  await analystA.poll();
  expect(presenceA.at(-1).map((participant) => participant.actorId)).toEqual(["analyst-a"]);
  await analystA.disconnect();
});

test("private realtime collaboration adapter sends metadata-only operations", async () => {
  const collaboration = await import(moduleUrl("src/modules/video-analysis/services/collaborationSessionService.js"));
  const sends = [];
  const tracks = [];
  const channel = {
    on() { return this; },
    subscribe(callback) { callback("SUBSCRIBED"); return this; },
    track: async (payload) => tracks.push(payload),
    send: async (payload) => { sends.push(payload); return "ok"; },
    untrack: async () => {},
    presenceState: () => ({}),
  };
  const channelCalls = [];
  const client = {
    channel(topic, config) { channelCalls.push({ topic, config }); return channel; },
    removeChannel: async () => {},
  };
  const service = collaboration.createCollaborationSessionService({ getSupabaseClient: () => client });
  await service.join({ id: "11111111-1111-4111-8111-111111111111" }, { id: "analyst-a", name: "Analyst A" });
  await expect.poll(() => tracks.length).toBe(1);
  expect(channelCalls[0]).toMatchObject({
    topic: "video-analysis:11111111-1111-4111-8111-111111111111",
    config: { config: { private: true, broadcast: { ack: true, self: false } } },
  });
  expect(await service.broadcastOperation({
    operationType: "clip.create",
    entityType: "clip",
    entityId: "22222222-2222-4222-8222-222222222222",
    videoPath: "/Users/example/match.mov",
  })).toBe(true);
  expect(sends[0].payload).not.toHaveProperty("videoPath");
  expect(sends[0].payload).toMatchObject({ operationType: "clip.create", entityType: "clip" });
  await service.disconnect();
});

test("clip revisions travel from database reads to optimistic writes", async () => {
  const clipModel = await import(moduleUrl("src/modules/video-analysis/domain/clipInstance.model.js"));
  const clipService = await import(moduleUrl("src/modules/video-analysis/services/clipInstanceService.js"));
  const clip = clipModel.normalizeClipInstance({
    id: "11111111-1111-4111-8111-111111111111",
    match_id: "22222222-2222-4222-8222-222222222222",
    video_id: "33333333-3333-4333-8333-333333333333",
    start_ms: 10_000,
    end_ms: 25_000,
    revision: 7,
  });
  expect(clip.revision).toBe(7);
  expect(clipService.toApiClipPayload(clip).expectedRevision).toBe(7);
  expect(read("api/_lib/video-analysis-database.js")).toContain("Clip revision conflict");
});
