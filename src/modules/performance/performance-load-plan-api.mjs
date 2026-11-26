export function createLoadPlanApi(getAuthToken, fetchImpl = globalThis.fetch) {
  async function request(week, records) {
    const token = await getAuthToken();
    if (!token) throw new Error("Sign in to open saved load plans.");
    const write = records !== undefined;
    const url = write ? "/api/performance-load-plan" : `/api/performance-load-plan?week=${encodeURIComponent(week)}`;
    const response = await fetchImpl(url, {
      method: write ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(write ? { "Content-Type": "application/json" } : {}),
      },
      body: write ? JSON.stringify({ week, records }) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok || data.week !== week || !Array.isArray(data.records)) {
      const error = new Error(data?.reason ?? "Saved load plans are unavailable. Try again.");
      error.status = response.status;
      throw error;
    }
    return data;
  }

  async function readGpsHistory(week, signal) {
    const token = await getAuthToken();
    if (!token) throw new Error("Sign in to open GPS history.");
    const response = await fetchImpl(`/api/performance-load-plan?view=gps-history&week=${encodeURIComponent(week)}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok || data.week !== week || !Array.isArray(data.history?.rows)) {
      throw new Error("GPS history is unavailable. Try again.");
    }
    return data.history;
  }

  async function requestCheckins(week, playerId, body, signal) {
    const token = await getAuthToken();
    if (!token) throw new Error("Sign in to open player check-ins.");
    const params = new URLSearchParams({ view: "checkins", week });
    if (playerId) params.set("player", playerId);
    const response = await fetchImpl(`/api/performance-load-plan?${params}`, {
      method: body ? "POST" : "GET",
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify({ ...body, week }) : undefined,
      cache: "no-store",
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok || data.week !== week || (body ? (body.action === "open-rpe" ? !Array.isArray(data.opened) : typeof data.linked !== "boolean")
      : !["players", "activities", "wellness", "rpe", "linkedPlayerIds"].every((key) => Array.isArray(data[key])))) {
      throw new Error(data?.reason ?? "Player check-ins are temporarily unavailable.");
    }
    return data;
  }

  return {
    read: request, save: (week, records) => request(week, records), readGpsHistory,
    readCheckins: (week, playerId, signal) => requestCheckins(week, playerId, null, signal),
    openRpe: (week, activityId, playerIds) => requestCheckins(week, "", { action: "open-rpe", activityId, playerIds }),
    manageAccount: (week, playerId, email) => requestCheckins(week, "", {
      action: email === null ? "unlink-account" : "link-account", playerId, email,
    }),
  };
}
