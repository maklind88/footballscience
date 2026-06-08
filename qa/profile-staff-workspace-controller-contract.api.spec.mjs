import { expect, test } from "@playwright/test";
import { createProfileStaffWorkspaceController } from "../src/modules/profile/index.mjs";

test("Profile and staff workspace controller owns render state outside app.js", async () => {
  const fs = await import("node:fs/promises");
  const appSource = await fs.readFile("app-runtime.js", "utf8");
  const composerSource = await fs.readFile("src/core/workspace-runtime-composer.mjs", "utf8");
  expect(appSource).not.toContain("function getProfileWorkspaceMessage");
  expect(appSource).toContain("createWorkspaceRuntimeComposition({");
  expect(appSource).not.toContain("createProfileStaffWorkspaceController({");
  expect(composerSource).toContain("createProfileStaffWorkspaceController({");
});

test("Profile and staff workspace controller renders profile tasks and selected staff", () => {
  const ui = {
    profileWorkspace: { innerHTML: "" },
    staffWorkspace: { innerHTML: "" },
  };
  let selectedStaffUserId = "";
  const users = [
    { id: "user-1", firstName: "Mak", role: "coach" },
    { id: "user-2", firstName: "Ana", role: "analyst" },
  ];
  const controller = createProfileStaffWorkspaceController({
    getActiveWorkspaceId: () => "my-profile",
    getAssignableRolesForUser: () => ["coach", "analyst"],
    getCurrentUser: () => users[0],
    getScopedUsers: (sourceUsers) => sourceUsers,
    getSelectedStaffUserId: () => selectedStaffUserId,
    getStaffCreateUserEditorOpen: () => true,
    getTeamId: () => "team-1",
    getUi: () => ui,
    getUserProfileImageUrl: () => "https://example.com/profile.png",
    getUsers: () => users,
    isAdmin: () => true,
    profileWorkspaceRenderer: {
      renderWorkspace: (context) => `profile:${context.user.id}:${context.openPersonalTasks.length}:${context.message}:${context.hasProfilePhoto}`,
    },
    readDashboardTasks: () => [
      { id: "task-1", assignedTo: "user-1", createdBy: "user-1", scope: "personal", status: "open" },
      { id: "task-2", assignedTo: "user-1", createdBy: "user-1", scope: "personal", status: "done" },
    ],
    renderAdminRoleOptions: () => "<option>Coach</option>",
    renderAdminTeamOptions: () => "<option>Team</option>",
    setSelectedStaffUserId: (userId) => {
      selectedStaffUserId = userId;
    },
    staffWorkspaceRenderer: {
      renderWorkspace: (context) => `staff:${context.selectedUserId}:${context.createUserEditorOpen}:${context.isAdmin}:${context.message}`,
    },
    syncStructure: () => ({ teams: [{ id: "team-1" }] }),
    win: {
      clearTimeout() {},
      setTimeout: () => 1,
    },
  });

  controller.renderProfileWorkspace("Saved.");
  expect(ui.profileWorkspace.innerHTML).toBe("profile:user-1:1:Saved.:true");

  selectedStaffUserId = "user-2";
  controller.renderStaffWorkspace("Ready.");
  expect(ui.staffWorkspace.innerHTML).toBe("staff:user-2:true:true:Ready.");
});
