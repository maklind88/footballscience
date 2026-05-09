# Chat QA Checklist

Use this checklist after every chat change before calling the module stable.

## Accounts and setup

1. Sign in as User A.
2. Sign in as User B in another browser/profile/device.
3. Open the chat widget on both users.
4. Confirm both users see the same team name and active thread list.

## Send and ordering

1. User A sends a team-room message.
2. User B receives it without reload.
3. The team room moves to the top of the thread list.
4. User B sends a DM to User A.
5. The DM moves to the top for both users.
6. Reload both browsers and confirm the same ordering remains.

## Date and time display

1. Messages from today show only time in the thread row.
2. Messages from yesterday show `Yesterday HH:mm`.
3. Older messages show a date and time.
4. Conversation view shows separators: `Today`, `Yesterday`, or a date.

## Delete and clear

1. User A deletes their own message if allowed.
2. Admin deletes any selected message.
3. The deleted message disappears immediately.
4. Reload both browsers and confirm the deleted message does not return.
5. Admin clears a thread.
6. The thread count and latest message reset correctly.

## Realtime recovery

1. Keep both browsers open.
2. Send a message from User A and confirm User B receives it.
3. Put User B tab in background for 30 seconds.
4. Return to User B tab and confirm chat refetches current thread and thread summaries.
5. Disconnect/reconnect network if possible and confirm latest state recovers after focus/reopen.

## Message actions

1. Hover a message and open the action menu.
2. Reply works and shows the reply reference.
3. React add/remove works once without duplicating.
4. Pin/unpin updates the pinned area.
5. Copy/delete/admin actions do not affect the wrong message.

## Attachments

1. Attach a supported small file.
2. Confirm pending upload state is visible.
3. Confirm sent attachment opens through a signed URL.
4. Confirm unsupported/large files fail cleanly.

## Mobile and desktop layout

1. Closed launcher does not cover page CTA buttons.
2. Open widget behaves as an overlay/popup.
3. Thread list scroll does not jump.
4. Composer stays at the bottom.
5. Message list uses available height.

## Admin health

1. Open Audit as admin.
2. Confirm health metrics load: threads, messages, deleted, pending files.
3. Confirm recent audit events appear.
4. Refresh health panel and confirm it does not break the active chat.

## Pass condition

The chat passes when send, receive, delete, refresh, realtime recovery, ordering, and mobile layout behave correctly for two users without messages reappearing or thread ordering drifting.
