export function createPlayerProfileAgeHelpers(options = {}) {
  const getAgeCacheEntry = typeof options.getAgeCacheEntry === "function" ? options.getAgeCacheEntry : () => null;
  const birthdayMonthLabels = Object.freeze(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]);

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

  function getReferenceDateParts(referenceDate = new Date()) {
    if (referenceDate instanceof Date && !Number.isNaN(referenceDate.getTime())) {
      return {
        year: referenceDate.getFullYear(),
        month: referenceDate.getMonth() + 1,
        day: referenceDate.getDate(),
      };
    }
    const cleanValue = String(referenceDate ?? "").trim();
    const dateValue = normalizePlayerProfileBirthDate(cleanValue.slice(0, 10));
    if (dateValue) {
      const [year, month, day] = dateValue.split("-").map(Number);
      return { year, month, day };
    }
    const parsedDate = new Date(cleanValue);
    if (!Number.isNaN(parsedDate.getTime())) {
      return {
        year: parsedDate.getFullYear(),
        month: parsedDate.getMonth() + 1,
        day: parsedDate.getDate(),
      };
    }
    const today = new Date();
    return {
      year: today.getFullYear(),
      month: today.getMonth() + 1,
      day: today.getDate(),
    };
  }

  function getBirthDateParts(value = "") {
    const birthDate = normalizePlayerProfileBirthDate(value);
    if (!birthDate) return null;
    const [year, month, day] = birthDate.split("-").map(Number);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
    return { year, month, day, value: birthDate };
  }

  function getDaysInMonth(year, month) {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
  }

  function formatBirthdayDateValue(year, month, day) {
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function getBirthdayDateForYear(birthParts, year) {
    const day = Math.min(birthParts.day, getDaysInMonth(year, birthParts.month));
    return {
      date: new Date(Date.UTC(year, birthParts.month - 1, day)),
      value: formatBirthdayDateValue(year, birthParts.month, day),
      month: birthParts.month,
      day,
    };
  }

  function getBirthdayRelativeLabel(daysUntil) {
    const days = Number(daysUntil);
    if (!Number.isFinite(days)) return "";
    if (days <= 0) return "Today";
    if (days === 1) return "Tomorrow";
    return `In ${days} days`;
  }

  function formatBirthdayMonthDay(month, day) {
    const monthLabel = birthdayMonthLabels[Math.max(0, Math.min(11, Number(month) - 1))] || "";
    return [monthLabel, day].filter(Boolean).join(" ");
  }

  function getUpcomingPlayerProfileBirthdays(players = [], options = {}) {
    const referenceParts = getReferenceDateParts(options.referenceDate);
    const referenceDate = new Date(Date.UTC(referenceParts.year, referenceParts.month - 1, referenceParts.day));
    const limit = Math.max(1, Math.min(20, Number(options.limit) || 6));
    const includeTemporary = options.includeTemporary === true;
    const getBirthDate =
      typeof options.getBirthDate === "function"
        ? options.getBirthDate
        : (player) => getPlayerProfileDisplayBirthDateValue(player);
    const trackedPlayers = (Array.isArray(players) ? players : []).filter(
      (player) => player && (includeTemporary || player.countsInSquad !== false)
    );
    const items = trackedPlayers
      .map((player) => {
        const birthParts = getBirthDateParts(getBirthDate(player));
        if (!birthParts) return null;
        let nextBirthday = getBirthdayDateForYear(birthParts, referenceParts.year);
        if (nextBirthday.date.getTime() < referenceDate.getTime()) {
          nextBirthday = getBirthdayDateForYear(birthParts, referenceParts.year + 1);
        }
        const daysUntil = Math.max(0, Math.round((nextBirthday.date.getTime() - referenceDate.getTime()) / 86400000));
        const turningAge = nextBirthday.date.getUTCFullYear() - birthParts.year;
        return {
          id: String(player.id || "").trim(),
          name: String(player.name || player.displayName || "Player").trim(),
          number: String(player.number || player.shirtNumber || "").trim(),
          primaryRole: String(player.primaryRole || player.role || player.position || "").trim(),
          photoUrl: String(
            player.photoUrl ||
              player.photo_url ||
              player.imageUrl ||
              player.image_url ||
              player.profileImageUrl ||
              player.profile_image_url ||
              ""
          ).trim(),
          birthDate: birthParts.value,
          nextBirthday: nextBirthday.value,
          dateLabel: formatBirthdayMonthDay(nextBirthday.month, nextBirthday.day),
          relativeLabel: getBirthdayRelativeLabel(daysUntil),
          daysUntil,
          turningAge: Number.isFinite(turningAge) && turningAge >= 0 && turningAge <= 120 ? turningAge : null,
        };
      })
      .filter(Boolean)
      .sort((first, second) => {
        if (first.daysUntil !== second.daysUntil) return first.daysUntil - second.daysUntil;
        return `${first.name}|${first.id}`.localeCompare(`${second.name}|${second.id}`);
      });
    const thisMonthKey = `${referenceParts.year}-${String(referenceParts.month).padStart(2, "0")}`;
    return {
      items: items.slice(0, limit),
      next: items[0] || null,
      thisMonthCount: items.filter((item) => item.nextBirthday.startsWith(thisMonthKey)).length,
      todayCount: items.filter((item) => item.daysUntil === 0).length,
      trackedCount: trackedPlayers.length,
      withBirthDateCount: items.length,
      missingBirthDateCount: Math.max(0, trackedPlayers.length - items.length),
    };
  }

  return {
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
  };
}
