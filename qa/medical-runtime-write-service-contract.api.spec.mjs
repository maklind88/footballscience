import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createMedicalRuntimeWriteService } from "../src/modules/medical/index.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function readProjectFile(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function createHarness(overrides = {}) {
  let recordCounter = 1;
  let planCounter = 1;
  let medicalState = overrides.state || {
    selectedDate: "2026-05-31",
    selectedPlayerId: "p1",
    players: [
      { id: "p1", number: "10", name: "Alex Morgan", position: "FW" },
      { id: "p2", number: "8", name: "Sam Kerr", position: "FW" },
    ],
    records: [
      { id: "r-old", playerId: "p2", date: "2026-05-31", status: "modified", participation: 75, createdAt: "2026-05-31T09:00:00.000Z" },
    ],
    injuryPlans: [
      { id: "plan-old", playerId: "p2", startDate: "2026-05-01", endDate: "2026-06-15", rtpPhase: "modified-team", createdAt: "2026-05-01T09:00:00.000Z" },
    ],
  };
  const commits = [];
  const renders = [];
  const writes = [];
  const modal = { open: false, tab: "" };
  const service = createMedicalRuntimeWriteService({
    addCalendarDays: (date, days) => {
      const next = new Date(date);
      next.setUTCDate(next.getUTCDate() + Number(days || 0));
      return next;
    },
    cloneMedicalState: (state) => JSON.parse(JSON.stringify(state)),
    commitMedicalClinicalState: (type, summary) => {
      commits.push({ type, summary });
      writes.push("commit");
    },
    ensureMedicalState: () => medicalState,
    formatDateValue: (date) => new Date(date).toISOString().slice(0, 10),
    getActiveMedicalPlayers: () => medicalState.players.filter((player) => !player.archivedAt),
    getCurrentMedicalActorId: () => "medical-user",
    getCurrentPlatformUser: () => ({ id: "medical-user" }),
    getMedicalClearanceValues: (values = {}) => ({ doctor: Boolean(values.doctor) }),
    getMedicalLoadGateValues: (values = {}) => ({ running: values.running || "pending" }),
    getMedicalRecommendationActivityContext: (dateValue) => ({
      isRecommendable: dateValue !== "2026-06-02",
      type: "training",
    }),
    getMedicalRemovedSquadPlayerIdSet: () => new Set(["removed"]),
    getMedicalRtpPhaseOption: (key) => ({ key, label: "Full training", status: "full", participation: 100 }),
    getMedicalState: () => medicalState,
    getMedicalStatusForParticipation: (participation) => participation >= 100 ? "full" : participation > 0 ? "modified" : "unavailable",
    isDateValue: (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")),
    isMedicalItemArchived: (item) => Boolean(item?.archivedAt),
    isMedicalPlayerBlockedBySquadAvailability: (player) => player?.blocked === true,
    isMedicalPlayerRemovedFromSquad: (player, removedIds) => removedIds.has(player.id),
    medicalStatusOptions: [{ key: "full" }, { key: "modified" }, { key: "unavailable" }],
    normalizeMedicalInjuryPlan: (value = {}) => value && value.playerId ? { id: value.id || `plan-${planCounter++}`, ...value } : null,
    normalizeMedicalParticipation: (value, fallback = 100) => {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : fallback;
    },
    normalizeMedicalPlayer: (value = {}) => value && value.id ? { ...value } : null,
    normalizeMedicalRecord: (value = {}) => value && value.playerId ? { id: value.id || `record-${recordCounter++}`, ...value } : null,
    parseDateValue: (value) => new Date(`${value}T00:00:00.000Z`),
    renderMedicalTeamWorkspace: (message = "") => renders.push(message),
    setMedicalPlayerModalOpen: (isOpen) => {
      modal.open = Boolean(isOpen);
    },
    setMedicalPlayerModalTab: (tab) => {
      modal.tab = tab;
    },
    setMedicalState: (nextState) => {
      medicalState = nextState;
    },
    writeMedicalState: () => writes.push("write"),
    ...overrides.deps,
  });
  return {
    commits,
    getState: () => medicalState,
    modal,
    renders,
    service,
    writes,
  };
}

test("Medical runtime write service owns protected Medical writes outside app-runtime", () => {
  const app = readProjectFile("app-runtime.js");
  const service = readProjectFile("src/modules/medical/medical-runtime-write-service.mjs");
  const index = readProjectFile("src/modules/medical/index.mjs");

  expect(typeof createMedicalRuntimeWriteService).toBe("function");
  expect(app).toContain("createMedicalRuntimeWriteService({");
  expect(app).toContain("function addMedicalRecord(...args)");
  expect(app).toContain("function removeMedicalPlayer(...args)");
  expect(app).not.toContain("function addMedicalRecord(values, options = {}) {");
  expect(app).not.toContain("function updateMedicalPlanClearance(values) {");
  expect(service).toContain("function addMedicalRecord(values, options = {})");
  expect(service).toContain("function updateMedicalPlanClearance(values)");
  expect(service).toContain("commitMedicalClinicalState");
  expect(service).not.toContain("renderDashboardChatWidget");
  expect(index).toContain('export * from "./medical-runtime-write-service.mjs";');
});

test("Medical runtime write service preserves record saves and protected archiving", () => {
  const harness = createHarness();
  const record = harness.service.addMedicalRecord({
    playerId: "p1",
    date: "2026-06-01",
    status: "bad",
    participation: 75,
    comment: "Limit load",
    coachNote: "Modified",
    shareWithCoach: true,
    rtpPhase: "modified-team",
  });

  expect(record).toMatchObject({
    id: "record-1",
    playerId: "p1",
    status: "modified",
    participation: 75,
    createdBy: "medical-user",
  });
  expect(harness.getState()).toMatchObject({
    selectedDate: "2026-06-01",
    selectedPlayerId: "p1",
  });
  expect(harness.commits.at(-1)).toMatchObject({
    type: "recommendation-saved",
    summary: "Alex Morgan: 75% recommendation saved.",
  });

  const archivedPlayer = harness.service.removeMedicalPlayer("p2");
  expect(archivedPlayer).toMatchObject({
    id: "p2",
    archivedBy: "medical-user",
    archiveReason: "Manual archive from Medical Room",
  });
  expect(harness.getState().records.find((item) => item.id === "r-old")).toMatchObject({
    archivedBy: "medical-user",
    archiveReason: "Player archived from Medical Room",
  });
  expect(harness.getState().injuryPlans.find((item) => item.id === "plan-old")).toMatchObject({
    archivedBy: "medical-user",
    archiveReason: "Player archived from Medical Room",
  });
  expect(harness.commits.at(-1).type).toBe("player-archived");
});

test("Medical runtime write service preserves plans, clearance, roster upsert, and modal/date UI hooks", () => {
  const harness = createHarness();

  expect(harness.service.updateMedicalPlayerProfile({ playerId: "p1", number: "11", name: "Alex M", position: "ST", photoUrl: "photo.png" })).toBe(true);
  expect(harness.getState().players.find((player) => player.id === "p1")).toMatchObject({
    number: "11",
    name: "Alex M",
    position: "ST",
    photoUrl: "photo.png",
  });
  expect(harness.commits.at(-1).type).toBe("player-profile-saved");

  const plan = harness.service.addMedicalInjuryPlan({
    playerId: "p1",
    startDate: "2026-06-01",
    endDate: "2026-06-20",
    rtpPhase: "modified-team",
    doctor: true,
    running: "pass",
  });
  expect(plan).toMatchObject({
    id: "plan-1",
    createdBy: "medical-user",
    clearance: { doctor: true },
    gates: { running: "pass" },
  });
  expect(harness.commits.at(-1).type).toBe("availability-plan-created");

  expect(harness.service.updateMedicalPlanClearance({ planId: plan.id, rtpPhase: "full-training", doctor: true, running: "pass" })).toMatchObject({
    status: "full",
    participation: 100,
    rtpPhase: "full-training",
    clearance: { doctor: true },
  });
  expect(harness.commits.at(-1).type).toBe("clearance-saved");

  harness.service.upsertMedicalPlayers([
    { id: "p1", number: "11", name: "Alex M", position: "FW" },
    { id: "p3", number: "7", name: "New Player", position: "W" },
    { id: "removed", number: "99", name: "Removed Player", position: "CM" },
  ]);
  expect(harness.getState().players.map((player) => player.id)).toContain("p3");
  expect(harness.writes).toContain("write");

  harness.service.openMedicalPlayerModal("p1");
  expect(harness.modal).toEqual({ open: true, tab: "availability" });
  expect(harness.renders.at(-1)).toBe("");
  harness.service.closeMedicalPlayerModal("Closed");
  expect(harness.modal).toEqual({ open: false, tab: "availability" });
  expect(harness.renders.at(-1)).toBe("Closed");

  harness.service.setMedicalSelectedDate("2026-06-03");
  expect(harness.getState().selectedDate).toBe("2026-06-03");
  harness.service.shiftMedicalSelectedDate(1);
  expect(harness.getState().selectedDate).toBe("2026-06-04");
});
