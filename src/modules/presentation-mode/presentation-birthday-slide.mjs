function normalizeAge(value) {
  const age = Number(value);
  return Number.isInteger(age) && age >= 0 && age <= 120 ? age : null;
}

function getBirthdayItemsForDate(calendar = {}, dateValue = "") {
  const items = Array.isArray(calendar.items) ? calendar.items : [];
  const seen = new Set();
  return items.filter((item) => {
    const id = String(item?.id || "").trim();
    const name = String(item?.name || "").trim();
    const birthdayDate = String(item?.nextBirthday || "").trim();
    const key = `${id}|${name}|${birthdayDate}`;
    if (!name || birthdayDate !== dateValue || Number(item?.daysUntil) !== 0 || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function getBirthdayLine(item = {}) {
  const name = String(item.name || "Player").trim() || "Player";
  const age = normalizeAge(item.turningAge);
  return age === null ? `${name} celebrates today.` : `${name} turns ${age} today.`;
}

export function createPresentationBirthdaySlide({ birthdayCalendar = {}, dateValue = "", meetingType = "team" } = {}) {
  if (String(meetingType || "").trim() !== "team" || !/^\d{4}-\d{2}-\d{2}$/.test(String(dateValue || ""))) {
    return null;
  }

  const birthdayItems = getBirthdayItemsForDate(birthdayCalendar, dateValue);
  if (!birthdayItems.length) {
    return null;
  }

  const firstName = String(birthdayItems[0].name || "Player").trim() || "Player";
  const multipleBirthdays = birthdayItems.length > 1;
  const title = multipleBirthdays ? "Happy Birthday!" : `Happy Birthday, ${firstName}!`;
  const body = birthdayItems.map(getBirthdayLine).join("\n");
  const id = `system-birthday-${dateValue}`;
  const style = {
    theme: "custom",
    accentColor: "#b45309",
    backgroundColor: "#fff8ed",
    glowColor: "#f6d7a7",
    textColor: "#1d1d1f",
  };

  return {
    id,
    type: "info",
    label: multipleBirthdays ? "Birthdays" : "Birthday",
    readOnly: true,
    systemGenerated: true,
    systemKind: "birthday",
    style,
    infoSlide: {
      id,
      layout: "title-subtitle",
      title,
      body,
      fontSize: "60",
      accentColor: style.accentColor,
      textColor: style.textColor,
      systemGenerated: true,
      systemKind: "birthday",
    },
  };
}
