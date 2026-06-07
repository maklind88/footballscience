const planningGuestStatus = { key: "planning-guest", label: "Planning guest", tone: "full", defaultParticipation: 100 };

export function createSessionPlannerMedicalAvailabilitySelectors({
  buildMedicalPlayerFromPlayerProfile = () => null,
  createMedicalRecordFromSquadAvailabilityBlock = () => null,
  getMedicalAvailabilityItems = () => [],
  getMedicalRecordStatus = () => planningGuestStatus,
  getSelectedDate = () => "",
  getSessionPlannerPlayerBoardProfileState = () => ({}),
  getSessionPlannerPlayerBoardSyncedPlayer = (player) => player,
  isMedicalPlayerBlockedBySquadAvailability = () => false,
  isPlayerProfileTemporaryActiveOnDate = () => true,
  isTemporaryPlayerProfile = () => false,
} = {}) {
  function getTemporaryProfileAvailabilityItems(dateValue = getSelectedDate(), existingItems = []) {
    const profileState = getSessionPlannerPlayerBoardProfileState();
    const profiles = Array.isArray(profileState?.players) ? profileState.players : [];
    if (!profiles.length) {
      return [];
    }
    const existingIds = new Set(
      existingItems
        .map((item) => item?.player)
        .flatMap((player) => [player?.id, player?.playerId, player?.profileId, player?.medicalPlayerId])
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
    );
    return profiles
      .filter((profile) => isTemporaryPlayerProfile(profile))
      .filter((profile) => isPlayerProfileTemporaryActiveOnDate(profile, dateValue))
      .filter((profile) => !existingIds.has(String(profile.id ?? "").trim()))
      .map((profile) => buildMedicalPlayerFromPlayerProfile(profile))
      .filter((player) => player && player.id && player.name)
      .filter((player) => !isMedicalPlayerBlockedBySquadAvailability(player))
      .map((player) => ({
        player,
        record: createMedicalRecordFromSquadAvailabilityBlock(player, dateValue),
      }))
      .map(({ player, record }) => ({
        player,
        record,
        status: record ? getMedicalRecordStatus(record) : planningGuestStatus,
        participation: record ? record.participation : 100,
        planningOnly: !record,
      }));
  }

  function getAvailabilityItems(dateValue = getSelectedDate()) {
    const medicalItems = getMedicalAvailabilityItems(dateValue)
      .map((item) => ({
        ...item,
        player: getSessionPlannerPlayerBoardSyncedPlayer(item.player),
      }))
      .filter((item) => !isMedicalPlayerBlockedBySquadAvailability(item.player))
      .filter((item) => !isTemporaryPlayerProfile(item.player) || isPlayerProfileTemporaryActiveOnDate(item.player, dateValue))
      .map((item) =>
        !isTemporaryPlayerProfile(item.player) || item.record
          ? item
          : {
              ...item,
              status: planningGuestStatus,
              participation: 100,
              planningOnly: true,
            }
      );
    const temporaryProfileItems = getTemporaryProfileAvailabilityItems(dateValue, medicalItems);
    return [...medicalItems, ...temporaryProfileItems];
  }

  function getMedicalAvailability(dateValue = getSelectedDate()) {
    const items = getAvailabilityItems(dateValue);
    return {
      all: items,
      limited: items.filter((item) => item.record && item.participation < 100),
      available: items.filter((item) => item.participation === 100),
      unconfirmed: items.filter((item) => !item.record && !item.planningOnly),
    };
  }

  return {
    getAvailabilityItems,
    getMedicalAvailability,
    getTemporaryProfileAvailabilityItems,
  };
}
