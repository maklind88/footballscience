const clientConfigEndpoint = "/api/client-config";
const pushSubscriptionEndpoint = "/api/push-subscriptions";

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

  let cachedConfig = null;
  let refreshInFlight = null;

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
    return { ok: true };
  }

  async function status() {
    const subscription = await currentSubscription().catch(() => null);
    const serverStatus = await apiRequest("GET").catch(() => null);
    return {
      ok: true,
      supported: supported(),
      permission: win?.Notification?.permission || "unsupported",
      subscribed: Boolean(subscription),
      serverConfigured: Boolean(serverStatus?.configured),
      serverSubscriptions: Array.isArray(serverStatus?.subscriptions) ? serverStatus.subscriptions : [],
      hint: platformHint(),
    };
  }

  async function refreshExistingSubscription(notificationLevel = "all") {
    if (refreshInFlight) return refreshInFlight;
    refreshInFlight = (async () => {
      if (!supported() || win.Notification.permission !== "granted") {
        return { ok: false };
      }
      const subscription = await currentSubscription();
      if (!subscription) {
        return { ok: false };
      }
      const scope = getChatScope() || {};
      await apiRequest("POST", {
        action: "subscribe",
        subscription: subscription.toJSON(),
        permission: "granted",
        notificationLevel,
        organizationId: scope.organizationId || scope.organization_id || "",
        teamId: scope.teamId || scope.team_id || "",
      });
      return { ok: true };
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
