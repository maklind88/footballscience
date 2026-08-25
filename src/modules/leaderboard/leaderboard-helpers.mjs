export function normalizeLeaderboardText(value = "", maxLength = 240) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

export function escapeLeaderboardHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function normalizeLeaderboardMonth(value = "", fallback = "") {
  const clean = String(value || "").trim();
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(clean) ? clean : fallback;
}

export function normalizeLeaderboardDate(value = "", fallback = "") {
  const clean = String(value || "").trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(clean)) return fallback;
  const [year, month, day] = clean.split("-").map(Number);
  const parsed = new Date(`${clean}T12:00:00`);
  return !Number.isNaN(parsed.getTime())
    && parsed.getFullYear() === year
    && parsed.getMonth() === month - 1
    && parsed.getDate() === day
    ? clean
    : fallback;
}

export function normalizeLeaderboardTeamId(value = "") {
  const clean = String(value || "").trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(clean) ? clean : "";
}

export function getLeaderboardTodayValue(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getLeaderboardMonthValue(now = new Date()) {
  return getLeaderboardTodayValue(now).slice(0, 7);
}

export function shiftLeaderboardMonth(monthValue, delta = 0) {
  const month = normalizeLeaderboardMonth(monthValue, getLeaderboardMonthValue());
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(year, monthNumber - 1 + Number(delta || 0), 1, 12);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function formatLeaderboardMonth(monthValue, locale = "en-GB") {
  const month = normalizeLeaderboardMonth(monthValue, getLeaderboardMonthValue());
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(
    new Date(year, monthNumber - 1, 1, 12),
  );
}

export function formatLeaderboardDate(dateValue, locale = "en-GB") {
  const clean = normalizeLeaderboardDate(dateValue);
  if (!clean) return "Date unavailable";
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(
    new Date(`${clean}T12:00:00`),
  );
}

export function getLeaderboardInitials(name = "Player") {
  return normalizeLeaderboardText(name, 120)
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "P";
}

export function normalizeLeaderboardPoints(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

export function createLeaderboardIdempotencyKey(prefix = "leaderboard") {
  const cryptoObject = globalThis.crypto;
  if (typeof cryptoObject?.randomUUID === "function") return `${prefix}-${cryptoObject.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
