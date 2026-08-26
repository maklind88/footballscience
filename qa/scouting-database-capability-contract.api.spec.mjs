import { expect, test } from "@playwright/test";
import {
  createScoutingDatabaseCapabilityService,
  normalizeScoutingDatabaseCapability,
} from "../src/modules/scouting/scouting-database-capability.mjs";

test("Scouting capability normalizes versioned server readiness", () => {
  expect(normalizeScoutingDatabaseCapability({
    enabled: true,
    canAdministerData: true,
    dataset: {
      available: true,
      ready: true,
      versioningAvailable: true,
      readMode: "versioned",
      rowCount: 24351,
      metricCount: 100,
      activeDatasetVersion: { id: "version-1" },
    },
  })).toEqual({
    available: true,
    ready: true,
    versioningAvailable: true,
    canAdministerData: true,
    readMode: "versioned",
    rowCount: 24351,
    metricCount: 100,
    activeDatasetVersion: { id: "version-1" },
    degraded: false,
    fallbackReason: "",
  });
});

test("Scouting capability caches readiness and fails closed to legacy file mode", async () => {
  let calls = 0;
  const service = createScoutingDatabaseCapabilityService({
    fetchStatus: async () => {
      calls += 1;
      return { ok: true, result: { enabled: true, dataset: { ready: true, available: true } } };
    },
    now: () => 1000,
  });
  await expect(service.shouldUseServer()).resolves.toBe(true);
  await expect(service.shouldUseServer()).resolves.toBe(true);
  expect(calls).toBe(1);
  service.invalidate();
  await service.load();
  expect(calls).toBe(2);

  const unavailable = createScoutingDatabaseCapabilityService({ fetchStatus: async () => ({ ok: false }) });
  await expect(unavailable.shouldUseServer()).resolves.toBe(false);
  await expect(unavailable.load()).resolves.toMatchObject({
    degraded: true,
    fallbackReason: "The server dataset status could not be verified.",
    readMode: "legacy-file",
    ready: false,
  });
});
