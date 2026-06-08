import { expect, test } from "@playwright/test";
import {
  createPlayerProfileFormValueReader,
  createPlayerProfileRosterUiSelectors,
  getPlayerProfileCompleteness,
  getPlayerProfileImportUndoRelativeTimeLabel,
  getSquadChangeSummary,
  renderPlayerProfileAvatar,
  renderPlayerProfileAvatarUpload,
} from "../src/modules/squad/index.mjs";

test("Squad profile UI helpers parse profile form values without owning writes", () => {
  const formData = new FormData();
  formData.set("playerId", " p-1 ");
  formData.set("name", " Ada ");
  formData.set("number", " 8 ");
  formData.set("position", " CM ");
  formData.set("status", " available ");
  formData.set("squadStatus", " important ");
  formData.set("careerPhase", " prime ");
  formData.set("primaryRole", " 8 ");
  formData.append("secondaryRoles", " 10 ");
  formData.append("secondaryRoles", " 6 ");
  formData.set("preferredSide", " right ");
  formData.set("roleGroup", " midfielder ");
  formData.set("coachNotes", " Trusted ");
  formData.set("rating.technical", "4.6");
  formData.set("rating.physical", "2");
  formData.set("idpStatus", " active ");
  formData.set("idpPrimaryFocus", " Scanning ");
  formData.set("idpStrengths", " Passing ");
  formData.set("idpFocusAreas", " Timing ");
  formData.set("idpNextAction", " Video ");
  formData.set("idpReviewDate", "2026-06-20");
  formData.set("performanceNotes", "High ceiling ");
  formData.set("scoutingNotes", " Watch ");
  formData.set("analysisNotes", " Good ");
  formData.set("age", "24");
  formData.set("photoUrl", "https://cdn.test/ada.png");

  const readValues = createPlayerProfileFormValueReader({
    attributeGroups: [{ key: "technical" }, { key: "physical" }],
  });

  expect(readValues(formData)).toMatchObject({
    playerId: "p-1",
    name: "Ada",
    number: "8",
    position: "CM",
    secondaryRoles: ["10", "6"],
    attributeRatings: { technical: 5, physical: 2 },
    idp: {
      status: "active",
      primaryFocus: "Scanning",
      nextAction: "Video",
      reviewDate: "2026-06-20",
    },
    futureData: {
      performanceNotes: "High ceiling",
      scoutingNotes: "Watch",
      analysisNotes: "Good",
    },
    age: "24",
    photoUrl: "https://cdn.test/ada.png",
  });
});

test("Squad profile UI helpers filter roster profiles without owning state", () => {
  const selectors = createPlayerProfileRosterUiSelectors({
    countsInSquad: (player) => player.countsInSquad !== false,
    getRosterLabel: (player) => player.temporaryGroup || player.rosterType || "",
    normalizeRosterType: (value) => String(value || "").trim().toLowerCase(),
    compareProfiles: (first, second) => String(first.name || "").localeCompare(String(second.name || "")),
    isTemporaryProfile: (player) => player.countsInSquad === false,
  });
  const players = [
    {
      id: "p2",
      name: "Bea Forward",
      primaryRole: "ST",
      secondaryRoles: ["RW"],
      roleGroup: "forward",
      rosterType: "squad",
      countsInSquad: true,
      idp: { primaryFocus: "Press" },
    },
    {
      id: "p1",
      name: "Ada Midfielder",
      primaryRole: "8",
      secondaryRoles: ["10"],
      roleGroup: "midfielder",
      rosterType: "academy",
      temporaryGroup: "Academy",
      countsInSquad: false,
      idp: { focusAreas: "Scanning" },
    },
  ];

  expect(selectors.getRosterSummary(players)).toMatchObject({
    squadCount: 1,
    temporaryCount: 1,
    totalCount: 2,
    temporaryGroups: ["Academy"],
  });
  expect(selectors.matchesRosterFilter(players[0], "squad")).toBe(true);
  expect(selectors.matchesRosterFilter(players[1], "temporary")).toBe(true);
  expect(selectors.getVisibleProfiles(players, { query: "scan", roleGroupFilter: "midfielder", rosterFilter: "temporary" }).map((player) => player.id)).toEqual(["p1"]);
  expect(selectors.getTemporaryProfiles(players).map((player) => player.id)).toEqual(["p1"]);
});

test("Squad profile UI helpers preserve change summaries and completeness scoring", () => {
  expect(getSquadChangeSummary("player-added", { name: "Ada" })).toBe("Ada added to Squad");
  expect(getSquadChangeSummary("player-removed", { name: "Ada" })).toBe("Ada removed from Squad");
  expect(getSquadChangeSummary("squad-import", {}, [{}, {}, {}])).toBe("3 player profiles imported");
  expect(getSquadChangeSummary("player-updated", { name: "Ada" }, [{ field: "Primary role", to: "8" }])).toBe("Ada role changed to 8");
  expect(getSquadChangeSummary("player-updated", { name: "Ada" }, [{ field: "Career phase", to: "Prime" }])).toBe("Ada updated: Career phase");

  expect(
    getPlayerProfileCompleteness({
      name: "Ada",
      position: "Midfielder",
      primaryRole: "8",
      roleGroup: "midfielder",
      preferredSide: "right",
      squadStatus: "important",
      careerPhase: "prime",
      idp: { primaryFocus: "Scanning", nextAction: "Video" },
      futureData: { performanceNotes: "High ceiling" },
      coachNotes: "Starter",
    })
  ).toBe(100);
});

test("Squad profile UI helpers preserve avatar markup and escaping", () => {
  const plainAvatar = renderPlayerProfileAvatar({ name: "Ada Lovelace" }, "test-avatar");
  expect(plainAvatar).toContain('class="test-avatar"');
  expect(plainAvatar).toContain("AL");

  const uploadAvatar = renderPlayerProfileAvatarUpload(
    { id: "p-1", name: "Unsafe <Name>", photoUrl: "https://cdn.test/a&b.png" },
    true
  );
  expect(uploadAvatar).toContain("squad-profile-avatar-upload");
  expect(uploadAvatar).toContain("https://cdn.test/a&amp;b.png");
  expect(uploadAvatar).toContain("Upload image for Unsafe &lt;Name&gt;");
});

test("Squad profile UI helpers preserve import undo relative time labels", () => {
  const originalNow = Date.now;
  Date.now = () => new Date("2026-06-08T12:00:00.000Z").getTime();
  try {
    expect(getPlayerProfileImportUndoRelativeTimeLabel("2026-06-08T11:59:45.000Z")).toBe("just now");
    expect(getPlayerProfileImportUndoRelativeTimeLabel("2026-06-08T11:15:00.000Z")).toBe("45 minutes ago");
    expect(getPlayerProfileImportUndoRelativeTimeLabel("2026-06-08T10:00:00.000Z")).toBe("2 hours ago");
    expect(getPlayerProfileImportUndoRelativeTimeLabel("2026-06-05T12:00:00.000Z")).toBe("3 days ago");
    expect(getPlayerProfileImportUndoRelativeTimeLabel("2026-05-15T12:00:00.000Z")).toBe("24 days ago");
    expect(getPlayerProfileImportUndoRelativeTimeLabel("bad")).toBe("");
  } finally {
    Date.now = originalNow;
  }
});
