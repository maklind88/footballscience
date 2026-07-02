self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

function parsePushPayload(event) {
  try {
    return event.data ? event.data.json() : {};
  } catch {
    return {};
  }
}

function notificationUrl(payload = {}) {
  const rawUrl = String(payload.url || "/?workspace=home").trim() || "/?workspace=home";
  try {
    const target = new URL(rawUrl, self.location.origin);
    return target.origin === self.location.origin ? target.href : `${self.location.origin}/?workspace=home`;
  } catch {
    return `${self.location.origin}/?workspace=home`;
  }
}

self.addEventListener("push", (event) => {
  const payload = parsePushPayload(event);
  const title = String(payload.title || "Football Science chat").trim();
  const body = String(payload.body || "New chat activity").trim();
  const url = notificationUrl(payload);
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag: String(payload.tag || payload.threadId || "footballscience-chat"),
      renotify: false,
      icon: "/assets/football-science-mark.png",
      badge: "/assets/football-science-mark.png",
      data: {
        url,
        threadId: payload.threadId || "",
        messageId: payload.messageId || "",
      },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = notificationUrl(event.notification.data || {});
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const sameOriginWindow = windows.find((client) => {
      try {
        return new URL(client.url).origin === self.location.origin;
      } catch {
        return false;
      }
    });
    if (sameOriginWindow) {
      if (typeof sameOriginWindow.navigate === "function") {
        await sameOriginWindow.navigate(targetUrl);
      }
      return sameOriginWindow.focus();
    }
    return self.clients.openWindow(targetUrl);
  })());
});
