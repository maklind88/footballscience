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
const readModelMigration = readFileSync(
  resolve(__dirname, "../supabase/migrations/20260619000100_chat_thread_read_models.sql"),
  "utf8"
);
const whatsappStateMigration = readFileSync(
  resolve(__dirname, "../supabase/migrations/20260626170000_chat_whatsapp_user_state.sql"),
  "utf8"
);
const actionItemsMigration = readFileSync(
  resolve(__dirname, "../supabase/migrations/20260713195237_chat_action_items.sql"),
  "utf8"
);
const actionItemIndexesMigration = readFileSync(
  resolve(__dirname, "../supabase/migrations/20260713195408_chat_action_item_fk_indexes.sql"),
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

test("chat thread read model keeps summaries durable and access controlled", () => {
  expect(readModelMigration).toContain("public.chat_thread_read_models");
  expect(readModelMigration).toContain("private.refresh_chat_thread_read_model(target_thread_id uuid)");
  expect(readModelMigration).toContain("last_message_reactions jsonb");
  expect(readModelMigration).toContain("last_message_attachments jsonb");
  expect(readModelMigration).toContain("chat_thread_read_models_org_team_activity_idx");
  expect(readModelMigration).toContain("app_private.can_access_chat_thread(thread_id)");
  expect(readModelMigration).toContain("chat_messages_refresh_read_model_write");
  expect(readModelMigration).toContain("chat_reactions_refresh_read_model_write");
  expect(readModelMigration).toContain("chat_attachments_refresh_read_model_write");
  expect(readModelMigration).toContain("chat_thread_participants_refresh_read_model_write");
});

test("chat WhatsApp user-state migration keeps private deletes per-user", () => {
  expect(whatsappStateMigration).toContain("public.chat_message_user_states");
  expect(whatsappStateMigration).toContain("primary key (message_id, user_id)");
  expect(whatsappStateMigration).toContain("hidden_at timestamptz");
  expect(whatsappStateMigration).toContain("alter table public.chat_message_user_states enable row level security");
  expect(whatsappStateMigration).toContain("grant select on public.chat_message_user_states to authenticated");
  expect(whatsappStateMigration).not.toContain("grant insert on public.chat_message_user_states to authenticated");
  expect(whatsappStateMigration).toContain("user_id = (select auth.uid())");
  expect(whatsappStateMigration).toContain("app_private.can_access_chat_thread(thread_id)");
  expect(whatsappStateMigration).toContain("alter publication supabase_realtime add table public.%I");
  expect(whatsappStateMigration).toContain("video/mp4");
  expect(whatsappStateMigration).toContain("video/quicktime");
  expect(whatsappStateMigration).toContain("video/webm");
});

test("chat action items migration is server-write first and thread scoped", () => {
  expect(actionItemsMigration).toContain("public.chat_action_items");
  expect(actionItemsMigration).toContain("thread_id uuid not null references public.chat_threads(id) on delete cascade");
  expect(actionItemsMigration).toContain("message_id uuid references public.chat_messages(id) on delete set null");
  expect(actionItemsMigration).toContain("status text not null default 'open' check (status in ('open', 'done', 'archived'))");
  expect(actionItemsMigration).toContain("priority text not null default 'normal' check (priority in ('normal', 'important', 'urgent'))");
  expect(actionItemsMigration).toContain("chat_action_items_thread_status_idx");
  expect(actionItemsMigration).toContain("alter table public.chat_action_items enable row level security");
  expect(actionItemsMigration).toContain("revoke all on public.chat_action_items from anon, authenticated");
  expect(actionItemsMigration).toContain("grant select on public.chat_action_items to authenticated");
  expect(actionItemsMigration).not.toContain("grant insert on public.chat_action_items to authenticated");
  expect(actionItemsMigration).toContain("app_private.can_access_chat_thread(thread_id)");
  expect(actionItemsMigration).toContain("alter publication supabase_realtime add table public.chat_action_items");
});

test("chat action items foreign keys have focused covering indexes", () => {
  expect(actionItemIndexesMigration).toContain("chat_action_items_team_fk_idx");
  expect(actionItemIndexesMigration).toContain("on public.chat_action_items (team_id)");
  expect(actionItemIndexesMigration).toContain("chat_action_items_created_by_fk_idx");
  expect(actionItemIndexesMigration).toContain("on public.chat_action_items (created_by)");
  expect(actionItemIndexesMigration).toContain("chat_action_items_completed_by_fk_idx");
  expect(actionItemIndexesMigration).toContain("on public.chat_action_items (completed_by)");
});
