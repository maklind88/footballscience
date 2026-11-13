# History compatibility release — 2026-11-13

Owner: System/Security. Direct user authorization: deploy the compatibility support and verify live, without activating compact writing or altering/deleting saved or unsynced work.

## Isolated scope

Base main: `0046d3363b24b8b4b315537184c1e72f63820122`.
Source candidate: `805e923a725ef6ad541c27d5ac7a9a22f6744054`.
Release branch: `codex/history-compat-release-20261113`.

The source candidate also depends on two local prototype commits. This release deliberately extracts only the default history read compatibility, account epoch guard and shared history lock. No compact writer factory, write codec/store, optional writer injection, offline worker or offline QA bootstrap is included. No compact enable flag is introduced. The original candidate remains intact in its own branch.

The only changed product surface is `data-safety-runtime-service.mjs` and its three read/locking helpers. Default capture reasons (autosave, cross-tab, pagehide, export, restore, remove/clear and library callbacks) use the same capture function. Existing matching compact envelopes are verified by full content, scope and integrity before reuse. Missing compact databases are never created. Different recovery metadata retains the existing legacy write path. Reuse does not mutate or prune compact, legacy, latest or journal rows. Current primary saves, permission checks and central sync are unchanged.

The compatibility scan is bounded to 256 identities, 32 MiB declared decoded data and a 3-second deadline. Corruption/incomplete inventory/timeouts refuse the optional backup with an existing warning; they do not acknowledge pending primary work. Account changes including A→B→A cancel completion stamping. Both default tabs use the same lock, with a 4-second queue wait timeout. Existing atomic legacy writes remain the fallback when lock/inventory APIs are unavailable; this is not compact activation approval.

Sessions quota/review copies, primary journals and separate recovery drafts retain their existing module-owned formats and behavior. They are not collapsed into generic snapshots.

## Verification

The extracted release passed **26 targeted tests** in Chromium/WebKit on the exact base above. These cover default capture reasons with standalone/pooled copies, advanced head/older retained version, integrity failure, account switching, scan bounds, two tabs across 30 generations, lock timeout and preserved pending data. Compact creation stays absent during ordinary captures. The former writer-generated advanced-head fixture was replaced by equivalent synthetic retained rows and a head so no production writer is needed. A two-default-tab generation test replaces the prototype-writer concurrency case in this narrower release; that original prototype test remains on the source branch.

Commands:

```sh
npx playwright test --config=qa/playwright.history-paths.config.mjs
git diff --check
npm run deploy:safe
```

The official Safe Lane command owns full local QA, candidate push, traffic guard, staging, main QA, production and postdeploy. Final release/workflow URLs, exact final SHA, remote refs and served-source checks are recorded outside the committed tree after execution; this pre-release document does not assert success in advance.

## Preserved boundaries

No data migration, cache clearing, history deletion or historical repair is part of this release. Verification uses synthetic isolated browser data or the existing authorized QA accounts. Already-running JavaScript from before this version cannot be upgraded in-place and can still make duplicate legacy representations. Compact writing remains unavailable; a later pilot requires a separate safe client-lifecycle decision and explicit authorization. No offline startup feature is activated.
