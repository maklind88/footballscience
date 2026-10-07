# Saved Medical visibility: focused follow-up, 7 October 2026

Task owner: System / Security, for the existing saved-work visibility investigation.
Affected module owners: Medical (data and runtime composition), Sessions (read consumer).
No domain-rule, authorization, schema or central-write protocol change.

## Evidence

After release 279ab995, the user reported missing recommendations in both views.
The read-only production diagnostic confirms an active central target-date record;
the signed-in browser shows no selected recommendation for that date, including
in a fresh tab. Sessions shows unconfirmed availability. No clinical content or
player identifiers are included in this document.

A separate, reproducible initialization defect was identified in the Medical
runtime composition. Its deferred callbacks read uninitialized helper/service
variables directly. Depending on the first entry point, a valid stored roster and
records become empty in memory, an early selector returns null, or normalization
of a legacy record throws when activity context is undefined. The reader's broad
fallback can conceal this as an empty state.

Three behavioral contract tests fail on the released implementation and pass
when callback lookup initializes the corresponding existing service via its
getter. The product fix is three callback substitutions in
`src/modules/medical/medical-runtime-service.mjs`.

## Limits and next evidence

The new synthetic full-browser Medical/Sessions visibility tests pass on both
the old and corrected code. They exercise ordinary app startup, but do not yet
reproduce the production failure. Do not claim that the initialization fix alone
resolves the user's incident. The protected production diagnostic is extended
with in-memory normalization counts to test the actual central data shape.
It returns only aggregate counts/error types, with no clinical values or notes.

## Validation

- Three new behavioral regressions: red on released code, green with the fix.
- 37 focused Medical runtime contracts passed.
- Two central-read visibility browser cases passed, including module switching
  and reload; the same tests also pass on the old version (coverage limitation).
- Medical clinical/responsive UI and Sessions two-editor/offline suite: 12 passed,
  one 390px confirmation-focus failure. The unchanged failed case passed both
  explicit repeat runs; no assertion or product UI behavior was weakened.
- Five protected diagnostic tests passed, including secret/content suppression,
  source immutability, destination/build guards and session cleanup.
- `npm run check` and `git diff --check` passed.

This is an isolated candidate; there is no new release authorization or deployment.
