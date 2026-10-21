# Medical recovery surface

## Scope and evidence

Medical-only candidate based on origin/main 2fc62199. The user reported a large
recovery list above Availability. The original affected browser tab was closed
before investigation. Its memory-only drafts and original exception cannot be
inspected. No conclusion has been established about missing central records or
the original storage failure. No production data was read, replayed or changed.

## Change

- Private Medical views use a compact recovery notice after the navigation.
- Recovery is a separate tab containing the existing review, export, retry and
  exact-server-verification controls. An empty list does not claim central saving.
- Browser quota, denied access, rescue capacity and timeout failures have fixed,
  non-clinical descriptions. Unknown errors remain explicitly unconfirmed.
- Authorized memory-only drafts register a beforeunload warning. A durable rescue
  commit removes that draft from the warning condition; export alone does not.
- Current recommendations, percentages, roster order, central writes, merging,
  retention limits and verified-copy deletion rules are unchanged.

## Limits

Beforeunload is a browser warning, not durable storage. It needs browser user
activation and cannot protect against process crashes, force-close or every
mobile lifecycle. No warning is shown for a different account/team or lost
Medical edit access. A saved rescue copy is not a central receipt.

Do not clear browser storage or automatically replay old copies. Investigating
the original incident still requires authorized comparison of central records
and any durable copies on the affected device. If failure recurs, retain the tab
and capture the new categorized error before closing it.

## Integration boundary

The release candidate was rebased onto main 09e9ccbc, which now includes System's
startup recovery and sign-out cache fixes. Expanded copies remain open across
refresh; the acceptance helper now asserts that behavior without closing them.
The readiness-test conflict retained main's resolved-value polling. Earlier
Medical injury/RTP and recovery-tab branches are not bundled in this candidate.
This recovery behavior change requires Safe Lane validation for release.

## Targeted validation

Browser coverage includes actual-form failed saves, durable reload, denied
IndexedDB, concurrent drafts, private access changes, verified-copy retirement,
compact desktop/mobile layout, recovery navigation, export/retry, and a real
dismissed beforeunload dialog. Contract coverage checks menu/renderer routing,
sanitized failure categories, existing write behavior and recovery read policy.
These synthetic checks do not verify the user's original clinical data.

Local results: 51/51 targeted Chromium checks and 75/75 targeted contracts pass.
`npm run check`, `npm run quick:ui` and `git diff --check` pass. The real-form
failure notice was screenshot-checked at 1440px and 390px. No staging, full release
gate or production verification has been run for this candidate.

After rebasing onto 09e9ccbc, the expanded targeted Chromium suite passes 54/54.
