const clientConfigEndpoint = "/api/client-config";
const pushSubscriptionEndpoint = "/api/push-subscriptions";
const defaultStatusCacheMs = 60 * 1000;
const defaultStatusErrorBackoffMs = 2 * 60 * 1000;
const defaultSubscriptionRefreshCooldownMs = 5 * 60 * 1000;

function normalizeString(value, maxLength = 240) {
  return String(value || "").trim().slice(0, maxLength);
}

function isIosLike(win) {
  const navigatorRef = win?.navigator || {};
  const ua = String(navigatorRef.userAgent || "");
  return /iphone|ipad|ipod/i.test(ua) || (navigatorRef.platform === "MacIntel" && Number(navigatorRef.maxTouchPoints || 0) > 1);
}

function isStandalone(win) {
  return Boolean(
    win?.matchMedia?.("(display-mode: standalone)")?.matches ||
      win?.navigator?.standalone === true
  );
}

function base64UrlToUint8Array(value = "") {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = `${value}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let index = 0; index < rawData.length; index += 1) {
    output[index] = rawData.charCodeAt(index);
  }
  return output;
}

async function parseJsonResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { reason: text };
  }
}

export function createChatPushClient(options = {}) {
  const win = options.win || (typeof window !== "undefined" ? window : null);
  const fetchImpl = options.fetchImpl || win?.fetch?.bind(win);
  const getAuthStore = options.getAuthStore || (() => win?.platformAuthStore || null);
  const getChatScope = options.getChatScope || (() => ({}));
  const getAssetVersion = options.getAssetVersion || (() => win?.__assetVersion || Date.now());
  const showToast = options.showToast || (() => {});
  const nowMs = typeof options.now === "function" ? options.now : () => Date.now();
  const statusCacheMs = Math.max(0, Number(options.statusCacheMs ?? defaultStatusCacheMs) || defaultStatusCacheMs);
  const statusErrorBackoffMs = Math.max(0, Number(options.statusErrorBackoffMs ?? defaultStatusErrorBackoffMs) || defaultStatusErrorBackoffMs);
  const refreshCooldownMs = Math.max(
    0,
    Number(options.subscriptionRefreshCooldownMs ?? defaultSubscriptionRefreshCooldownMs) ||
      defaultSubscriptionRefreshCooldownMs
  );

  let cachedConfig = null;
  let refreshInFlight = null;
  let statusInFlight = null;
  let cachedStatus = null;
  let cachedStatusAt = 0;
  let lastStatusErrorAt = 0;
  let lastRefreshAt = 0;
  let lastRefreshSignature = "";
  let lastRefreshResult = null;

  function supported() {
    return Boolean(
      win &&
        win.isSecureContext !== false &&
        "serviceWorker" in win.navigator &&
        "PushManager" in win &&
        "Notification" in win &&
        typeof fetchImpl === "function"
    );
  }

  function platformHint() {
    if (isIosLike(win) && !isStandalone(win)) {
      return "On iPhone/iPad, add Football Science to the Home Screen to receive push when the app is closed.";
    }
    return "";
  }

  async function readConfig({ force = false } = {}) {
    if (cachedConfig && !force) return cachedConfig;
    const response = await fetchImpl(`${clientConfigEndpoint}?push=${Date.now()}`, {
      cache: "no-store",
      credentials: "omit",
    });
    const payload = await parseJsonResponse(response);
    cachedConfig = payload?.chatPush || { enabled: false, publicKey: "" };
    return cachedConfig;
  }

  async function getAccessToken() {
    const authStore = getAuthStore();
    if (typeof authStore?.getAccessToken === "function") {
      return normalizeString(await authStore.getAccessToken(), 4096);
    }
    return "";
  }

  function cloneStatusResult(value = {}) {
    if (!value || typeof value !== "object") return value;
    return {
      ...value,
      serverSubscriptions: Array.isArray(value.serverSubscriptions)
        ? value.serverSubscriptions.map((subscription) => ({ ...subscription }))
        : [],
    };
  }

  function rememberStatusResult(result = {}) {
    cachedStatus = cloneStatusResult(result);
    cachedStatusAt = nowMs();
    return cloneStatusResult(cachedStatus);
  }

  function clearStatusCache() {
    cachedStatus = null;
    cachedStatusAt = 0;
    lastStatusErrorAt = 0;
  }

  function readScopeSignature() {
    const scope = getChatScope() || {};
    return [
      normalizeString(scope.organizationId || scope.organization_id || "", 120),
      normalizeString(scope.teamId || scope.team_id || "", 120),
    ].join(":");
  }

  function shouldUseCachedStatus(force = false) {
    if (force || !cachedStatus || statusCacheMs <= 0) {
      return false;
    }
    return nowMs() - cachedStatusAt < statusCacheMs;
  }

  function shouldBackoffStatus(force = false) {
    if (force || !cachedStatus || statusErrorBackoffMs <= 0 || !lastStatusErrorAt) {
      return false;
    }
    return nowMs() - lastStatusErrorAt < statusErrorBackoffMs;
  }

  async function apiRequest(method, body = null) {
    const token = await getAccessToken();
    if (!token) {
      throw new Error("You must be signed in to manage push notifications.");
    }
    const response = await fetchImpl(pushSubscriptionEndpoint, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await parseJsonResponse(response);
    if (!response.ok || payload?.ok === false) {
      throw new Error(payload?.reason || "Push notification request failed.");
    }
    return payload;
  }

  async function registerServiceWorker() {
    const registration = await win.navigator.serviceWorker.register(
      `/footballscience-sw.js?v=${encodeURIComponent(String(getAssetVersion()))}`,
      { scope: "/", updateViaCache: "none" }
    );
    await win.navigator.serviceWorker.ready;
    return registration;
  }

  async function currentSubscription() {
    if (!supported()) return null;
    const registration = await win.navigator.serviceWorker.getRegistration("/") || await registerServiceWorker();
    return registration?.pushManager?.getSubscription?.() || null;
  }

  async function subscribe(notificationLevel = "all") {
    if (!supported()) {
      return { ok: false, reason: "This browser does not support Web Push notifications.", hint: platformHint() };
    }
    const config = await readConfig({ force: true });
    if (!config?.enabled || !config?.publicKey) {
      return { ok: false, reason: "Push notifications are not configured on the server.", hint: platformHint() };
    }
    const permission = await win.Notification.requestPermission();
    if (permission !== "granted") {
      const reason = permission === "denied"
        ? "Notifications are blocked in this browser. Allow notifications for footballscience.xyz in browser settings, then test again."
        : "Notifications were not allowed. Allow notifications to receive chat push outside the platform.";
      return { ok: false, reason, permission, hint: platformHint() };
    }
    const registration = await registerServiceWorker();
    const existing = await registration.pushManager.getSubscription();
    const subscription = existing || await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(config.publicKey),
    });
    const scope = getChatScope() || {};
    await apiRequest("POST", {
      action: "subscribe",
      subscription: subscription.toJSON(),
      permission,
      notificationLevel,
      platform: isIosLike(win) ? "ios-web" : "web",
      swScope: registration.scope,
      organizationId: scope.organizationId || scope.organization_id || "",
      teamId: scope.teamId || scope.team_id || "",
    });
    clearStatusCache();
    return { ok: true, permission, hint: platformHint() };
  }

  async function sendTest(notificationLevel = "all") {
    const subscribeResult = await subscribe(notificationLevel);
    if (!subscribeResult?.ok) {
      return subscribeResult;
    }
    const payload = await apiRequest("POST", {
      action: "test",
      body: "Test notification from Football Science.",
    });
    return {
      ...payload,
      hint: platformHint(),
    };
  }

  async function unsubscribe() {
    const subscription = await currentSubscription();
    if (subscription) {
      await apiRequest("POST", { action: "unsubscribe", subscription: subscription.toJSON() }).catch(() => null);
      await subscription.unsubscribe().catch(() => false);
    } else {
      await apiRequest("POST", { action: "unsubscribe" }).catch(() => null);
    }
    clearStatusCache();
    return { ok: true };
  }

  async function status({ force = false } = {}) {
    if (shouldUseCachedStatus(force) || shouldBackoffStatus(force)) {
      return cloneStatusResult(cachedStatus);
    }
    if (statusInFlight) {
      return statusInFlight;
    }
    statusInFlight = (async () => {
      const subscription = await currentSubscription().catch(() => null);
      let serverStatus = null;
      let statusError = null;
      try {
        serverStatus = await apiRequest("GET");
        lastStatusErrorAt = 0;
      } catch (error) {
        statusError = error;
        lastStatusErrorAt = nowMs();
      }
      return rememberStatusResult({
        ok: !statusError,
        status: statusError ? "error" : "ok",
        reason: statusError?.message || "",
        supported: supported(),
        permission: win?.Notification?.permission || "unsupported",
        subscribed: Boolean(subscription),
        serverConfigured: Boolean(serverStatus?.configured),
        serverSubscriptions: Array.isArray(serverStatus?.subscriptions) ? serverStatus.subscriptions : [],
        hint: platformHint(),
      });
    })().finally(() => {
      statusInFlight = null;
    });
    return statusInFlight;
  }

  async function refreshExistingSubscription(notificationLevel = "all", { force = false } = {}) {
    if (refreshInFlight) return refreshInFlight;
    refreshInFlight = (async () => {
      if (!supported() || win.Notification.permission !== "granted") {
        return { ok: false };
      }
      const subscription = await currentSubscription();
      if (!subscription) {
        return { ok: false };
      }
      const signature = [
        normalizeString(notificationLevel || "all", 40),
        readScopeSignature(),
        normalizeString(subscription.endpoint || "", 2048),
      ].join("|");
      if (
        !force &&
        lastRefreshResult &&
        lastRefreshSignature === signature &&
        refreshCooldownMs > 0 &&
        nowMs() - lastRefreshAt < refreshCooldownMs
      ) {
        return { ...lastRefreshResult, cached: true };
      }
      const scope = getChatScope() || {};
      let result = { ok: true };
      try {
        await apiRequest("POST", {
          action: "subscribe",
          subscription: subscription.toJSON(),
          permission: "granted",
          notificationLevel,
          organizationId: scope.organizationId || scope.organization_id || "",
          teamId: scope.teamId || scope.team_id || "",
        });
      } catch (error) {
        result = { ok: false, reason: error?.message || "Push subscription refresh failed." };
      }
      lastRefreshSignature = signature;
      lastRefreshAt = nowMs();
      lastRefreshResult = result;
      if (result.ok) {
        clearStatusCache();
      }
      return result;
    })().finally(() => {
      refreshInFlight = null;
    });
    return refreshInFlight;
  }

  async function toggleFromNotificationLevel(nextLevel) {
    if (nextLevel === "muted") {
      await unsubscribe();
      showToast("Push notifications disabled.");
      return { ok: true, enabled: false };
    }
    const result = await subscribe(nextLevel);
    showToast(result.ok ? "Push notifications enabled." : result.reason || "Push notifications could not be enabled.");
    return { ...result, enabled: result.ok };
  }

  return {
    refreshExistingSubscription,
    sendTest,
    status,
    subscribe,
    supported,
    toggleFromNotificationLevel,
    unsubscribe,
  };
}
