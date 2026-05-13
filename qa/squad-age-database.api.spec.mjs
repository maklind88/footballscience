import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const squadAges = require("../api/_lib/squad-age-database.js");
const permissionMatrix = require("../src/core/permission-matrix.cjs");

test("Squad age API normalizes only bounded player lookup candidates", () => {
  const candidates = squadAges.normalizeAgeCandidates([
    { profileId: "ncc-2026-kailen-sheridan", name: "Kailen Sheridan", number: "1", position: "Goalkeeper" },
    { profileId: "ncc-2026-kailen-sheridan", name: "Kailen Sheridan", number: "1", position: "Goalkeeper" },
    { profileId: "", name: "" },
  ]);

  expect(candidates).toEqual([
    expect.objectContaining({
      profileId: "ncc-2026-kailen-sheridan",
      name: "Kailen Sheridan",
      sortName: "kailen sheridan",
      number: "1",
    }),
  ]);
});

test("Squad age API maps database birth dates without fabricating missing ages", () => {
  const candidates = squadAges.normalizeAgeCandidates([
    { profileId: "ncc-2026-kailen-sheridan", name: "Kailen Sheridan" },
    { profileId: "ncc-2026-missing", name: "Missing Player" },
  ]);
  const matched = squadAges.matchSquadAgeCandidatesToRows(candidates, [
    {
      id: "11111111-1111-4111-8111-111111111111",
      display_name: "Kailen Sheridan",
      sort_name: "kailen sheridan",
      date_of_birth: "1995-07-16",
      metadata: {},
    },
  ]);

  expect(matched).toEqual([
    expect.objectContaining({
      profileId: "ncc-2026-kailen-sheridan",
      birthDate: "1995-07-16",
      databasePlayerId: "11111111-1111-4111-8111-111111111111",
    }),
  ]);
});

test("Squad age cache stays local-only while the API route is permission guarded", () => {
  expect(permissionMatrix.apiRouteSecurity["/api/squad-ages"]).toEqual(
    expect.objectContaining({
      moduleId: "player-profiles",
      actions: expect.objectContaining({ POST: "read" }),
      enforcePermission: true,
    })
  );
  expect(permissionMatrix.getModulePermissionContract("player-profiles").storageKeys).not.toContain(
    "football-player-profile-age-cache-v1"
  );
});
