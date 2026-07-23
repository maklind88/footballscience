import { createHash } from "node:crypto";
import {
  PLATFORM_IDENTITY_BACKFILL_MARKER,
  canonicalJson,
} from "./platform-identity-snapshot.mjs";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizePlatformIdentityText(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

export function isPlatformIdentityUuid(value) {
  return UUID_PATTERN.test(normalizePlatformIdentityText(value, 120));
}

export function createDeterministicPlatformIdentityMigrationId(seed) {
  const hex = createHash("sha256")
    .update(normalizePlatformIdentityText(seed, 2_000), "utf8")
    .digest("hex")
    .slice(0, 32)
    .split("");
  hex[12] = "5";
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const value = hex.join("");
  return [
    value.slice(0, 8),
    value.slice(8, 12),
    value.slice(12, 16),
    value.slice(16, 20),
    value.slice(20),
  ].join("-");
}

export function platformIdentityRowVersion(row) {
  const version = Number(row?.row_version);
  return Number.isSafeInteger(version) && version > 0 ? version : null;
}

export function isPlatformIdentityBackfillOwned(row) {
  return row?.metadata?.backfillSchema === PLATFORM_IDENTITY_BACKFILL_MARKER;
}

export function platformIdentityValuesEqual(left, right, fields) {
  return fields.every(
    (field) =>
      canonicalJson(left?.[field] ?? null) ===
      canonicalJson(right?.[field] ?? null)
  );
}

export function createPlatformIdentityRestorePatch(desired) {
  return {
    ...desired,
    deleted_by: null,
    deleted_at: null,
    delete_reason: null,
  };
}

export function createPlatformIdentityMigrationCommand(
  table,
  action,
  keyColumn,
  key,
  expectedRowVersion,
  value
) {
  return {
    table,
    action,
    keyColumn,
    key,
    expectedRowVersion,
    ...(action === "create" ? { record: value } : { patch: value }),
  };
}

export function requirePlatformIdentityRowVersion(row, label, blockers) {
  const version = platformIdentityRowVersion(row);
  if (!version) blockers.push(`${label}:missing-row-version`);
  return version;
}

export function findPlatformIdentityRowById(rows, key, id) {
  return (
    rows.find(
      (row) => normalizePlatformIdentityText(row?.[key], 120) === id
    ) || null
  );
}
