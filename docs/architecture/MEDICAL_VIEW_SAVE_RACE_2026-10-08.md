# Medical view changes and deferred central reads

Owner: System / Security, within the existing central-save reliability task. Medical owns clinical rules and records; Sessions consumes the Medical availability contract. This correction changes Medical view persistence only. No database schema, clinical rule, permission, archive policy or Sessions write contract changes.

## Evidence and cause

Production release `74f2b075` stopped in run `37716992327` before deployment. Diagnostic commit `501899df` reproduced the same failure 3 times in 60 Linux cases in run `37719782780`; 57 passed. One failure occurred without simulated quota exhaustion, so full storage is an aggravating condition rather than a requirement. The ordinary full QA on the same diagnostic commit passed, confirming why a green rerun alone was insufficient.

Failure diagnostics showed the correct selected and rendered date, no JavaScript errors, and zero target records in the local Medical copy although the mocked central response contained the record. This was not merely a missing CSS class or an incorrect selected date.

A controlled test establishes the ordering:

1. Render Medical before a new recommendation is available.
2. Focus the date field, then complete an authorized central refresh with the new recommendation at a newer revision.
3. Confirm the new record exists in the browser cache. The runtime refresh is intentionally deferred while an input has focus.
4. Change the displayed date. The previous implementation persisted the entire older in-memory Medical state, replacing the newer cache with a state lacking the record.
5. The subsequent deferred reload displayed that overwritten copy.

Both controlled cases failed before the correction, with and without the quota fixture. Their original visibility assertions and timeouts were retained.

## Correction

Date and selected-player navigation now use view-only persistence. A small separate sessionStorage preference contains the current authorized central read scope, selected date and selected player. It never reads or changes the clinical storage blob, its pending generation, its hash or its central write queue. Authorized reads apply matching preferences after normal clinical parsing. Missing, inaccessible or invalid preferences cannot invalidate the clinical read; a selected archived/deleted player is not restored.

Preferences survive a reload of the same tab. A new tab/session starts from the existing defaults; preferences are not shared clinical content. When preference storage is unavailable, view choices remain in memory. No existing clinical copies are removed or migrated.

The helper is isolated in `src/modules/medical/medical-view-preferences.mjs` to avoid growing the legacy Medical state service. Clinical saves also refresh the tab preference when the clinical action selects another date or player. A preference failure cannot block the clinical save; its existing payload and persistence path are unchanged.

## Verification and release boundary

- Both controlled failures passed after correction, along with the four original Medical/Sessions visibility scenarios.
- Contract coverage verifies byte-for-byte preservation of the clinical cache, no clinical queue entry for navigation, denied preference storage, absent/malformed clinical cache, scope isolation, and archived-player selection.
- Browser coverage also checks that the selected date survives a reload before the test selects it again.
- CI now preserves failed browser traces for seven days. A scoped Medical regression workflow repeats these synthetic scenarios on the release Linux image; it has no production secrets or deployment steps.

Final CI/release evidence belongs in PR #265. This document is implementation evidence, not a claim that production was updated. Broader offline coverage, legacy cache reclamation and the prior backup latency finding remain separate work.
