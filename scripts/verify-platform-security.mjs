import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const {
  apiRouteSecurity,
  getModulePermissionContract,
  permissionActions,
  platformPermissionMatrix,
} = require("../src/core/permission-matrix.cjs");

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function requireText(relativePath, text, reason) {
  const source = read(relativePath);
  if (!source.includes(text)) {
    failures.push(`${relativePath} must contain ${JSON.stringify(text)} (${reason}).`);
  }
}

function routeFileFor(route) {
  if (route === "/api/app-state-backup-status") {
    return "api/app-state-backup.js";
  }
  return `${route.slice(1)}.js`;
}

for (const contract of platformPermissionMatrix) {
  for (const action of permissionActions) {
    const roles = contract.permissions[action];
    if (!Array.isArray(roles) || roles.length === 0) {
      failures.push(`${contract.moduleId}.${action} must define at least one allowed role.`);
    }
  }
}

for (const [route, config] of Object.entries(apiRouteSecurity)) {
  const routeFile = routeFileFor(route);
  if (!fs.existsSync(path.join(rootDir, routeFile))) {
    failures.push(`${route} points to missing ${routeFile}.`);
    continue;
  }

  if (!getModulePermissionContract(config.moduleId)) {
    failures.push(`${route} references unknown module ${config.moduleId}.`);
  }

  if (!config.actions || !Object.keys(config.actions).length) {
    failures.push(`${route} must define method-to-action mapping.`);
  }

  for (const action of Object.values(config.actions || {})) {
    if (!permissionActions.includes(action)) {
      failures.push(`${route} uses unsupported action ${action}.`);
    }
    if (!Number.isInteger(Number(config.rateLimits?.[action])) || Number(config.rateLimits[action]) <= 0) {
      failures.push(`${route} must define a positive rate limit for ${action}.`);
    }
  }

  const source = read(routeFile);
  if (!source.includes("guardApiRequest")) {
    failures.push(`${routeFile} must pass through guardApiRequest for rate limiting and observability.`);
  }
}

const publicApiFiles = fs
  .readdirSync(path.join(rootDir, "api"))
  .filter((entry) => entry.endsWith(".js"))
  .map((entry) => `/api/${entry.replace(/\.js$/, "")}`)
  .sort();

for (const route of publicApiFiles) {
  if (!apiRouteSecurity[route] && route !== "/api/app-state-backup-status") {
    failures.push(`${route} must be registered in apiRouteSecurity.`);
  }
}

requireText("api/_lib/platform-security.js", "footballscience-api-security-event-v1", "structured API security logs must keep a stable schema");
requireText("api/_lib/platform-security.js", "X-RateLimit-Limit", "API guard must expose rate limit headers");
requireText("api/_lib/platform-security.js", "api.permission_denied", "API guard must log permission denials");
requireText("api/_lib/supabase-admin.js", "finishApiRequest", "sendJson must close structured observability spans");

const migrationFile = "supabase/migrations/20260510030705_platform_security_control_plane.sql";
const migration = read(migrationFile);
const migrationsDir = path.join(rootDir, "supabase", "migrations");
const allMigrations = fs
  .readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .map((entry) => fs.readFileSync(path.join(migrationsDir, entry), "utf8"))
  .join("\n");
[
  "create table if not exists public.platform_permission_matrix",
  "create table if not exists public.platform_security_events",
  "alter table public.platform_permission_matrix enable row level security",
  "alter table public.platform_security_events enable row level security",
  "revoke all on public.platform_permission_matrix from anon, authenticated",
  "revoke all on public.platform_security_events from anon, authenticated",
  "app_private.has_platform_permission",
  "app_private.is_platform_org_member",
  "app_private.is_platform_team_member",
].forEach((text) => {
  if (!migration.includes(text)) {
    failures.push(`${migrationFile} must contain ${JSON.stringify(text)}.`);
  }
});

for (const contract of platformPermissionMatrix) {
  if (!allMigrations.includes(`('${contract.moduleId}', 'read'`)) {
    failures.push(`Supabase migrations must seed ${contract.moduleId} read permission.`);
  }
  if (!allMigrations.includes(`('${contract.moduleId}', 'write'`)) {
    failures.push(`Supabase migrations must seed ${contract.moduleId} write permission.`);
  }
}

const tenantRootTables = new Set([
  "chat_organizations",
  "squad_organizations",
  "platform_organizations",
  "platform_user_profiles",
  "platform_module_migration_checkpoints",
  "platform_permission_matrix",
]);
const teamRootTables = new Set(["chat_teams", "squad_teams", "platform_teams"]);
const organizationScopedEntityTables = new Set(["squad_players", "squad_player_external_ids", "squad_player_media"]);
for (const entry of fs.readdirSync(migrationsDir).filter((file) => file.endsWith(".sql"))) {
  const source = fs.readFileSync(path.join(migrationsDir, entry), "utf8");
  const tablePattern = /\bcreate\s+table\s+if\s+not\s+exists\s+public\.([a-zA-Z_][\w]*)\s*\(([\s\S]*?)\n\);/gi;
  for (const match of source.matchAll(tablePattern)) {
    const tableName = match[1];
    const body = match[2];
    if (tenantRootTables.has(tableName)) {
      continue;
    }
    if (!/\borganization_id\b/i.test(body)) {
      failures.push(`${entry}: public.${tableName} must include organization_id or be explicitly approved as a tenant root table.`);
    }
    const isTeamScopedName = /team|message|schedule|medical|presence|session|roster/i.test(tableName);
    const isPlayerScopedWithoutTeam =
      /player/i.test(tableName) &&
      !organizationScopedEntityTables.has(tableName) &&
      !/\broster_membership_id\b/i.test(body);
    if (
      (isTeamScopedName || isPlayerScopedWithoutTeam) &&
      !teamRootTables.has(tableName) &&
      !/\bteam_id\b/i.test(body)
    ) {
      failures.push(`${entry}: public.${tableName} should include team_id for team-scoped tenant isolation.`);
    }
  }
}

if (failures.length) {
  console.error("Platform security verification failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("Platform security verification: ok");
}
