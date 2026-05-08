export const chatApiEndpoint = "/api/chat";
export const chatApiSchema = "footballscience-chat-api-v1";

async function resolveAuthToken(authTokenProvider) {
  if (!authTokenProvider) {
    return "";
  }

  if (typeof authTokenProvider === "function") {
    return String((await authTokenProvider()) || "").trim();
  }

  return String(authTokenProvider || "").trim();
}

function resolveFetch(fetchImpl) {
  if (typeof fetchImpl === "function") {
    return fetchImpl;
  }

  if (typeof globalThis.fetch === "function") {
    return globalThis.fetch.bind(globalThis);
  }

  throw new Error("Chat API client requires fetch.");
}

function buildHeaders(token) {
  const headers = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

async function parseChatApiResponse(response) {
  const text = await response.text();
  let payload = {};

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { reason: text };
    }
  }

  if (!response.ok || payload?.ok === false) {
    const reason = payload?.reason || payload?.message || `Chat API request failed (${response.status}).`;
    const error = new Error(reason);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

export function createChatApiClient(options = {}) {
  const endpoint = options.endpoint || chatApiEndpoint;
  const fetchImpl = resolveFetch(options.fetchImpl);
  const authTokenProvider = options.authTokenProvider || options.getAuthToken || "";

  async function request(method, body, query = null) {
    const token = await resolveAuthToken(authTokenProvider);
    const url = query ? `${endpoint}?${new URLSearchParams(query).toString()}` : endpoint;
    const response = await fetchImpl(url, {
      method,
      headers: buildHeaders(token),
      body: body ? JSON.stringify(body) : undefined,
    });

    return parseChatApiResponse(response);
  }

  function action(payload = {}) {
    return request("POST", payload);
  }

    return {
    endpoint,
    load(query = {}) {
      return request("GET", null, query);
    },
    action,
    createThread(payload = {}) {
      return action({ ...payload, action: "createThread" });
    },
    sendMessage(payload = {}) {
      return action({ ...payload, action: "sendMessage" });
    },
    editMessage(payload = {}) {
      return action({ ...payload, action: "editMessage" });
    },
    deleteMessage(payload = {}) {
      return action({ ...payload, action: "deleteMessage" });
    },
    setMessagePinned(payload = {}) {
      return action({ ...payload, action: "setMessagePinned" });
    },
    setMessagePriority(payload = {}) {
      return action({ ...payload, action: "setMessagePriority" });
    },
    addReaction(payload = {}) {
      return action({ ...payload, action: "addReaction" });
    },
    removeReaction(payload = {}) {
      return action({ ...payload, action: "removeReaction" });
    },
    markThreadRead(payload = {}) {
      return action({ ...payload, action: "markThreadRead" });
    },
    clearThread(payload = {}) {
      return action({ ...payload, action: "clearThread" });
    },
    createAttachmentIntent(payload = {}) {
      return action({ ...payload, action: "createAttachmentIntent" });
    },
  };
}
