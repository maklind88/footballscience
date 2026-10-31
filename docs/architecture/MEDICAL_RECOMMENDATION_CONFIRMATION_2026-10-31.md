# Medical recommendation confirmation — 2026-10-31

**Implemented and locally verified; staging/production release remains on hold.**
This fixes the bounded defect reproduced in
[the concurrency acceptance report](MEDICAL_MULTIWRITER_ACCEPTANCE_2026-10-31.md).
No staging/production database, historical user data or deployment changed.

Owner: System / Security for the confirmation contract, transport and this release
candidate. Affected boundaries: Medical owns clinical content/rules and Sessions
consumes Medical's public read contract. No Sessions implementation changes.

## Decision and contract

The recovery journal proves that an event was received and processed. It does not
prove its submitted recommendation still matches canonical state after another
writer changes/archives it. A browser-only fix leaves old open clients vulnerable;
a separate API read introduces another interleaving between projection and check.

The existing projector keeps its four-column signature. Before returning, while
still holding the Medical aggregate lock, it checks every submitted recommendation
against the final working state. Exactly one matching ID must remain, its submitted
fields must match exactly (including nested arrays), and it must be neither archived
nor deleted. Extra canonical fields retained by the existing merge are permitted.
This covers recommendation-saved and every member of bulk-recommendation-saved,
including already processed retries, delayed first delivery and mixed-event batches.

The check changes neither merge/version selection nor journal processing history.
An unchanged retry remains successful without another revision. A historical
processed event that no longer matches returns canonical_stored=false while
processed_count remains complete and failed_count remains zero. The API maps that
combination to HTTP 409, stored=true, canonicalStored=false,
code=medical_recommendation_changed, processingStatus=processed, and current revision.
Infrastructure/projection failures remain 503. Idempotency key/content collisions
retain their separate existing 409 behavior.

Old clients fail closed on the non-success response and retain their old generic
error/retry wording. The new transport forwards only the recognized conflict code;
new Medical bindings request a refresh without automatically retrying that conflict.
No cache is cleared, draft discarded or archived recommendation restored by the fix.
The acknowledgement describes state at the locked transaction boundary; it cannot
promise that a later writer will not change it again.

## Installation and release boundary

Dormant artifact: `scripts/release-artifacts/medical-recommendation-confirmation.sql`.
SHA-256: `7fa574f9eefd7782d81718e126c3c3271ab6a6dde9624c7da229798d3f6294ec`.
It is deliberately outside tracked migrations and is not a broad database push.

The entire artifact must run in ONE transaction after direct release authorization.
Seven existing definitions/privileges must match the reviewed September baseline
with the corrected timestamp helper. Missing/drifted definitions, elevated execution,
client grants, missing service execution or an existing new helper stop installation.
Transaction-local lock/statement timeouts are 5/30 seconds. Both new definitions
are fingerprint-checked after installation. Invoker/service-role-only execution and
the original projector signature are retained. Installation performs no row writes,
replays, repairs, deletes or revision changes.

Reviewed post-install function MD5s:
- Projector: `1c48730f74b5bcfdaaac7cc9d0b0d533`.
- New private comparison helper: `9f88aae85182ac1f2947dc1a0f604003`.

Next release step is authenticated staging acceptance of this exact candidate and
artifact, including two users and a reconnect. Recheck target identity, exact SHA,
function fingerprints and release traffic first. Staging already has the corrected
timestamp baseline; apply only the new confirmation artifact there. Production
requires the timestamp-only correction followed by this artifact, preferably in the
same reviewed transaction so either both apply or neither does. Existing production
fingerprints must be re-read immediately before that separately authorized release.

Apply the database protection before the application release. With the corrected
DB and old server, the existing API fails closed with 503; with the new server it
returns the explicit 409. A frontend/API deploy alone cannot fix the old projector.
Do not automatically roll the database back to known defective definitions. A code
rollback can retain the database guard, with less informative old-client wording.

## Verification

- `npm run check` and `npm run qa:static`: passed (existing size warnings remain).
- 57 native PostgreSQL tests: passed. Includes the 37 prior controls, simultaneous
  independent writers, exact successful retry, archived/changed/missing records,
  delayed same-ID delivery, bulk conflict, final-state batch check, all six plan
  event types, preserved rows/history, drift rejection and restricted execution.
- 261 targeted API/runtime/data-safety/platform-safety tests: passed.
- Chromium and WebKit, old author/new peer and new author/old peer: 4/4 passed.
  Actual application code, actual API handler and actual local PostgreSQL projector;
  auth, PostgREST HTTP transport, audit storage and generic app-state transport are
  synthetic. The replay envelope/key is checked for equality. Old client sources
  come from exact SHA 845a0ed95bbd8795bf574a8aeb0c9f37ed903250, including the old
  platform-auth-boot transport. Transient feedback is observed as well as final text.

The mandatory native/browser gate lives in `.github/workflows/medical-projection-native.yml`.
The dedicated browser config requires native PostgreSQL; it does not silently skip
when tools are absent or add that dependency to the ordinary browser suite.

```sh
FS_RECOVERY_PG_BIN=/path/to/pg17/bin node --test qa/medical-projection-forward-native.test.mjs qa/medical-multiwriter-acceptance-native.test.mjs
FS_RECOVERY_PG_BIN=/path/to/pg17/bin npx playwright test --config=qa/playwright.medical-confirmation.config.mjs --reporter=list
```

Local logs: `/private/tmp/medical-confirmation-{native,api,browser,static,check}.log`.
The temporary PostgreSQL tools remain isolated under `/private/tmp/medical-native-pg17`.

## Still not certified

The confirmation means the submitted record remains stored and active, not that it
wins every clinical display rule. A different active record ID, an active plan,
Squad availability, equal timestamps or skewed clocks can affect the selected view.
Concurrent field edits of a stable plan ID, bulk performance on large aggregates,
sustained writers, authenticated staging, real disk exhaustion, offline cold restart,
cache growth and the other modules remain separate acceptance work. This correction
must not be presented as certification of all saving, offline or multi-user behavior.

The implementation follows the existing projector and PostgreSQL 17 function
replacement contract. References checked: [PostgreSQL CREATE FUNCTION](https://www.postgresql.org/docs/17/sql-createfunction.html),
[Supabase function security](https://supabase.com/docs/guides/database/functions).
Current Supabase changelog was checked; its recent minor-version/legacy-TLS changes
do not require changes to this JSONB/function contract or a dependency upgrade here.

## Staging reconnect preparation follow-up

The full GitHub PR suite for product source `abcb2b8111bb1db9ff42c97dfa3227fafea68c46`
is now green: [full QA](https://github.com/maklind88/footballscience/actions/runs/41200674376),
[Medical native/mixed-client gate](https://github.com/maklind88/footballscience/actions/runs/41200674349),
and [Medical visibility reproduction](https://github.com/maklind88/footballscience/actions/runs/41200674401).
This follow-up changes test preparation/workflow wiring only; product and SQL code
remain exactly as in that product source.

The existing default-off `verify_medical_journey` staging input now includes a fifth
case, `peer-archived`. The real author UI first saves a new run-owned recommendation
through the canonical path. Generic publication is deliberately blocked for this
case to isolate canonical confirmation. The author browser is then set offline;
the distinct peer archives that exact observed record through its authenticated API
session. Peer archival is an API operation, not a peer UI test.

After reconnection the test delays the author's refresh GETs, including responses
already in flight. Only one exact original recommendation envelope and idempotency
key may be delivered. The test requires a real HTTP 409 with the original event ID,
duplicate=true, stored=true, canonicalStored=false and medical_recommendation_changed.
It observes the new attempt's feedback, rejects transient false success, checks that
canonical state/revision did not change, then releases reads and verifies fresh
Medical and Sessions views for both users. The archived recommendation must be
absent from active selectors; Sessions must show the player as unconfirmed, never
implicitly 100% available.

A separate test-only replay guard requires the original ownership-checked accepted
receipt, the exact archived row, an unchanged replay payload and a single permitted
request. Changed identities/content, further retries, unrelated endpoints and generic
writes cannot pass. A server 200/503 or mismatched receipt fails the test; the harness
does not replace it with an invented 409. Existing cleanup ownership and version/
origin checks stay in force. Staging screenshots, video, traces and clinical payload
attachments remain disabled. The synthetic ledger contains only owned IDs/statuses.

Local rehearsal uses the same scenario and routing guard with actual Chromium/WebKit,
API handler and PostgreSQL. Authentication, baseline and HTTP transport are synthetic.
The normal four staging scenarios are retained as regression controls. The native CI
job includes the new reconnect rehearsal; staging runs its guard contracts before
creating any fixture. Offline cold restart, peer archive UI, full disk behavior and
sustained writers remain outside this proof.

Read-only target recheck on 31 October:
- Staging: HTTP 200, build `dpl_EiWkM8G5aQp2AC5eVxUyjFUzkV2U`, backend
  `pokrksgempkuraueglpu.supabase.co`.
- All seven staging function MD5s/privileges match the new artifact preconditions;
  the new helper is absent. Existing functions are invoker-only, unavailable to
  anon/authenticated, and executable by service_role.
- Live remains HTTP 200, build `845a0ed95bbd8795bf574a8aeb0c9f37ed903250`, backend
  `bustidorxevacosqhkcz.supabase.co`.

No remote test accounts, clinical rows, schema or deployments were changed during
this preparation. Under AGENTS.md, a direct instruction such as **Deploy safe till
staging** is required before installing the artifact/deploying the candidate and
running the authenticated staging exercise. That would authorize this staging scope,
not production. Recheck exact SHA, current target fingerprints and release traffic
at execution time; do not reuse this snapshot as a permanent permission or lock.

Follow-up validation: 55 guard/API contracts, six native PostgreSQL-backed browser
cases (four mixed-version cases plus two reconnect rehearsals), and eight existing
staging-harness browser controls (four each in Chromium/WebKit) passed. `npm run check`,
`npm run release:rules`, staging `--list` (five cases, no execution) and
`git diff --check` passed. Product/SQL diff against abcb2b811 is empty.
Logs: `/private/tmp/medical-reconnect-guards.log`,
`/private/tmp/medical-reconnect-final-browser.log`,
`/private/tmp/medical-staging-harness-regression.log`,
`/private/tmp/medical-staging-harness-webkit.log`.
