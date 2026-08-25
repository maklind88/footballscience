import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
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

test("Platform navigation renderer has a dedicated IDP menu symbol", () => {
  const idpSymbol = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="7" r="3"></circle></svg>';
  const markup = createPlatformNavigationRenderer({
    getTopIconSvg: (workspaceId) => (workspaceId === "idp" ? idpSymbol : ""),
  }).renderTopIconMenu({
    activeWorkspaceId: "idp",
    workspaces: [{ id: "idp", title: "IDP" }],
  });
  const iconSource = readFileSync(new URL("../top-icons.js", import.meta.url), "utf8");

  expect(markup).toContain('data-open-workspace="idp"');
  expect(markup).toContain("top-icon-menu-item is-active");
  expect(markup).toContain('aria-label="IDP"');
  expect(markup).toContain(idpSymbol);
  expect(iconSource).toContain('"idp":');
  expect(iconSource).toContain('<circle cx="8" cy="7" r="3"');
  expect(iconSource).toContain("M12.4 18.4");
});

test("Set Pieces Room uses a recognizable corner flag and football symbol", () => {
  const iconSource = readFileSync(new URL("../top-icons.js", import.meta.url), "utf8");

  expect(iconSource).toContain('"set-pieces-room":');
  expect(iconSource).toContain('d="M5 21V4');
  expect(iconSource).toContain('<circle cx="17.5" cy="17.5" r="4"');
});

test("Leaderboard no longer exposes a standalone navigation symbol", () => {
  const iconSource = readFileSync(new URL("../top-icons.js", import.meta.url), "utf8");

  expect(iconSource).not.toContain("leaderboard:");
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
