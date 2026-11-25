# IDP Game Model actions

The player profile's **Choose individual action** button opens:

Sub-Phase → Position → Individual Actions → Player Focus.

The catalogue covers the 16 sub-phases in `periodizationPhaseLibrary`, with LB,
CB, RB, CMF–6/8/10, LW, RW and 9. Shared full-back and winger actions are stored
once. Goalkeepers have no catalogue entries in this scope. Unknown Squad position
labels require an explicit selection. Set-piece instructions are conditional on
the player's assigned responsibility.

Coaching source: `principle-taxonomy.md` plus the position actions reviewed in the
Player Development IDP chat. Defensive goal-kick actions derive from the reviewed
high-press/second-ball proposal; they are not a separate pre-existing principle
list. The catalogue is maintained in `action-catalog.mjs`. A coach can adapt the
selected action's title and coaching details before saving a player focus.

## Ownership and persistence

This feature is owned entirely by IDP. It does not edit Periodization, Squad,
Exercise Library, Video Analysis or their records.

The action controller delegates to the existing `actions.createFocus` →
`/api/idp` create-focus path. It supplies title, description, category, status,
priority, review date, linked phase and sub-phase. Position, situation, action and
coaching detail are saved as a human-readable description snapshot. No catalogue
lookup is needed to read a saved focus; future copy changes do not rewrite it.
No new storage keys, database schema, API actions or permission changes are added.
Catalogue IDs are selection identifiers, not new persisted database relationships.

The flow only creates new focuses. It never sends an existing focus ID or
replaces another focus. Available priorities follow the existing IDP contract.
When all priorities are occupied, coaches can browse but must review/archive a
focus before saving another. Failed requests retain the customised form; saving
is locked against repeat submission. Existing API authorization remains final.

## Verification

- `qa/idp-game-model-actions.api.spec.mjs`: coverage, valid position selection,
  reset rules and round-trip compatibility with the existing domain model.
- `qa/idp-game-model-actions.smoke.spec.mjs`: desktop/mobile flow, saved payload,
  reload, preservation of existing focus, cancellation, error/retry, permissions,
  occupied priorities and keyboard exit.
- Existing IDP API/schema/module/multiple-focus contracts and focus/exercise
  browser regressions.

Browser tests use isolated API fixtures; they are not production database proof.
The feature has no release authorization in the implementation task. Follow the
repository release rules after a direct Deploy/Live command.
