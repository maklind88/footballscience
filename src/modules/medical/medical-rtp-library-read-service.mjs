const CACHE_TTL_MS = 5 * 60 * 1000;

const normalizeId = (value = "") => String(value || "").trim().toLowerCase();
const asArray = (value = []) => (Array.isArray(value) ? value : []);

function mergeProfileListItem(databaseProfile = {}, fallbackProfile = null) {
  if (!fallbackProfile) {
    return { ...databaseProfile };
  }
  return {
    ...fallbackProfile,
    ...databaseProfile,
    symptoms: asArray(databaseProfile.symptoms).length ? databaseProfile.symptoms : fallbackProfile.symptoms,
    positions: asArray(databaseProfile.positions).length ? databaseProfile.positions : fallbackProfile.positions,
    movementPlanes: asArray(databaseProfile.movementPlanes).length
      ? databaseProfile.movementPlanes
      : fallbackProfile.movementPlanes,
    riskTags: asArray(databaseProfile.riskTags).length ? databaseProfile.riskTags : fallbackProfile.riskTags,
  };
}

export function createMedicalRtpLibraryReadService({
  fetchRef,
  getAccessToken,
  fallbackProfiles = [],
  getFallbackProfile = () => null,
  getFallbackExercises = () => [],
  now = () => Date.now(),
} = {}) {
  let profiles = [...fallbackProfiles];
  let listLoadedAt = 0;
  let source = "module-fallback";
  let sourceReason = "";
  let listRequest = null;
  const profileDetails = new Map();
  const exercisesByProfileId = new Map();

  const getProfile = (profileId = "") => {
    const normalizedProfileId = normalizeId(profileId);
    return profileDetails.get(normalizedProfileId) || getFallbackProfile(normalizedProfileId) || null;
  };

  const getExercisesForProfile = (profileId = "", options = {}) => {
    const normalizedProfileId = normalizeId(profileId);
    const limit = Number.isFinite(Number(options.limit)) ? Math.max(1, Number(options.limit)) : Number.POSITIVE_INFINITY;
    const cached = exercisesByProfileId.get(normalizedProfileId);
    const exercises = Array.isArray(cached) ? cached : getFallbackExercises(normalizedProfileId, options);
    return asArray(exercises).slice(0, limit);
  };

  const getReadStatus = () => ({
    source,
    sourceReason,
    loadedAt: listLoadedAt,
    isDatabaseBacked: source === "database",
  });

  async function fetchPayload(pathname) {
    const token = await getAccessToken?.();
    if (!token || typeof fetchRef !== "function") {
      return null;
    }
    const response = await fetchRef(pathname, {
      headers: {
        Authorization: `Bearer ${String(token).trim()}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });
    if (!response?.ok) {
      return null;
    }
    const payload = await response.json().catch(() => null);
    return payload && typeof payload === "object" && payload.ok !== false ? payload : null;
  }

  async function loadProfiles({ force = false } = {}) {
    if (!force && listLoadedAt && now() - listLoadedAt < CACHE_TTL_MS) {
      return { changed: false, profiles, ...getReadStatus() };
    }
    if (listRequest) {
      return listRequest;
    }
    listRequest = (async () => {
      try {
        const payload = await fetchPayload("/api/rtp?view=library&limit=250");
        if (!payload || !Array.isArray(payload.profiles)) {
          return { changed: false, profiles, ...getReadStatus() };
        }
        const fallbackById = new Map(fallbackProfiles.map((profile) => [normalizeId(profile.id), profile]));
        profiles = payload.profiles.map((profile) =>
          mergeProfileListItem(profile, fallbackById.get(normalizeId(profile.id)))
        );
        source = String(payload.source || "database");
        sourceReason = String(payload.sourceReason || "");
        listLoadedAt = now();
        return { changed: true, profiles, ...getReadStatus() };
      } catch {
        return { changed: false, profiles, ...getReadStatus() };
      } finally {
        listRequest = null;
      }
    })();
    return listRequest;
  }

  async function loadProfile(profileId = "", { force = false } = {}) {
    const normalizedProfileId = normalizeId(profileId);
    if (!normalizedProfileId) {
      return null;
    }
    if (!force && profileDetails.has(normalizedProfileId)) {
      return profileDetails.get(normalizedProfileId);
    }
    try {
      const payload = await fetchPayload(
        `/api/rtp?view=library-profile&profileId=${encodeURIComponent(normalizedProfileId)}`
      );
      if (!payload?.profile) {
        return getProfile(normalizedProfileId);
      }
      const fallback = getFallbackProfile(normalizedProfileId);
      const detail = fallback ? { ...fallback, ...payload.profile } : payload.profile;
      profileDetails.set(normalizedProfileId, detail);
      exercisesByProfileId.set(normalizedProfileId, asArray(payload.exercises));
      source = String(payload.source || source);
      sourceReason = String(payload.sourceReason || "");
      return detail;
    } catch {
      return getProfile(normalizedProfileId);
    }
  }

  return {
    getExercisesForProfile,
    getProfile,
    getProfiles: () => profiles,
    getReadStatus,
    loadProfile,
    loadProfiles,
  };
}
