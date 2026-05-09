import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const adminUsersHandler = require("../api/admin-users.js");
const profileImageHandler = require("../api/profile-image.js");
const { normalizePlatformUser, normalizeProfilePayload } = require("../api/_lib/supabase-admin.js");

const supabaseEnvKeys = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_PROJECT_REF",
  "SUPABASE_PROJECT_ID",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE",
];

function snapshotEnv(keys) {
  return Object.fromEntries(keys.map((key) => [key, process.env[key]]));
}

function restoreEnv(snapshot) {
  Object.entries(snapshot).forEach(([key, value]) => {
    if (value === undefined) {
      delete process.env[key];
      return;
    }
    process.env[key] = value;
  });
}

function createMockResponse() {
  const response = {
    statusCode: 200,
    headers: {},
    body: "",
    setHeader(name, value) {
      response.headers[String(name).toLowerCase()] = value;
    },
    end(chunk = "") {
      response.body += chunk;
    },
  };
  return response;
}

async function callHandler(handler, req = {}) {
  const res = createMockResponse();
  const body = req.body;
  const request = {
    method: "GET",
    url: "/",
    headers: {},
    ...req,
  };
  if (!request[Symbol.asyncIterator]) {
    request[Symbol.asyncIterator] = async function* requestBodyIterator() {
      if (body !== undefined) {
        yield Buffer.from(String(body));
      }
    };
  }
  await handler(request, res);

  return {
    status: res.statusCode,
    headers: res.headers,
    payload: res.body ? JSON.parse(res.body) : {},
  };
}

function createAuthUser(metadata = {}) {
  return {
    id: "user-1",
    email: "coach@example.com",
    user_metadata: {
      firstName: "Coach",
      lastName: "One",
      username: "coach.one",
      title: "Coach",
      department: "Football",
      team: "North Carolina Courage",
      ...metadata,
    },
    app_metadata: {
      role: "admin",
      status: "active",
    },
    created_at: "2026-05-07T00:00:00.000Z",
    updated_at: "2026-05-07T00:00:00.000Z",
  };
}

test("profile metadata rejects new inline images but legacy profile reads still show them", () => {
  const inlineImage = "data:image/png;base64,aaaa";

  expect(normalizeProfilePayload({ profileImageUrl: inlineImage }).profileImageUrl).toBe("");
  expect(normalizePlatformUser(createAuthUser({ profileImageUrl: inlineImage })).profileImageUrl).toBe(inlineImage);
});

test("profile image API uploads to storage and stores only a public URL in auth metadata", async () => {
  const envSnapshot = snapshotEnv(supabaseEnvKeys);
  const fetchSnapshot = globalThis.fetch;
  const updatePayloads = [];
  const uploadedObjects = [];

  process.env.SUPABASE_URL = "https://project.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-test-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";

  const currentUser = createAuthUser({
    profileImageUrl: "https://project.supabase.co/storage/v1/object/public/footballscience-profile-images/users/user-1/old.png",
  });
  globalThis.fetch = async (url, options = {}) => {
    const requestUrl = String(url);
    const method = String(options.method || "GET").toUpperCase();

    if (requestUrl.endsWith("/auth/v1/user")) {
      return new Response(JSON.stringify(currentUser), { status: 200 });
    }

    if (requestUrl.includes("/auth/v1/admin/users/user-1") && method === "GET") {
      return new Response(JSON.stringify(currentUser), { status: 200 });
    }

    if (requestUrl.includes("/auth/v1/admin/users/user-1") && method === "PUT") {
      const payload = JSON.parse(String(options.body || "{}"));
      updatePayloads.push(payload);
      return new Response(
        JSON.stringify({
          ...currentUser,
          email: payload.email || currentUser.email,
          user_metadata: payload.user_metadata,
          app_metadata: payload.app_metadata,
          updated_at: "2026-05-07T01:00:00.000Z",
        }),
        { status: 200 }
      );
    }

    if (requestUrl.includes("/storage/v1/bucket/footballscience-profile-images") && method === "GET") {
      return new Response(JSON.stringify({ message: "Not found" }), { status: 404 });
    }

    if (requestUrl.endsWith("/storage/v1/bucket") && method === "POST") {
      return new Response(JSON.stringify({ id: "footballscience-profile-images" }), { status: 200 });
    }

    if (requestUrl.includes("/storage/v1/object/footballscience-profile-images/") && method === "POST") {
      uploadedObjects.push({ url: requestUrl, body: options.body, contentType: options.headers?.get?.("Content-Type") });
      return new Response(JSON.stringify({ Key: "avatar.png" }), { status: 200 });
    }

    if (requestUrl.includes("/storage/v1/bucket/footballscience-app-state") && method === "GET") {
      return new Response(JSON.stringify({ id: "footballscience-app-state", public: false }), { status: 200 });
    }

    if (requestUrl.includes("/storage/v1/object/footballscience-app-state/") && method === "GET") {
      return new Response(JSON.stringify({ message: "Not found" }), { status: 404 });
    }

    if (requestUrl.includes("/storage/v1/object/footballscience-app-state/") && (method === "PUT" || method === "POST")) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    return new Response(JSON.stringify({ message: `Unexpected ${method} ${requestUrl}` }), { status: 500 });
  };

  try {
    const imageDataUrl = `data:image/png;base64,${Buffer.from("profile-image").toString("base64")}`;
    const response = await callHandler(profileImageHandler, {
      method: "POST",
      url: "/api/profile-image",
      headers: { authorization: "Bearer user-token" },
      body: JSON.stringify({
        userId: "user-1",
        imageDataUrl,
        profile: {
          firstName: "Updated",
          lastName: "Coach",
          team: "Central Team",
        },
      }),
    });

    expect(response.status).toBe(200);
    expect(response.payload.ok).toBe(true);
    expect(response.payload.profileImageUrl).toMatch(
      /^https:\/\/project\.supabase\.co\/storage\/v1\/object\/public\/footballscience-profile-images\/users\/user-1\/avatar-/
    );
    expect(uploadedObjects).toHaveLength(1);
    expect(updatePayloads).toHaveLength(1);
    expect(updatePayloads[0].user_metadata.profileImageUrl).toBe(response.payload.profileImageUrl);
    expect(updatePayloads[0].user_metadata.profileImageUrl).not.toContain("data:image");
    expect(JSON.stringify(updatePayloads[0])).not.toContain(imageDataUrl);
    expect(updatePayloads[0].user_metadata.firstName).toBe("Updated");
    expect(updatePayloads[0].app_metadata.role).toBe("admin");
  } finally {
    globalThis.fetch = fetchSnapshot;
    restoreEnv(envSnapshot);
  }
});

test("admin cannot accidentally remove their own admin role or pause their own account", async () => {
  const envSnapshot = snapshotEnv(supabaseEnvKeys);
  const fetchSnapshot = globalThis.fetch;
  const updatePayloads = [];

  process.env.SUPABASE_URL = "https://project.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-test-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";

  const currentUser = createAuthUser();
  globalThis.fetch = async (url, options = {}) => {
    const requestUrl = String(url);
    const method = String(options.method || "GET").toUpperCase();

    if (requestUrl.endsWith("/auth/v1/user")) {
      return new Response(JSON.stringify(currentUser), { status: 200 });
    }

    if (requestUrl.includes("/auth/v1/admin/users/user-1") && method === "GET") {
      return new Response(JSON.stringify(currentUser), { status: 200 });
    }

    if (requestUrl.includes("/auth/v1/admin/users/user-1") && method === "PUT") {
      const payload = JSON.parse(String(options.body || "{}"));
      updatePayloads.push(payload);
      return new Response(
        JSON.stringify({
          ...currentUser,
          user_metadata: payload.user_metadata,
          app_metadata: payload.app_metadata,
        }),
        { status: 200 }
      );
    }

    if (requestUrl.includes("/storage/v1/bucket/footballscience-app-state") && method === "GET") {
      return new Response(JSON.stringify({ id: "footballscience-app-state", public: false }), { status: 200 });
    }

    if (requestUrl.includes("/storage/v1/object/footballscience-app-state/") && method === "GET") {
      return new Response(JSON.stringify({ message: "Not found" }), { status: 404 });
    }

    if (requestUrl.includes("/storage/v1/object/footballscience-app-state/") && (method === "PUT" || method === "POST")) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    return new Response(JSON.stringify({ message: `Unexpected ${method} ${requestUrl}` }), { status: 500 });
  };

  try {
    const response = await callHandler(adminUsersHandler, {
      method: "PUT",
      url: "/api/admin-users?userId=user-1",
      headers: { authorization: "Bearer user-token" },
      body: JSON.stringify({
        firstName: "Still",
        lastName: "Admin",
        role: "coach",
        status: "paused",
      }),
    });

    expect(response.status).toBe(200);
    expect(response.payload.user.role).toBe("admin");
    expect(response.payload.user.status).toBe("active");
    expect(updatePayloads[0].app_metadata.role).toBe("admin");
    expect(updatePayloads[0].app_metadata.status).toBe("active");
  } finally {
    globalThis.fetch = fetchSnapshot;
    restoreEnv(envSnapshot);
  }
});

test("legacy inline profile images are migrated to Supabase Storage while reading users", async () => {
  const envSnapshot = snapshotEnv(supabaseEnvKeys);
  const fetchSnapshot = globalThis.fetch;
  const uploadedObjects = [];
  const updatePayloads = [];

  process.env.SUPABASE_URL = "https://project.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-test-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";

  const inlineImage = `data:image/png;base64,${Buffer.from("legacy-profile").toString("base64")}`;
  let currentUser = createAuthUser({ profileImageUrl: inlineImage });
  globalThis.fetch = async (url, options = {}) => {
    const requestUrl = String(url);
    const method = String(options.method || "GET").toUpperCase();

    if (requestUrl.endsWith("/auth/v1/user")) {
      return new Response(JSON.stringify(currentUser), { status: 200 });
    }

    if (requestUrl.includes("/auth/v1/admin/users?") && method === "GET") {
      return new Response(JSON.stringify({ users: [currentUser] }), { status: 200 });
    }

    if (requestUrl.includes("/auth/v1/admin/users/user-1") && method === "PUT") {
      const payload = JSON.parse(String(options.body || "{}"));
      updatePayloads.push(payload);
      currentUser = {
        ...currentUser,
        user_metadata: payload.user_metadata,
        app_metadata: payload.app_metadata,
      };
      return new Response(JSON.stringify(currentUser), { status: 200 });
    }

    if (requestUrl.includes("/storage/v1/bucket/footballscience-profile-images") && method === "GET") {
      return new Response(JSON.stringify({ id: "footballscience-profile-images", public: true }), { status: 200 });
    }

    if (requestUrl.includes("/storage/v1/object/footballscience-profile-images/") && method === "POST") {
      uploadedObjects.push({ url: requestUrl, body: options.body });
      return new Response(JSON.stringify({ Key: "avatar.png" }), { status: 200 });
    }

    return new Response(JSON.stringify({ message: `Unexpected ${method} ${requestUrl}` }), { status: 500 });
  };

  try {
    const response = await callHandler(adminUsersHandler, {
      method: "GET",
      url: "/api/admin-users",
      headers: { authorization: "Bearer user-token" },
    });

    expect(response.status).toBe(200);
    expect(uploadedObjects).toHaveLength(1);
    expect(updatePayloads).toHaveLength(1);
    expect(response.payload.users[0].profileImageUrl).toMatch(
      /^https:\/\/project\.supabase\.co\/storage\/v1\/object\/public\/footballscience-profile-images\/users\/user-1\/avatar-migrated-/
    );
    expect(response.payload.users[0].profileImageUrl).not.toContain("data:image");
    expect(updatePayloads[0].user_metadata.profileImageUrl).toBe(response.payload.users[0].profileImageUrl);
  } finally {
    globalThis.fetch = fetchSnapshot;
    restoreEnv(envSnapshot);
  }
});
