const {
  readConfig,
  getCurrentActor,
  getAuthUserById,
  updateAuthUser,
  sendCorsHeaders,
  sendJson,
} = require("./_lib/supabase-admin.js");
const { appendAuditLog } = require("./_lib/audit-log.js");
const { guardApiRequest } = require("./_lib/platform-security.js");

const PROFILE_IMAGE_BUCKET = "footballscience-profile-images";
const MAX_JSON_BODY_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_BYTES = 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/jpg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

function normalizeBodyString(value, maxLength = 160) {
  return String(value || "").trim().slice(0, maxLength);
}

async function parseJsonBody(req) {
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > MAX_JSON_BODY_BYTES) {
      const error = new Error("Profile image request is too large.");
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

function parseDataUrl(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,([a-z0-9+/=\s]+)$/i);
  if (!match) {
    return { ok: false, reason: "Choose a JPEG, PNG or WebP image." };
  }

  const contentType = match[1].toLowerCase() === "image/jpg" ? "image/jpeg" : match[1].toLowerCase();
  const extension = SUPPORTED_IMAGE_TYPES.get(contentType);
  if (!extension) {
    return { ok: false, reason: "Choose a JPEG, PNG or WebP image." };
  }

  const base64 = match[2].replace(/\s+/g, "");
  const buffer = Buffer.from(base64, "base64");
  if (!buffer.length) {
    return { ok: false, reason: "The image could not be read." };
  }

  if (buffer.length > MAX_IMAGE_BYTES) {
    return { ok: false, reason: "Choose an image under 1 MB." };
  }

  return {
    ok: true,
    buffer,
    contentType,
    extension,
  };
}

async function parseStorageResponse(response) {
  if (!response || response.status === 204) {
    return {};
  }

  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 500) };
  }
}

async function storageRequest(path, options = {}) {
  const { url, serviceRoleKey } = readConfig();
  if (!url || !serviceRoleKey) {
    return {
      ok: false,
      status: 500,
      payload: { message: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment." },
    };
  }

  const headers = new Headers(options.headers || {});
  headers.set("apikey", serviceRoleKey);
  headers.set("Authorization", `Bearer ${serviceRoleKey}`);

  const response = await fetch(`${url}/storage/v1${path}`, {
    ...options,
    headers,
  });
  const payload = await parseStorageResponse(response);
  return {
    ok: response.ok,
    status: response.status,
    payload,
  };
}

async function ensureProfileImageBucket() {
  const existing = await storageRequest(`/bucket/${encodeURIComponent(PROFILE_IMAGE_BUCKET)}`, {
    method: "GET",
  });

  if (existing.ok) {
    if (existing.payload?.public === false) {
      const updated = await storageRequest(`/bucket/${encodeURIComponent(PROFILE_IMAGE_BUCKET)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          public: true,
          file_size_limit: MAX_IMAGE_BYTES,
          allowed_mime_types: Array.from(SUPPORTED_IMAGE_TYPES.keys()).filter((type) => type !== "image/jpg"),
        }),
      });
      if (!updated.ok) {
        return {
          ok: false,
          reason: updated.payload?.message || "Profile image bucket is private and could not be updated.",
        };
      }
    }
    return { ok: true };
  }

  if (existing.status !== 404) {
    return {
      ok: false,
      reason: existing.payload?.message || "Profile image storage is not available.",
    };
  }

  const created = await storageRequest("/bucket", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: PROFILE_IMAGE_BUCKET,
      name: PROFILE_IMAGE_BUCKET,
      public: true,
      file_size_limit: MAX_IMAGE_BYTES,
      allowed_mime_types: Array.from(SUPPORTED_IMAGE_TYPES.keys()).filter((type) => type !== "image/jpg"),
    }),
  });

  return created.ok || created.status === 409
    ? { ok: true }
    : { ok: false, reason: created.payload?.message || "Profile image storage could not be created." };
}

function buildObjectPath(userId, extension) {
  const safeUserId = normalizeBodyString(userId, 120).replace(/[^a-z0-9_-]/gi, "-") || "user";
  const randomPart = Math.random().toString(36).slice(2, 8);
  return `users/${safeUserId}/avatar-${Date.now()}-${randomPart}.${extension}`;
}

function getPublicImageUrl(objectPath) {
  const { url } = readConfig();
  return `${url}/storage/v1/object/public/${PROFILE_IMAGE_BUCKET}/${objectPath}?v=${Date.now()}`;
}

async function uploadProfileImageObject(targetId, image) {
  const objectPath = buildObjectPath(targetId, image.extension);
  const upload = await storageRequest(
    `/object/${encodeURIComponent(PROFILE_IMAGE_BUCKET)}/${objectPath}`,
    {
      method: "POST",
      headers: {
        "Content-Type": image.contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
        "x-upsert": "true",
      },
      body: image.buffer,
    }
  );

  if (!upload.ok) {
    return {
      ok: false,
      reason: upload.payload?.message || "Profile image could not be uploaded.",
    };
  }

  return {
    ok: true,
    objectPath,
    publicUrl: getPublicImageUrl(objectPath),
  };
}

function getOwnedObjectPathFromPublicUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  try {
    const { url } = readConfig();
    const projectUrl = new URL(url);
    const parsed = new URL(raw);
    const prefix = `/storage/v1/object/public/${PROFILE_IMAGE_BUCKET}/`;
    if (parsed.origin !== projectUrl.origin || !parsed.pathname.startsWith(prefix)) {
      return "";
    }
    return decodeURIComponent(parsed.pathname.slice(prefix.length));
  } catch {
    return "";
  }
}

async function removeProfileImageObject(publicUrl) {
  const objectPath = getOwnedObjectPathFromPublicUrl(publicUrl);
  if (!objectPath) {
    return;
  }

  await storageRequest(`/object/${encodeURIComponent(PROFILE_IMAGE_BUCKET)}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prefixes: [objectPath] }),
  });
}

function buildProfilePatch(body = {}) {
  const source = body.profile && typeof body.profile === "object" ? body.profile : body;
  const allowedFields = ["firstName", "lastName", "email", "username", "title", "department", "team"];
  return allowedFields.reduce((result, field) => {
    if (Object.prototype.hasOwnProperty.call(source, field)) {
      result[field] = normalizeBodyString(source[field], field === "username" ? 64 : 160);
    }
    return result;
  }, {});
}

function auditUserSnapshot(user = {}) {
  return {
    id: user.id || "",
    email: user.email || "",
    username: user.username || "",
    firstName: user.firstName || "",
    lastName: user.lastName || "",
    role: user.role || "",
    status: user.status || "",
  };
}

module.exports = async (req, res) => {
  sendCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 200;
    res.end();
    return;
  }

  const method = String(req.method || "").toUpperCase();
  if (method !== "POST" && method !== "DELETE") {
    return sendJson(res, 405, { ok: false, reason: "Method not allowed." });
  }

  const actor = await getCurrentActor(req.headers?.authorization || req.headers?.Authorization);
  if (!actor) {
    return sendJson(res, 401, { ok: false, reason: "You must be signed in." });
  }

  const security = guardApiRequest(req, res, {
    route: "/api/profile-image",
    moduleId: "profile",
    actor,
  });
  if (!security.ok) {
    return;
  }

  try {
    const body = await parseJsonBody(req);
    const targetId = normalizeBodyString(body.userId || body.id || actor.id, 140);
    if (!targetId) {
      return sendJson(res, 400, { ok: false, reason: "Missing user id." });
    }

    if (targetId !== actor.id && actor.role !== "admin") {
      return sendJson(res, 403, { ok: false, reason: "You cannot edit this profile image." });
    }

    const target = await getAuthUserById(targetId);
    if (!target) {
      return sendJson(res, 404, { ok: false, reason: "User not found." });
    }

    if (method === "DELETE" || body.remove === true) {
      const result = await updateAuthUser(targetId, { profileImageUrl: "" });
      if (!result.ok) {
        return sendJson(res, result.status || 400, {
          ok: false,
          reason: result.reason || "Profile image could not be removed.",
        });
      }

      await removeProfileImageObject(target.profileImageUrl);
      await appendAuditLog(actor, {
        action: targetId === actor.id ? "profile.image_removed" : "user.image_removed",
        target: result.user,
        summary: targetId === actor.id ? "Removed own profile image" : `Removed profile image for ${target.email}`,
        details: {
          before: auditUserSnapshot(target),
          after: auditUserSnapshot(result.user),
        },
      });

      return sendJson(res, 200, { ok: true, user: result.user, profileImageUrl: "" });
    }

    const image = parseDataUrl(body.imageDataUrl || body.profileImageDataUrl || "");
    if (!image.ok) {
      return sendJson(res, 400, { ok: false, reason: image.reason || "Profile image could not be read." });
    }

    const bucket = await ensureProfileImageBucket();
    if (!bucket.ok) {
      return sendJson(res, 500, { ok: false, reason: bucket.reason || "Profile image storage is not ready." });
    }

    const upload = await uploadProfileImageObject(targetId, image);
    if (!upload.ok) {
      return sendJson(res, 500, { ok: false, reason: upload.reason || "Profile image could not be uploaded." });
    }

    const result = await updateAuthUser(targetId, {
      ...buildProfilePatch(body),
      profileImageUrl: upload.publicUrl,
    });
    if (!result.ok) {
      await removeProfileImageObject(upload.publicUrl);
      return sendJson(res, result.status || 400, {
        ok: false,
        reason: result.reason || "Profile image could not be saved.",
      });
    }

    await removeProfileImageObject(target.profileImageUrl);
    await appendAuditLog(actor, {
      action: targetId === actor.id ? "profile.image_updated" : "user.image_updated",
      target: result.user,
      summary: targetId === actor.id ? "Updated own profile image" : `Updated profile image for ${target.email}`,
      details: {
        before: auditUserSnapshot(target),
        after: auditUserSnapshot(result.user),
      },
    });

    return sendJson(res, 200, {
      ok: true,
      user: result.user,
      profileImageUrl: upload.publicUrl,
    });
  } catch (error) {
    if (error?.code === "BODY_TOO_LARGE") {
      return sendJson(res, 413, { ok: false, reason: error.message || "Profile image request is too large." });
    }

    return sendJson(res, 500, { ok: false, reason: error?.message || "Profile image API failed." });
  }
};
