import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createProfileImageRuntimeActions } from "../src/modules/profile/index.mjs";

function readProjectFile(relativePath) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function createHarness(options = {}) {
  const calls = [];
  const state = {
    players: [{ id: "player-1", firstName: "Mak", lastName: "Lind", photoUrl: "" }],
  };
  const actions = createProfileImageRuntimeActions({
    buildPlayerProfileOperationFeedback: (result, fallback) => result?.message || fallback,
    canEditPlayerProfiles: () => options.canEdit !== false,
    createProfileImageDataUrl: async (file, imageOptions) => {
      calls.push(["create-data-url", file?.name || "", imageOptions.maxUploadDataUrlLength, imageOptions.documentRef?.name || ""]);
      if (options.imageError) {
        throw options.imageError;
      }
      return "data:image/webp;base64,profile";
    },
    createTeamLogoDataUrl: async (file, imageOptions) => {
      calls.push(["create-logo-data-url", file?.name || "", imageOptions.maxUploadDataUrlLength, imageOptions.documentRef?.name || ""]);
      if (options.logoError) {
        throw options.logoError;
      }
      return "data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C%2Fsvg%3E";
    },
    documentRef: { name: "document-ref" },
    ensurePlayerProfilesState: () => calls.push("ensure-player-profiles"),
    getCurrentPlatformUser: () => ({ id: "coach-1" }),
    getPlatformTeamDisplayTeam: () => (Object.hasOwn(options, "team") ? options.team : { id: "team-1" }),
    getPlayerProfilesState: () => state,
    ImageCtor: function FakeImage() {},
    maxProfileImageUploadDataUrlLength: 123456,
    readPlatformStructureState: () => ({ teams: [{ id: "team-1" }] }),
    renderPlayerProfilesWorkspace: (message) => calls.push(["render", message]),
    updatePlayerProfile: (payload) => {
      calls.push(["update-player", payload]);
      return { ok: true, message: "Player image saved." };
    },
    URLRef: { name: "url-ref" },
    writePlatformTeamLogo: (teamId, logoUrl) => calls.push(["write-logo", teamId, logoUrl]),
  });
  return { actions, calls, state };
}

test("profile image runtime actions own profile/team upload orchestration outside app-runtime", () => {
  const appSource = readProjectFile("app-runtime.js");
  const moduleSource = readProjectFile("src/modules/profile/profile-image-runtime-actions.mjs");
  const indexSource = readProjectFile("src/modules/profile/index.mjs");
  const packageJson = JSON.parse(readProjectFile("package.json"));

  expect(appSource).toContain("createProfileImageRuntimeActions({");
  expect(appSource).not.toContain("async function uploadSquadTeamLogo(file)");
  expect(appSource).not.toContain("async function uploadPlayerProfilePhoto(playerId, file)");
  expect(appSource).not.toContain("function handlePhotoInput(playerPhotoInput)");
  expect(appSource).not.toContain("function createProfileImageDataUrl(file)");

  expect(moduleSource).toContain("async function uploadSquadTeamLogo(file)");
  expect(moduleSource).toContain("async function uploadPlayerProfilePhoto(playerId, file)");
  expect(moduleSource).toContain("function handlePhotoInput(playerPhotoInput)");
  expect(moduleSource).toContain("function createTeamLogoDataUrl(file)");
  expect(moduleSource).not.toMatch(/dashboardChat|DashboardChat|chat-widget/);
  expect(indexSource).toContain('export * from "./profile-image-runtime-actions.mjs";');
  expect(packageJson.scripts.check).toContain("src/modules/profile/profile-image-runtime-actions.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/profile-image-runtime-actions-contract.api.spec.mjs");
});

test("profile image runtime actions preserve team logo save behavior", async () => {
  const { actions, calls } = createHarness();

  await actions.uploadSquadTeamLogo({ name: "badge.svg", type: "image/svg+xml" });

  expect(calls).toEqual([
    ["create-logo-data-url", "badge.svg", 123456, "document-ref"],
    ["write-logo", "team-1", "data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C%2Fsvg%3E"],
    ["render", "Team logo saved."],
  ]);
});

test("profile image runtime actions preserve player photo save and input behavior", async () => {
  const { actions, calls } = createHarness();
  const input = {
    dataset: { playerProfilePhotoUpload: "player-1" },
    files: [{ name: "player.jpg", type: "image/jpeg" }],
    value: "selected-file",
  };

  actions.handlePhotoInput(input);
  await Promise.resolve();
  await Promise.resolve();

  expect(input.value).toBe("");
  expect(calls).toEqual([
    "ensure-player-profiles",
    ["create-data-url", "player.jpg", 123456, "document-ref"],
    ["update-player", expect.objectContaining({
      id: "player-1",
      playerId: "player-1",
      photoUrl: "data:image/webp;base64,profile",
    })],
    ["render", "Player image saved."],
  ]);
});

test("profile image runtime actions preserve warning and error feedback", async () => {
  const blocked = createHarness({ canEdit: false });
  await blocked.actions.uploadSquadTeamLogo({ name: "badge.png" });
  expect(blocked.calls).toEqual([["render", { status: "warning", lines: ["Your role cannot update the team logo."] }]]);

  const noTeam = createHarness({ team: null });
  await noTeam.actions.uploadSquadTeamLogo({ name: "badge.png" });
  expect(noTeam.calls).toEqual([["render", { status: "warning", lines: ["No active team was available for logo upload."] }]]);

  const quotaError = new Error("Profile image too large");
  quotaError.name = "QuotaExceededError";
  const failed = createHarness({ imageError: quotaError });
  await failed.actions.uploadPlayerProfilePhoto("player-1", { name: "large.png" });
  expect(failed.calls.at(-1)).toEqual(["render", "Player image could not be saved because local storage is full."]);
});
