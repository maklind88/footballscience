export function createMedicalAvailabilitySelectors({
  compareMedicalPlayers = () => 0,
  ensureMedicalState = () => {},
  getActiveMedicalPlayersForDate = () => [],
  getLatestMedicalRecord = () => null,
  getMedicalRecordStatus = () => ({ key: "not-set", label: "Not set", tone: "missing" }),
} = {}) {
  function getMedicalAvailabilityItems(dateValue = "") {
    ensureMedicalState();
    return getActiveMedicalPlayersForDate(dateValue)
      .sort(compareMedicalPlayers)
      .map((player) => {
        const record = getLatestMedicalRecord(player.id, dateValue);
        const participation = record ? record.participation : null;
        const status = record ? getMedicalRecordStatus(record) : getMedicalRecordStatus(null);
        return { player, record, status, participation };
      })
      .sort((first, second) => {
        if (first.participation === null && second.participation !== null) {
          return 1;
        }
        if (first.participation !== null && second.participation === null) {
          return -1;
        }
        if (first.participation !== second.participation) {
          return first.participation - second.participation;
        }
        return compareMedicalPlayers(first.player, second.player);
      });
  }

  return { getMedicalAvailabilityItems };
}
