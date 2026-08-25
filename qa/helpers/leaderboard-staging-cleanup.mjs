import { randomBytes } from "node:crypto";

const DEFAULT_BUDGET_MS = 80_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_RETRY_DELAY_MS = 1_000;
export const leaderboardQaTitlePrefix = "QA Leaderboard staging ";
export const leaderboardQaNotePrefix = "Reversed append-only staging proof ";
export const leaderboardQaStaleAfterMs = 30 * 60 * 1000;
export const leaderboardQaRunIdPattern = /^\d{8}T\d{9}Z-[0-9a-f]{20}$/;
const MAX_EVENT_CREATION_LAG_MS = 10 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 60 * 1000;

function text(value) {
  return String(value || "");
}

function eventIsReversed(event = {}) {
  return event.status === "reversed" || Boolean(event.reversedAt || event.reversed_at);
}

function standingPoints(snapshot = {}, playerId = "") {
  const standing = (Array.isArray(snapshot.standings) ? snapshot.standings : [])
    .find((row) => text(row?.playerId || row?.player_id) === playerId);
  return Number(standing?.points || 0);
}

function summaryNumber(snapshot = {}, key) {
  const value = Number(snapshot.summary?.[key]);
  return Number.isFinite(value) ? value : null;
}

export function createLeaderboardQaRunId(options = {}) {
  const now = options.now instanceof Date ? new Date(options.now.getTime()) : new Date(options.now ?? Date.now());
  const randomHex = String(options.randomHex || randomBytes(10).toString("hex")).toLowerCase();
  if (!Number.isFinite(now.getTime()) || !/^[0-9a-f]{20}$/.test(randomHex)) {
    throw new Error("Leaderboard staging run identity could not be generated.");
  }
  const timestamp = now.toISOString().replace(/[-:.]/g, "");
  return `${timestamp}-${randomHex}`;
}

export function parseLeaderboardQaRunId(value) {
  const runId = text(value);
  if (!leaderboardQaRunIdPattern.test(runId)) return null;
  const timestamp = runId.slice(0, 19);
  const iso = `${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)}T${timestamp.slice(9, 11)}:${timestamp.slice(11, 13)}:${timestamp.slice(13, 15)}.${timestamp.slice(15, 18)}Z`;
  const timestampMs = Date.parse(iso);
  if (!Number.isFinite(timestampMs) || new Date(timestampMs).toISOString() !== iso) return null;
  return { runId, timestampMs };
}

function canonicalRunEvent(runId) {
  return {
    title: `${leaderboardQaTitlePrefix}${runId}`,
    note: `${leaderboardQaNotePrefix}${runId}`,
  };
}

function parseCanonicalEventRun(event = {}) {
  const title = text(event.title);
  const note = text(event.note);
  if (!title.startsWith(leaderboardQaTitlePrefix) || !note.startsWith(leaderboardQaNotePrefix)) return null;
  const titleRunId = title.slice(leaderboardQaTitlePrefix.length);
  const noteRunId = note.slice(leaderboardQaNotePrefix.length);
  if (titleRunId !== noteRunId) return null;
  const parsed = parseLeaderboardQaRunId(titleRunId);
  if (!parsed) return null;
  const canonical = canonicalRunEvent(parsed.runId);
  return title === canonical.title && note === canonical.note ? parsed : null;
}

export function getRunOwnedLeaderboardEvents(snapshot = {}, run = {}) {
  const events = Array.isArray(snapshot.events) ? snapshot.events : [];
  const parsed = parseLeaderboardQaRunId(run.runId);
  if (!parsed) return [];
  const canonical = canonicalRunEvent(parsed.runId);
  return events.filter((event) => text(event?.title) === canonical.title && text(event?.note) === canonical.note);
}

export function createLeaderboardQaReversalBody({ run, teamId, eventId } = {}) {
  return {
    action: "reverse-event",
    teamId,
    eventId,
    reason: `QA staging smoke reversal ${run.runId}`,
    idempotencyKey: `leaderboard-staging-reverse-${run.runId}-${eventId}`,
  };
}

export function getStaleLeaderboardQaEvents(snapshot = {}, nowMs = Date.now(), teamId = "") {
  if (!teamId || text(snapshot.qaTeamId) !== teamId) return [];
  const cutoff = nowMs - leaderboardQaStaleAfterMs;
  return (Array.isArray(snapshot.events) ? snapshot.events : []).filter((event) => {
    const createdAt = Date.parse(text(event?.createdAt || event?.created_at));
    const run = parseCanonicalEventRun(event);
    const awards = Array.isArray(event?.awards) ? event.awards : [];
    const awardPoints = awards.reduce((total, award) => total + Number(award?.points || 0), 0);
    const creationLagMs = run ? createdAt - run.timestampMs : Number.NaN;
    return Boolean(run)
      && text(event?.teamId || event?.team_id) === teamId
      && event?.status === "active"
      && !eventIsReversed(event)
      && Number(event?.points) > 0
      && Number(event?.netPoints) > 0
      && awards.length > 0
      && awards.every((award) => text(award?.playerId) && Number(award?.points) > 0)
      && awardPoints === Number(event?.points)
      && Number.isFinite(createdAt)
      && createdAt <= cutoff
      && run.timestampMs <= cutoff
      && creationLagMs >= -MAX_CLOCK_SKEW_MS
      && creationLagMs <= MAX_EVENT_CREATION_LAG_MS;
  });
}

function createStaleReversalBody(teamId, eventId) {
  return {
    action: "reverse-event",
    teamId,
    eventId,
    reason: "QA staging stale-run safety reversal",
    idempotencyKey: `leaderboard-staging-stale-${eventId}`,
  };
}

function cleanupIsProven(snapshot, run, baseline) {
  const events = getRunOwnedLeaderboardEvents(snapshot, run);
  const eventsSettled = events.length > 0 && events.every((event) => (
    eventIsReversed(event) && Number(event.netPoints) === 0
  ));
  return eventsSettled
    && standingPoints(snapshot, baseline.playerId) === baseline.playerPoints
    && summaryNumber(snapshot, "totalPoints") === baseline.totalPoints
    && summaryNumber(snapshot, "eventCount") === baseline.eventCount;
}

function cleanupError(runId, reason) {
  return new Error(`Leaderboard staging cleanup failed for run ${runId}: ${reason}`);
}

export async function convergeLeaderboardStagingCleanup(options = {}) {
  const {
    run,
    awardBody,
    baseline,
    retryAward,
    readSnapshot,
    reverseEvent,
    now = Date.now,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    budgetMs = DEFAULT_BUDGET_MS,
    requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  } = options;
  if (!parseLeaderboardQaRunId(run?.runId) || !awardBody?.idempotencyKey || !baseline?.playerId) {
    throw cleanupError(run?.runId || "unknown", "run identity, award command, and baseline are required");
  }
  if (![retryAward, readSnapshot, reverseEvent].every((callback) => typeof callback === "function")) {
    throw cleanupError(run.runId, "cleanup callbacks are incomplete");
  }

  const deadline = now() + budgetMs;
  let snapshot = null;
  let awardRetryAttempted = false;
  let observedEvents = [];

  const remaining = () => Math.max(0, deadline - now());
  const timeoutForCall = () => Math.max(1, Math.min(requestTimeoutMs, remaining()));
  const pause = async () => {
    const delay = Math.min(retryDelayMs, remaining());
    if (delay > 0) await sleep(delay);
  };

  while (remaining() > 0 && observedEvents.length === 0) {
    awardRetryAttempted = true;
    try { snapshot = await retryAward(awardBody, timeoutForCall()); } catch {}
    observedEvents = getRunOwnedLeaderboardEvents(snapshot || {}, run);
    if (observedEvents.length > 0) break;
    try { snapshot = await readSnapshot(timeoutForCall()); } catch {}
    observedEvents = getRunOwnedLeaderboardEvents(snapshot || {}, run);
    if (!observedEvents.length) await pause();
  }

  if (!awardRetryAttempted || observedEvents.length === 0) {
    throw cleanupError(run.runId, "no run-owned event became visible after bounded idempotent award retry/readback");
  }

  while (remaining() > 0) {
    const activeEvents = getRunOwnedLeaderboardEvents(snapshot || {}, run)
      .filter((event) => !eventIsReversed(event) || Number(event.netPoints) !== 0);
    for (const event of activeEvents) {
      const reversalBody = createLeaderboardQaReversalBody({ run, teamId: awardBody.teamId, eventId: event.id });
      try { snapshot = await reverseEvent(reversalBody, timeoutForCall()); } catch {}
    }
    try { snapshot = await readSnapshot(timeoutForCall()); } catch {}
    if (cleanupIsProven(snapshot || {}, run, baseline)) {
      return { ok: true, eventIds: getRunOwnedLeaderboardEvents(snapshot, run).map((event) => event.id) };
    }
    await pause();
  }

  throw cleanupError(run.runId, "run-owned events did not converge to reversed net-zero baseline within the teardown budget");
}

export async function sweepStaleLeaderboardQaEvents(options = {}) {
  const {
    initialSnapshot,
    teamId,
    readSnapshot,
    reverseEvent,
    now = Date.now,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    budgetMs = 40_000,
    requestTimeoutMs = 12_000,
    retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  } = options;
  let snapshot = initialSnapshot || {};
  const staleIds = new Set(getStaleLeaderboardQaEvents(snapshot, now(), teamId).map((event) => event.id));
  if (!staleIds.size) return { ok: true, eventIds: [] };
  const deadline = now() + budgetMs;
  const remaining = () => Math.max(0, deadline - now());
  const timeoutForCall = () => Math.max(1, Math.min(requestTimeoutMs, remaining()));

  while (remaining() > 0) {
    const active = (Array.isArray(snapshot.events) ? snapshot.events : [])
      .filter((event) => staleIds.has(event.id))
      .filter((event) => !eventIsReversed(event) || Number(event.netPoints) !== 0);
    for (const event of active) {
      try { snapshot = await reverseEvent(createStaleReversalBody(teamId, event.id), timeoutForCall()); } catch {}
    }
    try { snapshot = await readSnapshot(timeoutForCall()); } catch {}
    const tracked = (Array.isArray(snapshot.events) ? snapshot.events : []).filter((event) => staleIds.has(event.id));
    if (tracked.length === staleIds.size && tracked.every((event) => eventIsReversed(event) && Number(event.netPoints) === 0)) {
      return { ok: true, eventIds: [...staleIds] };
    }
    const delay = Math.min(retryDelayMs, remaining());
    if (delay > 0) await sleep(delay);
  }
  throw new Error(`Leaderboard staging stale QA cleanup failed for ${staleIds.size} event(s).`);
}
