import { expect, test } from "@playwright/test";
import { createPerformanceSurfaceRuntime } from "../src/modules/performance/performance-surface-runtime.mjs";
import { createWorkspaceAccessRuntimeService } from "../src/core/workspace-access-runtime-service.mjs";
import { defaultWorkspaceAccess, defaultWorkspaceEditAccess } from "../src/core/app-runtime-constants.mjs";
import { defaultHubState } from "../src/core/workspace-defaults.mjs";

test("Performance workspace allows the coaching roles in its view policy and never grants edit", () => {
  const service = createWorkspaceAccessRuntimeService({ defaultHubState, defaultWorkspaceAccess, defaultWorkspaceEditAccess });
  const workspace = defaultHubState.workspaces.find(({ id }) => id === "performance-room");
  const allRoles = { "performance-room": { view: ["guest", "coach", "performance"], edit: ["admin", "coach"] } };
  expect(service.canUserAccessWorkspace(workspace, { id: "coach", role: "coach" })).toBe(true);
  expect(service.canUserAccessWorkspace(workspace, { id: "perf", role: "performance" })).toBe(true);
  expect(service.canUserAccessWorkspace(workspace, { id: "guest", role: "guest" }, allRoles)).toBe(false);
  expect(service.canUserAccessWorkspace(workspace, { role: "admin" })).toBe(false);
  expect(service.canUserEditWorkspace(workspace.id, { id: "admin", role: "admin" }, allRoles)).toBe(false);
});

test("Performance never loads a different team's legacy data or renders after the source scope changes", async () => {
  const listeners = new Map();
  const root = { textContent: "" };
  let scope = "coach/team-ncc-first";
  let user = { id: "coach", role: "coach", teamId: "other-team" };
  let releaseModule;
  const load = new Promise((resolve) => { releaseModule = resolve; });
  let loads = 0;
  let renders = 0;
  const runtime = createPerformanceSurfaceRuntime({
    root,
    win: {
      console,
      addEventListener: (event, callback) => listeners.set(event, callback),
      footballScienceCentralState: { getReadScope: () => scope, isHydrated: () => true },
    },
    loader: {
      loadStylesheet: async () => {},
      loadModule: () => {
        loads += 1;
        return load;
      },
    },
    defaultTeamId: "team-north-carolina-courage",
    getAuth: () => ({}),
    getUser: () => user,
    getActiveWorkspace: () => "performance-room",
    getWorkspace: () => ({ id: "performance-room" }),
  });
  runtime.render();
  expect(root.textContent).toContain("not connected for this team");
  expect(loads).toBe(0);
  user = { ...user, teamId: "team-ncc-first" };
  runtime.render();
  expect(root.textContent).toContain("Loading Performance Room");
  scope = "another-coach/team-ncc-first";
  releaseModule({ createPerformanceSurface: () => ({ render: () => { renders += 1; } }) });
  await load;
  runtime.render();
  expect(root.textContent).toContain("Waiting for the team’s workspace data");
  expect(renders).toBe(0);
  listeners.get("footballscience:central-state-ready")();
  await expect.poll(() => {
    runtime.render();
    return renders;
  }).toBeGreaterThan(0);
});
