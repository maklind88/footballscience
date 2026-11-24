import { createMedicalRuntimeActivitySelectors } from "../medical/medical-runtime-activity-selectors.mjs";

export function createPerformancePlatformAdapter(context) {
  const {
    canRead, getSchedule, getUniqueEvents, getPeriodizationDay, getSessions,
    getSquad, getMedicalState, medicalRules, getDrillLibrary, isTemporaryPlayer, isTemporaryPlayerActive,
  } = context;

  function getAvailability(date, players) {
    const result = new Map();
    if (!players.length || !canRead("medical-team")) return result;
    const state = getMedicalState();
    if (!state) return result;

    // Reuse Medical's dated recommendation and clearance rules over its snapshot.
    // The workspace lifecycle can perform roster maintenance and is not invoked here.
    const medical = createMedicalRuntimeActivitySelectors({ ...medicalRules, getMedicalState: () => state });
    const rosterById = new Map();
    for (const player of state.players ?? []) {
      if (medicalRules.isItemArchived(player)) continue;
      for (const id of new Set([player.id, player.playerId, player.profileId].filter(Boolean))) {
        rosterById.set(id, rosterById.has(id) ? null : player);
      }
    }
    for (const player of players) {
      const medicalPlayer = rosterById.get(player.id);
      if (!medicalPlayer) continue;
      const record = medical.getLatestMedicalRecord(medicalPlayer.id, date);
      if (record) result.set(player.id, record.participation);
    }
    return result;
  }

  function read(date, { includeDrills = false } = {}) {
    const hasSchedule = canRead("schedule");
    const squad = canRead("player-profiles") ? getSquad()?.players ?? [] : [];
    const players = squad
      .filter((player) => player?.id && player.name && !player.archivedAt && !player.deletedAt)
      .filter((player) => !isTemporaryPlayer(player) || isTemporaryPlayerActive(player, date))
      .map(({ id, name, number, position, roleGroup }) => ({ id, name, number, position, roleGroup }));

    return {
      events: hasSchedule ? getUniqueEvents(getSchedule()?.events ?? []) : [],
      getPeriodization: canRead("periodization") ? (day) => getPeriodizationDay(day, hasSchedule) : () => ({}),
      sessions: canRead("session-planner") ? getSessions()?.sessions ?? {} : {},
      players,
      getAvailability: (day) => getAvailability(day, players),
      drills: includeDrills && canRead("session-planner") ? getDrillLibrary() : [],
    };
  }

  return { read };
}
