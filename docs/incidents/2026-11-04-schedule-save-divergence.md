# Schedule Save Divergence

## Confirmed Mechanisms

- A failed protected Schedule save left the working draft in memory. A later
  view-only navigation wrote that whole draft through the raw cache path, without
  registering its content as a protected write. Navigation now merges only local
  UI preferences onto the existing stored content.
- Navigation during an in-flight Schedule save changed the cached JSON. Exact
  equality then rejected the successful receipt while still recording its server
  revision. The pending generation retained its old base revision. Receipt and
  queued-successor checks now allow only UI differences and object key ordering;
  shared fields, array order, generation, and principal checks remain enforced.
- Schedule normalization could return defaults when its cache write failed after
  a successful read. Cache failure now retains the successfully read state.

The first two mechanisms were reproduced with failing regression tests before
their fixes. They explain the observed failure pattern, but do not establish the
complete sequence of historical browser events.

## Recovery and Boundaries

The user approved recovery of eight missing training events (November 5, 6, 9,
10, 12, 13, 16, and 17) and the November 4 title. A secured browser export and
server snapshot were compared before applying exactly those changes through the
existing database compare-and-swap RPC. Revision 2532 became 2533. Both existing
FIFA Window events and all other server content were retained and read back.

No permissions, Medical eligibility rules, schema, or tenant boundaries changed.
No whole older browser snapshot was uploaded. A second browser export confirmed
that no new shared Schedule edits had appeared. A Schedule-only backup containing
the verified central value then reconciled the browser through the existing
restore UI. A fresh export after reload contained all 278 events, both FIFA
Window records, server revision 2535, and `pendingCentralSync: false`. The central
value hash remained unchanged. No other module was included in that import.
An old pending conflict must never acknowledge a different shared value.

## Verification

- Targeted Schedule/data/sync contracts: 175 passed.
- Targeted central-state Schedule browser scenarios: 19 passed.
- Separate synthetic coach and Medical contexts read all eight training days;
  Medical's activity gate and November 5 recommendation control are enabled.
- Production account/permission inspection confirms active coach and Medical
  roles with Schedule read access. This is not an authenticated observation in
  the real staff members' browsers.
- Syntax and diff checks passed before release. Deployment/postdeploy results
  are reported separately; this note does not assert that the code is live.

## Release Test Blocker

The first staging CI attempt stopped before deploy in the Storage health lazy
loading test. The trace shows a late initial user-list response around the
profile-menu click. Post-auth hydration emits a user-change event, which closes
the menu after the app-ready flag has already become true. The test now waits
for a fixture-only profile marker proving that this response was applied before
starting its menu journey. A delayed-response regression explicitly reproduces
the menu closure and then verifies the complete Storage health journey. Auth
behavior, role checks, cancellation assertions, and timeouts are unchanged.

The Schedule UI now distinguishes pending saves, server receipts, and errors.
Rejected drafts remain visible, and leaving the page warns when local saving
failed. An older successful receipt cannot dismiss that warning.
