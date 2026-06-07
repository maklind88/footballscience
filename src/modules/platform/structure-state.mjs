function normalizeSet(candidate) {
  return candidate instanceof Set ? candidate : new Set(Array.isArray(candidate) ? candidate : []);
}

function defaultTeamLogoUrl(team = {}) {
  return String(team?.logoUrl || team?.logo_url || team?.logo || team?.badgeUrl || team?.crestUrl || "").trim();
}

export function createPlatformStructureStateHelpers(options = {}) {
  const defaultClubId = options.defaultClubId || "club-north-carolina-courage";
  const defaultTeamId = options.defaultTeamId || "team-north-carolina-courage";
  const defaultClubName = options.defaultClubName || "North Carolina Courage";
  const defaultClubShortName = options.defaultClubShortName || "NCC";
  const defaultTeamName = options.defaultTeamName || defaultClubName;
  const defaultTeamLevel = options.defaultTeamLevel || "First Team";
  const legacyValues = normalizeSet(options.legacyValues);
  const canonicalClubValues = normalizeSet(options.canonicalClubValues);
  const canonicalTeamValues = normalizeSet(options.canonicalTeamValues);
  const getTeamLogoUrl = typeof options.getTeamLogoUrl === "function" ? options.getTeamLogoUrl : defaultTeamLogoUrl;

  const defaultStructureState = Object.freeze({
    version: 1,
    activeClubId: defaultClubId,
    activeTeamId: defaultTeamId,
    clubs: Object.freeze([
      Object.freeze({
        id: defaultClubId,
        name: defaultClubName,
        shortName: defaultClubShortName,
        status: "active",
      }),
    ]),
    teams: Object.freeze([
      Object.freeze({
        id: defaultTeamId,
        clubId: defaultClubId,
        name: defaultTeamName,
        shortName: defaultClubShortName,
        level: defaultTeamLevel,
        season: "2026",
        status: "active",
      }),
    ]),
    memberships: Object.freeze([]),
  });

  function cloneDefaultPlatformStructureState() {
    return {
      version: defaultStructureState.version,
      activeClubId: defaultStructureState.activeClubId,
      activeTeamId: defaultStructureState.activeTeamId,
      clubs: defaultStructureState.clubs.map((club) => ({ ...club })),
      teams: defaultStructureState.teams.map((team) => ({ ...team })),
      memberships: [],
    };
  }

  function normalizePlatformStructureText(value, fallback = "") {
    return String(value || fallback).trim();
  }

  function normalizePlatformStructureComparable(value = "") {
    return normalizePlatformStructureText(value, "").toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  }

  function isLegacyPlatformStructureValue(value = "") {
    const normalized = normalizePlatformStructureComparable(value);
    return Boolean(normalized && (legacyValues.has(normalized) || normalized.includes("football science live")));
  }

  function isCanonicalPlatformClubValue(value = "") {
    const normalized = normalizePlatformStructureComparable(value);
    return Boolean(normalized && canonicalClubValues.has(normalized));
  }

  function isCanonicalPlatformTeamValue(value = "") {
    const normalized = normalizePlatformStructureComparable(value);
    return Boolean(normalized && canonicalTeamValues.has(normalized));
  }

  function isLegacyPlatformClub(candidate = {}) {
    return [
      candidate.id,
      candidate.clubId,
      candidate.club_id,
      candidate.name,
      candidate.clubName,
      candidate.club,
      candidate.shortName,
      candidate.slug,
    ].some(isLegacyPlatformStructureValue);
  }

  function isLegacyPlatformTeam(candidate = {}) {
    return [
      candidate.id,
      candidate.teamId,
      candidate.team_id,
      candidate.name,
      candidate.teamName,
      candidate.team,
      candidate.shortName,
      candidate.slug,
    ].some(isLegacyPlatformStructureValue);
  }

  function isCanonicalPlatformClub(candidate = {}) {
    return [
      candidate.id,
      candidate.clubId,
      candidate.club_id,
      candidate.name,
      candidate.clubName,
      candidate.club,
      candidate.shortName,
      candidate.slug,
    ].some(isCanonicalPlatformClubValue);
  }

  function isCanonicalPlatformTeam(candidate = {}) {
    return [
      candidate.id,
      candidate.teamId,
      candidate.team_id,
      candidate.name,
      candidate.teamName,
      candidate.team,
      candidate.shortName,
      candidate.slug,
    ].some(isCanonicalPlatformTeamValue);
  }

  function hasPlatformWorkspaceScope(user = {}) {
    return [
      user.clubId,
      user.club_id,
      user.clubName,
      user.club,
      user.teamId,
      user.team_id,
      user.teamName,
      user.team,
    ].some(isLegacyPlatformStructureValue);
  }

  function slugifyPlatformStructureValue(value, fallback = "scope") {
    return (
      String(value || "")
        .trim()
        .toLowerCase()
        .replace(/&/g, " and ")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48) || fallback
    );
  }

  function normalizePlatformStructureId(value, prefix, fallbackLabel) {
    const raw = String(value || "").trim();
    if (raw && raw.length <= 80 && /^[a-z0-9][a-z0-9._:-]*$/i.test(raw)) {
      return raw.toLowerCase();
    }
    return `${prefix}-${slugifyPlatformStructureValue(fallbackLabel, prefix)}`;
  }

  function createPlatformStructureId(prefix, label, usedIds = new Set()) {
    const baseId = normalizePlatformStructureId("", prefix, label);
    let nextId = baseId;
    let index = 2;
    while (usedIds.has(nextId)) {
      nextId = `${baseId}-${index}`;
      index += 1;
    }
    return nextId;
  }

  function normalizePlatformClub(club = {}, fallback = {}) {
    const name = normalizePlatformStructureText(club.name || club.clubName, fallback.name || "Club");
    return {
      id: normalizePlatformStructureId(club.id || club.clubId, "club", name),
      name,
      shortName: normalizePlatformStructureText(club.shortName || club.short_name, fallback.shortName || name),
      status: String(club.status || fallback.status || "active").trim().toLowerCase() === "archived" ? "archived" : "active",
    };
  }

  function normalizePlatformTeam(team = {}, fallback = {}) {
    const name = normalizePlatformStructureText(team.name || team.teamName || team.team, fallback.name || "Team");
    return {
      id: normalizePlatformStructureId(team.id || team.teamId, "team", name),
      clubId: normalizePlatformStructureId(team.clubId || team.club_id || fallback.clubId, "club", fallback.clubName || "Club"),
      name,
      shortName: normalizePlatformStructureText(team.shortName || team.short_name, fallback.shortName || name),
      logoUrl: getTeamLogoUrl(team) || getTeamLogoUrl(fallback),
      level: normalizePlatformStructureText(team.level || team.ageGroup || team.age_group, fallback.level || "First Team"),
      season: normalizePlatformStructureText(team.season, fallback.season || "2026"),
      status: String(team.status || fallback.status || "active").trim().toLowerCase() === "archived" ? "archived" : "active",
    };
  }

  function normalizePlatformStructureState(candidate = {}) {
    const fallback = cloneDefaultPlatformStructureState();
    const sourceClubs = Array.isArray(candidate.clubs) && candidate.clubs.length ? candidate.clubs : fallback.clubs;
    const clubIds = new Set();
    const clubIdRedirects = new Map();
    const clubs = [];
    sourceClubs.forEach((club) => {
      const normalizedClub = normalizePlatformClub(club, fallback.clubs[0]);
      const originalClubId = normalizePlatformStructureText(club?.id || club?.clubId || club?.club_id || normalizedClub.id, "");
      if (isLegacyPlatformClub(club) || isLegacyPlatformClub(normalizedClub)) {
        if (originalClubId) {
          clubIdRedirects.set(originalClubId, defaultClubId);
        }
        return;
      }
      if (isCanonicalPlatformClub(club) || isCanonicalPlatformClub(normalizedClub)) {
        if (originalClubId) {
          clubIdRedirects.set(originalClubId, defaultClubId);
        }
        normalizedClub.id = defaultClubId;
        normalizedClub.name = defaultClubName;
        normalizedClub.shortName = defaultClubShortName;
        normalizedClub.status = "active";
      }
      const existingByName = clubs.findIndex((candidateClub) => candidateClub.name.toLowerCase() === normalizedClub.name.toLowerCase());
      if (existingByName >= 0) {
        if (originalClubId) {
          clubIdRedirects.set(originalClubId, clubs[existingByName].id);
        }
        clubs[existingByName] = {
          ...clubs[existingByName],
          ...normalizedClub,
          id: clubs[existingByName].id,
          name: clubs[existingByName].name,
          shortName: clubs[existingByName].shortName || normalizedClub.shortName,
          logoUrl: normalizedClub.logoUrl || clubs[existingByName].logoUrl,
        };
        return;
      }
      if (clubIds.has(normalizedClub.id)) {
        normalizedClub.id = createPlatformStructureId("club", normalizedClub.name, clubIds);
      }
      if (originalClubId) {
        clubIdRedirects.set(originalClubId, normalizedClub.id);
      }
      clubIds.add(normalizedClub.id);
      clubs.push(normalizedClub);
    });
    if (!clubIds.has(defaultClubId)) {
      clubs.unshift({ ...fallback.clubs[0] });
      clubIds.add(defaultClubId);
    }
    const sourceTeams = Array.isArray(candidate.teams) && candidate.teams.length ? candidate.teams : fallback.teams;
    const teamIds = new Set();
    const teamIdRedirects = new Map();
    const teams = [];
    sourceTeams.forEach((team) => {
      const normalizedTeam = normalizePlatformTeam(team, fallback.teams[0]);
      const originalTeamId = normalizePlatformStructureText(team?.id || team?.teamId || team?.team_id || normalizedTeam.id, "");
      if (isLegacyPlatformTeam(team) || isLegacyPlatformTeam(normalizedTeam)) {
        if (originalTeamId) {
          teamIdRedirects.set(originalTeamId, defaultTeamId);
        }
        return;
      }
      if (clubIdRedirects.has(normalizedTeam.clubId)) {
        normalizedTeam.clubId = clubIdRedirects.get(normalizedTeam.clubId);
      }
      if (!clubIds.has(normalizedTeam.clubId)) {
        normalizedTeam.clubId = defaultClubId;
      }
      if (isCanonicalPlatformTeam(team) || isCanonicalPlatformTeam(normalizedTeam)) {
        if (originalTeamId) {
          teamIdRedirects.set(originalTeamId, defaultTeamId);
        }
        normalizedTeam.id = defaultTeamId;
        normalizedTeam.clubId = defaultClubId;
        normalizedTeam.name = defaultTeamName;
        normalizedTeam.shortName = defaultClubShortName;
        normalizedTeam.level = defaultTeamLevel;
        normalizedTeam.status = "active";
      }
      const existingByName = teams.findIndex(
        (candidateTeam) =>
          candidateTeam.clubId === normalizedTeam.clubId &&
          candidateTeam.name.toLowerCase() === normalizedTeam.name.toLowerCase()
      );
      if (existingByName >= 0) {
        if (originalTeamId) {
          teamIdRedirects.set(originalTeamId, teams[existingByName].id);
        }
        teams[existingByName] = {
          ...teams[existingByName],
          ...normalizedTeam,
          id: teams[existingByName].id,
          clubId: teams[existingByName].clubId,
          name: teams[existingByName].name,
          shortName: teams[existingByName].shortName || normalizedTeam.shortName,
          logoUrl: normalizedTeam.logoUrl || teams[existingByName].logoUrl,
        };
        return;
      }
      if (teamIds.has(normalizedTeam.id)) {
        normalizedTeam.id = createPlatformStructureId("team", normalizedTeam.name, teamIds);
      }
      if (originalTeamId) {
        teamIdRedirects.set(originalTeamId, normalizedTeam.id);
      }
      teamIds.add(normalizedTeam.id);
      teams.push(normalizedTeam);
    });
    if (!teamIds.has(defaultTeamId)) {
      teams.unshift({ ...fallback.teams[0] });
      teamIds.add(defaultTeamId);
    }
    const memberships = Array.isArray(candidate.memberships)
      ? candidate.memberships
          .filter(Boolean)
          .map((membership) => {
            if (!membership || typeof membership !== "object") {
              return membership;
            }
            const nextMembership = { ...membership };
            const rawClubId = normalizePlatformStructureText(nextMembership.clubId || nextMembership.club_id, "");
            const rawTeamId = normalizePlatformStructureText(nextMembership.teamId || nextMembership.team_id, "");
            const mappedTeamId =
              teamIdRedirects.get(rawTeamId) ||
              (isLegacyPlatformStructureValue(rawTeamId) ? defaultTeamId : rawTeamId);
            const mappedTeam = teams.find((team) => team.id === mappedTeamId) || teams.find((team) => team.id === defaultTeamId);
            const mappedClubId =
              clubIdRedirects.get(rawClubId) ||
              mappedTeam?.clubId ||
              (isLegacyPlatformStructureValue(rawClubId) ? defaultClubId : rawClubId);
            if (mappedTeam?.id) {
              nextMembership.teamId = mappedTeam.id;
              if ("team_id" in nextMembership) {
                nextMembership.team_id = mappedTeam.id;
              }
            }
            if (mappedClubId) {
              nextMembership.clubId = mappedClubId;
              if ("club_id" in nextMembership) {
                nextMembership.club_id = mappedClubId;
              }
            }
            return nextMembership;
          })
      : [];
    return {
      version: 1,
      activeClubId:
        clubIdRedirects.get(candidate.activeClubId) ||
        (clubIds.has(candidate.activeClubId) && !isLegacyPlatformStructureValue(candidate.activeClubId)
          ? candidate.activeClubId
          : defaultClubId),
      activeTeamId:
        teamIdRedirects.get(candidate.activeTeamId) ||
        (teamIds.has(candidate.activeTeamId) && !isLegacyPlatformStructureValue(candidate.activeTeamId)
          ? candidate.activeTeamId
          : defaultTeamId),
      clubs,
      teams,
      memberships,
    };
  }

  function isLegacyPlatformTeamPlaceholderName(value = "") {
    return isLegacyPlatformStructureValue(value);
  }

  return {
    cloneDefaultPlatformStructureState,
    createPlatformStructureId,
    hasPlatformWorkspaceScope,
    isCanonicalPlatformClub,
    isCanonicalPlatformClubValue,
    isCanonicalPlatformTeam,
    isCanonicalPlatformTeamValue,
    isLegacyPlatformClub,
    isLegacyPlatformStructureValue,
    isLegacyPlatformTeam,
    isLegacyPlatformTeamPlaceholderName,
    normalizePlatformClub,
    normalizePlatformStructureComparable,
    normalizePlatformStructureId,
    normalizePlatformStructureState,
    normalizePlatformStructureText,
    normalizePlatformTeam,
    slugifyPlatformStructureValue,
  };
}
