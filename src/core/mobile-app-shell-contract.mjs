export const FOOTBALL_SCIENCE_LIVE_URL = "https://footballscience.xyz";

export const MOBILE_APP_BUNDLE_ID = "xyz.footballscience.app";

export const mobileAppShellContract = Object.freeze({
  schema: "footballscience-mobile-app-shell-contract-v1",
  productName: "Football Science",
  liveUrl: FOOTBALL_SCIENCE_LIVE_URL,
  bundleId: MOBILE_APP_BUNDLE_ID,
  primaryTargets: ["desktop", "ipad"],
  secondaryTargets: ["iphone", "android"],
  desktopStrategy: "installable-live-pwa-first",
  ipadStrategy: "app-store-shell-for-live-platform",
  sourceOfTruth: "live-web-platform",
  appStoreShellRole: "native-shell-for-live-platform",
  dataOwnership: "server-and-supabase-backed-platform-data",
  requiresAppStoreReviewFor: [
    "native entitlement changes",
    "push notification capability changes",
    "camera or file-system native capability changes",
    "app icon or launch screen changes",
    "bundle identifier or app metadata changes",
  ],
  updatesThroughLiveDeployFor: [
    "workspace UI",
    "module behavior",
    "copy and layout",
    "permissions enforced by backend",
    "server APIs",
    "Supabase-backed data",
    "desktop installed web app experience",
    "iPad live shell experience",
  ],
  prohibitedShellSources: [
    "file://",
    "localhost",
    "127.0.0.1",
    "::1",
  ],
});

export function isAllowedMobileShellUrl(value) {
  let parsed;
  try {
    parsed = new URL(String(value || ""));
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:") return false;
  return parsed.origin === FOOTBALL_SCIENCE_LIVE_URL;
}

export function buildMobileShellLaunchUrl(path = "/?workspace=home") {
  const url = new URL(path || "/", FOOTBALL_SCIENCE_LIVE_URL);
  if (url.origin !== FOOTBALL_SCIENCE_LIVE_URL) {
    return `${FOOTBALL_SCIENCE_LIVE_URL}/?workspace=home`;
  }
  return url.toString();
}
