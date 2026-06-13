export function createFootballScienceDbSearchParams(query = {}, URLSearchParamsRef = URLSearchParams) {
  const params = new URLSearchParamsRef();
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim()) {
      params.set(key, String(value));
    }
  });
  return params;
}

async function parseFootballScienceDbResponse(response) {
  const text = typeof response?.text === "function" ? await response.text() : "";
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    return { reason: text.slice(0, 240) };
  }
}

export function createFootballScienceDbApiClient(deps = {}) {
  const apiPath = deps.apiPath || "/api/football-science-db";
  const fetchRef = deps.fetchRef || (typeof fetch === "function" ? fetch : null);
  const getAccessToken = deps.getAccessToken;
  const URLSearchParamsRef = deps.URLSearchParamsRef || URLSearchParams;

  async function fetchApi(query = {}) {
    const params = createFootballScienceDbSearchParams(query, URLSearchParamsRef);
    const queryString = params.toString();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const token = typeof getAccessToken === "function" ? await getAccessToken({ forceRefresh: attempt > 0 }) : "";
      if (!token) {
        return { ok: false, status: 401, reason: "Football Science DB requires an authenticated session." };
      }
      if (typeof fetchRef !== "function") {
        return { ok: false, status: 0, reason: "Football Science DB could not be reached." };
      }
      try {
        const response = await fetchRef(`${apiPath}${queryString ? `?${queryString}` : ""}`, {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const result = await parseFootballScienceDbResponse(response);
        if (response.status === 401 && attempt === 0) {
          continue;
        }
        if (!response.ok || result?.ok === false) {
          return {
            ok: false,
            status: response.status,
            reason: result?.reason || result?.message || `Football Science DB failed (${response.status}).`,
          };
        }
        return { ok: true, status: response.status, result };
      } catch (error) {
        return { ok: false, status: 0, reason: error?.message || "Football Science DB could not be reached." };
      }
    }
    return { ok: false, status: 401, reason: "Football Science DB requires a fresh authenticated session." };
  }

  return {
    fetchApi,
  };
}
