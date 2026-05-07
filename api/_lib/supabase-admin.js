const DEFAULT_ROLES = ["admin", "coach", "analyst", "performance", "medical", "guest"];
const ROLE_LOOKUP = new Set(DEFAULT_ROLES);
const MIN_PASSWORD_LENGTH = 6;
const GENERATE_PASSWORD_TOKEN = ["true", "1", "yes", "on"];
const MAX_METADATA_FIELD_LENGTH = 120;
const MAX_NAME_LENGTH = 80;
const MAX_USERNAME_LENGTH = 64;
const MAX_PROFILE_IMAGE_LENGTH = 1800;
const MAX_JSON_BODY_BYTES = 256 * 1024;

function getEnvValue(primary, alternatives = []) {
  for (const key of [primary, ...alternatives]) {
    const value = process?.env?.[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function readConfig() {
  const projectRef = getEnvValue("SUPABASE_PROJECT_REF", ["SUPABASE_PROJECT_ID"]);
  const urlByRef = projectRef ? `https://${projectRef}.supabase.co` : "";

  return {
    url: getEnvValue("SUPABASE_URL", ["NEXT_PUBLIC_SUPABASE_URL"]) || urlByRef,
    anonKey: getEnvValue("SUPABASE_ANON_KEY", [
      "SUPABASE_PUBLISHABLE_KEY",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    ]),
    serviceRoleKey: getEnvValue("SUPABASE_SERVICE_ROLE_KEY", [
      "SUPABASE_SECRET_KEY",
      "SUPABASE_SERVICE_ROLE",
    ]),
  };
}

function parseBearer(value) {
  if (!value) {
    return null;
  }

  const raw = String(value).trim();
  return raw.toLowerCase().startsWith("bearer ") ? raw.slice(7).trim() : raw;
}

function normalizeRole(value) {
  const role = String(value || "coach").trim().toLowerCase();
  return ROLE_LOOKUP.has(role) ? role : "coach";
}

function normalizeStatus(value) {
  return String(value || "active").trim().toLowerCase() === "paused" ? "paused" : "active";
}

function normalizeProfileValue(value, maxLength = MAX_METADATA_FIELD_LENGTH) {
  const normalized = String(value || "").trim();
  if (maxLength <= 0) {
    return normalized;
  }
  return normalized.slice(0, maxLength);
}

function normalizeUsername(value, fallback = "user") {
  const normalized = normalizeProfileValue(value, MAX_USERNAME_LENGTH)
    .toLowerCase()
    .replace(/\s+/g, ".")
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/\.{2,}/g, ".")
    .replace(/^\./, "")
    .replace(/\.$/, "");
  return normalized || fallback;
}

function normalizeProfileImageValue(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  if (raw.length > MAX_PROFILE_IMAGE_LENGTH) {
    return "";
  }

  if (raw.startsWith("data:image/")) {
    return raw;
  }

  try {
    const parsed = new URL(raw);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return raw;
    }
  } catch {
    return "";
  }

  return "";
}

function emailHandle(email) {
  return String(email || "")
    .split("@", 1)[0]
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ".");
}

function normalizeProfilePayload(values = {}) {
  const firstName = normalizeProfileValue(values.firstName || values.first_name, MAX_NAME_LENGTH);
  const lastName = normalizeProfileValue(values.lastName || values.last_name, MAX_NAME_LENGTH);
  const explicitUsername = normalizeProfileValue(values.username, MAX_USERNAME_LENGTH);
  const fallbackUsername = normalizeUsername(`${firstName || "new"}.${lastName || "user"}`, "new.user");

  return {
    firstName: firstName || "New",
    lastName: lastName || "User",
    username: normalizeUsername(explicitUsername || fallbackUsername, fallbackUsername),
    role: normalizeRole(values.role),
    title: normalizeProfileValue(values.title || "Coach", MAX_METADATA_FIELD_LENGTH),
    department: normalizeProfileValue(values.department || "Football", MAX_METADATA_FIELD_LENGTH),
    team: normalizeProfileValue(values.team || "North Carolina Courage", MAX_METADATA_FIELD_LENGTH),
    status: normalizeStatus(values.status),
    profileImageUrl: normalizeProfileImageValue(values.profileImageUrl || values.profile_image_url),
  };
}

function normalizePlatformUser(user) {
  const metadata = user?.user_metadata ?? {};
  const appMetadata = user?.app_metadata ?? {};

  return {
    id: String(user?.id || ""),
    email: String(user?.email || "").toLowerCase(),
    username: normalizeUsername(metadata?.username || metadata?.user_name || emailHandle(user?.email || ""), "user"),
    firstName: normalizeProfileValue(metadata?.firstName || metadata?.first_name || "New", MAX_NAME_LENGTH),
    lastName: normalizeProfileValue(metadata?.lastName || metadata?.last_name || "User", MAX_NAME_LENGTH),
    role: normalizeRole(appMetadata?.role || "coach"),
    title: normalizeProfileValue(metadata?.title || "Coach", MAX_METADATA_FIELD_LENGTH),
    department: normalizeProfileValue(metadata?.department || "Football", MAX_METADATA_FIELD_LENGTH),
    team: normalizeProfileValue(metadata?.team || "North Carolina Courage", MAX_METADATA_FIELD_LENGTH),
    status: normalizeStatus(appMetadata?.status),
    profileImageUrl: normalizeProfileImageValue(
      metadata?.profileImageUrl || metadata?.profile_image_url || metadata?.avatarUrl || metadata?.avatar_url
    ),
    createdAt: user?.created_at || new Date().toISOString(),
    updatedAt: user?.updated_at || "",
    lastSignInAt: user?.last_sign_in_at || "",
  };
}

function parseResponseJson(response) {
  if (!response || response.status === 204) {
    return {};
  }

  return response.text().then((text) => {
    if (!text) {
      return {};
    }

    try {
      return JSON.parse(text);
    } catch {
      return { message: text };
    }
  });
}

function buildHeaders(apiKey) {
  return {
    apikey: apiKey,
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

async function callSupabase(path, method, body, token) {
  const { url, serviceRoleKey } = readConfig();
  if (!url || !serviceRoleKey) {
    return {
      ok: false,
      status: 500,
      error: { message: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment." },
    };
  }

  const response = await fetch(`${url}/auth/v1${path}`, {
    method,
    headers: buildHeaders(token || serviceRoleKey),
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await parseResponseJson(response);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: {
        message:
          payload?.error_description || payload?.error?.message || payload?.msg || payload?.message || `Request failed (${response.status})`,
        payload,
      },
    };
  }

  return {
    ok: true,
    status: response.status,
    data: payload,
  };
}

async function getCurrentActor(authHeader) {
  const token = parseBearer(authHeader);
  if (!token) {
    return null;
  }

  const { url, anonKey } = readConfig();
  if (!url || !anonKey) {
    return null;
  }

  const response = await fetch(`${url}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    return null;
  }

  const payload = await parseResponseJson(response);
  const user = payload?.user || payload?.data?.user || payload;
  if (!user?.id) {
    return null;
  }

  const freshUser = await getRawAuthUserById(user.id);
  return normalizePlatformUser(freshUser || user);
}

async function listAllAuthUsers(perPage = 200) {
  const { url, serviceRoleKey } = readConfig();
  if (!url || !serviceRoleKey) {
    return [];
  }

  const users = [];
  const limit = Math.max(1, Math.min(500, Number(perPage) || 200));
  let page = 1;

  while (page <= 20) {
    const listUrl = new URL(`${url}/auth/v1/admin/users`);
    listUrl.searchParams.set("page", String(page));
    listUrl.searchParams.set("per_page", String(limit));

    const response = await fetch(listUrl.toString(), {
      method: "GET",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    });

    if (!response.ok) {
      break;
    }

    const payload = await parseResponseJson(response);
    const chunk = Array.isArray(payload?.users) ? payload.users : Array.isArray(payload) ? payload : [];
    users.push(...chunk.map((entry) => normalizePlatformUser(entry)));

    if (chunk.length < limit) {
      break;
    }

    page += 1;
  }

  return users;
}

async function findAuthUserByIdentifier(identifier) {
  const target = normalizeProfileValue(identifier).toLowerCase();
  if (!target) {
    return null;
  }

  const users = await listAllAuthUsers();
  return users.find((user) => user.username.toLowerCase() === target || user.email.toLowerCase() === target) || null;
}

async function getAuthUserById(id) {
  const user = await getRawAuthUserById(id);
  return user ? normalizePlatformUser(user) : null;
}

async function getRawAuthUserById(id) {
  const result = await callSupabase(`/admin/users/${encodeURIComponent(id)}`, "GET");
  if (!result.ok) {
    return null;
  }

  return result.data?.user || result.data || null;
}

function randomPassword(length = 14) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint8Array(length);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  return Array.from(bytes)
    .map((value) => alphabet[value % alphabet.length])
    .join("");
}

async function createAuthUser(values = {}) {
  const metadata = normalizeProfilePayload(values);
  const email = normalizeProfileValue(values.email).toLowerCase();
  const providedPassword = normalizeProfileValue(values.password);
  const generatedPassword = providedPassword || randomPassword();

  if (!email || !metadata.username || !metadata.firstName || !metadata.lastName) {
    return { ok: false, status: 400, reason: "Missing required user fields." };
  }

  if (providedPassword && providedPassword.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      status: 400,
      reason: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }

  const result = await callSupabase("/admin/users", "POST", {
    email,
    password: generatedPassword,
    email_confirm: true,
    user_metadata: metadata,
    app_metadata: {
      role: metadata.role,
      status: metadata.status,
    },
  });

  if (!result.ok) {
    return { ok: false, status: result.status, reason: result.error?.message || "User could not be created." };
  }

  const user = result.data?.user || result.data;
  return {
    ok: true,
    user: normalizePlatformUser(user),
    generatedPassword,
  };
}

async function updateAuthUser(id, values = {}) {
  const rawCurrentUser = await getRawAuthUserById(id);
  const currentUser = rawCurrentUser ? normalizePlatformUser(rawCurrentUser) : null;
  const metadataSource = currentUser && typeof currentUser === "object"
    ? {
        firstName: currentUser.firstName || "",
        lastName: currentUser.lastName || "",
        username: currentUser.username || "",
        role: currentUser.role || "",
        title: currentUser.title || "",
        department: currentUser.department || "",
        team: currentUser.team || "",
        status: currentUser.status || "",
        profileImageUrl: currentUser.profileImageUrl || "",
      }
    : {};
  const appMetadataSource =
    rawCurrentUser?.app_metadata && typeof rawCurrentUser.app_metadata === "object"
      ? rawCurrentUser.app_metadata
      : {};

  const nextValues = {
    ...metadataSource,
    ...values,
  };

  const metadata = normalizeProfilePayload(nextValues);
  const payload = {
    user_metadata: metadata,
    app_metadata: {
      ...appMetadataSource,
      role: metadata.role,
      status: metadata.status,
    },
  };

  const email = normalizeProfileValue(values.email);
  if (email) {
    payload.email = email.toLowerCase();
  }

  const password = normalizeProfileValue(values.password);
  const generatePassword =
    values?.generatePassword === true ||
    GENERATE_PASSWORD_TOKEN.includes(String(values.generatePassword || "").trim().toLowerCase());
  let generatedPassword = "";

  if (password && password.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      status: 400,
      reason: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }

  if (!password && generatePassword) {
    generatedPassword = randomPassword();
  }

  if (password) {
    payload.password = password;
  } else if (generatePassword && generatedPassword) {
    payload.password = generatedPassword;
  }

  if (payload.password || payload.email) {
    payload.email_confirm = true;
  }

  const result = await callSupabase(`/admin/users/${encodeURIComponent(id)}`, "PUT", payload);
  if (!result.ok) {
    return { ok: false, status: result.status, reason: result.error?.message || "User could not be updated." };
  }

  const user = result.data?.user || result.data;
  return {
    ok: true,
    user: normalizePlatformUser(user),
    generatedPassword: generatedPassword || null,
  };
}

async function removeAuthUser(id) {
  const result = await callSupabase(`/admin/users/${encodeURIComponent(id)}`, "DELETE");
  if (!result.ok) {
    return { ok: false, status: result.status, reason: result.error?.message || "User could not be removed." };
  }

  return { ok: true };
}

async function sendPasswordReset(email, redirectTo) {
  const { url, anonKey } = readConfig();
  if (!url || !anonKey) {
    return { ok: false, status: 500, reason: "Missing SUPABASE_URL or SUPABASE_ANON_KEY." };
  }

  const response = await fetch(`${url}/auth/v1/recover`, {
    method: "POST",
    headers: buildHeaders(anonKey),
    body: JSON.stringify({
      email,
      type: "recovery",
      redirect_to: redirectTo,
    }),
  });

  const payload = await parseResponseJson(response);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      reason: payload?.error_description || payload?.message || "Recovery email could not be sent.",
    };
  }

  return { ok: true };
}

function sendCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function sendJson(res, status, payload) {
  sendCorsHeaders(res);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

async function parseJsonBody(req) {
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > MAX_JSON_BODY_BYTES) {
      const error = new Error("Request body is too large.");
      error.code = "BODY_TOO_LARGE";
      throw error;
    }
    chunks.push(buffer);
  }

  if (!chunks.length) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
}

module.exports = {
  DEFAULT_ROLES,
  readConfig,
  parseBearer,
  getCurrentActor,
  listAllAuthUsers,
  findAuthUserByIdentifier,
  getAuthUserById,
  normalizeProfilePayload,
  normalizePlatformUser,
  normalizeRole,
  createAuthUser,
  updateAuthUser,
  removeAuthUser,
  sendPasswordReset,
  sendCorsHeaders,
  sendJson,
  parseJsonBody,
};
