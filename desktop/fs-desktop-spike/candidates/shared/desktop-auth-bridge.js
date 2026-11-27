(() => {
  const page = new URL(location.href);
  const isActiveOrigin = (url) => !url.username && !url.password && !url.port && (
    (url.protocol === "fs-active:" && url.hostname === "localhost") ||
    (["http:", "https:"].includes(url.protocol) && url.hostname === "fs-active.localhost")
  );
  if (!isActiveOrigin(page)) return;
  const invoke = globalThis.__TAURI_INTERNALS__?.invoke;
  if (typeof invoke !== "function") return;

  const OPAQUE_ACCESS_MARKER = "desktop-native-session-v1";
  const nativeFetch = globalThis.fetch.bind(globalThis);

  const profileUser = (snapshot = {}) => {
    const profile = snapshot.profile || {};
    if (!snapshot.actorId || !snapshot.canReadOffline || profile.status !== "active") return null;
    return {
      id: snapshot.actorId,
      email: profile.email || "",
      user_metadata: {
        firstName: profile.firstName || "",
        lastName: profile.lastName || "",
        username: String(profile.email || "").split("@", 1)[0],
        title: "",
        department: "",
        clubId: profile.clubId || snapshot.tenantId || "",
        clubName: profile.clubName || "",
        teamId: snapshot.teamId || "",
        teamName: profile.teamName || "",
        team: profile.teamName || "",
      },
      app_metadata: {
        role: profile.role || "guest",
        status: profile.status || "active",
        organizationId: snapshot.organizationId || "",
      },
    };
  };

  const sessionFromView = (view = {}) => {
    const snapshot = view.snapshot || {};
    const user = profileUser(snapshot);
    if (!user) return null;
    return {
      access_token: OPAQUE_ACCESS_MARKER,
      token_type: "native",
      expires_at: Math.floor(Number(snapshot.offlineLeaseExpiresAtUnixMs || 0) / 1000),
      user,
    };
  };

  const desktopApiFetch = async (input, init = {}) => {
    const inputUrl = input instanceof Request ? input.url : String(input || "");
    const url = new URL(inputUrl, location.href);
    if (!isActiveOrigin(url) || url.protocol !== page.protocol ||
        url.hostname !== page.hostname || !url.pathname.startsWith("/api/")) {
      return nativeFetch(input, init);
    }
    const method = String(init.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (method !== "GET") throw new TypeError("Writing through the desktop web API is unavailable in this candidate.");
    const signal = init.signal ?? (input instanceof Request ? input.signal : undefined);
    signal?.throwIfAborted();
    const result = await invoke("desktop_api_request", {
      request: { path: `${url.pathname}${url.search}`, method },
    });
    signal?.throwIfAborted();
    const status = Number(result.status || 500);
    const responseBody = [204, 205, 304].includes(status) ? null : result.body || "";
    return new Response(responseBody, {
      status,
      headers: { "Content-Type": result.contentType || "application/json; charset=utf-8" },
    });
  };

  globalThis.fetch = desktopApiFetch;

  const bridge = Object.freeze({
    schema: "fs-desktop-auth-bridge-v1",
    opaqueAccessMarker: OPAQUE_ACCESS_MARKER,
    async getSession() {
      const view = await invoke("desktop_auth_status");
      return { configured: view.configured === true, session: sessionFromView(view), snapshot: view.snapshot || null };
    },
    async signIn(identifier, password) {
      const view = await invoke("desktop_auth_sign_in", { request: { identifier, password } });
      return { session: sessionFromView(view), snapshot: view.snapshot || null };
    },
    async refreshSession() {
      const view = await invoke("desktop_auth_refresh");
      return { session: sessionFromView(view), snapshot: view.snapshot || null };
    },
    async signOut() {
      const view = await invoke("desktop_auth_sign_out");
      return { session: sessionFromView(view), snapshot: view.snapshot || null };
    },
    async resetPassword(identifier) {
      await invoke("desktop_auth_reset_password", { request: { identifier } });
      return { ok: true };
    },
  });

  Object.defineProperty(globalThis, "__FOOTBALL_SCIENCE_DESKTOP_AUTH__", {
    configurable: false,
    enumerable: false,
    writable: false,
    value: bridge,
  });
})();
