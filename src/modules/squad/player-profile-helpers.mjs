import {
  playerProfileAttributeGroups,
  playerProfileCareerPhaseOptions,
  playerProfileChangeFieldDefinitions,
  playerProfileIdpStatusOptions,
  playerProfilePreferredSideOptions,
  playerProfileRoleGroupOptions,
  playerProfileRoleOptions,
  playerProfileRosterTypeAliases,
  playerProfileRosterTypeOptions,
  playerProfileSquadStatusOptions,
  playerProfileStatusOptions,
  playerProfileTabOptions,
} from "./player-profile-options.mjs";
import { createPlayerProfileAgeHelpers } from "./player-profile-age-helpers.mjs";

const defaultCreateId = (prefix = "player-profile") => `${prefix}-${Date.now()}`;
const defaultNow = () => new Date().toISOString();
const defaultComparePlayers = (first = {}, second = {}) => String(first?.name || "").localeCompare(String(second?.name || ""));

export function createPlayerProfileHelpers(options = {}) {
  const createId = typeof options.createId === "function" ? options.createId : defaultCreateId;
  const getNow = typeof options.getNow === "function" ? options.getNow : defaultNow;
  const isDateValue = typeof options.isDateValue === "function" ? options.isDateValue : (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
  const comparePlayers = typeof options.comparePlayers === "function" ? options.comparePlayers : defaultComparePlayers;
  const changeLogLimit = Number.isFinite(Number(options.changeLogLimit)) ? Number(options.changeLogLimit) : 250;
  const {
    getPlayerProfileAgeCacheKey,
    getPlayerProfileAgeLookupSignature,
    getPlayerProfileAgeValue,
    getPlayerProfileBirthDateValue,
    getPlayerProfileDisplayAgeValue,
    getPlayerProfileDisplayBirthDateValue,
    getUpcomingPlayerProfileBirthdays,
    normalizePlayerProfileAgeCacheEntry,
    normalizePlayerProfileAgeLookupText,
    normalizePlayerProfileAgeValue,
    normalizePlayerProfileBirthDate,
    normalizePlayerProfileTemporaryDate,
  } = createPlayerProfileAgeHelpers({
    getAgeCacheEntry: options.getAgeCacheEntry,
  });

  function getPlayerProfileOption(items, key, fallback = null) {
    return items.find((option) => option.key === key) ?? fallback ?? items[0];
  }

  function normalizePlayerProfileRosterTypeKey(value) {
    const cleanValue = String(value ?? "").trim().toLowerCase();
    if (!cleanValue) return "";
    const dashedValue = cleanValue.replace(/[_\s/]+/g, "-").replace(/-+/g, "-");
    const compactValue = cleanValue.replace(/[\s/_-]+/g, "");
    return playerProfileRosterTypeAliases[cleanValue] || playerProfileRosterTypeAliases[dashedValue] || playerProfileRosterTypeAliases[compactValue] || cleanValue;
  }

  function normalizePlayerProfileRosterType(value, fallback = "squad") {
    const rosterType = normalizePlayerProfileRosterTypeKey(value);
    return playerProfileRosterTypeOptions.some((option) => option.key === rosterType) ? rosterType : fallback;
  }

  function getPlayerProfileRosterTypeOption(value) {
    return getPlayerProfileOption(playerProfileRosterTypeOptions, normalizePlayerProfileRosterType(value), playerProfileRosterTypeOptions[0]);
  }

  function playerProfileRosterTypeCountsInSquad(value) {
    return getPlayerProfileRosterTypeOption(value).countsInSquad !== false;
  }

  function playerProfileCountsInSquad(player = {}) {
    return typeof player.countsInSquad === "boolean" ? player.countsInSquad : playerProfileRosterTypeCountsInSquad(player.rosterType);
  }

  function isTemporaryPlayerProfile(player = {}) {
    return !playerProfileCountsInSquad(player);
  }

  function isPlayerProfileTemporaryActiveOnDate(player = {}, dateValue = "") {
    if (!isTemporaryPlayerProfile(player)) return true;
    const activeDate = normalizePlayerProfileTemporaryDate(dateValue);
    if (!activeDate) return true;
    const fromDate = normalizePlayerProfileTemporaryDate(player.temporaryFrom);
    const toDate = normalizePlayerProfileTemporaryDate(player.temporaryTo);
    if (fromDate && activeDate < fromDate) return false;
    if (toDate && activeDate > toDate) return false;
    return true;
  }

  function getPlayerProfileTemporaryWindowLabel(player = {}) {
    const fromDate = normalizePlayerProfileTemporaryDate(player.temporaryFrom);
    const toDate = normalizePlayerProfileTemporaryDate(player.temporaryTo);
    if (fromDate && toDate) return `${fromDate} to ${toDate}`;
    if (fromDate) return `from ${fromDate}`;
    if (toDate) return `until ${toDate}`;
    return "";
  }

  function getPlayerProfileRosterLabel(player = {}) {
    const option = getPlayerProfileRosterTypeOption(player.rosterType);
    const group = String(player.temporaryGroup ?? "").trim();
    return group ? `${option.shortLabel || option.label} / ${group}` : option.label;
  }

  function normalizePlayerProfileTab(tabKey) {
    return playerProfileTabOptions.some((tab) => tab.key === tabKey) ? tabKey : "overview";
  }

  function normalizePlayerProfileRole(value, fallback = "CB") {
    const cleanValue = String(value ?? "").trim().toUpperCase();
    return playerProfileRoleOptions.includes(cleanValue) ? cleanValue : fallback;
  }

  function normalizePlayerProfileRoleList(value = []) {
    const source = Array.isArray(value) ? value : String(value ?? "").split(",").map((entry) => entry.trim());
    return Array.from(new Set(source.map((entry) => normalizePlayerProfileRole(entry, "")).filter(Boolean)));
  }

  function getDefaultPlayerProfileRole(player = {}) {
    const position = String(player.position ?? "").toLowerCase();
    if (position.includes("goal")) return "GK";
    if (position.includes("def")) return "CB";
    if (position.includes("mid")) return "8";
    if (position.includes("for")) return "ST";
    return "CB";
  }

  function getPlayerProfileRoleGroupForRole(role, position = "") {
    const roleKey = normalizePlayerProfileRole(role, getDefaultPlayerProfileRole({ position }));
    if (roleKey === "GK") return "goalkeeper";
    if (["LB", "CB", "RB", "LWB", "RWB"].includes(roleKey)) return "defender";
    if (["6", "8", "10"].includes(roleKey)) return "midfielder";
    return "forward";
  }

  function normalizePlayerProfileName(value = "") {
    return String(value).trim().replace(/\s+/g, " ").toLowerCase();
  }

  function getPlayerProfileSyncIdentityKeys(player = {}) {
    const keys = [];
    const playerId = String(player.id || player.playerId || player.profileId || "").trim();
    if (playerId) keys.push(`id:${playerId}`);
    const name = normalizePlayerProfileName(player.name || player.displayName || "");
    if (name) {
      const number = String(player.number || player.shirtNumber || player.shirt_number || "").trim().toLowerCase();
      keys.push(`name:${name}|${number}`);
    }
    return keys;
  }

  function getTemporaryRosterTypeFromPlayerSource(player = {}) {
    const rosterType = normalizePlayerProfileRosterType(player.rosterType || player.playerType || player.squadType, "");
    if (rosterType && !playerProfileRosterTypeCountsInSquad(rosterType)) return rosterType;
    const searchText = [player.rosterType, player.playerType, player.squadType, player.temporaryGroup, player.subGroup, player.trainingGroup, player.status].join(" ").toLowerCase();
    if (searchText.includes("academy")) return "academy";
    if (searchText.includes("trial")) return "trialist";
    if (searchText.includes("loan") || searchText.includes("external")) return "loan";
    return "guest";
  }

  function getPlayerProfileDuplicateCandidates(candidate = {}, players = [], opts = {}) {
    const ignorePlayerId = String(opts.ignorePlayerId || "");
    const normalizedName = normalizePlayerProfileName(candidate?.name || "");
    const normalizedNumber = String(candidate?.number || "").trim();
    const normalizedPosition = normalizePlayerProfileName(candidate?.position || "");
    if (!normalizedName) return [];
    const exactMatches = [];
    const probableMatches = [];
    players.forEach((player) => {
      if (!player || player.id === ignorePlayerId || normalizePlayerProfileName(player.name) !== normalizedName) return;
      const existingNumber = String(player.number || "").trim();
      const existingPosition = normalizePlayerProfileName(player.position || "");
      if (normalizedNumber && existingNumber && existingNumber === normalizedNumber) {
        exactMatches.push({ player, match: "same name and number" });
        return;
      }
      if (!existingNumber || !normalizedNumber) {
        if (!normalizedPosition || !existingPosition || normalizedPosition === existingPosition) probableMatches.push({ player, match: "same name" });
        return;
      }
      if (existingNumber !== normalizedNumber) probableMatches.push({ player, match: "same name" });
    });
    if (exactMatches.length) return exactMatches;
    return probableMatches.length > 3 ? probableMatches.slice(0, 3) : probableMatches;
  }

  function normalizePlayerProfileFutureData(futureData = {}) {
    return {
      matchData: Array.isArray(futureData.matchData) ? futureData.matchData : [],
      load: Array.isArray(futureData.load) ? futureData.load : [],
      minutes: Array.isArray(futureData.minutes) ? futureData.minutes : [],
      performanceNotes: String(futureData.performanceNotes ?? "").trim(),
      scoutingNotes: String(futureData.scoutingNotes ?? "").trim(),
      analysisNotes: String(futureData.analysisNotes ?? "").trim(),
    };
  }

  function normalizePlayerProfileMedicalSummary(summary = {}) {
    return {
      currentAvailability: String(summary.currentAvailability ?? "").trim(),
      rtpStatus: String(summary.rtpStatus ?? "").trim(),
      coachNote: String(summary.coachNote ?? "").trim(),
      latestLogDate: String(summary.latestLogDate ?? "").trim(),
      latestLogSummary: String(summary.latestLogSummary ?? "").trim(),
      returnDate: String(summary.returnDate ?? "").trim(),
      returnDateLabel: String(summary.returnDateLabel ?? "").trim(),
      returnLabel: String(summary.returnLabel ?? "").trim(),
      activeInjuryLabel: String(summary.activeInjuryLabel ?? "").trim(),
      medicalSource: String(summary.medicalSource ?? "").trim(),
    };
  }

  function normalizePlayerProfileNumber(value, fallback = 3) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? Math.max(1, Math.min(5, Math.round(numericValue))) : fallback;
  }

  function normalizePlayerProfileAttributeRatings(ratings = {}) {
    return playerProfileAttributeGroups.reduce((result, group) => {
      result[group.key] = normalizePlayerProfileNumber(ratings?.[group.key], 3);
      return result;
    }, {});
  }

  function getDefaultPlayerProfileAttributeRatings(player = {}) {
    const group = getPlayerProfileRoleGroupForRole(player.primaryRole || getDefaultPlayerProfileRole(player), player.position);
    const defaults = {
      goalkeeper: { technical: 3, tactical: 3, physical: 3, mental: 4 },
      defender: { technical: 3, tactical: 4, physical: 3, mental: 3 },
      midfielder: { technical: 4, tactical: 4, physical: 3, mental: 4 },
      forward: { technical: 4, tactical: 3, physical: 4, mental: 3 },
    };
    return defaults[group] ?? defaults.defender;
  }

  function normalizePlayerProfileIdp(idp = {}) {
    const status = playerProfileIdpStatusOptions.some((option) => option.key === idp.status) ? idp.status : "active";
    return {
      status,
      primaryFocus: String(idp.primaryFocus ?? "").trim(),
      strengths: String(idp.strengths ?? "").trim(),
      focusAreas: String(idp.focusAreas ?? "").trim(),
      nextAction: String(idp.nextAction ?? "").trim(),
      reviewDate: isDateValue(idp.reviewDate) ? idp.reviewDate : "",
    };
  }

  function getDefaultPlayerProfileIdp(player = {}) {
    const role = normalizePlayerProfileRole(player.primaryRole, getDefaultPlayerProfileRole(player));
    const focusByRole = {
      GK: "Distribution, claiming space and defensive organisation",
      LB: "Wide defending, timing overlaps and final-third delivery",
      CB: "Box defending, build-up security and defending large spaces",
      RB: "Wide defending, timing overlaps and final-third delivery",
      LWB: "High wing-back output, recovery runs and crossing choices",
      RWB: "High wing-back output, recovery runs and crossing choices",
      6: "Receiving under pressure, screening and progression choices",
      8: "Box-to-box timing, counter-pressing and third-player runs",
      10: "Between-line receiving, final pass and pressing cues",
      LW: "1v1 threat, back-post timing and counter-pressing",
      RW: "1v1 threat, back-post timing and counter-pressing",
      ST: "Penalty-box movement, pressing triggers and link play",
    };
    return { status: "active", primaryFocus: focusByRole[role] || "Role behaviours and consistency", strengths: "", focusAreas: "", nextAction: "", reviewDate: "" };
  }

  function getDefaultPlayerProfileSquadStatus(player = {}) {
    const order = Number(player.rosterOrder);
    if (Number.isFinite(order) && order <= 11) return "important";
    if (Number.isFinite(order) && order <= 18) return "rotation";
    return "depth";
  }

  function getDefaultPlayerProfileCareerPhase(player = {}) {
    const order = Number(player.rosterOrder);
    if (Number.isFinite(order) && order <= 8) return "peak";
    if (Number.isFinite(order) && order <= 18) return "emerging";
    return "developing";
  }

  function normalizePlayerProfile(player = {}) {
    const name = String(player.name ?? "").trim();
    if (!name) return null;
    const primaryRole = normalizePlayerProfileRole(player.primaryRole, getDefaultPlayerProfileRole(player));
    const roleGroup = playerProfileRoleGroupOptions.some((option) => option.key === player.roleGroup) ? player.roleGroup : getPlayerProfileRoleGroupForRole(primaryRole, player.position);
    const preferredSide = playerProfilePreferredSideOptions.some((option) => option.key === player.preferredSide) ? player.preferredSide : "center";
    const status = playerProfileStatusOptions.some((option) => option.key === player.status) ? player.status : "available";
    const squadStatus = playerProfileSquadStatusOptions.some((option) => option.key === player.squadStatus) ? player.squadStatus : getDefaultPlayerProfileSquadStatus(player);
    const hasRosterTypeValue = Boolean(String(player.rosterType || player.playerType || player.squadType || "").trim());
    const rosterTypeFallback = player.countsInSquad === false ? "guest" : "squad";
    const rosterType = normalizePlayerProfileRosterType(
      player.rosterType || player.playerType || player.squadType,
      hasRosterTypeValue ? "squad" : rosterTypeFallback
    );
    const countsInSquad = playerProfileRosterTypeCountsInSquad(rosterType);
    const careerPhase = playerProfileCareerPhaseOptions.some((option) => option.key === player.careerPhase) ? player.careerPhase : getDefaultPlayerProfileCareerPhase(player);
    const rosterOrder = Number(player.rosterOrder);
    const attributeRatings = normalizePlayerProfileAttributeRatings({ ...getDefaultPlayerProfileAttributeRatings({ ...player, primaryRole }), ...(player.attributeRatings || {}) });
    const now = getNow();
    return {
      id: player.id || createId("player-profile"),
      name,
      number: String(player.number ?? "").trim(),
      age: normalizePlayerProfileAgeValue(player.age ?? player.playerAge),
      birthDate: normalizePlayerProfileBirthDate(player.birthDate || player.dateOfBirth || player.date_of_birth || player.dob),
      position: String(player.position ?? "").trim(),
      photoUrl: String(player.photoUrl ?? "").trim(),
      sourceUrl: String(player.sourceUrl ?? "").trim(),
      coachNotes: String(player.coachNotes ?? "").trim(),
      status,
      squadStatus,
      rosterType,
      countsInSquad,
      temporaryGroup: String(player.temporaryGroup ?? player.subGroup ?? player.trainingGroup ?? "").trim(),
      temporaryFrom: normalizePlayerProfileTemporaryDate(player.temporaryFrom || player.startDate),
      temporaryTo: normalizePlayerProfileTemporaryDate(player.temporaryTo || player.endDate),
      careerPhase,
      primaryRole,
      secondaryRoles: normalizePlayerProfileRoleList(player.secondaryRoles).filter((role) => role !== primaryRole),
      preferredSide,
      roleGroup,
      attributeRatings,
      idp: normalizePlayerProfileIdp({ ...getDefaultPlayerProfileIdp({ ...player, primaryRole }), ...(player.idp || {}) }),
      medicalSummary: normalizePlayerProfileMedicalSummary(player.medicalSummary),
      futureData: normalizePlayerProfileFutureData(player.futureData),
      rosterOrder: Number.isFinite(rosterOrder) ? rosterOrder : null,
      createdAt: player.createdAt || now,
      updatedAt: player.updatedAt || now,
    };
  }

  function validatePlayerProfileFormValues(values = {}, opts = {}) {
    const errors = [];
    const warnings = [];
    const existingPlayers = Array.isArray(opts.existingPlayers) ? opts.existingPlayers : [];
    const blockDuplicate = opts.blockDuplicate !== false;
    const player = normalizePlayerProfile(values);
    if (!player) return { ok: false, status: "error", errors: ["Player name is required."], warnings: [], player: null, duplicates: [] };
    const requestedFrom = String(values.temporaryFrom || "").trim();
    const requestedTo = String(values.temporaryTo || "").trim();
    const requestedReviewDate = String(values.idp?.reviewDate || "").trim();
    const temporaryFrom = normalizePlayerProfileTemporaryDate(requestedFrom || player.temporaryFrom);
    const temporaryTo = normalizePlayerProfileTemporaryDate(requestedTo || player.temporaryTo);
    if (requestedFrom && !temporaryFrom) errors.push("Temporary from must be YYYY-MM-DD when provided.");
    if (requestedTo && !temporaryTo) errors.push("Temporary to must be YYYY-MM-DD when provided.");
    if (temporaryFrom && temporaryTo && temporaryFrom > temporaryTo) errors.push("Temporary from must not be after temporary to.");
    if (requestedReviewDate && !isDateValue(requestedReviewDate)) errors.push("IDP review date must be YYYY-MM-DD when entered.");
    if (!player.position) warnings.push("Position is recommended for better role quality and matching.");
    if (!player.primaryRole) warnings.push("Primary role is required.");
    if (!player.preferredSide) warnings.push("Preferred side is recommended.");
    const duplicates = getPlayerProfileDuplicateCandidates(player, existingPlayers, { ignorePlayerId: opts.ignorePlayerId || player.id });
    if (blockDuplicate && duplicates.length) {
      const duplicate = duplicates[0];
      const existingName = String(duplicate.player?.name || player.name || "").trim();
      errors.push(`A player already exists with ${player.name}: ${duplicate.match} (${existingName}).`);
    }
    if (!errors.length && warnings.length) return { ok: true, status: "warning", errors, warnings, player, duplicates };
    return { ok: !errors.length, status: errors.length ? "error" : "success", errors, warnings, player, duplicates };
  }

  function normalizePlayerProfileChangeLogEntry(entry = {}) {
    const createdAt = Date.parse(entry.createdAt) ? entry.createdAt : getNow();
    const changes = Array.isArray(entry.changes)
      ? entry.changes.map((change) => ({ field: String(change?.field ?? "").trim(), from: String(change?.from ?? "").trim(), to: String(change?.to ?? "").trim() })).filter((change) => change.field || change.from || change.to)
      : [];
    return {
      id: String(entry.id || createId("squad-change")),
      type: String(entry.type || "profile-updated").trim(),
      playerId: String(entry.playerId ?? "").trim(),
      playerName: String(entry.playerName ?? "").trim(),
      actor: String(entry.actor ?? "Football Science").trim(),
      summary: String(entry.summary ?? "").trim(),
      changes,
      createdAt,
    };
  }

  function normalizePlayerProfileChangeLog(entries = []) {
    return (Array.isArray(entries) ? entries : []).map(normalizePlayerProfileChangeLogEntry).sort((first, second) => new Date(second.createdAt) - new Date(first.createdAt)).slice(0, changeLogLimit);
  }

  function getNestedPlayerProfileValue(source = {}, path = "") {
    return path.split(".").reduce((value, key) => (value && typeof value === "object" ? value[key] : undefined), source);
  }

  function formatPlayerProfileChangeValue(value, definition = {}) {
    if (Array.isArray(value)) return value.length ? value.join(" / ") : "-";
    if (definition.options) {
      const option = getPlayerProfileOption(definition.options, value, null);
      return option ? option.label : String(value ?? "").trim() || "-";
    }
    return String(value ?? "").trim() || "-";
  }

  function getPlayerProfileChangeDiffs(previousPlayer = {}, nextPlayer = {}) {
    return playerProfileChangeFieldDefinitions.map((definition) => {
      const formattedPrevious = formatPlayerProfileChangeValue(getNestedPlayerProfileValue(previousPlayer, definition.key), definition);
      const formattedNext = formatPlayerProfileChangeValue(getNestedPlayerProfileValue(nextPlayer, definition.key), definition);
      return formattedPrevious === formattedNext ? null : { field: definition.label, from: formattedPrevious, to: formattedNext };
    }).filter(Boolean);
  }

  function formatPlayerProfileChangeTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
  }

  function getPlayerProfileSquadSortGroup(player = {}) {
    const role = normalizePlayerProfileRole(player.primaryRole, "");
    if (role === "GK") return 0;
    if (["LB", "RB", "LWB", "RWB"].includes(role)) return 1;
    if (role === "CB") return 2;
    if (["6", "8", "10"].includes(role)) return 3;
    if (["LW", "RW"].includes(role)) return 4;
    if (role === "ST") return 5;

    const position = String(player.position || "").trim().toLowerCase();
    if (position.includes("goal")) return 0;
    if (position.includes("fullback") || position.includes("full back") || position.includes("wingback") || position.includes("wing back")) return 1;
    if (position.includes("centre back") || position.includes("center back") || position.includes("central defender")) return 2;
    if (position.includes("def") || position.includes("back")) return 2;
    if (position.includes("wing") || position.includes("wide")) return 4;
    if (position.includes("mid")) return 3;
    if (position.includes("for") || position.includes("strik")) return 5;
    return 9;
  }

  function getPlayerProfileRoleSortIndex(player = {}) {
    const role = normalizePlayerProfileRole(player.primaryRole, "");
    const sortOrder = {
      GK: 0,
      LB: 10,
      RB: 11,
      LWB: 12,
      RWB: 13,
      CB: 20,
      6: 30,
      8: 31,
      10: 32,
      LW: 40,
      RW: 41,
      ST: 50,
    };
    return sortOrder[role] ?? playerProfileRoleOptions.length * 10;
  }

  function comparePlayerProfiles(first, second) {
    const groupComparison = getPlayerProfileSquadSortGroup(first) - getPlayerProfileSquadSortGroup(second);
    if (groupComparison !== 0) {
      return groupComparison;
    }
    const roleComparison = getPlayerProfileRoleSortIndex(first) - getPlayerProfileRoleSortIndex(second);
    if (roleComparison !== 0) {
      return roleComparison;
    }
    const firstName = String(first?.name || "").trim();
    const secondName = String(second?.name || "").trim();
    const nameComparison = firstName.localeCompare(secondName);
    if (nameComparison !== 0) {
      return nameComparison;
    }
    const firstId = String(first?.id || "").trim();
    const secondId = String(second?.id || "").trim();
    if (firstId !== secondId) {
      return firstId.localeCompare(secondId);
    }
    return comparePlayers(first, second);
  }

  function normalizePlayerProfileRemovedIds(value = []) {
    return Array.from(new Set((Array.isArray(value) ? value : []).map((id) => String(id || "").trim()).filter(Boolean))).slice(0, 1000);
  }

  return {
    comparePlayerProfiles,
    formatPlayerProfileChangeTime,
    formatPlayerProfileChangeValue,
    getDefaultPlayerProfileAttributeRatings,
    getDefaultPlayerProfileCareerPhase,
    getDefaultPlayerProfileIdp,
    getDefaultPlayerProfileRole,
    getDefaultPlayerProfileSquadStatus,
    getNestedPlayerProfileValue,
    getPlayerProfileAgeCacheKey,
    getPlayerProfileAgeLookupSignature,
    getPlayerProfileAgeValue,
    getPlayerProfileBirthDateValue,
    getPlayerProfileChangeDiffs,
    getPlayerProfileDisplayAgeValue,
    getPlayerProfileDisplayBirthDateValue,
    getPlayerProfileDuplicateCandidates,
    getPlayerProfileOption,
    getPlayerProfileRoleGroupForRole,
    getPlayerProfileRoleSortIndex,
    getPlayerProfileRosterLabel,
    getPlayerProfileRosterTypeOption,
    getPlayerProfileSquadSortGroup,
    getPlayerProfileSyncIdentityKeys,
    getPlayerProfileTemporaryWindowLabel,
    getUpcomingPlayerProfileBirthdays,
    getTemporaryRosterTypeFromPlayerSource,
    isPlayerProfileTemporaryActiveOnDate,
    isTemporaryPlayerProfile,
    normalizePlayerProfile,
    normalizePlayerProfileAgeCacheEntry,
    normalizePlayerProfileAgeLookupText,
    normalizePlayerProfileAgeValue,
    normalizePlayerProfileAttributeRatings,
    normalizePlayerProfileBirthDate,
    normalizePlayerProfileChangeLog,
    normalizePlayerProfileChangeLogEntry,
    normalizePlayerProfileFutureData,
    normalizePlayerProfileIdp,
    normalizePlayerProfileMedicalSummary,
    normalizePlayerProfileName,
    normalizePlayerProfileNumber,
    normalizePlayerProfileRemovedIds,
    normalizePlayerProfileRole,
    normalizePlayerProfileRoleList,
    normalizePlayerProfileRosterType,
    normalizePlayerProfileRosterTypeKey,
    normalizePlayerProfileTab,
    normalizePlayerProfileTemporaryDate,
    playerProfileCountsInSquad,
    playerProfileRosterTypeCountsInSquad,
    validatePlayerProfileFormValues,
  };
}
