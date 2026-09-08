# Sessions Postdeploy Live Check Investigation

Date: 2026-09-08

Live commit investigated: `af7ec2475125d70741d79fbc9c6e492f821d7690`

Original failed run: `34244999618`

Diagnostic run: `34249691490`

Sessions staging run: `34253649642`

## Executive Result

The Sessions release artifact and technical production checks were healthy. The four authenticated failures did not repeat as four stable failures: the diagnostic run passed Leaderboard, Admin, Scouting, team chat, and Schedule, while the peer-DM flow failed.

This rules out one common total outage and identifies a concrete chat selection race. It does not justify dismissing the earlier auth signal. The later Sessions staging run reproduced the Schedule failure and confirmed a central-write concurrency defect rather than a Sessions renderer defect.

## Confirmed Root Cause And Fix

### Peer DM thread resets to Team

The chat summary refresh replaces the cached thread list. It preserved an omitted selected group thread, but not an omitted selected DM thread. If the selected DM was briefly absent from a summary page, the renderer changed the active conversation to the first thread, normally Team.

The candidate fix preserves any currently selected, previously verified, non-archived thread during a replacing summary refresh. Archived threads remain removable. A contract test covers both cases, and the live test now asserts the exact active thread before checking message content.

### Overlapping Schedule writes

The Sessions staging run passed the full local gate and deployed candidate `c8c9be94cdd61d521d4ec50c19c079f160cb6105` to staging, but its authenticated Schedule save check failed. Vercel staging logs showed two `/api/app-state` writes beginning 41 ms apart. One completed with `200`; the other was correctly rejected by the server with `409 Central app-state revision changed before save.`

The client central-sync runtime did not serialize flushes. Its Schedule conflict path then forced a central hydration, which could replace the newer unsynced local event with the server value. The smoke helper subsequently stopped finding the local title and reported a generic central-save timeout.

The candidate correction:

- makes central write flushes single-flight;
- advances a queued same-key generation only from the acknowledged revision of the write it demonstrably followed;
- keeps acknowledgements generation-bound so an older response cannot clear a newer pending edit;
- preserves a conflicted Schedule value locally instead of force-hydrating it away;
- keeps backend revision checks and `409` protection unchanged.

A deterministic browser test holds Schedule write A in flight, creates newer local generation B, and requires requests to use base revisions `4` then `5`. It verifies that the server, local raw value, and manifest all finish on B at revision `6`, with pending cleared only after B is acknowledged.

## Signal Still Requiring Separate Safe-Lane Treatment

### Intermittent auth loss after reload

The original run reached a state reported as `hydrated=true hydrating=false error=You must be signed in.` after reload. A later run completed the same team-chat reload flow. This is intermittent, not disproved.

Code inspection shows two existing race candidates in the legacy auth boot path: server-login session persistence is started without awaiting completion, and the Supabase auth callback performs asynchronous work directly in the callback. These are high-risk auth boundaries and must not be patched casually without deterministic session/reload race tests.

## Longer-Term Schedule Architecture

The current Schedule state remains one organization-wide revision-guarded blob. The candidate prevents the observed same-page race and preserves conflicting local data, but it deliberately does not auto-merge a genuine edit from another user. Record-level Schedule writes remain the recommended longer-term architecture because they reduce unrelated conflicts without weakening optimistic concurrency.

## Live QA Safety Finding

The production Schedule smoke creates and removes a real event in the organization-wide Schedule state. Even with cleanup, a concurrent user edit can conflict with either operation. Production write verification should run in a dedicated production QA tenant or through an isolated transactional health contract, never against live coaching content.

## Evidence

- Original run: 2 passed, 4 failed.
- Diagnostic run: 5 passed, 1 failed.
- Diagnostic Schedule save completed in 24 seconds.
- Diagnostic DM failure displayed Team-thread content after the DM button had been visible and clicked.
- Sessions staging run `34253649642` passed all repository gates but failed only the authenticated Schedule central-save assertion.
- Staging logs showed Schedule POST starts 41 ms apart, followed by one `200`, one `409`, and fresh hydration reads.
- The targeted chat contract suite passed 47/47.
- The new selected-thread race contract passed 10/10 repeated runs.
- The central-sync contract suite passed 18/18; the two high-risk generation tests passed 20/20 repeated runs.
- The full API/data contract suite passed 2415/2415.
- The central-state browser suite passed 18/18; the overlapping Schedule browser regression passed 10/10 repeated runs.
- The targeted chat suite passed 140/140 API and 16/16 browser tests.
- No permissions, tenant isolation, backend write authorization, or production data were changed during investigation.

## Release Boundary

The chat fix, central-sync correction, and diagnostic improvements are candidate-only. No main merge, staging deploy, production deploy, migration, or production-data repair is authorized by this investigation.
