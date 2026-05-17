import { expect, test } from "@playwright/test";
import {
  canEditModule,
  canViewModule,
  dataSafetyRegistry,
  createModuleRegistry,
  createPlatformEventBus,
  createReadOnlyStorageAdapter,
  platformModuleMigrationOrder,
  platformModuleRegistry,
  platformModules,
  protectedStorageKeys,
  storageAdapterKinds,
} from "../src/core/index.mjs";

test("modular core covers protected storage keys without loading the current UI", () => {
  const registry = createModuleRegistry(platformModules);

  expect(registry.assertProtectedStorageCoverage(protectedStorageKeys)).toBe(true);
  expect(registry.assertDataSafetyCoverage()).toBe(true);
  expect(dataSafetyRegistry.assertStorageKeyCoverage(protectedStorageKeys)).toBe(true);
  expect(registry.ownersForStorageKey("football-dashboard-chat-v1")).toEqual(["chat"]);
  expect(registry.dataSafetyForStorageKey("football-dashboard-chat-v1")).toMatchObject({
    moduleId: "chat",
    saveEndpoint: "/api/app-state",
    localPersistence: "cache-only",
  });
  expect(registry.ownersForStorageKey("football-platform-appearance-v1")).toEqual(["platform-appearance"]);
  expect(registry.ownersForStorageKey("football-session-exercise-library-backup-v1")).toEqual(["exercise-library"]);
  expect(registry.ownersForStorageKey("football-scouting-v1")).toEqual(["scouting"]);
  expect(platformModuleRegistry.ids()).toContain("session-planner");
  expect(platformModuleRegistry.ids()).toContain("scouting");
});

test("migration order starts with low-risk modules and keeps deep planning modules later", () => {
  expect(platformModuleMigrationOrder.slice(0, 3)).toEqual(["platform-identity", "home", "chat"]);
  expect(platformModuleMigrationOrder.indexOf("session-planner")).toBeGreaterThan(
    platformModuleMigrationOrder.indexOf("exercise-library")
  );
  expect(platformModuleMigrationOrder.at(-1)).toBe("game-simulator");
});

test("module permissions are explicit and conservative", () => {
  expect(canEditModule("coach", "schedule")).toBe(true);
  expect(canEditModule("guest", "schedule")).toBe(false);
  expect(canViewModule("medical", "session-planner")).toBe(true);
  expect(canEditModule("medical", "session-planner")).toBe(false);
  expect(canEditModule("medical", "medical-team")).toBe(true);
});

test("platform event bus supports safe subscribe, emit, and unsubscribe", () => {
  const events = createPlatformEventBus();
  const received = [];
  const unsubscribe = events.on("chat.message-sent", (event) => received.push(event));

  expect(events.listenerCount("chat.message-sent")).toBe(1);
  expect(events.emit("chat.message-sent", { id: "message-1" })).toBe(1);
  unsubscribe();
  expect(events.emit("chat.message-sent", { id: "message-2" })).toBe(0);
  expect(received).toEqual([
    {
      eventName: "chat.message-sent",
      payload: { id: "message-1" },
    },
  ]);
});

test("read-only storage adapter blocks accidental writes during modular extraction", async () => {
  const adapter = createReadOnlyStorageAdapter({
    kind: storageAdapterKinds.legacyAppState,
    read: (key) => `value:${key}`,
  });

  await expect(adapter.read("football-schedule-v1")).resolves.toBe("value:football-schedule-v1");
  await expect(adapter.write("football-schedule-v1", "{}")).rejects.toThrow("read-only");
  await expect(adapter.remove("football-schedule-v1")).rejects.toThrow("Destructive migration paths");
});
