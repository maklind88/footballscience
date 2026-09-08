# Sessions Postdeploy Live Check Investigation

Date: 2026-09-08

Live commit investigated: `af7ec2475125d70741d79fbc9c6e492f821d7690`

Original failed run: `34244999618`

Diagnostic run: `34249691490`

## Executive Result

The Sessions release artifact and technical production checks were healthy. The four authenticated failures did not repeat as four stable failures: the diagnostic run passed Leaderboard, Admin, Scouting, team chat, and Schedule, while the peer-DM flow failed.

This rules out one common total outage and identifies a concrete chat selection race. It does not justify dismissing the earlier auth and Schedule signals. Production logs show real `401` app-state/chat responses around the original run and real `409` app-state write conflicts.

## Confirmed Root Cause And Fix

### Peer DM thread resets to Team

The chat summary refresh replaces the cached thread list. It preserved an omitted selected group thread, but not an omitted selected DM thread. If the selected DM was briefly absent from a summary page, the renderer changed the active conversation to the first thread, normally Team.

The candidate fix preserves any currently selected, previously verified, non-archived thread during a replacing summary refresh. Archived threads remain removable. A contract test covers both cases, and the live test now asserts the exact active thread before checking message content.

## Signals Still Requiring Safe-Lane Treatment

### Intermittent auth loss after reload

The original run reached a state reported as `hydrated=true hydrating=false error=You must be signed in.` after reload. A later run completed the same team-chat reload flow. This is intermittent, not disproved.

Code inspection shows two existing race candidates in the legacy auth boot path: server-login session persistence is started without awaiting completion, and the Supabase auth callback performs asynchronous work directly in the callback. These are high-risk auth boundaries and must not be patched casually without deterministic session/reload race tests.

### Schedule write conflict

Production logs contain `409` responses with `Central app-state revision changed before save.` The diagnostic live test captured exact Schedule request/response metadata, but Schedule passed in that run, so the original conflicting payload was not reproduced.

The current Schedule state is one organization-wide revision-guarded blob. Blindly retrying the full blob at the latest revision could overwrite a colleague's intervening edit. The current conflict path also deserves a dedicated data-preservation review because a forced refresh may replace an unsynced local edit.

The safe long-term correction is a conflict-aware Schedule write contract, preferably record-level writes or a proven three-way merge using base/local/server values. A timeout increase or blind retry is rejected.

## Live QA Safety Finding

The production Schedule smoke creates and removes a real event in the organization-wide Schedule state. Even with cleanup, a concurrent user edit can conflict with either operation. Production write verification should run in a dedicated production QA tenant or through an isolated transactional health contract, never against live coaching content.

## Evidence

- Original run: 2 passed, 4 failed.
- Diagnostic run: 5 passed, 1 failed.
- Diagnostic Schedule save completed in 24 seconds.
- Diagnostic DM failure displayed Team-thread content after the DM button had been visible and clicked.
- The targeted chat contract suite passed 47/47.
- The new selected-thread race contract passed 10/10 repeated runs.
- No permissions, tenant isolation, backend write authorization, or production data were changed during investigation.

## Release Boundary

The chat fix and diagnostic improvements are candidate-only. No main merge, staging deploy, production deploy, migration, or production-data repair is authorized by this investigation.
