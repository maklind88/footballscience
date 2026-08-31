function assertSnapshot(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Session authority snapshot must be an object.");
  const serialized = JSON.stringify(value).toLowerCase();
  if (serialized.includes("accesstoken") || serialized.includes("refreshtoken")) throw new TypeError("Session authority adapters must not expose credential material.");
  if (!value.actorId || !value.organizationId || !value.partitionKey || !Number.isInteger(value.authEpoch)) {
    throw new TypeError("Session authority snapshot is incomplete.");
  }
  return Object.freeze({ ...value });
}

export class SessionAuthority {
  #adapter;
  #snapshot = null;
  #readInFlight = null;

  constructor({ adapter } = {}) {
    if (!adapter || typeof adapter.readSnapshot !== "function") throw new TypeError("A native session authority adapter is required.");
    this.#adapter = adapter;
  }

  async snapshot({ refresh = false } = {}) {
    if (this.#snapshot && !refresh) return this.#snapshot;
    if (this.#readInFlight) return this.#readInFlight;
    this.#readInFlight = Promise.resolve(this.#adapter.readSnapshot()).then(assertSnapshot).then((snapshot) => {
      this.#snapshot = snapshot;
      return snapshot;
    }).finally(() => { this.#readInFlight = null; });
    return this.#readInFlight;
  }

  async contextProof(frontendBuildId) {
    const snapshot = await this.snapshot();
    if (!snapshot.canReadOffline) throw new Error("Native offline authorization is not valid.");
    return Object.freeze({
      actorId: snapshot.actorId,
      organizationId: snapshot.organizationId,
      partitionKey: snapshot.partitionKey,
      authEpoch: snapshot.authEpoch,
      frontendBuildId: String(frontendBuildId || ""),
    });
  }

  clearLocalView() {
    this.#snapshot = null;
  }
}
