// No retries, automatic upload, destructive discard, or frontend-supplied snapshot.
export class ConflictReviewController {
  #bridge; #context = null; #review = null; #receipt = null; #busy = false; #generation = 0; #message = "";
  constructor(bridge) { this.#bridge = bridge; }
  snapshot() { return Object.freeze({ review: this.#review, receipt: this.#receipt, busy: this.#busy, message: this.#message }); }
  cancel() {
    this.#generation += 1;
    this.#context = null; this.#review = null; this.#receipt = null;
    this.#message = "Local work is unchanged. Synchronization remains paused at the conflict.";
    return this.snapshot();
  }
  async #currentContext() {
    const authority = await this.#bridge.getSessionAuthority();
    const bootstrap = await this.#bridge.getBootstrapStatus();
    if (!authority?.canReadOffline || !authority.canSync || !bootstrap?.activeBuildId) throw new Error("Access unavailable.");
    return { actorId: authority.actorId, organizationId: authority.organizationId, partitionKey: authority.partitionKey,
      authEpoch: authority.authEpoch, frontendBuildId: bootstrap.activeBuildId };
  }
  async guard() {
    if (!this.#context) return true;
    try {
      if (JSON.stringify(await this.#currentContext()) === JSON.stringify(this.#context)) return true;
    } catch { /* Hidden on expiry, sign-out or unknown authority. */ }
    this.cancel();
    this.#message = "Access or application version changed. Reopen the review with the correct account.";
    return false;
  }
  async review() {
    if (this.#busy) return this.snapshot();
    const generation = ++this.#generation;
    this.#busy = true; this.#review = null; this.#receipt = null; this.#message = "Loading the current server version…";
    try {
      const context = await this.#currentContext();
      const review = await this.#bridge.reviewSessionConflict(context);
      if (generation !== this.#generation) return this.snapshot();
      this.#context = context;
      if (!await this.guard() || generation !== this.#generation) return this.snapshot();
      this.#review = review;
      this.#message = "Compare every queued edit. Original before-values are not available; this is not an automatic merge.";
    } catch {
      if (generation === this.#generation) this.#message = "Review unavailable. Reconnect and check access. Unsupported server changes need separate review. Local work is preserved.";
    } finally { this.#busy = false; }
    return this.snapshot();
  }
  async recover(confirmed = false) {
    if (this.#busy || !confirmed || !this.#review || !this.#context) return this.snapshot();
    this.#busy = true;
    const generation = this.#generation;
    const review = this.#review;
    try {
      if (!await this.guard() || generation !== this.#generation) return this.snapshot();
      const receipt = await this.#bridge.recoverSessionConflict(this.#context, review.reviewToken);
      if (generation !== this.#generation || !await this.guard()) return this.snapshot();
      this.#review = null; this.#receipt = receipt;
      this.#message = `${receipt.requeuedOperationCount} ${receipt.requeuedOperationCount === 1 ? "edit" : "edits"} recovered locally. Nothing was uploaded. Original work is retained in local checkpoint ${receipt.recoveryId}.`;
    } catch {
      if (generation === this.#generation) {
        this.#review = null;
        this.#message = "Recovery was not confirmed. Local work is preserved. Refresh the review before trying again; the server, local edits or access may have changed.";
      }
    } finally { this.#busy = false; }
    return this.snapshot();
  }
}
