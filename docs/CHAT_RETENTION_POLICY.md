# Chat Retention Policy

The chat module now has an explicit retention policy in the dedicated `/api/chat` contract.

## Defaults

- Active messages: `365` days
- Soft-deleted messages: `30` days
- Chat audit entries: `730` days
- Per-thread message cap: `5000`

## Behavior

- Destructive actions use soft-delete first.
- Soft-deleted message bodies are cleared immediately.
- Deleted message metadata remains temporarily for audit and timeline integrity.
- Old deleted messages are pruned after the deleted-message retention period.
- Old active messages are pruned after the active-message retention period.
- Audit entries are pruned after the audit retention period and capped to the latest `200` entries in the current app-state compatibility layer.

## Long-term target

When chat moves to dedicated database tables, retention should become a scheduled database or server job that archives or deletes rows from:

- `chat_messages`
- `chat_read_receipts`
- `chat_reactions`
- `chat_audit_events`

## Product stance

Chat is operational football staff communication, not permanent documentation. Important decisions should be promoted into their correct module, for example tasks, player notes, medical notes, or match reports.
