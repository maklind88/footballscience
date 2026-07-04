async function parseJson(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { reason: text };
  }
}

export function createIdpApiService(context = {}) {
  const getAuthToken = typeof context.getAuthToken === "function" ? context.getAuthToken : () => "";

  async function request(path = "/api/idp", options = {}) {
    const token = await getAuthToken();
    const headers = {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    };
    const response = await fetch(path, {
      method: options.method || "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const payload = await parseJson(response);
    if (!response.ok) {
      const error = new Error(payload?.reason || `IDP request failed (${response.status}).`);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload || {};
  }

  return {
    loadDashboard: () => request("/api/idp?action=dashboard"),
    loadPlayer: (playerId) => request(`/api/idp?action=player&playerId=${encodeURIComponent(playerId)}`),
    loadSync: (playerId = "") =>
      request(`/api/idp?action=sync${playerId ? `&playerId=${encodeURIComponent(playerId)}` : ""}`),
    createFocus: (focus) => request("/api/idp", { method: "POST", body: { action: "create-focus", focus } }),
    updateFocus: (focus) => request("/api/idp", { method: "POST", body: { action: "update-focus", focus } }),
    archiveFocus: (focus) => request("/api/idp", { method: "POST", body: { action: "archive-focus", focus } }),
    deleteFocus: (focus) => request("/api/idp", { method: "POST", body: { action: "delete-focus", focus } }),
    reviewClipBank: (clipBankItem) => request("/api/idp", { method: "POST", body: { action: "review-clip-bank", clipBankItem } }),
    removeClipBankItem: (clipBankItem) => request("/api/idp", { method: "POST", body: { action: "remove-clip-bank-item", clipBankItem } }),
    addEvidence: (evidence) => request("/api/idp", { method: "POST", body: { action: "add-evidence", evidence } }),
    updateEvidence: (evidence) => request("/api/idp", { method: "POST", body: { action: "update-evidence", evidence } }),
    deleteEvidence: (evidence) => request("/api/idp", { method: "POST", body: { action: "delete-evidence", evidence } }),
    createGoal: (goal) => request("/api/idp", { method: "POST", body: { action: "create-goal", goal } }),
    updateGoal: (goal) => request("/api/idp", { method: "POST", body: { action: "update-goal", goal } }),
    archiveGoal: (goal) => request("/api/idp", { method: "POST", body: { action: "archive-goal", goal } }),
    addGoalCheckin: (checkin) => request("/api/idp", { method: "POST", body: { action: "add-goal-checkin", checkin } }),
    createIntervention: (intervention) => request("/api/idp", { method: "POST", body: { action: "create-intervention", intervention } }),
    updateIntervention: (intervention) => request("/api/idp", { method: "POST", body: { action: "update-intervention", intervention } }),
    archiveIntervention: (intervention) => request("/api/idp", { method: "POST", body: { action: "archive-intervention", intervention } }),
    assignOwner: (ownership) => request("/api/idp", { method: "POST", body: { action: "assign-owner", ownership } }),
    completeReview: (review) => request("/api/idp", { method: "POST", body: { action: "complete-review", review } }),
    videoPlayerTagged: (clip) => request("/api/idp", { method: "POST", body: { action: "video-player-tagged", clip } }),
  };
}
