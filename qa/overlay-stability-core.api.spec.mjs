import { expect, test } from "@playwright/test";
import {
  createPlatformOverlayStabilityInstaller,
  installPlatformOverlayStability,
  platformOverlayStabilityRootSelectors,
} from "../src/core/overlay-stability.mjs";

test("Overlay stability core keeps platform overlay selector contract", () => {
  expect(platformOverlayStabilityRootSelectors).toContain('[role="dialog"][aria-modal="true"]');
  expect(platformOverlayStabilityRootSelectors).toContain("[data-admin-user-editor-overlay]");
  expect(platformOverlayStabilityRootSelectors).toContain("[data-player-profile-modal-overlay]");
  expect(platformOverlayStabilityRootSelectors).toContain(".medical-modal-layer");
  expect(platformOverlayStabilityRootSelectors).toContain(".scouting-profile-modal");
});

test("Overlay stability installer is a safe no-op without a DOM", () => {
  expect(installPlatformOverlayStability({ win: null, document: null })).toBe(false);
  const installer = createPlatformOverlayStabilityInstaller({ win: null, document: null });
  expect(installer.install()).toBe(false);
  expect(installer.state.installed).toBe(false);
});
