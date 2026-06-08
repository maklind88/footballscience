import { expect, test } from "@playwright/test";
import {
  getPlayerProfileCompleteness,
  getPlayerProfileImportUndoRelativeTimeLabel,
  getSquadChangeSummary,
  renderPlayerProfileAvatar,
  renderPlayerProfileAvatarUpload,
} from "../src/modules/squad/index.mjs";

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
