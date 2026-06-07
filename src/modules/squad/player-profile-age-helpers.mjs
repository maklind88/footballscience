export function createPlayerProfileAgeHelpers(options = {}) {
  const getAgeCacheEntry = typeof options.getAgeCacheEntry === "function" ? options.getAgeCacheEntry : () => null;

  function normalizePlayerProfileTemporaryDate(value) {
    const cleanValue = String(value ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanValue)) return "";
    const parsedDate = new Date(`${cleanValue}T00:00:00`);
    return Number.isNaN(parsedDate.getTime()) ? "" : cleanValue;
  }

  const normalizePlayerProfileBirthDate = normalizePlayerProfileTemporaryDate;

  function normalizePlayerProfileAgeValue(value) {
    const cleanValue = String(value ?? "").trim();
    if (!cleanValue) return "";
    const numericValue = Number(cleanValue);
    if (!Number.isFinite(numericValue)) return "";
    const age = Math.floor(numericValue);
    return age >= 0 && age <= 99 ? String(age) : "";
  }

  function getPlayerProfileAgeValue(player = {}, referenceDate = new Date()) {
    const birthDate = normalizePlayerProfileBirthDate(player.birthDate || player.dateOfBirth || player.date_of_birth || player.dob);
    if (birthDate) {
      const [birthYear, birthMonth, birthDay] = birthDate.split("-").map(Number);
      if (Number.isFinite(birthYear) && Number.isFinite(birthMonth) && Number.isFinite(birthDay)) {
        let age = referenceDate.getFullYear() - birthYear;
        const monthDiff = referenceDate.getMonth() + 1 - birthMonth;
        if (monthDiff < 0 || (monthDiff === 0 && referenceDate.getDate() < birthDay)) age -= 1;
        if (age >= 0 && age <= 99) return String(age);
      }
    }
    return normalizePlayerProfileAgeValue(player.age ?? player.playerAge);
  }

  function normalizePlayerProfileAgeLookupText(value = "") {
    return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  }

  function getPlayerProfileAgeLookupSignature(player = {}) {
    return [
      normalizePlayerProfileAgeLookupText(player.id),
      normalizePlayerProfileAgeLookupText(player.name),
      normalizePlayerProfileAgeLookupText(player.number),
      normalizePlayerProfileAgeLookupText(player.position),
    ].join("|");
  }

  function getPlayerProfileAgeCacheKey(player = {}) {
    const playerId = String(player.id || "").trim();
    return playerId || getPlayerProfileAgeLookupSignature(player);
  }

  function normalizePlayerProfileAgeCacheEntry(entry = {}) {
    return {
      signature: String(entry.signature || "").trim(),
      birthDate: normalizePlayerProfileBirthDate(entry.birthDate || entry.dateOfBirth || entry.date_of_birth),
      age: normalizePlayerProfileAgeValue(entry.age),
      databasePlayerId: String(entry.databasePlayerId || entry.playerId || "").trim(),
      source: String(entry.source || "squad_players").trim(),
      checkedAt: String(entry.checkedAt || "").trim(),
      birthDateCheckedAt: String(entry.birthDateCheckedAt || "").trim(),
    };
  }

  function getPlayerProfileBirthDateValue(player = {}) {
    return normalizePlayerProfileBirthDate(player.birthDate || player.dateOfBirth || player.date_of_birth || player.dob);
  }

  function getPlayerProfileDisplayAgeValue(player = {}, referenceDate = new Date()) {
    const directBirthDate = getPlayerProfileBirthDateValue(player);
    if (directBirthDate) return getPlayerProfileAgeValue({ birthDate: directBirthDate }, referenceDate);
    const cachedAge = getAgeCacheEntry(player);
    const cachedBirthDate = normalizePlayerProfileBirthDate(cachedAge?.birthDate);
    if (cachedBirthDate) return getPlayerProfileAgeValue({ birthDate: cachedBirthDate }, referenceDate);
    const directAge = normalizePlayerProfileAgeValue(player.age ?? player.playerAge);
    if (directAge) return directAge;
    return cachedAge ? getPlayerProfileAgeValue({ age: cachedAge.age }, referenceDate) : "";
  }

  function getPlayerProfileDisplayBirthDateValue(player = {}) {
    const directBirthDate = getPlayerProfileBirthDateValue(player);
    if (directBirthDate) return directBirthDate;
    return getAgeCacheEntry(player)?.birthDate || "";
  }

  return {
    getPlayerProfileAgeCacheKey,
    getPlayerProfileAgeLookupSignature,
    getPlayerProfileAgeValue,
    getPlayerProfileBirthDateValue,
    getPlayerProfileDisplayAgeValue,
    getPlayerProfileDisplayBirthDateValue,
    normalizePlayerProfileAgeCacheEntry,
    normalizePlayerProfileAgeLookupText,
    normalizePlayerProfileAgeValue,
    normalizePlayerProfileBirthDate,
    normalizePlayerProfileTemporaryDate,
  };
}
