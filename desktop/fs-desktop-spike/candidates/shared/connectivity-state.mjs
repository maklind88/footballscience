const allowedTransitions = Object.freeze({
  "starting": new Set(["offline-cold-start", "online-checking", "auth-required", "compatibility-blocked"]),
  "offline-cold-start": new Set(["offline-ready", "online-checking", "auth-required"]),
  "offline-ready": new Set(["online-checking", "auth-required", "compatibility-blocked"]),
  "online-checking": new Set(["syncing", "online-ready", "degraded", "offline-ready", "auth-required", "compatibility-blocked"]),
  "syncing": new Set(["online-ready", "degraded", "offline-ready", "auth-required", "compatibility-blocked"]),
  "online-ready": new Set(["online-checking", "syncing", "degraded", "offline-ready", "auth-required", "compatibility-blocked"]),
  "degraded": new Set(["online-checking", "syncing", "offline-ready", "auth-required", "compatibility-blocked"]),
  "auth-required": new Set(["online-checking", "offline-ready"]),
  "compatibility-blocked": new Set(["online-checking", "offline-ready"]),
});

const signalKeys = Object.freeze([
  "osNetwork",
  "frontendSource",
  "fsApi",
  "supabaseAuth",
  "authenticatedSession",
  "synchronization",
]);

function boundedSignal(value, key) {
  const normalized = String(value || "unknown").trim();
  if (!normalized || normalized.length > 80) throw new TypeError(`Invalid connectivity signal ${key}.`);
  return normalized;
}

const compatibilityFailure = /compatib|unsupported|manifest|integrity|signature|signing key|verification key|pinned key|rollback|asset|declared boundary|content type|origin changed|immutable shell|signed shell/i;
const transportFailure = /shell source unavailable|shell source returned|connection refused|error sending request|tcp connect|timed? out/i;

export function classifyShellUpdateFailure(error) {
  const message = String(error?.message || error);
  if (transportFailure.test(message)) return "offline";
  return compatibilityFailure.test(message) ? "compatibility-blocked" : "offline";
}

export class ConnectivityState {
  #state = "starting";
  #history = [];
  #signals = Object.fromEntries(signalKeys.map((key) => [key, "unknown"]));

  observe(values, reason = "diagnostic observation") {
    if (!values || typeof values !== "object" || Array.isArray(values)) throw new TypeError("Connectivity observations must be an object.");
    for (const [key, value] of Object.entries(values)) {
      if (!signalKeys.includes(key)) throw new TypeError(`Unknown connectivity signal ${key}.`);
      this.#signals[key] = boundedSignal(value, key);
    }
    this.#history.push(Object.freeze({
      from: this.#state,
      to: this.#state,
      reason: String(reason || "diagnostic observation").slice(0, 160),
      signals: Object.freeze({ ...this.#signals }),
    }));
    return this.snapshot();
  }

  transition(next, reason) {
    if (!allowedTransitions[this.#state]?.has(next)) throw new Error(`Invalid connectivity transition ${this.#state} -> ${next}.`);
    const entry = Object.freeze({ from: this.#state, to: next, reason: String(reason || "unspecified").slice(0, 160) });
    this.#history.push(entry);
    this.#state = next;
    return this.snapshot();
  }

  snapshot() {
    return Object.freeze({
      state: this.#state,
      signals: Object.freeze({ ...this.#signals }),
      history: Object.freeze([...this.#history]),
    });
  }
}
