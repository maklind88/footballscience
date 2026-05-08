import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migration = readFileSync(
  resolve(__dirname, "../supabase/migrations/20260507130000_chat_module_multitenant.sql"),
  "utf8"
);
const storageMigration = readFileSync(
  resolve(__dirname, "../supabase/migrations/20260507234337_chat_storage_attachments_v1.sql"),
  "utf8"
);

test("chat database migration includes multi-tenant core tables", () => {
  [
    "chat_organizations",
    "chat_teams",
    "chat_team_memberships",
    "chat_threads",
    "chat_thread_participants",
    "chat_messages",
    "chat_message_mentions",
    "chat_reactions",
    "chat_read_receipts",
    "chat_attachments",
    "chat_audit_events",
    "chat_retention_policies",
  ].forEach((tableName) => {
    expect(migration).toContain(`public.${tableName}`);
  });
});

test("chat database migration enables RLS and avoids guest staff access", () => {
  expect(migration).toContain("enable row level security");
  expect(migration).toContain("app_private.is_chat_staff()");
  expect(migration).toContain("'admin', 'coach', 'analyst', 'performance', 'medical'");
  expect(migration).not.toContain("'admin', 'coach', 'analyst', 'performance', 'medical', 'guest'");
});

test("chat database migration is server-write first", () => {
  expect(migration).toContain("revoke all on public.chat_messages from anon, authenticated");
  expect(migration).toContain("grant select on public.chat_messages to authenticated");
  expect(migration).not.toContain("grant insert on public.chat_messages to authenticated");
});

test("chat database migration includes scale indexes and idempotency", () => {
  expect(migration).toContain("chat_messages_thread_created_idx");
  expect(migration).toContain("chat_threads_org_team_updated_idx");
  expect(migration).toContain("unique (thread_id, client_message_id)");
});

test("chat attachment storage migration keeps files private and thread-scoped", () => {
  expect(storageMigration).toContain("footballscience-chat-attachments");
  expect(storageMigration).toContain("public = false");
  expect(storageMigration).toContain("chat attachment storage objects are readable");
  expect(storageMigration).toContain("chat attachment storage objects are uploadable");
  expect(storageMigration).toContain("app_private.can_access_chat_thread(attachment.thread_id)");
  expect(storageMigration).toContain("attachment.uploaded_by = (select auth.uid())");
});
