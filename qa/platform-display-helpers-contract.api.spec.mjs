import { expect, test } from "@playwright/test";
import {
  createPlatformDisplayHelpers,
  formatPlatformUserName,
  getPlatformUserInitials,
  getPlatformUserProfileImageUrl,
  normalizePlatformProfileImageUrl,
} from "../src/modules/platform/display-helpers.mjs";

const helpers = createPlatformDisplayHelpers({
  escapeHtml: (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;"),
  getUserInitials: (user = {}) => `${user.firstName?.[0] || ""}${user.lastName?.[0] || ""}`.toUpperCase() || "U",
  getUserProfileImageUrl: (user = {}) => user.profileImageUrl || "",
  normalizeImageUrl: (value = "") => String(value || "").trim(),
  normalizeText: (value, fallback = "") => String(value || fallback).trim(),
});

test("Platform display helpers own user avatar photo and fallback markup", () => {
  expect(helpers.renderUserAvatar({ firstName: "Mak", lastName: "Lind" }, "profile-avatar")).toContain("ML");
  expect(
    helpers.renderUserAvatar(
      { firstName: "Mak", lastName: "Lind", profileImageUrl: "https://cdn.example.com/mak.png" },
      "profile-avatar"
    )
  ).toContain('<img src="https://cdn.example.com/mak.png" alt="" />');
});

test("Platform display helpers own user naming and profile image normalization", () => {
  expect(formatPlatformUserName({ firstName: "Mak", lastName: "Lind" })).toBe("Mak Lind");
  expect(formatPlatformUserName({})).toBe("Unknown User");
  expect(getPlatformUserInitials({ firstName: "Mak", lastName: "Lind" })).toBe("ML");
  expect(getPlatformUserInitials({})).toBe("U");

  expect(
    getPlatformUserProfileImageUrl({
      user_metadata: { avatar_url: "https://cdn.example.com/avatar.png" },
    })
  ).toBe("https://cdn.example.com/avatar.png");
  expect(normalizePlatformProfileImageUrl(" data:image/png;base64,abc ", { maxUploadDataUrlLength: 100 })).toBe(
    "data:image/png;base64,abc"
  );
  expect(normalizePlatformProfileImageUrl("data:image/png;base64,abc", { maxUploadDataUrlLength: 5 })).toBe("");
  expect(normalizePlatformProfileImageUrl("https://cdn.example.com/too-long.png", { maxUrlLength: 5 })).toBe("");
});

test("Platform display helpers own team logo initials, upload, and image markup", () => {
  const uploadMarkup = helpers.renderPlatformTeamLogoMark(
    { name: "North Carolina Courage", shortName: "NCC" },
    { canUpload: true }
  );
  expect(uploadMarkup).toContain("squad-team-logo-mark is-empty can-upload");
  expect(uploadMarkup).toContain("<strong>NCC</strong>");
  expect(uploadMarkup).toContain("data-squad-team-logo-upload");

  const imageMarkup = helpers.renderPlatformTeamLogoMark({
    name: "A&B Team",
    logoUrl: "https://cdn.example.com/a&b.png",
  });
  expect(imageMarkup).toContain("squad-team-logo-mark has-logo");
  expect(imageMarkup).toContain('src="https://cdn.example.com/a&amp;b.png"');
  expect(imageMarkup).toContain('alt="A&amp;B Team logo"');
});

test("Platform display helpers can apply the current avatar to an existing element", () => {
  const classes = new Set(["profile-avatar"]);
  const element = {
    classList: {
      contains: (className) => classes.has(className),
      toggle: (className, enabled) => {
        if (enabled) {
          classes.add(className);
        } else {
          classes.delete(className);
        }
      },
    },
    innerHTML: "",
  };
  const { applyUserAvatar } = createPlatformDisplayHelpers({
    getUserInitials: () => "ML",
    getUserProfileImageUrl: (user = {}) => user.profileImageUrl || "",
  });

  applyUserAvatar(element, { profileImageUrl: "https://cdn.example.com/mak.png" });

  expect(element.classList.contains("has-photo")).toBe(true);
  expect(element.innerHTML).toContain('<img src="https://cdn.example.com/mak.png" alt="" />');
});
