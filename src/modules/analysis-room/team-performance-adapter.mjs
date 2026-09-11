export function createTeamPerformanceAdapter(getContext = () => ({})) {
  return async function request(filters = {}, command = null, signal) {
    const context = getContext();
    const token = await context.getAuthToken?.();
    if (!token) throw new Error("Sign in to view Team Performance.");
    const url = new URL("/api/analysis-room", context.win?.location?.origin || window.location.origin);
    const teamId = context.platformTeamId || context.team?.platformTeamId || "";
    if (teamId) url.searchParams.set("teamId", teamId);
    if (!command) for (const [key, value] of Object.entries(filters)) {
      if (value !== "" && value != null) url.searchParams.set(key, value);
    }
    const response = await fetch(url, {
      method: command ? "POST" : "GET", signal, cache: "no-store",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      ...(command ? { body: JSON.stringify(command) } : {}),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) throw new Error(payload.reason || "Team Performance is unavailable.");
    return payload;
  };
}
