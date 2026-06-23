import { expect, test } from "@playwright/test";
import {
  createPlayerProfileRuntimeStateService,
  renderPlayerProfileRtpStatusCard,
} from "../src/modules/squad/index.mjs";

test("Player Profile RTP status card renders coach-safe empty state without clearance language", () => {
  const markup = renderPlayerProfileRtpStatusCard(null, { playerId: "player-1" });

  expect(markup).toContain("No coach-safe RTP status available");
  expect(markup).toContain("Progression score – not clearance");
  expect(markup).toContain("data-player-profile-rtp-card");
  expect(markup).not.toContain("Cleared");
  expect(markup).not.toContain("Healthy");
  expect(markup).not.toContain("Available");
});

test("Player Profile RTP status card allowlists coach-safe fields only", () => {
  const markup = renderPlayerProfileRtpStatusCard({
    contractVersion: "footballscience-rtp-coach-read-v1",
    scope: "coach-safe",
    playerId: "player-2",
    statusCard: {
      canTrainToday: "modified",
      canPlayNextMatch: "limited",
      riskLevel: "moderate",
      minutesGuidanceBand: "low",
      minutesRecommendationBand: "high",
      restrictions: ["Non-contact training"],
      positionReadinessBand: "partial",
      nextDecisionPoint: "Complete controlled field exposure.",
    },
    readiness: {
      label: "Progression score – not clearance",
      band: "field-build",
      bandLabel: "Field build",
      exactPercentage: 64,
      components: { sprint: 62 },
    },
    case: {
      hasActiveRtpCase: true,
      rtpStage: "active-rtp",
      medicalConfidenceLevel: "low",
      privateMedicalNotes: "protected note",
      performanceOnlyReason: "raw sprint gap",
    },
  });

  expect(markup).toContain("Coach-safe status");
  expect(markup).toContain("Minutes guidance");
  expect(markup).toContain("Non-contact training");
  expect(markup).toContain("Field build");
  expect(markup).not.toContain("64");
  expect(markup).not.toContain("exactPercentage");
  expect(markup).not.toContain("components");
  expect(markup).not.toContain("medicalConfidenceLevel");
  expect(markup).not.toContain("protected note");
  expect(markup).not.toContain("performanceOnlyReason");
  expect(markup).not.toContain("minutesRecommendationBand");
  expect(markup.toLowerCase()).not.toContain("recommendation");
});

test("Player Profile RTP status hydration reads Sprint 3 coach-safe API and patches only the RTP card", async () => {
  const calls = [];
  let rtpStatusByPlayerId = {};
  let pending = false;
  const card = {
    outerHTML: "",
    getAttribute: (name) => (name === "data-player-profile-rtp-card-player-id" ? "player-3" : ""),
  };
  const service = createPlayerProfileRuntimeStateService({
    fetchFn: async (url, init = {}) => {
      calls.push({ url, init });
      return {
        ok: true,
        text: async () => JSON.stringify({
          contractVersion: "footballscience-rtp-coach-read-v1",
          scope: "coach-safe",
          playerId: "player-3",
          statusCard: {
            canTrainToday: "modified",
            canPlayNextMatch: "limited",
            riskLevel: "moderate",
            minutesGuidanceBand: "low",
            positionReadinessBand: "partial",
          },
          readiness: {
            label: "Progression score – not clearance",
            band: "field-build",
            bandLabel: "Field build",
            exactPercentage: 62,
          },
          case: {
            hasActiveRtpCase: true,
            medicalConfidenceLevel: "low",
          },
        }),
      };
    },
    getHubState: () => ({ activeWorkspaceId: "player-profiles" }),
    getNow: () => "2026-06-23T10:00:00.000Z",
    getPlatformApiAccessToken: async () => "token-1",
    getPlayerProfilesState: () => ({
      selectedPlayerId: "player-3",
      players: [{ id: "player-3", name: "RTP Player" }],
    }),
    getPlayerProfilesWorkspace: () => ({
      querySelectorAll: () => [card],
    }),
    getPlayerProfileRtpCoachStatusByPlayerId: () => rtpStatusByPlayerId,
    getPlayerProfileRtpCoachStatusHydrationPending: () => pending,
    renderPlayerProfileRtpStatusCard,
    setPlayerProfileRtpCoachStatusByPlayerId: (nextState) => {
      rtpStatusByPlayerId = nextState;
    },
    setPlayerProfileRtpCoachStatusHydrationPending: (nextPending) => {
      pending = Boolean(nextPending);
    },
  });

  await service.hydrateSelectedPlayerProfileRtpCoachStatusOnce();

  expect(calls).toHaveLength(1);
  expect(calls[0].url).toBe("/api/rtp?view=coach-player-status&playerId=player-3");
  expect(calls[0].init).toMatchObject({
    method: "GET",
    headers: { Authorization: "Bearer token-1" },
  });
  expect(service.getPlayerProfileRtpCoachStatus("player-3")).toMatchObject({
    scope: "coach-safe",
    statusCard: {
      minutesGuidanceBand: "low",
    },
  });
  expect(card.outerHTML).toContain("Coach-safe status");
  expect(card.outerHTML).toContain("Minutes guidance");
  expect(card.outerHTML).toContain("Field build");
  expect(card.outerHTML).not.toContain("62");
  expect(card.outerHTML).not.toContain("medicalConfidenceLevel");
});
