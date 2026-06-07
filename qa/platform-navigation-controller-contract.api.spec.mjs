import { expect, test } from "@playwright/test";
import { createPlatformNavigationController, getPlatformTopIconLabel } from "../src/modules/platform/navigation-controller.mjs";

function createClassList(initial = "") {
  const classes = new Set(String(initial).split(/\s+/).filter(Boolean));
  return {
    add: (...items) => items.forEach((item) => classes.add(item)),
    contains: (item) => classes.has(item),
    remove: (...items) => items.forEach((item) => classes.delete(item)),
    toString: () => Array.from(classes).join(" "),
  };
}

function createElement(className = "") {
  return {
    __lastRenderedMarkup: "",
    classList: createClassList(className),
    className,
    innerHTML: "",
    style: {},
    textContent: "",
    value: "",
    getBoundingClientRect: () => ({ bottom: 48, height: 32, left: 24, right: 56, top: 16, width: 32 }),
    setAttribute(name, value) {
      this[name] = value;
    },
  };
}

test("Platform navigation controller exposes stable top icon labels", () => {
  expect(getPlatformTopIconLabel({ id: "session-planner", title: "Planner" })).toBe("Sessions");
  expect(getPlatformTopIconLabel({ id: "custom", title: "Custom Workspace" })).toBe("Custom Workspace");
});

test("Platform navigation controller renders top icons, sidebar lists, quick switch, and placeholders", () => {
  let hubState = {
    activeWorkspaceId: "admin",
    workspaces: [{ id: "admin", title: "Admin", meta: "System", description: "Control" }],
  };
  const ui = {
    placeholderDescription: createElement(),
    placeholderModules: createElement(),
    placeholderTag: createElement(),
    placeholderTitle: createElement(),
    topIconMenu: createElement(),
    workspaceList: createElement("platform-nav"),
    workspaceQuickSwitch: createElement(),
    workspaceSearch: createElement(),
  };
  const workspaces = {
    admin: { id: "admin", title: "Admin", meta: "System", description: "Control" },
    schedule: { id: "schedule", title: "Schedule", meta: "Plan", description: "Calendar" },
    hidden: { hiddenFromNav: true, id: "hidden", title: "Hidden" },
  };
  const renderer = {
    renderTopIconMenu: ({ activeWorkspaceId, hasHomeNotification, workspaces: visibleWorkspaces }) =>
      `top:${activeWorkspaceId}:${hasHomeNotification}:${visibleWorkspaces.map((workspace) => workspace.id).join(",")}`,
    renderWorkspaceList: ({ activeWorkspaceId, isPlatformNav, overflowWorkspaces, primaryWorkspaces, visibleWorkspaces }) =>
      `list:${activeWorkspaceId}:${Boolean(isPlatformNav)}:${(primaryWorkspaces || visibleWorkspaces).map((workspace) => workspace.id).join(",")}:${(overflowWorkspaces || []).map((workspace) => workspace.id).join(",")}`,
    renderWorkspaceQuickSwitchOptions: (visibleWorkspaces) =>
      visibleWorkspaces.map((workspace) => `<option value="${workspace.id}">${workspace.title}</option>`).join(""),
  };
  const controller = createPlatformNavigationController({
    renderer,
    getUi: () => ui,
    getHubState: () => hubState,
    setHubState: (nextState) => {
      hubState = nextState;
    },
    getWorkspaceById: (id) => workspaces[id],
    getVisibleWorkspaces: () => [],
    getAccessibleWorkspacePool: () => Object.values(workspaces),
    canAccessWorkspace: (workspace) => workspace.id !== "hidden",
    repairWorkspaceState: (state) => ({ ...state, repaired: true }),
    hasHomeNotifications: () => true,
    topIconMenuOrder: ["schedule", "hidden", "admin"],
    sidebarPrimaryOrder: ["schedule"],
    sidebarMoreOrder: ["admin", "hidden"],
    placeholderContent: {
      admin: { description: "Manage platform", modules: [], tag: "Admin", title: "Platform Admin" },
    },
  });

  controller.renderTopIconMenu();
  controller.renderWorkspaceList();
  controller.renderWorkspaceQuickSwitch("admin");
  controller.renderPlaceholderWorkspace();

  expect(ui.topIconMenu.innerHTML).toBe("top:admin:true:schedule,admin");
  expect(ui.workspaceList.innerHTML).toBe("list:admin:true:schedule:admin");
  expect(ui.workspaceQuickSwitch.innerHTML).toContain('<option value="admin">Admin</option>');
  expect(ui.workspaceQuickSwitch.innerHTML).not.toContain("Hidden");
  expect(ui.placeholderTitle.textContent).toBe("Platform Admin");
  expect(hubState.repaired).toBe(true);
});

test("Platform navigation controller owns top icon tooltip visibility", () => {
  let tooltip = null;
  const documentStub = {
    body: {
      append(element) {
        tooltip = element;
      },
    },
    createElement: () => createElement(),
    querySelector: () => tooltip,
  };
  const trigger = {
    closest: () => null,
    getAttribute: () => "Schedule",
    getBoundingClientRect: () => ({ bottom: 40, height: 32, left: 20, right: 52, top: 8, width: 32 }),
    querySelector: () => null,
  };
  const controller = createPlatformNavigationController({
    document: documentStub,
    window: { innerHeight: 600, innerWidth: 800 },
  });

  controller.showTopIconTooltip(trigger);
  expect(tooltip.textContent).toBe("Schedule");
  expect(tooltip.classList.contains("is-visible")).toBe(true);

  controller.hideTopIconTooltip();
  expect(tooltip.classList.contains("is-visible")).toBe(false);
});
