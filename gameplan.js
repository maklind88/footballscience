import {
  cloneGameplanState,
  createGameplanFromMatch,
  gameplanPhaseKeys,
  gameplanPhaseLabels,
  gameplanStatusOptions,
  getActiveGameplan,
  getGameplanMatchLabel,
} from "./gameplan-state.js";

const gameplanStorageKey = "football-gameplan-v1";
const scheduleStorageKey = "football-schedule-v1";
const playerProfilesStorageKey = "football-player-profiles-v1";
let activeContext = null;
let gameplanState = null;
let signedPlayerBriefState = { token: "", status: "idle", payload: null, reason: "" };
let signedPlayerBriefPromise = null;
const gameplanEditableFields = new Set([
  "status",
  "summary.objective",
  "summary.matchStory",
  "summary.nonNegotiables",
  "tactical.inPossession",
  "tactical.outOfPossession",
  "tactical.attackingTransition",
  "tactical.defensiveTransition",
  "tactical.setPieces",
  "opponentPlan.shape",
  "opponentPlan.threats",
  "opponentPlan.weakZones",
  "opponentPlan.keyPlayers",
  "opponentPlan.pressingCues",
  "opponentPlan.setPieces",
  "playerBrief.headline",
  "playerBrief.message",
  "playerBrief.focus",
  "playerBrief.individualFocus",
  "playerBrief.phases.inPossession",
  "playerBrief.phases.outOfPossession",
  "playerBrief.phases.attackingTransition",
  "playerBrief.phases.defensiveTransition",
  "playerBrief.phases.setPieces",
]);

function setContext(context = {}) {
  activeContext = context;
  gameplanState = cloneGameplanState(readGameplanState(), { currentUser: activeContext.currentUser || {} });
}

function rerenderGameplan() {
  render(activeContext || {});
}

function escapeHtml(value) {
  if (typeof activeContext?.escapeHtml === "function") {
    return activeContext.escapeHtml(value);
  }
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getState() {
  if (!gameplanState) {
    gameplanState = cloneGameplanState(readGameplanState(), { currentUser: activeContext?.currentUser || {} });
  }
  return gameplanState;
}

function readStorageJson(key = "") {
  try {
    return JSON.parse(window.localStorage.getItem(key) || "{}");
  } catch {
    return {};
  }
}

function getScheduleMatches() {
  const events = (activeContext?.getScheduleState?.() || readStorageJson(scheduleStorageKey)).events || [];
  const seen = new Set();
  const unique = [];
  for (const event of events) {
    const key = event?.id || `${event?.date || ""}:${event?.time || ""}:${event?.title || ""}`;
    if (!event || seen.has(key)) continue;
    seen.add(key);
    unique.push(event);
  }
  const today = new Date();
  const todayValue = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return unique
    .filter((event) => event.type === "match")
    .sort((a, b) => {
      const futureA = a.date >= todayValue ? 0 : 1;
      const futureB = b.date >= todayValue ? 0 : 1;
      if (futureA !== futureB) return futureA - futureB;
      return `${a.date || ""} ${a.time || ""} ${a.title || ""}`.localeCompare(`${b.date || ""} ${b.time || ""} ${b.title || ""}`);
    })
    .map((event) => ({
      id: event.id,
      title: event.title || "Match",
      opponent: event.title || "Match",
      date: event.date,
      time: event.time,
      venue: event.location || event.venue || "",
      competition: event.competition || "",
    }));
}

function getSquadPlayers() {
  const players = (activeContext?.getPlayerProfilesState?.() || readStorageJson(playerProfilesStorageKey)).players || [];
  return players
    .filter((player) => player?.id && player?.name && player.countsInSquad !== false)
    .map((player) => ({
      id: player.id,
      name: player.name,
      number: player.number || player.jerseyNumber || "",
      position: player.position || player.primaryRole || "",
      roleGroup: player.roleGroup || "",
    }));
}

function getPlan() {
  return getActiveGameplan(getState());
}

function ensureSeedGameplan() {
  const state = getState();
  state.gameplans = Array.isArray(state.gameplans) ? state.gameplans : [];
  if (state.gameplans.length) return;
  const match = getScheduleMatches()[0];
  if (!match) return;
  const plan = createGameplanFromMatch(match, { currentUser: activeContext?.currentUser || null });
  state.gameplans.push(plan);
  state.activeGameplanId = plan.id;
  state.activeTab = "plan";
  writeGameplanState({ syncCentral: false });
}

function getPlanById(planId = "") {
  const plans = Array.isArray(getState().gameplans) ? getState().gameplans : [];
  return plans.find((plan) => plan.id === planId) || null;
}

function getPlayerById(playerId = "") {
  return getSquadPlayers().find((player) => player.id === playerId) || null;
}

function canEditPlan(plan = getPlan()) {
  return activeContext?.canEdit?.() === true && plan?.status !== "locked";
}

function canEditWorkspace() {
  return activeContext?.canEdit?.() === true;
}

function formatDate(value = "") {
  if (!value) return "No date";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(date);
}

function formatTimestamp(value = "") {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function isLocalRuntime() {
  const host = window.location?.hostname || "";
  return (
    window.location?.protocol === "file:" ||
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.endsWith(".localhost")
  );
}

function getPlayerBriefUrl(planId = "", playerId = "") {
  if (typeof activeContext?.getPlayerBriefUrl === "function") {
    return activeContext.getPlayerBriefUrl(planId, playerId);
  }
  try {
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";
    url.searchParams.set("workspace", "gameplan");
    url.searchParams.set("playerBrief", "1");
    url.searchParams.set("gameplan", String(planId || ""));
    url.searchParams.set("player", String(playerId || ""));
    return url.toString();
  } catch {
    return `?workspace=gameplan&playerBrief=1&gameplan=${encodeURIComponent(String(planId || ""))}&player=${encodeURIComponent(String(playerId || ""))}`;
  }
}

function getPlayerBriefRoute() {
  try {
    const params = new URLSearchParams(window.location.search);
    const isPlayerBriefRoute = params.get("workspace") === "player-brief" || params.get("playerBrief") === "1";
    if (!isPlayerBriefRoute) return null;
    return {
      active: true,
      token: String(params.get("token") || params.get("briefToken") || "").trim(),
      planId: String(params.get("gameplan") || params.get("plan") || "").trim(),
      playerId: String(params.get("player") || "").trim(),
    };
  } catch {
    return null;
  }
}

function requiresSignedPlayerBriefLinks() {
  if (typeof activeContext?.requiresSignedPlayerBriefLinks === "function") {
    return activeContext.requiresSignedPlayerBriefLinks() === true;
  }
  return !isLocalRuntime();
}

async function parsePlayerBriefApiResponse(response) {
  const responseText = await response.text();
  let payload = {};
  if (responseText) {
    try {
      payload = JSON.parse(responseText);
    } catch {
      payload = { reason: responseText.slice(0, 240) };
    }
  }
  if (!response.ok || payload?.ok === false) {
    return {
      ok: false,
      status: response.status,
      reason: payload?.reason || payload?.message || `Player Brief API failed (${response.status}).`,
    };
  }
  return { ok: true, status: response.status, payload };
}

async function requestSignedPlayerBrief(token, payload = null) {
  const playerBriefToken = String(token || "");
  if (!playerBriefToken) {
    return { ok: false, reason: "Missing secure Player Brief token." };
  }
  try {
    const response = await fetch(
      `/api/gameplan-player-brief?token=${encodeURIComponent(playerBriefToken)}`,
      payload
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...payload, token: playerBriefToken }),
            cache: "no-store",
          }
        : { cache: "no-store" }
    );
    return parsePlayerBriefApiResponse(response);
  } catch (error) {
    return { ok: false, reason: error?.message || "Could not open secure Player Brief." };
  }
}

async function createSignedPlayerBriefLink(planId = "", playerId = "") {
  const fallbackUrl = getPlayerBriefUrl(planId, playerId);
  if (!requiresSignedPlayerBriefLinks()) {
    return { ok: true, signed: false, url: fallbackUrl };
  }
  const token = await activeContext?.getAuthToken?.();
  if (!token) {
    return { ok: false, reason: "Sign in again before creating a secure Player Brief link." };
  }
  try {
    const response = await fetch("/api/gameplan-player-brief", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        action: "sign",
        planId,
        playerId,
      }),
      cache: "no-store",
    });
    const result = await parsePlayerBriefApiResponse(response);
    if (!result.ok) return result;
    return {
      ok: true,
      signed: true,
      url: result.payload.url || "",
      expiresAt: result.payload.expiresAt || "",
    };
  } catch (error) {
    return { ok: false, reason: error?.message || "Could not create secure Player Brief link." };
  }
}

function resetSignedPlayerBriefState(token = "") {
  signedPlayerBriefState = { token: String(token || ""), status: token ? "idle" : "empty", payload: null, reason: "" };
  signedPlayerBriefPromise = null;
}

function shouldRerenderSignedPlayerBrief(token = "") {
  const route = getPlayerBriefRoute();
  return route?.active === true && route.token === token;
}

async function loadSignedPlayerBrief(token = "") {
  const playerBriefToken = String(token || "");
  if (!playerBriefToken) return;
  if (signedPlayerBriefPromise) return signedPlayerBriefPromise;

  signedPlayerBriefState = { token: playerBriefToken, status: "loading", payload: null, reason: "" };
  signedPlayerBriefPromise = requestSignedPlayerBrief(playerBriefToken)
    .then((result) => {
      if (result.ok) {
        signedPlayerBriefState = { token: playerBriefToken, status: "ready", payload: result.payload, reason: "" };
      } else {
        signedPlayerBriefState = {
          token: playerBriefToken,
          status: "error",
          payload: null,
          reason: result.reason || "This secure brief could not be opened.",
        };
      }
    })
    .finally(() => {
      signedPlayerBriefPromise = null;
      if (shouldRerenderSignedPlayerBrief(playerBriefToken)) {
        rerenderGameplan();
      }
    });
  return signedPlayerBriefPromise;
}

function getSignedPlayerBriefState(route = {}) {
  const token = String(route.token || "");
  if (signedPlayerBriefState.token !== token) {
    resetSignedPlayerBriefState(token);
  }
  if (token && signedPlayerBriefState.status === "idle") {
    loadSignedPlayerBrief(token);
  }
  return signedPlayerBriefState;
}

function updateSignedPlayerBriefPayload(token = "", payload = null) {
  const playerBriefToken = String(token || "");
  signedPlayerBriefState = { token: playerBriefToken, status: "ready", payload, reason: "" };
  if (shouldRerenderSignedPlayerBrief(playerBriefToken)) {
    rerenderGameplan();
  }
}

async function recordSignedPlayerBriefOpened(token = "") {
  const playerBriefToken = String(token || "");
  if (!playerBriefToken) return false;
  const receiptKey = `football-gameplan-player-brief-opened:${playerBriefToken}`;
  try {
    if (window.sessionStorage.getItem(receiptKey)) {
      return false;
    }
  } catch {}
  const result = await requestSignedPlayerBrief(playerBriefToken, { action: "opened" });
  if (result.ok) {
    try {
      window.sessionStorage.setItem(receiptKey, "1");
    } catch {}
    updateSignedPlayerBriefPayload(playerBriefToken, result.payload);
    return true;
  }
  return false;
}

async function acknowledgeSignedPlayerBrief(token = "") {
  const playerBriefToken = String(token || "");
  if (!playerBriefToken) return false;
  const result = await requestSignedPlayerBrief(playerBriefToken, { action: "acknowledge" });
  if (result.ok) {
    updateSignedPlayerBriefPayload(playerBriefToken, result.payload);
    return true;
  }
  return false;
}

function getBriefReceipt(plan = {}, playerId = "") {
  const receipts = plan.playerBrief?.readReceipts || {};
  return receipts[playerId] || null;
}

function readGameplanState() {
  try {
    return JSON.parse(window.localStorage.getItem(gameplanStorageKey) || "{}");
  } catch {
    return {};
  }
}

function writeGameplanState(options = {}) {
  if (!gameplanState) return;
  const shouldSyncCentral = options.syncCentral !== false;
  if (!shouldSyncCentral) activeContext?.suppressCentralWrites?.(gameplanStorageKey);
  gameplanState.updatedAt = new Date().toISOString();
  try {
    window.localStorage.setItem(gameplanStorageKey, JSON.stringify(gameplanState));
  } finally {
    if (!shouldSyncCentral) activeContext?.unsuppressCentralWrites?.(gameplanStorageKey);
  }
}

function createGameplanLocalId(prefix = "gameplan") {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function mutateActiveGameplan(mutator, options = {}) {
  const state = getState();
  const plan = getActiveGameplan(state);
  if (!plan || typeof mutator !== "function") return null;
  mutator(plan);
  plan.updatedAt = new Date().toISOString();
  writeGameplanState(options);
  return plan;
}

function setGameplanNestedField(plan = {}, path = "", value = "") {
  if (!gameplanEditableFields.has(path)) return false;
  if (path === "status") {
    const allowedStatuses = new Set(["draft", "staff-review", "player-brief-ready", "locked"]);
    const nextStatus = String(value || "").trim().toLowerCase();
    plan.status = allowedStatuses.has(nextStatus) ? nextStatus : "draft";
    return true;
  }
  const parts = path.split(".");
  let target = plan;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const key = parts[index];
    if (!target[key] || typeof target[key] !== "object" || Array.isArray(target[key])) {
      target[key] = {};
    }
    target = target[key];
  }
  target[parts[parts.length - 1]] = String(value ?? "").slice(0, 1200);
  return true;
}

function updateGameplanField(path = "", value = "") {
  mutateActiveGameplan((plan) => setGameplanNestedField(plan, path, value));
}

function setActiveGameplan(gameplanId = "") {
  const state = getState();
  if (!state.gameplans?.some((plan) => plan.id === gameplanId)) return;
  state.activeGameplanId = gameplanId;
  writeGameplanState({ syncCentral: false });
}

function setGameplanActiveTab(tabId = "") {
  const state = getState();
  state.activeTab = ["plan", "staff", "player-brief", "checklist"].includes(tabId) ? tabId : "plan";
  writeGameplanState({ syncCentral: false });
}

function createGameplanFromScheduleMatch(matchId = "") {
  if (!canEditWorkspace()) return;
  const match = getScheduleMatches().find((candidate) => candidate.id === matchId);
  if (!match) return;
  const state = getState();
  const existing = state.gameplans?.find((plan) => plan.matchEventId === match.id);
  if (existing) {
    state.activeGameplanId = existing.id;
    state.activeTab = "plan";
    writeGameplanState({ syncCentral: false });
    return;
  }
  const plan = createGameplanFromMatch(match, { currentUser: activeContext?.currentUser || null });
  state.gameplans = Array.isArray(state.gameplans) ? state.gameplans : [];
  state.gameplans.push(plan);
  state.activeGameplanId = plan.id;
  state.activeTab = "plan";
  writeGameplanState();
}

function addGameplanStaffResponsibility() {
  if (!canEditWorkspace()) return;
  mutateActiveGameplan((plan) => {
    plan.staffResponsibilities = Array.isArray(plan.staffResponsibilities) ? plan.staffResponsibilities : [];
    plan.staffResponsibilities.push({
      id: createGameplanLocalId("staff"),
      userId: "",
      role: "Staff role",
      ownerName: "",
      area: "",
      watchFor: "",
      reportAtHalftime: "",
      decisionTrigger: "",
      status: "open",
    });
  });
}

function updateGameplanStaffResponsibility(staffId = "", patch = {}) {
  if (!canEditWorkspace()) return;
  mutateActiveGameplan((plan) => {
    plan.staffResponsibilities = (plan.staffResponsibilities || []).map((entry) =>
      entry.id === staffId ? { ...entry, ...patch } : entry
    );
  });
}

function removeGameplanStaffResponsibility(staffId = "") {
  if (!canEditWorkspace()) return;
  mutateActiveGameplan((plan) => {
    plan.staffResponsibilities = (plan.staffResponsibilities || []).filter((entry) => entry.id !== staffId);
  });
}

function setGameplanAudience(mode = "") {
  if (!canEditWorkspace()) return;
  mutateActiveGameplan((plan) => {
    const brief = plan.playerBrief || {};
    const players = getSquadPlayers();
    brief.audiencePlayerIds = mode === "all" ? players.map((player) => player.id) : [];
    plan.playerBrief = brief;
  });
}

function toggleGameplanAudiencePlayer(playerId = "", isSelected = false) {
  if (!canEditWorkspace()) return;
  mutateActiveGameplan((plan) => {
    const brief = plan.playerBrief || {};
    const selected = new Set(Array.isArray(brief.audiencePlayerIds) ? brief.audiencePlayerIds : []);
    if (isSelected) selected.add(playerId);
    else selected.delete(playerId);
    brief.audiencePlayerIds = Array.from(selected);
    plan.playerBrief = brief;
  });
}

function publishGameplanPlayerBrief() {
  if (!canEditWorkspace()) return;
  mutateActiveGameplan((plan) => {
    plan.playerBrief = {
      ...(plan.playerBrief || {}),
      publishedAt: new Date().toISOString(),
    };
    if (plan.status === "draft" || plan.status === "staff-review") {
      plan.status = "player-brief-ready";
    }
  });
}

function addGameplanChecklistItem() {
  if (!canEditWorkspace()) return;
  mutateActiveGameplan((plan) => {
    plan.checklist = Array.isArray(plan.checklist) ? plan.checklist : [];
    plan.checklist.push({
      id: createGameplanLocalId("check"),
      stage: "MD",
      title: "",
      ownerUserId: "",
      due: "",
      done: false,
    });
  });
}

function updateGameplanChecklistItem(itemId = "", patch = {}) {
  if (!canEditWorkspace()) return;
  mutateActiveGameplan((plan) => {
    plan.checklist = (plan.checklist || []).map((entry) => (entry.id === itemId ? { ...entry, ...patch } : entry));
  });
}

function removeGameplanChecklistItem(itemId = "") {
  if (!canEditWorkspace()) return;
  mutateActiveGameplan((plan) => {
    plan.checklist = (plan.checklist || []).filter((entry) => entry.id !== itemId);
  });
}

function getLocalPlayerBriefAccess(planId = "", playerId = "") {
  const plan = getPlanById(planId);
  const brief = plan?.playerBrief || {};
  const selected = new Set(Array.isArray(brief.audiencePlayerIds) ? brief.audiencePlayerIds : []);
  const player = getPlayerById(playerId);
  if (!plan) {
    return { ok: false, reason: "Brief not found.", plan: null, player };
  }
  if (!brief.publishedAt) {
    return { ok: false, reason: "This player brief has not been published yet.", plan, player };
  }
  if (!playerId || !selected.has(playerId)) {
    return { ok: false, reason: "This brief is not assigned to this player.", plan, player };
  }
  return { ok: true, reason: "", plan, player };
}

function upsertLocalPlayerBriefReceipt(planId = "", playerId = "", options = {}) {
  const access = getLocalPlayerBriefAccess(planId, playerId);
  if (!access.ok || !access.plan) return false;
  const now = new Date().toISOString();
  const brief = access.plan.playerBrief || {};
  const receipts = { ...(brief.readReceipts || {}) };
  const previous = receipts[playerId] || {};
  const shouldCountOpen = options.countOpen !== false;
  const previousOpenCount = Number.parseInt(previous.openCount, 10) || 0;
  receipts[playerId] = {
    playerId,
    firstOpenedAt: previous.firstOpenedAt || now,
    lastOpenedAt: now,
    acknowledgedAt: options.acknowledge ? previous.acknowledgedAt || now : previous.acknowledgedAt || "",
    openCount: shouldCountOpen || previousOpenCount === 0 ? Math.min(9999, previousOpenCount + 1) : previousOpenCount,
  };
  access.plan.playerBrief = { ...brief, readReceipts: receipts };
  access.plan.updatedAt = now;
  writeGameplanState();
  return true;
}

function recordLocalPlayerBriefOpened(planId = "", playerId = "") {
  const receiptKey = `football-gameplan-player-brief-opened:${planId}:${playerId}`;
  try {
    if (window.sessionStorage.getItem(receiptKey)) return false;
  } catch {}
  const didRecord = upsertLocalPlayerBriefReceipt(planId, playerId, { countOpen: true });
  if (didRecord) {
    try {
      window.sessionStorage.setItem(receiptKey, "1");
    } catch {}
  }
  return didRecord;
}

function acknowledgeLocalPlayerBrief(planId = "", playerId = "") {
  return upsertLocalPlayerBriefReceipt(planId, playerId, { acknowledge: true, countOpen: false });
}

function getSelectedBriefPlayers(plan = {}) {
  const selected = new Set(plan.playerBrief?.audiencePlayerIds || []);
  return getSquadPlayers().filter((player) => selected.has(player.id));
}

function getReceiptLabel(receipt = null) {
  if (receipt?.acknowledgedAt) return `Acknowledged ${formatTimestamp(receipt.acknowledgedAt)}`;
  if (receipt?.lastOpenedAt) return `Opened ${formatTimestamp(receipt.lastOpenedAt)}`;
  return "Not opened";
}

function getUserName(userId = "") {
  const user = (activeContext?.users || []).find((candidate) => candidate.id === userId);
  return user ? [user.firstName, user.lastName].filter(Boolean).join(" ") || user.name || user.email : "";
}

function renderUserOptions(selectedUserId = "") {
  const users = activeContext?.users || [];
  return [`<option value="">Unassigned</option>`]
    .concat(
      users.map((user) => {
        const label = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.name || user.email || "Staff";
        return `<option value="${escapeHtml(user.id)}" ${user.id === selectedUserId ? "selected" : ""}>${escapeHtml(label)}</option>`;
      })
    )
    .join("");
}

function renderStatusOptions(selectedStatus = "draft") {
  return gameplanStatusOptions
    .map(
      (option) =>
        `<option value="${escapeHtml(option.value)}" ${option.value === selectedStatus ? "selected" : ""}>${escapeHtml(option.label)}</option>`
    )
    .join("");
}

function renderField(path, label, value = "", options = {}) {
  const disabled = options.disabled || !canEditPlan();
  const rows = options.rows || 3;
  return `
    <label class="gameplan-field ${options.wide ? "is-wide" : ""}">
      <span>${escapeHtml(label)}</span>
      <textarea
        rows="${rows}"
        data-gameplan-field="${escapeHtml(path)}"
        ${disabled ? "disabled" : ""}
      >${escapeHtml(value)}</textarea>
    </label>
  `;
}

function renderPlanList() {
  const state = getState();
  const plans = Array.isArray(state.gameplans) ? state.gameplans : [];
  const matches = getScheduleMatches();
  const activeId = state.activeGameplanId;
  return `
    <aside class="gameplan-sidebar">
      <div class="gameplan-sidebar-head">
        <span>Gameplans</span>
        <strong>${plans.length}</strong>
      </div>
      <div class="gameplan-plan-list">
        ${
          plans.length
            ? plans
                .map(
                  (plan) => `
                    <button type="button" class="gameplan-plan-card ${plan.id === activeId ? "is-active" : ""}" data-gameplan-open="${escapeHtml(plan.id)}">
                      <span>${escapeHtml(formatDate(plan.date))}</span>
                      <strong>${escapeHtml(plan.title || plan.opponent || "Match Plan")}</strong>
                      <small>${escapeHtml(plan.status.replaceAll("-", " "))}</small>
                    </button>
                  `
                )
                .join("")
            : `<div class="gameplan-empty-small">No gameplan yet.</div>`
        }
      </div>
      <div class="gameplan-create-panel">
        <span>Create from Schedule</span>
        <div class="gameplan-match-list">
          ${
            matches.length
              ? matches
                  .slice(0, 8)
                  .map(
                    (match) => `
                      <button type="button" data-gameplan-create-match="${escapeHtml(match.id)}" ${!activeContext?.canEdit?.() ? "disabled" : ""}>
                        ${escapeHtml(getGameplanMatchLabel(match))}
                      </button>
                    `
                  )
                  .join("")
              : `<small>No scheduled matches found.</small>`
          }
        </div>
      </div>
    </aside>
  `;
}

function renderHero(plan) {
  const audienceCount = plan.playerBrief?.audiencePlayerIds?.length || 0;
  const checklist = plan.checklist || [];
  const doneCount = checklist.filter((item) => item.done).length;
  return `
    <header class="gameplan-hero">
      <div class="gameplan-hero-main">
        <p>Gameplan</p>
        <h1>${escapeHtml(plan.title || plan.opponent || "Match Plan")}</h1>
        <div class="gameplan-meta-row">
          <span>${escapeHtml(formatDate(plan.date))}</span>
          ${plan.kickoff ? `<span>${escapeHtml(plan.kickoff)}</span>` : ""}
          ${plan.venue ? `<span>${escapeHtml(plan.venue)}</span>` : ""}
          ${plan.competition ? `<span>${escapeHtml(plan.competition)}</span>` : ""}
        </div>
      </div>
      <div class="gameplan-status-board">
        <label>
          <span>Status</span>
          <select data-gameplan-field="status" ${!activeContext?.canEdit?.() ? "disabled" : ""}>
            ${renderStatusOptions(plan.status)}
          </select>
        </label>
        <div>
          <strong>${audienceCount}</strong>
          <span>Player brief audience</span>
        </div>
        <div>
          <strong>${doneCount}/${checklist.length}</strong>
          <span>Checklist</span>
        </div>
      </div>
    </header>
  `;
}

function renderTabs() {
  const activeTab = getState().activeTab || "plan";
  const tabs = [
    ["plan", "Plan"],
    ["staff", "Staff"],
    ["player-brief", "Player Brief"],
    ["checklist", "Checklist"],
  ];
  return `
    <nav class="gameplan-tabs" aria-label="Gameplan sections">
      ${tabs
        .map(
          ([tab, label]) =>
            `<button type="button" class="${activeTab === tab ? "is-active" : ""}" data-gameplan-tab="${escapeHtml(tab)}">${escapeHtml(label)}</button>`
        )
        .join("")}
    </nav>
  `;
}

function renderPlanTab(plan) {
  return `
    <section class="gameplan-panel gameplan-plan-grid">
      <section class="gameplan-card gameplan-card-span">
        <header><span>Match Brief</span></header>
        <div class="gameplan-form-grid">
          ${renderField("summary.objective", "Match objective", plan.summary?.objective, { rows: 3 })}
          ${renderField("summary.matchStory", "Expected match story", plan.summary?.matchStory, { rows: 3 })}
          ${renderField("summary.nonNegotiables", "Non-negotiables", plan.summary?.nonNegotiables, { rows: 3, wide: true })}
        </div>
      </section>
      <section class="gameplan-card gameplan-card-span">
        <header><span>Tactical Intent</span></header>
        <div class="gameplan-phase-grid">
          ${gameplanPhaseKeys
            .map((key) => renderField(`tactical.${key}`, gameplanPhaseLabels[key], plan.tactical?.[key], { rows: 4 }))
            .join("")}
        </div>
      </section>
      <section class="gameplan-card gameplan-card-span">
        <header><span>Opponent Plan</span></header>
        <div class="gameplan-form-grid">
          ${renderField("opponentPlan.shape", "Shape", plan.opponentPlan?.shape, { rows: 2 })}
          ${renderField("opponentPlan.threats", "Threats", plan.opponentPlan?.threats, { rows: 3 })}
          ${renderField("opponentPlan.weakZones", "Weak zones", plan.opponentPlan?.weakZones, { rows: 3 })}
          ${renderField("opponentPlan.keyPlayers", "Key players", plan.opponentPlan?.keyPlayers, { rows: 3 })}
          ${renderField("opponentPlan.pressingCues", "Pressing cues", plan.opponentPlan?.pressingCues, { rows: 3 })}
          ${renderField("opponentPlan.setPieces", "Set-piece risk", plan.opponentPlan?.setPieces, { rows: 3 })}
        </div>
      </section>
    </section>
  `;
}

function renderStaffResponsibilityCard(item) {
  const disabled = !canEditPlan();
  return `
    <article class="gameplan-staff-card" data-gameplan-staff-card="${escapeHtml(item.id)}">
      <div class="gameplan-staff-top">
        <label>
          <span>Owner</span>
          <select data-gameplan-staff="${escapeHtml(item.id)}" data-gameplan-staff-field="userId" ${disabled ? "disabled" : ""}>
            ${renderUserOptions(item.userId)}
          </select>
        </label>
        <label>
          <span>Role</span>
          <input value="${escapeHtml(item.role)}" data-gameplan-staff="${escapeHtml(item.id)}" data-gameplan-staff-field="role" ${disabled ? "disabled" : ""}>
        </label>
        <button type="button" data-gameplan-remove-staff="${escapeHtml(item.id)}" ${disabled ? "disabled" : ""}>Remove</button>
      </div>
      <label>
        <span>Area</span>
        <input value="${escapeHtml(item.area)}" data-gameplan-staff="${escapeHtml(item.id)}" data-gameplan-staff-field="area" ${disabled ? "disabled" : ""}>
      </label>
      <div class="gameplan-staff-fields">
        <label>
          <span>Watch for</span>
          <textarea rows="3" data-gameplan-staff="${escapeHtml(item.id)}" data-gameplan-staff-field="watchFor" ${disabled ? "disabled" : ""}>${escapeHtml(item.watchFor)}</textarea>
        </label>
        <label>
          <span>Halftime report</span>
          <textarea rows="3" data-gameplan-staff="${escapeHtml(item.id)}" data-gameplan-staff-field="reportAtHalftime" ${disabled ? "disabled" : ""}>${escapeHtml(item.reportAtHalftime)}</textarea>
        </label>
        <label>
          <span>Decision trigger</span>
          <textarea rows="3" data-gameplan-staff="${escapeHtml(item.id)}" data-gameplan-staff-field="decisionTrigger" ${disabled ? "disabled" : ""}>${escapeHtml(item.decisionTrigger)}</textarea>
        </label>
      </div>
    </article>
  `;
}

function renderStaffTab(plan) {
  return `
    <section class="gameplan-panel">
      <section class="gameplan-card">
        <header>
          <span>Staff Responsibilities</span>
          <button type="button" data-gameplan-add-staff ${!canEditPlan() ? "disabled" : ""}>Add role</button>
        </header>
        <div class="gameplan-staff-list">
          ${(plan.staffResponsibilities || []).map(renderStaffResponsibilityCard).join("")}
        </div>
      </section>
    </section>
  `;
}

function renderPlayerAudience(plan) {
  const selected = new Set(plan.playerBrief?.audiencePlayerIds || []);
  const players = getSquadPlayers();
  return `
    <section class="gameplan-player-audience">
      <header>
        <span>Audience</span>
        <div>
          <button type="button" data-gameplan-audience="all" ${!canEditPlan() ? "disabled" : ""}>All</button>
          <button type="button" data-gameplan-audience="none" ${!canEditPlan() ? "disabled" : ""}>None</button>
        </div>
      </header>
      <div class="gameplan-player-list">
        ${
          players.length
            ? players
                .map(
                  (player) => `
                    <label class="gameplan-player-pill">
                      <input type="checkbox" data-gameplan-player-audience="${escapeHtml(player.id)}" ${selected.has(player.id) ? "checked" : ""} ${!canEditPlan() ? "disabled" : ""}>
                      <span>${escapeHtml(player.number ? `#${player.number}` : "")}</span>
                      <strong>${escapeHtml(player.name || "Player")}</strong>
                      <small>${escapeHtml(player.position || player.roleGroup || "")}</small>
                    </label>
                  `
                )
                .join("")
            : `<div class="gameplan-empty-small">No squad players found.</div>`
        }
      </div>
    </section>
  `;
}

function renderPlayerBriefPreview(plan) {
  const brief = plan.playerBrief || {};
  const selected = new Set(brief.audiencePlayerIds || []);
  const players = getSquadPlayers().filter((player) => selected.has(player.id));
  return `
    <section class="gameplan-player-preview">
      <div class="gameplan-player-preview-card">
        <p>${escapeHtml(plan.opponent || plan.title || "Match")}</p>
        <h2>${escapeHtml(brief.headline || "Player Brief")}</h2>
        ${brief.message ? `<strong>${escapeHtml(brief.message)}</strong>` : ""}
        ${brief.focus ? `<section><span>Team focus</span><p>${escapeHtml(brief.focus)}</p></section>` : ""}
        <div class="gameplan-player-preview-phases">
          ${gameplanPhaseKeys
            .map((key) =>
              brief.phases?.[key]
                ? `<section><span>${escapeHtml(gameplanPhaseLabels[key])}</span><p>${escapeHtml(brief.phases[key])}</p></section>`
                : ""
            )
            .join("")}
        </div>
        ${brief.individualFocus ? `<section><span>Individual focus</span><p>${escapeHtml(brief.individualFocus)}</p></section>` : ""}
        <footer>
          <span>${players.length} selected player${players.length === 1 ? "" : "s"}</span>
          ${brief.publishedAt ? `<span>Published ${escapeHtml(formatTimestamp(brief.publishedAt))}</span>` : `<span>Not published</span>`}
        </footer>
      </div>
    </section>
  `;
}

function renderPlayerBriefDelivery(plan) {
  const players = getSelectedBriefPlayers(plan);
  const acknowledgedCount = players.filter((player) => getBriefReceipt(plan, player.id)?.acknowledgedAt).length;
  const openedCount = players.filter((player) => getBriefReceipt(plan, player.id)?.lastOpenedAt).length;
  const isPublished = Boolean(plan.playerBrief?.publishedAt);
  const secureLinksRequired = requiresSignedPlayerBriefLinks();
  return `
    <section class="gameplan-delivery-panel">
      <header>
        <div>
          <span>Player Portal</span>
          <strong>${acknowledgedCount}/${players.length} acknowledged</strong>
        </div>
        <small>${openedCount} opened${isPublished ? "" : " · publish before sharing"}</small>
      </header>
      <div class="gameplan-delivery-list">
        ${
          players.length
            ? players
                .map((player) => {
                  const receipt = getBriefReceipt(plan, player.id);
                  const fallbackUrl = getPlayerBriefUrl(plan.id, player.id);
                  const url = secureLinksRequired ? "" : fallbackUrl;
                  return `
                    <article class="gameplan-delivery-row">
                      <div>
                        <strong>${escapeHtml(player.name || "Player")}</strong>
                        <span>${escapeHtml(getReceiptLabel(receipt))}</span>
                      </div>
                      <input data-gameplan-player-brief-link readonly value="${escapeHtml(url)}" placeholder="${secureLinksRequired ? "Generate secure link" : ""}" aria-label="${escapeHtml(`${player.name || "Player"} brief link`)}">
                      <button type="button" data-gameplan-sign-brief-link data-gameplan-sign-plan="${escapeHtml(plan.id)}" data-gameplan-sign-player="${escapeHtml(player.id)}" ${!isPublished || !canEditPlan(plan) ? "disabled" : ""}>Secure</button>
                      <button type="button" data-gameplan-copy-brief-link="${escapeHtml(url)}" ${!url ? "disabled" : ""}>Copy</button>
                      <a href="${escapeHtml(url || "#")}" target="_blank" rel="noopener" class="${url ? "" : "is-disabled"}" ${url ? "" : "aria-disabled=\"true\""}>Open</a>
                    </article>
                  `;
                })
                .join("")
            : `<div class="gameplan-empty-small">Select players to generate individual brief links.</div>`
        }
      </div>
    </section>
  `;
}

function renderPlayerBriefTab(plan) {
  const brief = plan.playerBrief || {};
  return `
    <section class="gameplan-panel gameplan-player-layout">
      <section class="gameplan-card">
        <header>
          <span>Player Brief Builder</span>
          <button type="button" data-gameplan-publish-player-brief ${!canEditPlan() ? "disabled" : ""}>Publish brief</button>
        </header>
        <div class="gameplan-form-grid">
          ${renderField("playerBrief.headline", "Headline", brief.headline, { rows: 2 })}
          ${renderField("playerBrief.message", "Message", brief.message, { rows: 3 })}
          ${renderField("playerBrief.focus", "Team focus", brief.focus, { rows: 3, wide: true })}
        </div>
        <div class="gameplan-phase-grid">
          ${gameplanPhaseKeys
            .map((key) => renderField(`playerBrief.phases.${key}`, gameplanPhaseLabels[key], brief.phases?.[key], { rows: 3 }))
            .join("")}
        </div>
        ${renderField("playerBrief.individualFocus", "Individual focus", brief.individualFocus, { rows: 3, wide: true })}
      </section>
      ${renderPlayerAudience(plan)}
      ${renderPlayerBriefDelivery(plan)}
      ${renderPlayerBriefPreview(plan)}
    </section>
  `;
}

function renderPlayerBriefUnavailable(reason = "Brief unavailable.") {
  return `
    <section class="gameplan-player-portal">
      <main class="gameplan-player-portal-card is-empty">
        <p>Player Brief</p>
        <h1>Brief unavailable</h1>
        <span>${escapeHtml(reason)}</span>
      </main>
    </section>
  `;
}

function renderPlayerBriefLoading() {
  return `
    <section class="gameplan-player-portal">
      <main class="gameplan-player-portal-card is-empty">
        <p>Player Brief</p>
        <h1>Loading brief</h1>
        <span>Opening secure match brief.</span>
      </main>
    </section>
  `;
}

function renderPlayerBriefPortalCard({ plan = {}, player = {}, brief = {}, receipt = {}, acknowledgeMarkup = "" }) {
  const playerName = player?.name || "Player";
  const acknowledged = Boolean(receipt?.acknowledgedAt);
  return `
    <section class="gameplan-player-portal">
      <main class="gameplan-player-portal-card">
        <header>
          <p>${escapeHtml(playerName)}</p>
          <span>${escapeHtml(formatDate(plan.date))}${plan.kickoff ? ` · ${escapeHtml(plan.kickoff)}` : ""}</span>
        </header>
        <h1>${escapeHtml(brief.headline || "Player Brief")}</h1>
        ${brief.message ? `<strong>${escapeHtml(brief.message)}</strong>` : ""}
        <div class="gameplan-player-portal-meta">
          <span>${escapeHtml(plan.opponent || plan.title || "Match")}</span>
          ${plan.venue ? `<span>${escapeHtml(plan.venue)}</span>` : ""}
          ${brief.publishedAt ? `<span>Published ${escapeHtml(formatTimestamp(brief.publishedAt))}</span>` : ""}
        </div>
        ${brief.focus ? `<section><span>Team focus</span><p>${escapeHtml(brief.focus)}</p></section>` : ""}
        <div class="gameplan-player-portal-phases">
          ${gameplanPhaseKeys
            .map((key) =>
              brief.phases?.[key]
                ? `<section><span>${escapeHtml(gameplanPhaseLabels[key])}</span><p>${escapeHtml(brief.phases[key])}</p></section>`
                : ""
            )
            .join("")}
        </div>
        ${brief.individualFocus ? `<section><span>Individual focus</span><p>${escapeHtml(brief.individualFocus)}</p></section>` : ""}
        <footer>
          <span>${receipt?.lastOpenedAt ? `Opened ${escapeHtml(formatTimestamp(receipt.lastOpenedAt))}` : "Opened now"}</span>
          ${acknowledgeMarkup || `<button type="button" disabled>${acknowledged ? "Marked as read" : "Mark as read"}</button>`}
        </footer>
      </main>
    </section>
  `;
}

function renderSignedPlayerBriefPortal(route = {}) {
  const signedState = getSignedPlayerBriefState(route);
  if (!signedState.token || signedState.status === "idle" || signedState.status === "loading") {
    return renderPlayerBriefLoading();
  }
  if (signedState.status === "error") {
    return renderPlayerBriefUnavailable(signedState.reason || "This secure brief could not be opened.");
  }
  const payload = signedState.payload || {};
  if (!payload.ok && payload.reason) {
    return renderPlayerBriefUnavailable(payload.reason);
  }
  recordSignedPlayerBriefOpened(route.token);
  const acknowledged = Boolean(payload.receipt?.acknowledgedAt);
  return renderPlayerBriefPortalCard({
    plan: payload.plan,
    player: payload.player,
    brief: payload.brief,
    receipt: payload.receipt,
    acknowledgeMarkup: `<button type="button" data-gameplan-ack-player-brief-token="${escapeHtml(route.token)}" ${acknowledged ? "disabled" : ""}>
      ${acknowledged ? "Marked as read" : "Mark as read"}
    </button>`,
  });
}

function renderPlayerBriefPortal(route = {}) {
  if (route.token) {
    return renderSignedPlayerBriefPortal(route);
  }

  const plan = getPlanById(route.planId);
  const player = getPlayerById(route.playerId);
  const brief = plan?.playerBrief || {};
  const selected = new Set(brief.audiencePlayerIds || []);
  const receipt = plan ? getBriefReceipt(plan, route.playerId) : null;
  let reason = "";
  if (!plan) {
    reason = "Brief not found.";
  } else if (!brief.publishedAt) {
    reason = "This player brief has not been published yet.";
  } else if (!route.playerId || !selected.has(route.playerId)) {
    reason = "This brief is not assigned to this player.";
  }

  if (reason) {
    return renderPlayerBriefUnavailable(reason);
  }

  recordLocalPlayerBriefOpened(plan.id, route.playerId);
  const acknowledged = Boolean(receipt?.acknowledgedAt);
  return renderPlayerBriefPortalCard({
    plan,
    player,
    brief,
    receipt,
    acknowledgeMarkup: `<button type="button" data-gameplan-ack-player-brief="${escapeHtml(plan.id)}" data-gameplan-ack-player="${escapeHtml(route.playerId)}" ${acknowledged ? "disabled" : ""}>
      ${acknowledged ? "Marked as read" : "Mark as read"}
    </button>`,
  });
}

function renderChecklistTab(plan) {
  const disabled = !canEditPlan();
  return `
    <section class="gameplan-panel">
      <section class="gameplan-card">
        <header>
          <span>Matchday Checklist</span>
          <button type="button" data-gameplan-add-check ${disabled ? "disabled" : ""}>Add item</button>
        </header>
        <div class="gameplan-check-list">
          ${(plan.checklist || [])
            .map(
              (item) => `
                <article class="gameplan-check-item ${item.done ? "is-done" : ""}">
                  <input type="checkbox" data-gameplan-check-toggle="${escapeHtml(item.id)}" ${item.done ? "checked" : ""} ${disabled ? "disabled" : ""}>
                  <input class="gameplan-check-stage" value="${escapeHtml(item.stage)}" data-gameplan-check="${escapeHtml(item.id)}" data-gameplan-check-field="stage" ${disabled ? "disabled" : ""}>
                  <input value="${escapeHtml(item.title)}" data-gameplan-check="${escapeHtml(item.id)}" data-gameplan-check-field="title" ${disabled ? "disabled" : ""}>
                  <select data-gameplan-check="${escapeHtml(item.id)}" data-gameplan-check-field="ownerUserId" ${disabled ? "disabled" : ""}>
                    ${renderUserOptions(item.ownerUserId)}
                  </select>
                  <button type="button" data-gameplan-remove-check="${escapeHtml(item.id)}" ${disabled ? "disabled" : ""}>Remove</button>
                </article>
              `
            )
            .join("")}
        </div>
      </section>
    </section>
  `;
}

function renderActiveTab(plan) {
  const tab = getState().activeTab || "plan";
  if (tab === "staff") return renderStaffTab(plan);
  if (tab === "player-brief") return renderPlayerBriefTab(plan);
  if (tab === "checklist") return renderChecklistTab(plan);
  return renderPlanTab(plan);
}

export function render(context = {}) {
  setContext(context);
  const root = context.root || context.ui?.gameplanWorkspace || document.getElementById("gameplanWorkspace");
  if (!root) return;
  const playerBriefRoute = getPlayerBriefRoute();
  if (playerBriefRoute?.active) {
    root.innerHTML = renderPlayerBriefPortal(playerBriefRoute);
    return;
  }
  ensureSeedGameplan();
  const plan = getPlan();
  if (!plan) {
    root.innerHTML = `
      <section class="gameplan-shell">
        ${renderPlanList()}
        <main class="gameplan-main">
          <section class="gameplan-empty">
            <h2>No scheduled match to build from yet.</h2>
          </section>
        </main>
      </section>
    `;
    return;
  }
  root.innerHTML = `
    <section class="gameplan-shell">
      ${renderPlanList()}
      <main class="gameplan-main">
        ${renderHero(plan)}
        ${renderTabs()}
        ${renderActiveTab(plan)}
      </main>
    </section>
  `;
}

export async function handleClick(event, context = activeContext) {
  setContext(context);
  const acknowledgeTrigger = event.target.closest("[data-gameplan-ack-player-brief][data-gameplan-ack-player]");
  if (acknowledgeTrigger) {
    acknowledgeLocalPlayerBrief(acknowledgeTrigger.dataset.gameplanAckPlayerBrief, acknowledgeTrigger.dataset.gameplanAckPlayer);
    rerenderGameplan();
    return;
  }
  const signedAcknowledgeTrigger = event.target.closest("[data-gameplan-ack-player-brief-token]");
  if (signedAcknowledgeTrigger) {
    signedAcknowledgeTrigger.disabled = true;
    const didAcknowledge = await acknowledgeSignedPlayerBrief(signedAcknowledgeTrigger.dataset.gameplanAckPlayerBriefToken);
    if (!didAcknowledge) {
      signedAcknowledgeTrigger.disabled = false;
    }
    return;
  }
  const signBriefTrigger = event.target.closest("[data-gameplan-sign-brief-link]");
  if (signBriefTrigger) {
    const row = signBriefTrigger.closest(".gameplan-delivery-row");
    const planId = signBriefTrigger.dataset.gameplanSignPlan || "";
    const playerId = signBriefTrigger.dataset.gameplanSignPlayer || "";
    signBriefTrigger.disabled = true;
    signBriefTrigger.textContent = "Signing";
    const result = await createSignedPlayerBriefLink(planId, playerId);
    if (result?.ok && result.url) {
      row?.removeAttribute("data-gameplan-link-error");
      const input = row?.querySelector("[data-gameplan-player-brief-link]");
      const copyButton = row?.querySelector("[data-gameplan-copy-brief-link]");
      const openLink = row?.querySelector("a");
      if (input) {
        input.value = result.url;
      }
      if (copyButton) {
        copyButton.dataset.gameplanCopyBriefLink = result.url;
        copyButton.disabled = false;
      }
      if (openLink) {
        openLink.href = result.url;
        openLink.classList.remove("is-disabled");
        openLink.removeAttribute("aria-disabled");
      }
      signBriefTrigger.textContent = result.signed ? "Signed" : "Ready";
    } else {
      signBriefTrigger.textContent = "Retry";
      signBriefTrigger.disabled = false;
      row?.setAttribute("data-gameplan-link-error", result?.reason || "Could not sign link");
    }
    return;
  }
  const copyBriefTrigger = event.target.closest("[data-gameplan-copy-brief-link]");
  if (copyBriefTrigger) {
    const url = copyBriefTrigger.dataset.gameplanCopyBriefLink || "";
    navigator.clipboard?.writeText(url)?.catch?.(() => {});
    return;
  }
  const openTrigger = event.target.closest("[data-gameplan-open]");
  if (openTrigger) {
    setActiveGameplan(openTrigger.dataset.gameplanOpen);
    rerenderGameplan();
    return;
  }
  const createTrigger = event.target.closest("[data-gameplan-create-match]");
  if (createTrigger) {
    createGameplanFromScheduleMatch(createTrigger.dataset.gameplanCreateMatch);
    rerenderGameplan();
    return;
  }
  const tabTrigger = event.target.closest("[data-gameplan-tab]");
  if (tabTrigger) {
    setGameplanActiveTab(tabTrigger.dataset.gameplanTab);
    rerenderGameplan();
    return;
  }
  if (event.target.closest("[data-gameplan-add-staff]")) {
    addGameplanStaffResponsibility();
    rerenderGameplan();
    return;
  }
  const removeStaffTrigger = event.target.closest("[data-gameplan-remove-staff]");
  if (removeStaffTrigger) {
    removeGameplanStaffResponsibility(removeStaffTrigger.dataset.gameplanRemoveStaff);
    rerenderGameplan();
    return;
  }
  const audienceTrigger = event.target.closest("[data-gameplan-audience]");
  if (audienceTrigger) {
    setGameplanAudience(audienceTrigger.dataset.gameplanAudience);
    rerenderGameplan();
    return;
  }
  if (event.target.closest("[data-gameplan-publish-player-brief]")) {
    publishGameplanPlayerBrief();
    rerenderGameplan();
    return;
  }
  if (event.target.closest("[data-gameplan-add-check]")) {
    addGameplanChecklistItem();
    rerenderGameplan();
    return;
  }
  const removeCheckTrigger = event.target.closest("[data-gameplan-remove-check]");
  if (removeCheckTrigger) {
    removeGameplanChecklistItem(removeCheckTrigger.dataset.gameplanRemoveCheck);
    rerenderGameplan();
  }
}

export function handleInput(event, context = activeContext) {
  setContext(context);
  const field = event.target.closest("[data-gameplan-field]");
  if (field) {
    updateGameplanField(field.dataset.gameplanField, field.value);
    return;
  }
  const staffField = event.target.closest("[data-gameplan-staff][data-gameplan-staff-field]");
  if (staffField) {
    updateGameplanStaffResponsibility(staffField.dataset.gameplanStaff, {
      [staffField.dataset.gameplanStaffField]: staffField.value,
    });
    return;
  }
  const checkField = event.target.closest("[data-gameplan-check][data-gameplan-check-field]");
  if (checkField) {
    updateGameplanChecklistItem(checkField.dataset.gameplanCheck, {
      [checkField.dataset.gameplanCheckField]: checkField.value,
    });
  }
}

export function handleChange(event, context = activeContext) {
  setContext(context);
  const field = event.target.closest("[data-gameplan-field]");
  if (field) {
    updateGameplanField(field.dataset.gameplanField, field.value);
    if (field.matches("select")) {
      rerenderGameplan();
    }
    return;
  }
  const audiencePlayer = event.target.closest("[data-gameplan-player-audience]");
  if (audiencePlayer) {
    toggleGameplanAudiencePlayer(audiencePlayer.dataset.gameplanPlayerAudience, audiencePlayer.checked);
    rerenderGameplan();
    return;
  }
  const checkToggle = event.target.closest("[data-gameplan-check-toggle]");
  if (checkToggle) {
    updateGameplanChecklistItem(checkToggle.dataset.gameplanCheckToggle, { done: checkToggle.checked });
    rerenderGameplan();
    return;
  }
  const staffField = event.target.closest("[data-gameplan-staff][data-gameplan-staff-field]");
  if (staffField) {
    updateGameplanStaffResponsibility(staffField.dataset.gameplanStaff, {
      [staffField.dataset.gameplanStaffField]: staffField.value,
    });
    if (staffField.matches("select")) {
      rerenderGameplan();
    }
    return;
  }
  const checkField = event.target.closest("[data-gameplan-check][data-gameplan-check-field]");
  if (checkField) {
    updateGameplanChecklistItem(checkField.dataset.gameplanCheck, {
      [checkField.dataset.gameplanCheckField]: checkField.value,
    });
    if (checkField.matches("select")) {
      rerenderGameplan();
    }
  }
}

export function handleSubmit(event) {
  event.preventDefault();
}
