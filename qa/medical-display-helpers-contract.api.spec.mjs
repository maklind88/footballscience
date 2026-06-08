import { expect, test } from "@playwright/test";
import { createMedicalDisplayHelpers } from "../src/modules/medical/index.mjs";

const helpers = createMedicalDisplayHelpers({
  escapeHtml: (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;"),
  getMedicalPlayerAvailabilityStatusOption: () => ({ key: "unavailable", tone: "danger", label: "Unavailable" }),
  getPlayerProfileRosterLabel: () => "Temporary",
  getPlayerProfileTemporaryWindowLabel: () => "2 sessions",
  getSelectedDate: () => "2026-05-29",
  isMedicalPlayerBlockedBySquadAvailability: (player = {}) => player.blocked,
  isPlayerProfileTemporaryActiveOnDate: (_player, dateValue) => dateValue === "2026-05-29",
  isTemporaryPlayerProfile: (player = {}) => player.temporary,
  medicalOperationsTabOptions: [{ key: "availability" }, { key: "system" }],
  medicalPlayerModalTabOptions: [{ key: "availability" }, { key: "clinical" }],
  parseScheduleDateValue: (value) => {
    const [year, month, day] = String(value).split("-").map(Number);
    return new Date(year, month - 1, day);
  },
});

test("Medical display helpers own date labels and initials", () => {
  expect(helpers.formatMedicalDateLabel("2026-05-29")).toBe("Fri 29 May");
  expect(helpers.formatMedicalDateLabel("2026-05-29", "long")).toBe("Friday 29 May");
  expect(helpers.getMedicalPlayerInitials({ name: "Mak Lind" })).toBe("ML");
  expect(helpers.getMedicalPlayerInitials({ name: "" })).toBe("P");
});

test("Medical display helpers own player avatar markup", () => {
  expect(helpers.renderMedicalPlayerAvatar({ name: "Ada Coach" })).toContain(">AC</span>");

  const photoMarkup = helpers.renderMedicalPlayerAvatar({
    name: "Ada & Coach",
    photoUrl: "https://cdn.example.com/ada&coach.png",
  });
  expect(photoMarkup).toContain("medical-player-avatar has-photo");
  expect(photoMarkup).toContain('src="https://cdn.example.com/ada&amp;coach.png"');
  expect(photoMarkup).toContain('alt="Ada &amp; Coach"');
});

test("Medical display helpers own temporary and squad availability badges", () => {
  expect(helpers.renderMedicalTemporaryPlayerBadge({ temporary: false })).toBe("");
  expect(helpers.renderMedicalTemporaryPlayerBadge({ temporary: true })).toContain(
    '<span class="medical-temporary-badge">Temporary / 2 sessions</span>'
  );

  expect(helpers.renderMedicalSquadAvailabilityBadge({ blocked: false })).toBe("");
  expect(helpers.renderMedicalSquadAvailabilityBadge({ blocked: true })).toContain(
    '<span class="medical-squad-availability-badge is-danger">Unavailable</span>'
  );
});

test("Medical display helpers own metric cards and tab normalization", () => {
  expect(helpers.renderMedicalMetric("Full", "12", "100%", "full")).toContain("medical-metric-card-full");
  expect(helpers.renderMedicalMetric("Not set", "2")).toContain("medical-metric-card-no-meta");
  expect(helpers.normalizeMedicalOperationsTab("system")).toBe("system");
  expect(helpers.normalizeMedicalOperationsTab("bad")).toBe("availability");
  expect(helpers.normalizeMedicalPlayerModalTab("clinical")).toBe("clinical");
  expect(helpers.normalizeMedicalPlayerModalTab("bad")).toBe("availability");
});
