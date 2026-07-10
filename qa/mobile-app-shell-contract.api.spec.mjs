import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FOOTBALL_SCIENCE_LIVE_URL,
  buildMobileShellLaunchUrl,
  isAllowedMobileShellUrl,
  mobileAppShellContract,
} from "../src/core/mobile-app-shell-contract.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function read(relativePath) {
  return readFileSync(resolve(root, relativePath), "utf8");
}

test("mobile app shell contract keeps Live as the only product source", () => {
  expect(mobileAppShellContract.liveUrl).toBe("https://footballscience.xyz");
  expect(mobileAppShellContract.sourceOfTruth).toBe("live-web-platform");
  expect(mobileAppShellContract.appStoreShellRole).toBe("native-shell-for-live-platform");
  expect(mobileAppShellContract.bundleId).toBe("xyz.footballscience.app");
  expect(mobileAppShellContract.primaryTargets).toEqual(["desktop", "ipad"]);
  expect(mobileAppShellContract.desktopStrategy).toBe("installable-live-pwa-first");
  expect(mobileAppShellContract.ipadStrategy).toBe("app-store-shell-for-live-platform");

  for (const blocked of ["file:///Users/maklind/Documents/New%20project/index.html", "http://localhost:3000", "https://example.com"]) {
    expect(isAllowedMobileShellUrl(blocked)).toBe(false);
  }

  expect(isAllowedMobileShellUrl(FOOTBALL_SCIENCE_LIVE_URL)).toBe(true);
  expect(isAllowedMobileShellUrl(`${FOOTBALL_SCIENCE_LIVE_URL}/?workspace=squad`)).toBe(true);
  expect(buildMobileShellLaunchUrl("/?workspace=scouting")).toBe(`${FOOTBALL_SCIENCE_LIVE_URL}/?workspace=scouting`);
});

test("PWA manifest is installable from the live domain without local coupling", () => {
  const manifest = JSON.parse(read("manifest.webmanifest"));

  expect(manifest.name).toBe("Football Science Coaching Platform");
  expect(manifest.short_name).toBe("Football Science");
  expect(manifest.id).toBe("/?app=football-science");
  expect(manifest.start_url).toBe("/?workspace=home");
  expect(manifest.scope).toBe("/");
  expect(manifest.display).toBe("standalone");
  expect(manifest.orientation).toBe("any");
  expect(JSON.stringify(manifest)).not.toContain("file://");
  expect(JSON.stringify(manifest)).not.toContain("localhost");

  const iconSizes = new Set(manifest.icons.map((icon) => icon.sizes));
  expect(iconSizes.has("180x180")).toBe(true);
  expect(iconSizes.has("192x192")).toBe(true);
  expect(iconSizes.has("512x512")).toBe(true);
  expect(manifest.icons.some((icon) => icon.purpose === "maskable")).toBe(true);
});

test("iOS home-screen metadata points to the shared app shell assets", () => {
  const index = read("index.html");

  expect(index).toContain('name=apple-mobile-web-app-capable content=yes');
  expect(index).toContain('name=apple-mobile-web-app-title content="Football Science"');
  expect(index).toContain('rel=apple-touch-icon sizes=180x180 href=assets/pwa/apple-touch-icon-180.png');
  expect(index).toContain("manifest.webmanifest");
  expect(index).not.toContain("serviceWorker.register");
});
