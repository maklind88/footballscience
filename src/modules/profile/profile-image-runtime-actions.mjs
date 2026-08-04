export function createProfileImageRuntimeActions(deps = {}) {
  const {
    buildPlayerProfileOperationFeedback = (_result, fallback) => fallback,
    canEditPlayerProfiles = () => false,
    createProfileImageDataUrl: createProfileImageDataUrlFromModule = () => Promise.reject(new Error("The image could not be prepared.")),
    createTeamLogoDataUrl: createTeamLogoDataUrlFromModule = createProfileImageDataUrlFromModule,
    documentRef = globalThis.document,
    ensurePlayerProfilesState = () => {},
    getCurrentPlatformUser = () => null,
    getPlatformTeamDisplayTeam = () => null,
    getPlayerProfilesState = () => ({ players: [] }),
    ImageCtor = globalThis.Image,
    maxProfileImageUploadDataUrlLength = 900000,
    maxTeamLogoUploadDataUrlLength = maxProfileImageUploadDataUrlLength,
    readPlatformStructureState = () => ({}),
    renderPlayerProfilesWorkspace = () => {},
    updatePlayerProfile = () => null,
    URLRef = globalThis.URL,
    writePlatformTeamLogo = () => {},
  } = deps;

  function createProfileImageDataUrl(file) {
    return createProfileImageDataUrlFromModule(file, {
      documentRef,
      ImageCtor,
      maxUploadDataUrlLength: maxProfileImageUploadDataUrlLength,
      URLRef,
    });
  }

  function createTeamLogoDataUrl(file) {
    return createTeamLogoDataUrlFromModule(file, {
      documentRef,
      ImageCtor,
      maxUploadDataUrlLength: maxTeamLogoUploadDataUrlLength,
      URLRef,
    });
  }

  async function uploadSquadTeamLogo(file) {
    if (!canEditPlayerProfiles()) {
      renderPlayerProfilesWorkspace({
        status: "warning",
        lines: ["Your role cannot update the team logo."],
      });
      return;
    }
    if (!file) {
      return;
    }
    const structure = readPlatformStructureState();
    const team = getPlatformTeamDisplayTeam(getCurrentPlatformUser(), structure);
    if (!team?.id) {
      renderPlayerProfilesWorkspace({
        status: "warning",
        lines: ["No active team was available for logo upload."],
      });
      return;
    }
    try {
      const logoUrl = await createTeamLogoDataUrl(file);
      writePlatformTeamLogo(team.id, logoUrl);
      renderPlayerProfilesWorkspace("Team logo saved.");
    } catch (error) {
      const message =
        error?.name === "QuotaExceededError"
          ? "Team logo could not be saved because local storage is full."
          : String(error?.message || "Team logo could not be saved.").replace(/profile image/gi, "team logo");
      renderPlayerProfilesWorkspace(message);
    }
  }

  async function uploadPlayerProfilePhoto(playerId, file) {
    if (!canEditPlayerProfiles()) {
      renderPlayerProfilesWorkspace({
        status: "warning",
        lines: ["Your role cannot update player images."],
      });
      return;
    }
    if (!file) {
      return;
    }
    ensurePlayerProfilesState();
    const playerProfilesState = getPlayerProfilesState();
    const player = playerProfilesState.players.find((candidate) => candidate.id === playerId);
    if (!player) {
      renderPlayerProfilesWorkspace({
        status: "warning",
        lines: ["Player profile could not be found for image upload."],
      });
      return;
    }
    try {
      const photoUrl = await createProfileImageDataUrl(file);
      const result = updatePlayerProfile({ ...player, playerId: player.id, photoUrl });
      renderPlayerProfilesWorkspace(
        buildPlayerProfileOperationFeedback(result, result?.ok ? "Player image saved." : "Player image could not be saved.")
      );
    } catch (error) {
      const message =
        error?.name === "QuotaExceededError"
          ? "Player image could not be saved because local storage is full."
          : String(error?.message || "Player image could not be saved.").replace(/profile image/gi, "player image");
      renderPlayerProfilesWorkspace(message);
    }
  }

  function handlePhotoInput(playerPhotoInput) {
    if (!playerPhotoInput) return;
    const file = playerPhotoInput.files?.[0] ?? null;
    playerPhotoInput.value = "";
    void uploadPlayerProfilePhoto(playerPhotoInput.dataset.playerProfilePhotoUpload || "", file);
  }

  return {
    createProfileImageDataUrl,
    createTeamLogoDataUrl,
    handlePhotoInput,
    uploadPlayerProfilePhoto,
    uploadSquadTeamLogo,
  };
}
