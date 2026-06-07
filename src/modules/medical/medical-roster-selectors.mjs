export function createMedicalRosterSelectors({
  compareMedicalPlayers = () => 0,
  getLatestMedicalRecord = () => null,
  getMedicalPlayerPositionRank = () => 99,
  getSelectedDate = () => "",
  medicalPositionOrder = {},
  normalizeMedicalPlayerPosition = (value) => String(value || "Unassigned"),
} = {}) {
  function getMedicalRosterPositionGroups(players = []) {
    const groups = new Map();
    players
      .slice()
      .sort((first, second) => {
        const positionComparison = getMedicalPlayerPositionRank(first) - getMedicalPlayerPositionRank(second);
        return positionComparison || compareMedicalPlayers(first, second);
      })
      .forEach((player) => {
        const position = normalizeMedicalPlayerPosition(player.position, player);
        const group = groups.get(position) ?? { position, players: [] };
        group.players.push(player);
        groups.set(position, group);
      });
    return Array.from(groups.values()).sort((first, second) => {
      const positionComparison = (medicalPositionOrder[first.position] ?? 99) - (medicalPositionOrder[second.position] ?? 99);
      return positionComparison || first.position.localeCompare(second.position);
    });
  }

  function getMedicalRosterPositionStats(players = []) {
    const selectedDate = getSelectedDate();
    return players.reduce(
      (stats, player) => {
        const record = getLatestMedicalRecord(player.id, selectedDate);
        stats.total += 1;
        if (!record) {
          stats.missing += 1;
          return stats;
        }
        stats.logged += 1;
        if (record.participation === 100) {
          stats.full += 1;
        } else if (record.participation === 0) {
          stats.unavailable += 1;
        } else {
          stats.modified += 1;
        }
        return stats;
      },
      { total: 0, logged: 0, full: 0, modified: 0, unavailable: 0, missing: 0 }
    );
  }

  return {
    getMedicalRosterPositionGroups,
    getMedicalRosterPositionStats,
  };
}
