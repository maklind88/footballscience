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

  return { read: request, save: (week, records) => request(week, records) };
}
