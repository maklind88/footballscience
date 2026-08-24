const collaborationStatuses = new Set([
  "CLOSED",
  "CHANNEL_ERROR",
  "SUBSCRIBED",
  "TIMED_OUT",
]);

function stringValue(value = "", limit = 180) {
  return String(value || "").trim().slice(0, limit);
}

function safeId(value = "") {
  const id = stringValue(value, 160);
  return /^[a-z0-9][a-z0-9-]{0,159}$/i.test(id) ? id : "";
}

function uniquePresences(state = {}) {
  const byActor = new Map();
  Object.values(state || {}).flat().forEach((presence = {}) => {
    const actorId = safeId(presence.actorId || presence.actor_id || presence.user_id || presence.presence_ref);
    if (!actorId) return;
    byActor.set(actorId, {
      actorId,
      name: stringValue(presence.name || presence.actorName || presence.actor_name || "Analyst", 180),
      joinedAt: stringValue(presence.joinedAt || presence.joined_at || presence.online_at, 80),
      activeTimelineId: safeId(presence.activeTimelineId || presence.active_timeline_id),
    });
  });
  return [...byActor.values()];
}

export function collaborationTopic(sessionId = "") {
  const id = safeId(sessionId);
  return id ? `video-analysis:${id}` : "";
}

export function normalizeCollaborationOperation(value = {}) {
  const operationType = stringValue(value.operationType || value.operation_type, 120);
  const entityType = stringValue(value.entityType || value.entity_type, 80);
  if (!operationType || !entityType) return null;
  return {
    idempotencyKey: stringValue(value.idempotencyKey || value.idempotency_key, 180),
    operationType,
    entityType,
    entityId: safeId(value.entityId || value.entity_id),
    entityIds: [...new Set((value.entityIds || value.entity_ids || []).map(safeId).filter(Boolean))].slice(0, 200),
    revision: Math.max(0, Math.round(Number(value.revision) || 0)),
    actorId: safeId(value.actorId || value.actor_id),
    occurredAt: stringValue(value.occurredAt || value.occurred_at || new Date().toISOString(), 80),
  };
}

export function createCollaborationSessionService(options = {}) {
  const getSupabaseClient = options.getSupabaseClient || (() => null);
  const onOperation = options.onOperation || (() => {});
  const onPresence = options.onPresence || (() => {});
  const onStatus = options.onStatus || (() => {});
  let channel = null;
  let client = null;
  let session = null;
  let actor = null;
  let status = "CLOSED";

  async function disconnect() {
    const activeChannel = channel;
    const activeClient = client;
    channel = null;
    client = null;
    session = null;
    actor = null;
    status = "CLOSED";
    if (!activeChannel) return;
    await activeChannel.untrack?.().catch?.(() => {});
    if (typeof activeClient?.removeChannel === "function") {
      await activeClient.removeChannel(activeChannel);
    } else {
      await activeChannel.unsubscribe?.();
    }
    onPresence([]);
    onStatus("CLOSED");
  }

  async function join(nextSession = {}, nextActor = {}) {
    await disconnect();
    const topic = collaborationTopic(nextSession.id);
    client = getSupabaseClient();
    if (!topic || typeof client?.channel !== "function") {
      status = "CHANNEL_ERROR";
      onStatus(status, new Error("Realtime collaboration is unavailable."));
      return { connected: false, status };
    }
    session = nextSession;
    actor = {
      actorId: safeId(nextActor.id || nextActor.actorId),
      name: stringValue(nextActor.name || nextActor.displayName || "Analyst", 180),
      joinedAt: new Date().toISOString(),
      activeTimelineId: safeId(nextSession.timeline_id || nextSession.timelineId),
    };
    channel = client.channel(topic, {
      config: {
        private: true,
        broadcast: { ack: true, self: false },
        presence: { key: actor.actorId || undefined },
      },
    });
    channel
      .on("broadcast", { event: "operation" }, ({ payload } = {}) => {
        const operation = normalizeCollaborationOperation(payload);
        if (operation) onOperation(operation);
      })
      .on("presence", { event: "sync" }, () => {
        onPresence(uniquePresences(channel?.presenceState?.() || {}));
      })
      .subscribe(async (nextStatus, error) => {
        status = collaborationStatuses.has(nextStatus) ? nextStatus : "CHANNEL_ERROR";
        onStatus(status, error || null);
        if (status === "SUBSCRIBED") await channel?.track?.(actor);
      });
    return { connected: true, status: "CONNECTING", topic };
  }

  async function broadcastOperation(value = {}) {
    const operation = normalizeCollaborationOperation({ ...value, actorId: value.actorId || actor?.actorId });
    if (!operation || status !== "SUBSCRIBED" || !channel?.send) return false;
    const response = await channel.send({ type: "broadcast", event: "operation", payload: operation });
    return response === "ok" || response === true || response?.status === "ok";
  }

  async function updatePresence(values = {}) {
    if (status !== "SUBSCRIBED" || !channel?.track || !actor) return false;
    actor = { ...actor, ...values, actorId: actor.actorId };
    await channel.track(actor);
    return true;
  }

  return {
    broadcastOperation,
    disconnect,
    join,
    updatePresence,
    getSession: () => session,
    getStatus: () => status,
  };
}
