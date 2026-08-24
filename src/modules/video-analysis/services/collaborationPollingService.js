function stringValue(value = "", limit = 180) {
  return String(value || "").trim().slice(0, limit);
}

function clientId() {
  const randomId = globalThis.crypto?.randomUUID?.()
    || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `fs-player-${randomId}`.slice(0, 160);
}

function normalizeParticipant(value = {}) {
  return {
    id: stringValue(value.id, 160),
    actorId: stringValue(value.actorId || value.actor_id, 160),
    name: stringValue(value.actorName || value.actor_name || "Analyst", 180),
    lastSeenAt: stringValue(value.lastSeenAt || value.last_seen_at, 80),
  };
}

function normalizeOperation(value = {}) {
  return {
    id: stringValue(value.id, 160),
    operationType: stringValue(value.operationType || value.operation_type, 120),
    entityType: stringValue(value.entityType || value.entity_type, 80),
    entityId: stringValue(value.entityId || value.entity_id, 160),
    actorId: stringValue(value.actorId || value.actor_id, 160),
    revision: Math.max(0, Math.round(Number(value.resultingRevision || value.resulting_revision) || 0)),
    occurredAt: stringValue(value.createdAt || value.created_at || value.appliedAt || value.applied_at, 80),
  };
}

export function createCollaborationPollingService(options = {}) {
  const repository = options.repository || {};
  const getActor = options.getActor || (() => ({}));
  const onOperation = options.onOperation || (() => {});
  const onPresence = options.onPresence || (() => {});
  const onStatus = options.onStatus || (() => {});
  const timerHost = options.timerHost || globalThis;
  const pollIntervalMs = Math.max(750, Number(options.pollIntervalMs) || 1200);
  const heartbeatIntervalMs = Math.max(5000, Number(options.heartbeatIntervalMs) || 10_000);
  const browserClientId = clientId();
  const seenOperationIds = new Set();
  let session = null;
  let cursor = "";
  let timer = 0;
  let polling = false;
  let lastHeartbeatAt = 0;

  function actorPayload() {
    const actor = getActor() || {};
    return {
      actorName: stringValue(actor.name || actor.displayName || "Analyst", 180),
      clientId: browserClientId,
    };
  }

  async function heartbeat(force = false) {
    if (!session?.id || typeof repository.joinCollaborationSession !== "function") return false;
    if (!force && Date.now() - lastHeartbeatAt < heartbeatIntervalMs) return true;
    await repository.joinCollaborationSession({
      sessionId: session.id,
      ...actorPayload(),
    });
    lastHeartbeatAt = Date.now();
    return true;
  }

  async function poll() {
    if (polling || !session?.id || typeof repository.collaborationState !== "function") return;
    polling = true;
    try {
      await heartbeat();
      const payload = await repository.collaborationState(session.id, cursor, 200);
      const actorId = stringValue(getActor()?.id, 160);
      const operations = (payload.operations || []).map(normalizeOperation).filter((operation) => operation.id);
      for (const operation of operations) {
        if (seenOperationIds.has(operation.id)) continue;
        seenOperationIds.add(operation.id);
        if (operation.actorId !== actorId) onOperation(operation);
      }
      if (seenOperationIds.size > 2000) {
        const retained = [...seenOperationIds].slice(-1000);
        seenOperationIds.clear();
        retained.forEach((id) => seenOperationIds.add(id));
      }
      cursor = payload.nextCursor || cursor;
      onPresence((payload.participants || []).map(normalizeParticipant));
      onStatus("connected");
    } catch (error) {
      onStatus("error", error);
    } finally {
      polling = false;
    }
  }

  async function join(nextSession = {}) {
    await disconnect();
    if (!nextSession?.id) throw new Error("A collaboration session is required.");
    session = nextSession;
    cursor = new Date(Date.now() - 2000).toISOString();
    onStatus("connecting");
    await heartbeat(true);
    await poll();
    timer = timerHost.setInterval?.(poll, pollIntervalMs) || 0;
    return session;
  }

  async function disconnect() {
    if (timer) timerHost.clearInterval?.(timer);
    timer = 0;
    const previousSession = session;
    session = null;
    cursor = "";
    seenOperationIds.clear();
    if (previousSession?.id && typeof repository.leaveCollaborationSession === "function") {
      await repository.leaveCollaborationSession({
        sessionId: previousSession.id,
        clientId: browserClientId,
      }).catch(() => {});
    }
    onPresence([]);
    onStatus("disconnected");
  }

  return {
    disconnect,
    join,
    poll,
    getClientId: () => browserClientId,
    getSession: () => session,
  };
}
