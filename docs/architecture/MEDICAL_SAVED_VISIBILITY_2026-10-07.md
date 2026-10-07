# Medical saved-work visibility – 7 October 2026

Task owner: System / Security, continuing the saved-work visibility investigation.
Affected module owners: Medical (data/runtime) and Sessions (read consumer).

## Problem and evidence

After release 279ab995 the signed-in production browser still showed no selected
Medical recommendation for a date with an active central record. A fresh tab had
the same result; Sessions showed unconfirmed availability. The user confirmed
both surfaces were affected. No clinical content or player identity is recorded here.

Read-only production diagnostics confirmed that the target record remains active
and preserves its identity/date through normalization. All 4,903 records, 50
players and 11 plans could be normalized in memory, with no rejected rows or
errors. This rules out malformed central rows in that observed dataset, but does
not prove the exact browser cache state or the QA account's equivalence to the user.

Two independently reproducible client defects were found:

1. Lazy runtime callbacks used helper/service variables before initialization.
   Early reads could drop valid players/records or return null; legacy records
   requiring an activity context could throw. Three behavioral contract tests
   fail on the released implementation and pass when callbacks use the existing
   lazy getters.
2. `readMedicalState` included optional cache maintenance in its main read try/catch.
   A successful parse followed by a failed cache write fell into the empty-state
   fallback, hiding valid saved records. Separate quota/security tests reproduce
   this and verify that one failed cache attempt does not schedule a central write
   or attempt an empty replacement.

The second defect reproduces the production *symptom* in a full browser with a
synthetic quota failure. Both Medical-first and Sessions-first startup cases fail
with the released cache reader and pass with the fix. Ordinary startup tests also
pass on the old implementation, so those alone were insufficient evidence.
The exact storage exception in the user's browser remains unconfirmed. Production
console warnings show acknowledgement-view/cache refresh failures, but the browser
inspection surface did not expose the structured details.

## Minimal correction

- `medical-runtime-service.mjs`: three deferred callbacks initialize their targets
  through the existing getters. No new service or storage architecture.
- `medical-runtime-state-service.mjs`: an optional cache-maintenance failure is
  logged separately; the successfully read state is still returned.
- Existing Medical rules, coach sanitization, permissions, source data, writes,
  central conflict protocol and cache failure on explicit edits remain unchanged.
- No database or schema changes; no clinical recovery/restore operations.

## Tests and diagnosis

- Five new behavioral contract regressions fail on the released implementation.
- Four browser cases cover Medical/Sessions entry, navigation and reload, with
  normal cache and simulated full cache. Chromium and WebKit pass.
- The released cache reader fails both quota browser cases at the missing selected
  recommendation; the corrected reader passes without weakening assertions.
- The read-only diagnostic now reports normalization counts/error types only.
  Five diagnostic tests verify content/secret suppression, source immutability,
  exact destination/build guards and session cleanup.
- Diagnostic run: https://github.com/maklind88/footballscience/actions/runs/37659324448
- An existing 390px confirmation-focus UI case failed once and passed both unchanged
  explicit repeat runs. No UI implementation or assertion was changed for that case.

Final candidate validation: `npm run qa:static` and 1,395 `qa:contracts` cases passed.
All 15 focused Chromium cases (Medical responsive/dialog flows, saved visibility,
and Sessions two-editor/offline editing) passed in the final combined run. Four
WebKit saved-visibility cases and all five diagnostic tests passed. Earlier focus
failure did not recur in the final complete focused run.

## Release boundary

This is a candidate branch, not a new production release. The prior Deploy safe
command completed PR259; a new explicit deployment instruction is required for
this candidate. The user's actual Medical/Sessions view must be rechecked after
an authorized release. Until then, do not describe the real incident as resolved.
The broader all-module and multi-device/offline program remains incomplete.
