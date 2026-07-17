import { expect, test } from "@playwright/test";
import { createMedicalRtpLibraryReadService } from "../src/modules/medical/medical-rtp-library-read-service.mjs";

const fallbackProfile = {
  id: "hamstring-strain",
  name: "Hamstring Strain",
  summary: "Bundled fallback summary",
  redFlags: ["Palpable defect"],
  goldStandardSections: Array.from({ length: 37 }, (_, index) => ({ title: `Section ${index + 1}` })),
};

test("RTP Library read service loads database list and lazy detail through guarded GET requests", async () => {
  const requests = [];
  const fetchRef = async (pathname, options) => {
    requests.push({ pathname, options });
    const detail = pathname.includes("library-profile");
    return {
      ok: true,
      json: async () =>
        detail
          ? {
              ok: true,
              source: "database",
              profile: { id: "hamstring-strain", name: "Hamstring Strain", summary: "Database detail" },
              exercises: [{ id: "bridge", name: "Bridge" }],
            }
          : {
              ok: true,
              source: "database",
              profiles: [{ id: "hamstring-strain", name: "Hamstring Strain", summary: "Database list" }],
            },
    };
  };
  const service = createMedicalRtpLibraryReadService({
    fallbackProfiles: [fallbackProfile],
    fetchRef,
    getAccessToken: async () => "full-length-access-token",
    getFallbackProfile: () => fallbackProfile,
    getFallbackExercises: () => [{ id: "fallback-bridge" }],
    now: () => 100,
  });

  const listResult = await service.loadProfiles();
  expect(listResult.changed).toBe(true);
  expect(listResult.source).toBe("database");
  expect(service.getProfiles()[0]).toMatchObject({
    summary: "Database list",
    redFlags: ["Palpable defect"],
  });

  const profile = await service.loadProfile("hamstring-strain");
  expect(profile).toMatchObject({ summary: "Database detail", redFlags: ["Palpable defect"] });
  expect(service.getExercisesForProfile("hamstring-strain")).toEqual([{ id: "bridge", name: "Bridge" }]);
  expect(requests.map((request) => request.pathname)).toEqual([
    "/api/rtp?view=library&limit=250",
    "/api/rtp?view=library-profile&profileId=hamstring-strain",
  ]);
  expect(requests.every((request) => !request.options.method || request.options.method === "GET")).toBe(true);
  expect(requests.every((request) => request.options.headers.Authorization === "Bearer full-length-access-token")).toBe(true);
});

test("RTP Library read service remains useful when API access is unavailable", async () => {
  const service = createMedicalRtpLibraryReadService({
    fallbackProfiles: [fallbackProfile],
    fetchRef: async () => {
      throw new Error("offline");
    },
    getAccessToken: async () => "",
    getFallbackProfile: () => fallbackProfile,
    getFallbackExercises: () => [{ id: "fallback-bridge" }],
  });

  const result = await service.loadProfiles();
  expect(result.changed).toBe(false);
  expect(result.source).toBe("module-fallback");
  expect(service.getProfile("hamstring-strain")).toBe(fallbackProfile);
  expect(service.getExercisesForProfile("hamstring-strain")).toEqual([{ id: "fallback-bridge" }]);
});
