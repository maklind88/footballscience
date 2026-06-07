import { expect, test } from "@playwright/test";
import { createPlatformStructureStateHelpers } from "../src/modules/platform/structure-state.mjs";

function createHelpers() {
  return createPlatformStructureStateHelpers({
    defaultClubId: "club-north-carolina-courage",
    defaultTeamId: "team-north-carolina-courage",
    defaultClubName: "North Carolina Courage",
    defaultClubShortName: "NCC",
    defaultTeamName: "North Carolina Courage",
    defaultTeamLevel: "First Team",
    legacyValues: new Set(["football science live", "club-football-science-live", "team-football-science-live", "fsl"]),
    canonicalClubValues: new Set(["north carolina courage", "club-north-carolina-courage", "ncc"]),
    canonicalTeamValues: new Set(["north carolina courage", "team-north-carolina-courage", "first team", "ncc"]),
    getTeamLogoUrl: (team = {}) => String(team.logoUrl || team.logo_url || "").trim(),
  });
}

test("Platform structure helpers clone defaults and create stable ids", () => {
  const helpers = createHelpers();
  const firstDefault = helpers.cloneDefaultPlatformStructureState();
  const secondDefault = helpers.cloneDefaultPlatformStructureState();

  firstDefault.clubs[0].name = "Changed";

  expect(secondDefault.clubs[0].name).toBe("North Carolina Courage");
  expect(helpers.normalizePlatformStructureText("  First Team  ")).toBe("First Team");
  expect(helpers.normalizePlatformStructureComparable("Team_Football-Science Live")).toBe("team football science live");
  expect(helpers.slugifyPlatformStructureValue("Club & Academy")).toBe("club-and-academy");
  expect(helpers.normalizePlatformStructureId("Team.ONE", "team", "Fallback")).toBe("team.one");
  expect(helpers.createPlatformStructureId("team", "First Team", new Set(["team-first-team"]))).toBe("team-first-team-2");
});

test("Platform structure helpers redirect legacy and canonical scope to the default live tenant", () => {
  const helpers = createHelpers();
  const state = helpers.normalizePlatformStructureState({
    activeClubId: "club-football-science-live",
    activeTeamId: "team-football-science-live",
    clubs: [
      { id: "club-football-science-live", name: "Football Science Live" },
      { id: "ncc", name: "NCC" },
    ],
    teams: [
      { id: "team-football-science-live", clubId: "club-football-science-live", name: "Football Science Live" },
      { id: "ncc-first", clubId: "ncc", name: "First Team", logoUrl: "https://cdn.example/team.png" },
    ],
    memberships: [{ userId: "coach-1", club_id: "club-football-science-live", team_id: "team-football-science-live" }],
  });

  expect(state.activeClubId).toBe("club-north-carolina-courage");
  expect(state.activeTeamId).toBe("team-north-carolina-courage");
  expect(state.clubs).toEqual([{ id: "club-north-carolina-courage", name: "North Carolina Courage", shortName: "NCC", status: "active" }]);
  expect(state.teams[0]).toMatchObject({
    id: "team-north-carolina-courage",
    clubId: "club-north-carolina-courage",
    name: "North Carolina Courage",
    level: "First Team",
  });
  expect(state.teams[0].logoUrl).toBe("https://cdn.example/team.png");
  expect(state.memberships[0]).toMatchObject({
    clubId: "club-north-carolina-courage",
    club_id: "club-north-carolina-courage",
    teamId: "team-north-carolina-courage",
    team_id: "team-north-carolina-courage",
  });
  expect(helpers.hasPlatformWorkspaceScope({ teamName: "Football Science Live" })).toBe(true);
  expect(helpers.isLegacyPlatformTeamPlaceholderName("Team Football Science Live")).toBe(true);
});

test("Platform structure helpers preserve custom clubs and dedupe names without losing memberships", () => {
  const helpers = createHelpers();
  const state = helpers.normalizePlatformStructureState({
    activeClubId: "club-academy",
    activeTeamId: "team-academy-u19",
    clubs: [
      { id: "club-academy", name: "Academy", shortName: "ACA" },
      { id: "club-academy-copy", name: "Academy", shortName: "Academy Copy" },
    ],
    teams: [
      { id: "team-academy-u19", clubId: "club-academy", name: "U19", shortName: "U19", age_group: "U19", season: "2027" },
      { id: "team-academy-u19-copy", clubId: "club-academy", name: "U19", shortName: "U19", level: "Duplicate" },
    ],
    memberships: [{ userId: "scout-1", clubId: "club-academy-copy", teamId: "team-academy-u19-copy" }],
  });

  expect(state.clubs.some((club) => club.id === "club-north-carolina-courage")).toBe(true);
  expect(state.clubs.filter((club) => club.name === "Academy")).toHaveLength(1);
  expect(state.teams.filter((team) => team.name === "U19")).toHaveLength(1);
  expect(state.activeClubId).toBe("club-academy");
  expect(state.activeTeamId).toBe("team-academy-u19");
  expect(state.memberships[0]).toMatchObject({ clubId: "club-academy", teamId: "team-academy-u19" });
});
