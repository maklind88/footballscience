const { randomUUID } = require("node:crypto");
const { readConfig } = require("./supabase-admin.js");

const PLATFORM_TENANT_BOOTSTRAP_SCHEMA = "footballscience-platform-tenant-bootstrap-v1";
const PLATFORM_ROLES = new Set(["admin", "club-admin", "team-admin", "coach", "scout", "analyst", "performance", "medical", "guest"]);
const RELATIONSHIPS = new Set(["staff", "contractor", "external", "guest"]);
const SCOPES = new Set(["organization", "club", "team"]);
const STATUS_VALUES = new Set(["active", "paused", "removed", "archived"]);
const GENDER_VALUES = new Set(["women", "men", "girls", "boys", "mixed", "other"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$/;
const MAX_METADATA_DEPTH = 3;
const MAX_METADATA_KEYS = 40;

const ORGANIZATION_SELECT = "id,slug,name,status,metadata,created_at,updated_at";
const CLUB_SELECT = "id,organization_id,slug,name,country_code,status,metadata,created_at,updated_at";
const TEAM_SELECT = "id,organization_id,club_id,slug,name,sport,age_group,gender,status,metadata,created_at,updated_at";
const PROFILE_SELECT = [
  "user_id",
  "primary_organization_id",
  "primary_club_id",
  "primary_team_id",
  "display_name",
  "first_name",
  "last_name",
  "email",
  "title",
  "department",
  "status",
  "created_at",
  "updated_at",
].join(",");
const MEMBERSHIP_SELECT = [
  "id",
  "organization_id",
  "club_id",
  "team_id",
  "user_id",
  "role",
  "scope",
  "status",
  "relationship",
  "accepted_at",
  "created_at",
  "updated_at",
].join(",");
const TENANT_LINK_SELECT = [
  "id",
  "organization_id",
  "club_id",
  "team_id",
  "module_id",
  "module_table",
  "module_record_id",
  "scope",
  "status",
  "created_at",
].join(",");

function normalizeString(value, maxLength = 240) {
  return String(value || "").trim().slice(0, maxLength);
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isUuid(value) {
  return UUID_PATTERN.test(normalizeString(value, 120));
}

function normalizeRole(value, fallback = "coach") {
  const role = normalizeString(value, 40).toLowerCase();
  return PLATFORM_ROLES.has(role) ? role : fallback;
}

function normalizeRelationship(value) {
  const relationship = normalizeString(value || "staff", 40).toLowerCase();
  return RELATIONSHIPS.has(relationship) ? relationship : "staff";
}

function normalizeStatus(value, fallback = "active") {
  const status = normalizeString(value || fallback, 40).toLowerCase();
  return STATUS_VALUES.has(status) ? status : fallback;
}

function normalizeProfileStatus(value) {
  const status = normalizeStatus(value, "active");
  return ["active", "paused", "removed"].includes(status) ? status : "active";
}

function normalizeGender(value) {
  const gender = normalizeString(value, 40).toLowerCase();
  return GENDER_VALUES.has(gender) ? gender : null;
}

function slugify(value, fallback) {
  const slug = normalizeString(value || fallback || "tenant", 120)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/^-+|-+$/g, "");
  const safeSlug = slug || "tenant";
  const padded = safeSlug.length < 3 ? `${safeSlug}-tenant` : safeSlug;
  return SLUG_PATTERN.test(padded) ? padded : "tenant-bootstrap";
}

function normalizeName(value, fallback) {
  const name = normalizeString(value || fallback, 160);
  return name.length >= 2 ? name : "Football Science";
}

function normalizeModuleId(value) {
  if (!normalizeString(value, 80)) {
    return "";
  }
  const moduleId = slugify(value, "");
  return moduleId.length <= 80 ? moduleId : moduleId.slice(0, 80).replace(/-+$/g, "");
}

function normalizeModuleTable(value) {
  if (!normalizeString(value, 80)) {
    return "";
  }
  return normalizeString(value, 80)
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_+|_+$/g, "");
}

function sanitizeMetadata(value, depth = 0) {
  if (depth > MAX_METADATA_DEPTH) {
    return null;
  }
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string") {
    return normalizeString(value, 300);
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, MAX_METADATA_KEYS).map((entry) => sanitizeMetadata(entry, depth + 1));
  }
  if (!isPlainObject(value)) {
    return null;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !["__proto__", "prototype", "constructor"].includes(key))
      .slice(0, MAX_METADATA_KEYS)
      .map(([key, entry]) => [normalizeString(key, 80), sanitizeMetadata(entry, depth + 1)])
      .filter(([key]) => Boolean(key))
  );
}

function serviceHeaders(serviceRoleKey, extra = {}) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    Accept: "application/json",
    "Content-Type": "application/json",
    ...extra,
  };
}

async function parseResponse(response) {
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
    return { message: text };
  }
}

function platformBootstrapConfig(options = {}) {
  if (options.config?.url && options.config?.serviceRoleKey) {
    return { ok: true, ...options.config };
  }
  const config = readConfig();
  if (!config.url || !config.serviceRoleKey) {
    return {
      ok: false,
      status: 500,
      reason: "Platform tenant bootstrap database is not configured.",
    };
  }
  return { ok: true, ...config };
}

async function requestPlatformJson(path, request = {}, options = {}) {
  const config = platformBootstrapConfig(options);
  if (!config.ok) {
    return config;
  }

  const response = await (options.fetchImpl || fetch)(`${config.url}${path}`, {
    method: request.method || "GET",
    headers: serviceHeaders(config.serviceRoleKey, request.headers),
    body: request.body === undefined ? undefined : JSON.stringify(request.body),
  });
  const payload = await parseResponse(response);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      reason: payload?.message || payload?.error_description || payload?.msg || "Platform tenant bootstrap request failed.",
      payload,
    };
  }
  return { ok: true, status: response.status, data: payload };
}

function baseParams(select) {
  const params = new URLSearchParams();
  params.set("select", select);
  return params;
}

async function fetchRestRows(tableName, params, options = {}) {
  const query = params instanceof URLSearchParams ? params : new URLSearchParams(params || {});
  const result = await requestPlatformJson(`/rest/v1/${tableName}?${query.toString()}`, {}, options);
  if (!result.ok) {
    return result;
  }
  return { ...result, rows: Array.isArray(result.data) ? result.data : [] };
}

async function createRestRow(tableName, row, options = {}) {
  return requestPlatformJson(
    `/rest/v1/${tableName}`,
    {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: row,
    },
    options
  );
}

async function patchRestRows(tableName, params, patch, options = {}) {
  const query = params instanceof URLSearchParams ? params : new URLSearchParams(params || {});
  return requestPlatformJson(
    `/rest/v1/${tableName}?${query.toString()}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: patch,
    },
    options
  );
}

async function fetchAuthUser(userId, options = {}) {
  if (!isUuid(userId)) {
    return { ok: false, status: 400, reason: "Invalid user id." };
  }
  return requestPlatformJson(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, {}, options);
}

function authUserFromResult(result) {
  return result?.data?.user || result?.data || {};
}

function appMetadataFromAuthUser(rawUser = {}) {
  return isPlainObject(rawUser.app_metadata) ? rawUser.app_metadata : {};
}

async function fetchAdminMembershipRows(actorId, options = {}) {
  const params = baseParams(MEMBERSHIP_SELECT);
  params.set("user_id", `eq.${actorId}`);
  params.set("role", "eq.admin");
  params.set("status", "eq.active");
  params.set("deleted_at", "is.null");
  return fetchRestRows("platform_memberships", params, options);
}

async function resolveTenantBootstrapActor(actor, options = {}) {
  if (!actor?.id || !isUuid(actor.id)) {
    return { ok: false, status: 401, reason: "You must be signed in." };
  }

  const [rawUserResult, membershipResult] = await Promise.all([
    fetchAuthUser(actor.id, options),
    fetchAdminMembershipRows(actor.id, options),
  ]);
  if (!rawUserResult.ok) {
    return rawUserResult;
  }
  if (!membershipResult.ok) {
    return membershipResult;
  }

  const rawUser = authUserFromResult(rawUserResult);
  const appMetadata = appMetadataFromAuthUser(rawUser);
  const appRole = normalizeRole(appMetadata.role || appMetadata.platformRole || appMetadata.platform_role, "");
  const appStatus = normalizeStatus(appMetadata.status, "active");
  const hasAdminMembership = membershipResult.rows.some((row) => normalizeRole(row.role, "") === "admin");

  if (appStatus !== "active" || (appRole !== "admin" && !hasAdminMembership)) {
    return { ok: false, status: 403, reason: "Platform admin access required." };
  }

  return {
    ok: true,
    actor: {
      id: normalizeString(rawUser.id || actor.id, 120),
      email: normalizeString(rawUser.email || actor.email, 254).toLowerCase(),
      role: "admin",
      bootstrapRole: appRole || null,
      adminSource: appRole === "admin" ? "app_metadata" : "platform_memberships",
    },
  };
}

function firstRow(result) {
  const rows = Array.isArray(result?.rows) ? result.rows : Array.isArray(result?.data) ? result.data : [];
  return rows[0] || null;
}

function operation(type, action, row, extra = {}) {
  return {
    type,
    action,
    id: normalizeString(row?.id || row?.user_id || "", 120) || null,
    ...extra,
  };
}

function normalizeTenantBootstrapRequest(body = {}, actor = {}) {
  const organizationInput = isPlainObject(body.organization) ? body.organization : {};
  const clubInput = isPlainObject(body.club) ? body.club : null;
  const teamInput = isPlainObject(body.team) ? body.team : null;
  const userInput = isPlainObject(body.user) ? body.user : {};
  const membershipInput = isPlainObject(body.membership) ? body.membership : {};
  const linksInput = Array.isArray(body.links) ? body.links : [];
  const targetUserId = normalizeString(userInput.id || membershipInput.userId || membershipInput.user_id || actor.id, 120);
  const organizationName = normalizeName(organizationInput.name, "Football Science");
  const clubName = clubInput ? normalizeName(clubInput.name, organizationName) : "";
  const teamName = teamInput ? normalizeName(teamInput.name, clubName || organizationName) : "";
  const defaultScope = teamInput ? "team" : clubInput ? "club" : "organization";
  const requestedScope = normalizeString(membershipInput.scope || defaultScope, 40).toLowerCase();
  const membershipScope = SCOPES.has(requestedScope) ? requestedScope : defaultScope;
  const targetIsActor = targetUserId && targetUserId === actor.id;

  return {
    dryRun: body.dryRun === true,
    organization: {
      id: isUuid(organizationInput.id) ? organizationInput.id : "",
      slug: slugify(organizationInput.slug || organizationName, "football-science"),
      name: organizationName,
      status: normalizeStatus(organizationInput.status, "active"),
      metadata: sanitizeMetadata(organizationInput.metadata || {}),
    },
    club: clubInput
      ? {
          id: isUuid(clubInput.id) ? clubInput.id : "",
          slug: slugify(clubInput.slug || clubName, "club"),
          name: clubName,
          country_code: normalizeString(clubInput.countryCode || clubInput.country_code, 2).toUpperCase() || null,
          status: normalizeStatus(clubInput.status, "active"),
          metadata: sanitizeMetadata(clubInput.metadata || {}),
        }
      : null,
    team: teamInput
      ? {
          id: isUuid(teamInput.id) ? teamInput.id : "",
          slug: slugify(teamInput.slug || teamName, "team"),
          name: teamName,
          sport: normalizeString(teamInput.sport || "football", 80),
          age_group: normalizeString(teamInput.ageGroup || teamInput.age_group, 80) || null,
          gender: normalizeGender(teamInput.gender),
          status: normalizeStatus(teamInput.status, "active"),
          metadata: sanitizeMetadata(teamInput.metadata || {}),
        }
      : null,
    user: {
      id: targetUserId,
      display_name: normalizeString(userInput.displayName || userInput.display_name || userInput.name, 180),
      first_name: normalizeString(userInput.firstName || userInput.first_name, 120),
      last_name: normalizeString(userInput.lastName || userInput.last_name, 120),
      email: normalizeString(userInput.email, 254).toLowerCase(),
      title: normalizeString(userInput.title, 160),
      department: normalizeString(userInput.department, 120),
      status: normalizeProfileStatus(userInput.status),
      metadata: sanitizeMetadata(userInput.metadata || {}),
    },
    membership: {
      role: normalizeRole(membershipInput.role || body.role, targetIsActor ? "admin" : "coach"),
      scope: membershipScope,
      relationship: normalizeRelationship(membershipInput.relationship),
      metadata: sanitizeMetadata(membershipInput.metadata || {}),
    },
    links: linksInput
      .map((link) => (isPlainObject(link) ? link : null))
      .filter(Boolean)
      .map((link) => ({
        module_id: normalizeModuleId(link.moduleId || link.module_id),
        module_table: normalizeModuleTable(link.moduleTable || link.module_table),
        module_record_id: normalizeString(link.moduleRecordId || link.module_record_id, 120),
        scope: SCOPES.has(normalizeString(link.scope, 40).toLowerCase()) ? normalizeString(link.scope, 40).toLowerCase() : defaultScope,
        status: normalizeStatus(link.status, "active") === "removed" ? "active" : normalizeStatus(link.status, "active"),
        metadata: sanitizeMetadata(link.metadata || {}),
      })),
  };
}

function validateNormalizedRequest(request) {
  if (!isUuid(request.user.id)) {
    return "A valid target user id is required.";
  }
  if (request.organization.id && !isUuid(request.organization.id)) {
    return "A valid organization id is required.";
  }
  if (request.club?.id && !isUuid(request.club.id)) {
    return "A valid club id is required.";
  }
  if (request.team?.id && !isUuid(request.team.id)) {
    return "A valid team id is required.";
  }
  if (request.membership.scope === "club" && !request.club) {
    return "A club-scoped membership requires a club payload.";
  }
  if (request.membership.scope === "team" && !request.team) {
    return "A team-scoped membership requires a team payload.";
  }
  for (const link of request.links) {
    if (!link.module_id || !link.module_table || !isUuid(link.module_record_id)) {
      return "Each tenant link requires moduleId, moduleTable, and a valid moduleRecordId.";
    }
    if (link.scope === "club" && !request.club) {
      return "A club-scoped tenant link requires a club payload.";
    }
    if (link.scope === "team" && !request.team) {
      return "A team-scoped tenant link requires a team payload.";
    }
  }
  return "";
}

async function findOrganization(request, options) {
  const params = baseParams(ORGANIZATION_SELECT);
  if (request.organization.id) {
    params.set("id", `eq.${request.organization.id}`);
  } else {
    params.set("slug", `eq.${request.organization.slug}`);
  }
  params.set("deleted_at", "is.null");
  params.set("limit", "1");
  return fetchRestRows("platform_organizations", params, options);
}

async function ensureOrganization(request, actor, operations, options) {
  const existing = await findOrganization(request, options);
  if (!existing.ok) {
    return existing;
  }
  const row = firstRow(existing);
  if (row) {
    operations.push(operation("organization", "reused", row, { slug: row.slug }));
    return { ok: true, row };
  }
  if (request.dryRun) {
    const planned = { ...request.organization, id: request.organization.id || randomUUID() };
    operations.push(operation("organization", "planned", planned, { slug: planned.slug }));
    return { ok: true, row: planned };
  }

  const created = await createRestRow(
    "platform_organizations",
    {
      slug: request.organization.slug,
      name: request.organization.name,
      status: request.organization.status,
      metadata: request.organization.metadata,
      created_by: actor.id,
      updated_by: actor.id,
    },
    options
  );
  if (!created.ok) {
    return created;
  }
  const createdRow = firstRow(created) || created.data?.[0] || null;
  operations.push(operation("organization", "created", createdRow, { slug: createdRow?.slug || request.organization.slug }));
  return { ok: true, row: createdRow };
}

async function findClub(request, organizationId, options) {
  if (!request.club) {
    return { ok: true, rows: [] };
  }
  const params = baseParams(CLUB_SELECT);
  if (request.club.id) {
    params.set("id", `eq.${request.club.id}`);
  } else {
    params.set("organization_id", `eq.${organizationId}`);
    params.set("slug", `eq.${request.club.slug}`);
  }
  params.set("deleted_at", "is.null");
  params.set("limit", "1");
  return fetchRestRows("platform_clubs", params, options);
}

async function ensureClub(request, actor, organization, operations, options) {
  if (!request.club) {
    return { ok: true, row: null };
  }
  if (!isUuid(organization?.id)) {
    return { ok: false, status: 400, reason: "A persisted organization is required before creating a club." };
  }
  const existing = await findClub(request, organization.id, options);
  if (!existing.ok) {
    return existing;
  }
  const row = firstRow(existing);
  if (row) {
    operations.push(operation("club", "reused", row, { slug: row.slug }));
    return { ok: true, row };
  }
  if (request.dryRun) {
    const planned = { ...request.club, id: request.club.id || randomUUID(), organization_id: organization.id };
    operations.push(operation("club", "planned", planned, { slug: planned.slug }));
    return { ok: true, row: planned };
  }

  const created = await createRestRow(
    "platform_clubs",
    {
      organization_id: organization.id,
      slug: request.club.slug,
      name: request.club.name,
      country_code: request.club.country_code,
      status: request.club.status,
      metadata: request.club.metadata,
      created_by: actor.id,
      updated_by: actor.id,
    },
    options
  );
  if (!created.ok) {
    return created;
  }
  const createdRow = firstRow(created) || created.data?.[0] || null;
  operations.push(operation("club", "created", createdRow, { slug: createdRow?.slug || request.club.slug }));
  return { ok: true, row: createdRow };
}

async function findTeam(request, organizationId, options) {
  if (!request.team) {
    return { ok: true, rows: [] };
  }
  const params = baseParams(TEAM_SELECT);
  if (request.team.id) {
    params.set("id", `eq.${request.team.id}`);
  } else {
    params.set("organization_id", `eq.${organizationId}`);
    params.set("slug", `eq.${request.team.slug}`);
  }
  params.set("deleted_at", "is.null");
  params.set("limit", "1");
  return fetchRestRows("platform_teams", params, options);
}

async function ensureTeam(request, actor, organization, club, operations, options) {
  if (!request.team) {
    return { ok: true, row: null };
  }
  if (!isUuid(organization?.id)) {
    return { ok: false, status: 400, reason: "A persisted organization is required before creating a team." };
  }
  const existing = await findTeam(request, organization.id, options);
  if (!existing.ok) {
    return existing;
  }
  const row = firstRow(existing);
  if (row) {
    operations.push(operation("team", "reused", row, { slug: row.slug }));
    return { ok: true, row };
  }
  if (request.dryRun) {
    const planned = { ...request.team, id: request.team.id || randomUUID(), organization_id: organization.id, club_id: club?.id || null };
    operations.push(operation("team", "planned", planned, { slug: planned.slug }));
    return { ok: true, row: planned };
  }

  const created = await createRestRow(
    "platform_teams",
    {
      organization_id: organization.id,
      club_id: club?.id || null,
      slug: request.team.slug,
      name: request.team.name,
      sport: request.team.sport,
      age_group: request.team.age_group,
      gender: request.team.gender,
      status: request.team.status,
      metadata: request.team.metadata,
      created_by: actor.id,
      updated_by: actor.id,
    },
    options
  );
  if (!created.ok) {
    return created;
  }
  const createdRow = firstRow(created) || created.data?.[0] || null;
  operations.push(operation("team", "created", createdRow, { slug: createdRow?.slug || request.team.slug }));
  return { ok: true, row: createdRow };
}

async function findProfile(userId, options) {
  const params = baseParams(PROFILE_SELECT);
  params.set("user_id", `eq.${userId}`);
  params.set("deleted_at", "is.null");
  params.set("limit", "1");
  return fetchRestRows("platform_user_profiles", params, options);
}

function profilePatch(request, targetAuthUser, organization, club, team, actor) {
  const email = request.user.email || normalizeString(targetAuthUser.email, 254).toLowerCase();
  const displayName = request.user.display_name || email.split("@", 1)[0] || "User";
  return {
    primary_organization_id: organization?.id || null,
    primary_club_id: club?.id || null,
    primary_team_id: team?.id || null,
    display_name: displayName,
    first_name: request.user.first_name || null,
    last_name: request.user.last_name || null,
    email,
    title: request.user.title || null,
    department: request.user.department || null,
    status: request.user.status,
    metadata: request.user.metadata,
    updated_by: actor.id,
  };
}

async function ensureProfile(request, targetAuthUser, actor, organization, club, team, operations, options) {
  const existing = await findProfile(request.user.id, options);
  if (!existing.ok) {
    return existing;
  }
  const patch = profilePatch(request, targetAuthUser, organization, club, team, actor);
  const row = firstRow(existing);
  if (request.dryRun) {
    operations.push(operation("profile", row ? "would-update" : "planned", row || { user_id: request.user.id }, { userId: request.user.id }));
    return { ok: true, row: row || { user_id: request.user.id, ...patch } };
  }
  if (row) {
    const params = new URLSearchParams();
    params.set("user_id", `eq.${request.user.id}`);
    const updated = await patchRestRows("platform_user_profiles", params, patch, options);
    if (!updated.ok) {
      return updated;
    }
    const updatedRow = firstRow(updated) || row;
    operations.push(operation("profile", "updated", updatedRow, { userId: request.user.id }));
    return { ok: true, row: updatedRow };
  }

  const created = await createRestRow(
    "platform_user_profiles",
    {
      user_id: request.user.id,
      ...patch,
      created_by: actor.id,
    },
    options
  );
  if (!created.ok) {
    return created;
  }
  const createdRow = firstRow(created) || created.data?.[0] || null;
  operations.push(operation("profile", "created", createdRow, { userId: request.user.id }));
  return { ok: true, row: createdRow };
}

function membershipTarget(request, organization, club, team) {
  if (request.membership.scope === "team") {
    return { organization_id: organization?.id || null, club_id: club?.id || null, team_id: team?.id || null };
  }
  if (request.membership.scope === "club") {
    return { organization_id: organization?.id || null, club_id: club?.id || null, team_id: null };
  }
  return { organization_id: organization?.id || null, club_id: null, team_id: null };
}

async function findMembership(request, target, options) {
  const params = baseParams(MEMBERSHIP_SELECT);
  params.set("user_id", `eq.${request.user.id}`);
  params.set("role", `eq.${request.membership.role}`);
  params.set("scope", `eq.${request.membership.scope}`);
  params.set("organization_id", `eq.${target.organization_id}`);
  params.set("status", "eq.active");
  params.set("deleted_at", "is.null");
  if (target.club_id) {
    params.set("club_id", `eq.${target.club_id}`);
  } else {
    params.set("club_id", "is.null");
  }
  if (target.team_id) {
    params.set("team_id", `eq.${target.team_id}`);
  } else {
    params.set("team_id", "is.null");
  }
  params.set("limit", "1");
  return fetchRestRows("platform_memberships", params, options);
}

async function ensureMembership(request, actor, organization, club, team, operations, options) {
  const target = membershipTarget(request, organization, club, team);
  if (!isUuid(target.organization_id) || (request.membership.scope === "club" && !isUuid(target.club_id)) || (request.membership.scope === "team" && !isUuid(target.team_id))) {
    return { ok: false, status: 400, reason: "A persisted tenant target is required before creating a membership." };
  }

  const existing = await findMembership(request, target, options);
  if (!existing.ok) {
    return existing;
  }
  const row = firstRow(existing);
  if (row) {
    operations.push(operation("membership", "reused", row, { userId: request.user.id, role: row.role, scope: row.scope }));
    return { ok: true, row };
  }
  if (request.dryRun) {
    const planned = {
      id: randomUUID(),
      ...target,
      user_id: request.user.id,
      role: request.membership.role,
      scope: request.membership.scope,
      status: "active",
    };
    operations.push(operation("membership", "planned", planned, { userId: request.user.id, role: planned.role, scope: planned.scope }));
    return { ok: true, row: planned };
  }

  const created = await createRestRow(
    "platform_memberships",
    {
      ...target,
      user_id: request.user.id,
      role: request.membership.role,
      scope: request.membership.scope,
      status: "active",
      relationship: request.membership.relationship,
      invited_by: actor.id,
      accepted_at: new Date().toISOString(),
      metadata: request.membership.metadata,
      created_by: actor.id,
      updated_by: actor.id,
    },
    options
  );
  if (!created.ok) {
    return created;
  }
  const createdRow = firstRow(created) || created.data?.[0] || null;
  operations.push(operation("membership", "created", createdRow, { userId: request.user.id, role: createdRow?.role || request.membership.role, scope: createdRow?.scope || request.membership.scope }));
  return { ok: true, row: createdRow };
}

function linkTarget(link, organization, club, team) {
  if (link.scope === "team") {
    return { organization_id: organization?.id || null, club_id: club?.id || null, team_id: team?.id || null };
  }
  if (link.scope === "club") {
    return { organization_id: organization?.id || null, club_id: club?.id || null, team_id: null };
  }
  return { organization_id: organization?.id || null, club_id: null, team_id: null };
}

function sameLinkTarget(row, target, scope) {
  return (
    normalizeString(row.organization_id, 120) === normalizeString(target.organization_id, 120) &&
    normalizeString(row.club_id, 120) === normalizeString(target.club_id, 120) &&
    normalizeString(row.team_id, 120) === normalizeString(target.team_id, 120) &&
    normalizeString(row.scope, 40) === scope
  );
}

async function findTenantLink(link, options) {
  const params = baseParams(TENANT_LINK_SELECT);
  params.set("module_id", `eq.${link.module_id}`);
  params.set("module_table", `eq.${link.module_table}`);
  params.set("module_record_id", `eq.${link.module_record_id}`);
  params.set("limit", "1");
  return fetchRestRows("platform_tenant_links", params, options);
}

async function ensureTenantLinks(request, actor, organization, club, team, operations, options) {
  const rows = [];
  for (const link of request.links) {
    const target = linkTarget(link, organization, club, team);
    if (!isUuid(target.organization_id) || (link.scope === "club" && !isUuid(target.club_id)) || (link.scope === "team" && !isUuid(target.team_id))) {
      return { ok: false, status: 400, reason: "A persisted tenant target is required before creating tenant links." };
    }

    const existing = await findTenantLink(link, options);
    if (!existing.ok) {
      return existing;
    }
    const row = firstRow(existing);
    if (row) {
      if (!sameLinkTarget(row, target, link.scope)) {
        return {
          ok: false,
          status: 409,
          reason: "Existing tenant link points to another tenant; bootstrap will not relink it automatically.",
        };
      }
      operations.push(operation("tenant-link", "reused", row, { moduleId: row.module_id, moduleTable: row.module_table }));
      rows.push(row);
      continue;
    }

    if (request.dryRun) {
      const planned = { ...target, ...link, id: randomUUID() };
      operations.push(operation("tenant-link", "planned", planned, { moduleId: link.module_id, moduleTable: link.module_table }));
      rows.push(planned);
      continue;
    }

    const created = await createRestRow(
      "platform_tenant_links",
      {
        ...target,
        module_id: link.module_id,
        module_table: link.module_table,
        module_record_id: link.module_record_id,
        scope: link.scope,
        status: link.status,
        metadata: link.metadata,
        created_by: actor.id,
      },
      options
    );
    if (!created.ok) {
      return created;
    }
    const createdRow = firstRow(created) || created.data?.[0] || null;
    operations.push(operation("tenant-link", "created", createdRow, { moduleId: createdRow?.module_id || link.module_id, moduleTable: createdRow?.module_table || link.module_table }));
    rows.push(createdRow);
  }
  return { ok: true, rows };
}

function tenantSummary(row) {
  if (!row) {
    return null;
  }
  return {
    id: normalizeString(row.id, 120) || null,
    slug: normalizeString(row.slug, 80),
    name: normalizeString(row.name, 160),
    status: normalizeStatus(row.status, "active"),
  };
}

function createBootstrapPayload(request, actor, organization, club, team, profile, membership, links, operations) {
  return {
    ok: true,
    schema: PLATFORM_TENANT_BOOTSTRAP_SCHEMA,
    dryRun: request.dryRun,
    actor: {
      id: actor.id,
      email: actor.email || "",
      role: "admin",
      adminSource: actor.adminSource || "platform",
    },
    tenant: {
      organization: tenantSummary(organization),
      club: club
        ? {
            ...tenantSummary(club),
            organizationId: normalizeString(club.organization_id, 120),
          }
        : null,
      team: team
        ? {
            ...tenantSummary(team),
            organizationId: normalizeString(team.organization_id, 120),
            clubId: normalizeString(team.club_id, 120) || null,
          }
        : null,
    },
    profile: profile
      ? {
          userId: normalizeString(profile.user_id, 120),
          primaryOrganizationId: normalizeString(profile.primary_organization_id, 120),
          primaryClubId: normalizeString(profile.primary_club_id, 120) || null,
          primaryTeamId: normalizeString(profile.primary_team_id, 120) || null,
          email: normalizeString(profile.email, 254).toLowerCase(),
          status: normalizeStatus(profile.status, "active"),
        }
      : null,
    membership: membership
      ? {
          id: normalizeString(membership.id, 120) || null,
          userId: normalizeString(membership.user_id, 120),
          role: normalizeRole(membership.role, "guest"),
          scope: normalizeString(membership.scope, 40),
          status: normalizeStatus(membership.status, "active"),
        }
      : null,
    links: (links || []).map((link) => ({
      id: normalizeString(link?.id, 120) || null,
      moduleId: normalizeString(link?.module_id, 80),
      moduleTable: normalizeString(link?.module_table, 80),
      moduleRecordId: normalizeString(link?.module_record_id, 120),
      scope: normalizeString(link?.scope, 40),
      status: normalizeStatus(link?.status, "active"),
    })),
    operations,
  };
}

async function executeTenantBootstrap(body, actor, options = {}) {
  const request = normalizeTenantBootstrapRequest(body, actor);
  const validationError = validateNormalizedRequest(request);
  if (validationError) {
    return { ok: false, status: 400, reason: validationError };
  }

  const targetUserResult = await fetchAuthUser(request.user.id, options);
  if (!targetUserResult.ok) {
    return targetUserResult;
  }
  const targetAuthUser = authUserFromResult(targetUserResult);
  if (!targetAuthUser?.id) {
    return { ok: false, status: 404, reason: "Target user was not found." };
  }

  const operations = [];
  const organization = await ensureOrganization(request, actor, operations, options);
  if (!organization.ok) {
    return organization;
  }
  const club = await ensureClub(request, actor, organization.row, operations, options);
  if (!club.ok) {
    return club;
  }
  const team = await ensureTeam(request, actor, organization.row, club.row, operations, options);
  if (!team.ok) {
    return team;
  }
  const profile = await ensureProfile(request, targetAuthUser, actor, organization.row, club.row, team.row, operations, options);
  if (!profile.ok) {
    return profile;
  }
  const membership = await ensureMembership(request, actor, organization.row, club.row, team.row, operations, options);
  if (!membership.ok) {
    return membership;
  }
  const links = await ensureTenantLinks(request, actor, organization.row, club.row, team.row, operations, options);
  if (!links.ok) {
    return links;
  }

  return createBootstrapPayload(request, actor, organization.row, club.row, team.row, profile.row, membership.row, links.rows, operations);
}

module.exports = {
  PLATFORM_TENANT_BOOTSTRAP_SCHEMA,
  executeTenantBootstrap,
  normalizeTenantBootstrapRequest,
  resolveTenantBootstrapActor,
};
