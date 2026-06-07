import { expect, test } from "@playwright/test";
import { createPlatformNavigationRenderer } from "../src/modules/platform/navigation-renderer.mjs";

const renderer = createPlatformNavigationRenderer({
  escapeHtml: (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;"),
  getTopIconLabel: (workspace = {}) => workspace.shortLabel || workspace.title || workspace.id,
  getTopIconSvg: (workspaceId) => `<svg data-icon="${workspaceId}"></svg>`,
});

test("Platform navigation renderer owns top icon markup and notification state", () => {
  const markup = renderer.renderTopIconMenu({
    activeWorkspaceId: "home",
    hasHomeNotification: true,
    workspaces: [
      { id: "home", title: "Home" },
      { id: "schedule", title: "Schedule" },
    ],
  });

  expect(markup).toContain("top-icon-menu-item is-active has-notification");
  expect(markup).toContain('aria-label="Home, new activity"');
  expect(markup).toContain('data-icon="schedule"');
});

test("Platform navigation renderer owns sidebar primary and overflow markup", () => {
  const markup = renderer.renderWorkspaceList({
    isPlatformNav: true,
    activeWorkspaceId: "admin",
    primaryWorkspaces: [
      { id: "schedule", title: "Schedule", meta: "Plan" },
      { id: "medical", title: "Medical", meta: "Health" },
    ],
    overflowWorkspaces: [
      { id: "admin", title: "Admin", meta: "System" },
      { id: "identity", title: "Identity", meta: "Access" },
    ],
  });

  expect(markup).toContain("platform-nav-item");
  expect(markup).toContain("platform-nav-more-trigger is-active");
  expect(markup).toContain("Team, admin, identity");
  expect(markup).toContain('data-open-workspace="admin"');
});

test("Platform navigation renderer owns legacy workspace list and quick switch options", () => {
  const workspaces = [
    { id: "schedule", title: "Schedule", status: "Live", meta: "Plan", description: "Calendar" },
    { id: "scouting", title: "Scouting", status: "Ready", meta: "Recruit", description: "Database" },
  ];

  const listMarkup = renderer.renderWorkspaceList({
    activeWorkspaceId: "scouting",
    visibleWorkspaces: workspaces,
  });
  const optionMarkup = renderer.renderWorkspaceQuickSwitchOptions(workspaces);

  expect(listMarkup).toContain("workspace-nav-item is-active");
  expect(listMarkup).toContain("Scouting");
  expect(optionMarkup).toContain('<option value="schedule">Schedule</option>');
  expect(optionMarkup).toContain('<option value="scouting">Scouting</option>');
});
