function requireSession(session) {
  if (!session || typeof session !== "object" || Array.isArray(session)) {
    throw new TypeError("Session must be an object.");
  }
  const accessToken = String(session.accessToken || "");
  const refreshToken = String(session.refreshToken || "");
  const expiresAt = Number(session.expiresAt || 0);
  if (!accessToken || !refreshToken || !Number.isFinite(expiresAt) || expiresAt <= 0) {
    throw new TypeError("Session requires accessToken, refreshToken and expiresAt.");
  }
  return { accessToken, refreshToken, expiresAt };
}

export class SessionAuthority {
  #session = null;
  #refresh = null;
  #refreshInFlight = null;
  #now;

  constructor({ refresh, now = () => Date.now() } = {}) {
    if (typeof refresh !== "function") throw new TypeError("A refresh function is required.");
    this.#refresh = refresh;
    this.#now = now;
  }

  replaceSession(session) {
    this.#session = requireSession(session);
  }

  clear() {
    this.#session = null;
  }

  hasOfflineSession() {
    return Boolean(this.#session?.accessToken && this.#session?.refreshToken);
  }

  async getAccessToken({ minimumValidityMs = 60_000 } = {}) {
    if (!this.#session) return null;
    if (this.#session.expiresAt - this.#now() > minimumValidityMs) {
      return this.#session.accessToken;
    }
    return this.refreshAccessToken();
  }

  async refreshAccessToken() {
    if (!this.#session) return null;
    if (this.#refreshInFlight) return this.#refreshInFlight;
    this.#refreshInFlight = (async () => {
      const currentRefreshToken = this.#session?.refreshToken;
      if (!currentRefreshToken) return null;
      const refreshed = requireSession(await this.#refresh({ refreshToken: currentRefreshToken }));
      this.#session = refreshed;
      return refreshed.accessToken;
    })().finally(() => {
      this.#refreshInFlight = null;
    });
    return this.#refreshInFlight;
  }

  accessTokenSnapshot() {
    if (!this.#session) return null;
    return Object.freeze({
      accessToken: this.#session.accessToken,
      expiresAt: this.#session.expiresAt,
    });
  }
}
