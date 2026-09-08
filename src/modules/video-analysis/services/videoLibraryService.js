function text(value = "") {
  return String(value || "").trim();
}

function dateValue(value = "") {
  const candidate = text(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : "";
}

function dateSearchTerms(value = "") {
  const date = dateValue(value);
  if (!date) return [];
  const [year, month, day] = date.split("-");
  const monthIndex = Math.max(0, Number(month) - 1);
  const shortMonths = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const longMonths = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ];
  const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const weekdayIndex = new Date(`${date}T00:00:00Z`).getUTCDay();
  return [
    date,
    `${day}/${month}/${year}`,
    `${day}/${month}`,
    `${year}-${month}`,
    shortMonths[monthIndex],
    longMonths[monthIndex],
    weekdays[weekdayIndex],
    "day",
  ];
}

function eventType(value = "") {
  const type = text(value).toLowerCase();
  return ["match", "training"].includes(type) ? type : "";
}

function inferEventType(value = "", context = {}) {
  const type = text(value).toLowerCase();
  if (type === "match" || type === "training") return type;
  const title = text(context.title).toLowerCase();
  return text(context.opponent) || /\bmatch\b|\svs\.?\s|\s@\s/.test(title) ? "match" : "training";
}

function titleFallback(item = {}) {
  return text(item.title || item.display_name || item.displayName || item.opponent) || "Untitled session";
}

function scheduleSignature(candidate = {}) {
  if (candidate.scheduleEventId) return `event:${candidate.scheduleEventId}`;
  return [
    text(candidate.scheduleEventId || candidate.id),
    dateValue(candidate.matchDate || candidate.date),
    eventType(candidate.eventType || candidate.type),
    text(candidate.title).toLowerCase(),
  ].join("::");
}

export function normalizeScheduleCandidate(event = {}, source = "schedule") {
  if (!event || typeof event !== "object") return null;
  const matchDate = dateValue(event.matchDate || event.match_date || event.eventDate || event.event_date || event.date);
  const type = eventType(event.eventType || event.event_type || event.type);
  const scheduleEventId = text(event.scheduleEventId || event.schedule_event_id || event.id);
  const title = titleFallback(event);
  if (!matchDate || !type) return null;
  return {
    key: `schedule:${scheduleEventId || `${matchDate}:${type}:${title}`}`,
    kind: "schedule-candidate",
    source,
    scheduleEventId,
    scheduleDayKey: text(event.scheduleDayKey || event.schedule_day_key) || matchDate,
    matchDate,
    eventType: type,
    title,
    opponent: text(event.opponent),
    location: text(event.location || event.venue),
    time: text(event.time || event.starts_at || event.startsAt).slice(0, 5),
    hasVideo: false,
    clipCount: 0,
    videoCount: 0,
    sourceCount: 0,
  };
}

export function normalizeContextScheduleCandidates(context = {}) {
  const state = context.getScheduleState?.() || context.getScheduleStateForVideoAnalysis?.() || {};
  const events = Array.isArray(state.events) ? state.events : [];
  return events
    .map((event) => normalizeScheduleCandidate(event, "schedule-state"))
    .filter(Boolean);
}

export function mergeScheduleCandidates(...candidateLists) {
  const seen = new Set();
  const merged = [];
  for (const list of candidateLists) {
    for (const candidate of Array.isArray(list) ? list : []) {
      const normalized = normalizeScheduleCandidate(candidate, candidate?.source || "schedule");
      if (!normalized) continue;
      const key = scheduleSignature(normalized);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(normalized);
    }
  }
  return merged;
}

export function normalizeLibraryMatch(match = {}) {
  const latestVideo = match.latest_video || match.latestVideo || match.video || null;
  const latestSource = match.latest_source || match.latestSource || match.source || null;
  const metadata = match.metadata && typeof match.metadata === "object" ? match.metadata : {};
  const matchDate = dateValue(match.match_date || match.matchDate || metadata.matchDate);
  const type = inferEventType(match.event_type || match.eventType || metadata.eventType || metadata.event_type, match);
  return {
    key: `match:${text(match.id)}`,
    kind: "match",
    id: text(match.id),
    match,
    latestVideo,
    latestSource,
    matchDate,
    eventType: type,
    title: titleFallback(match),
    opponent: text(match.opponent),
    competition: text(match.competition),
    venue: text(match.venue),
    scheduleEventId: text(match.schedule_event_id || match.scheduleEventId || metadata.scheduleEventId || metadata.schedule_event_id),
    scheduleDayKey: text(match.schedule_day_key || match.scheduleDayKey || metadata.scheduleDayKey || metadata.schedule_day_key) || matchDate,
    hasVideo: Boolean(latestVideo?.id || latestSource?.id || latestSource?.local_video_identifier),
    clipCount: Number(match.clip_count || match.clipCount || 0) || 0,
    videoCount: Number(match.video_count || match.videoCount || (latestVideo ? 1 : 0)) || 0,
    sourceCount: Number(match.source_count || match.sourceCount || (latestSource ? 1 : 0)) || 0,
  };
}

export function buildVideoLibraryItems(state = {}) {
  const matches = (state.library?.matches || []).map(normalizeLibraryMatch).filter((item) => item.id);
  const linkedScheduleIds = new Set([
    ...matches.map((item) => item.scheduleEventId).filter(Boolean),
    ...(state.library?.calendar?.linkedScheduleIds || []),
    ...(state.library?.archive?.matches || []).map(normalizeLibraryMatch).map((item) => item.scheduleEventId).filter(Boolean),
  ]);
  const candidates = mergeScheduleCandidates(state.library?.scheduleCandidates || []);
  const dayKey = (item) => JSON.stringify([item.scheduleDayKey, item.eventType]);
  const matchesByDay = new Map();
  const candidatesByDay = new Map();
  for (const match of matches) {
    const key = dayKey(match);
    const group = matchesByDay.get(key) || [];
    group.push(match);
    matchesByDay.set(key, group);
  }
  for (const candidate of candidates) {
    const key = dayKey(candidate);
    candidatesByDay.set(key, (candidatesByDay.get(key) || 0) + 1);
  }
  const scheduleOnly = candidates.filter((candidate) => {
    if (candidate.scheduleEventId) return !linkedScheduleIds.has(candidate.scheduleEventId);
    // Date-only links are safe to collapse only when neither side has an event identity and the day is unambiguous.
    const dayMatches = matchesByDay.get(dayKey(candidate)) || [];
    const dayCandidateCount = candidatesByDay.get(dayKey(candidate));
    return !(dayMatches.length === 1 && !dayMatches[0].scheduleEventId && dayCandidateCount === 1);
  });
  return [...matches, ...scheduleOnly].sort(compareLibraryItems);
}

export function filterVideoLibraryItems(items = [], filters = {}) {
  const search = text(filters.search).toLowerCase();
  const selectedDate = dateValue(filters.date);
  const selectedType = text(filters.type).toLowerCase();
  return items.filter((item) => {
    if (selectedDate && item.matchDate !== selectedDate) return false;
    if (selectedType && selectedType !== "all" && item.eventType !== selectedType) return false;
    if (!search) return true;
    return [
      item.title,
      item.matchDate,
      ...dateSearchTerms(item.matchDate),
      item.eventType,
      `${item.eventType} day`,
      item.hasVideo ? "video linked local video" : "needs video no video linked",
      item.opponent,
      item.competition,
      item.venue,
      item.location,
      item.time,
    ].some((value) => text(value).toLowerCase().includes(search));
  });
}

export function findVideoLibraryItem(state = {}, key = "") {
  return (state.library?.archive?.matches || []).map(normalizeLibraryMatch).find((item) => item.key === key)
    || buildVideoLibraryItems(state).find((item) => item.key === key) || null;
}

export function findScheduleCandidate(state = {}, scheduleEventId = "") {
  const id = text(scheduleEventId);
  if (!id) return null;
  return (state.library?.scheduleCandidates || [])
    .map((candidate) => normalizeScheduleCandidate(candidate, candidate?.source || "schedule"))
    .find((candidate) => candidate?.scheduleEventId === id) || null;
}

export function videoLibraryResultPage(items = [], requestedPage = 0) {
  const pageSize = 8;
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(pageCount - 1, Math.max(0, Math.floor(Number(requestedPage) || 0)));
  const offset = page * pageSize;
  return { page, pageCount, items: items.slice(offset, offset + pageSize), start: items.length ? offset + 1 : 0, end: Math.min(offset + pageSize, items.length) };
}

function compareLibraryItems(first, second) {
  const firstDate = dateValue(first.matchDate) || "0000-00-00";
  const secondDate = dateValue(second.matchDate) || "0000-00-00";
  if (firstDate !== secondDate) return secondDate.localeCompare(firstDate);
  const firstHasVideo = first.hasVideo ? 0 : 1;
  const secondHasVideo = second.hasVideo ? 0 : 1;
  if (firstHasVideo !== secondHasVideo) return firstHasVideo - secondHasVideo;
  return text(first.title).localeCompare(text(second.title));
}
