(() => {
  const activeOrigin = location.protocol === "fs-active:" || location.hostname === "fs-active.localhost";
  if (!activeOrigin) return;
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

  const readBody = async (input, init = {}) => {
    let value = init.body;
    if (value == null && input instanceof Request && !["GET", "HEAD"].includes(input.method.toUpperCase())) {
      const contentType = String(input.headers.get("content-type") || "").toLowerCase();
      if (!contentType.startsWith("application/json")) {
        throw new TypeError("This desktop API request body is not supported yet.");
      }
      value = await input.clone().text();
    }
    if (value == null) return "";
    if (typeof value === "string") return value;
    if (value instanceof Blob && String(value.type || "").toLowerCase().startsWith("application/json")) {
      return value.text();
    }
    throw new TypeError("This desktop API request body is not supported yet.");
  };

  const desktopApiFetch = async (input, init = {}) => {
    const inputUrl = input instanceof Request ? input.url : String(input || "");
    const url = new URL(inputUrl, location.href);
    if (url.origin !== location.origin || !url.pathname.startsWith("/api/")) {
      return nativeFetch(input, init);
    }
    const method = String(init.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
    const body = await readBody(input, init);
    const contentType = body ? "application/json" : "";
    const result = await invoke("desktop_api_request", {
      request: {
        path: `${url.pathname}${url.search}`,
        method,
        body,
        contentType,
      },
    });
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
