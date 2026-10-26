# Shell navigation must not publish settings

Task owner: System / Security. Affected owner: Platform Shell.
Operating model: distributed-specialist-v4. Safe Lane candidate on
codex/shell-navigation-read-boundary-20261022, based on origin/main
09e9ccbcc8758a3879f49bbea582e3d4c4a3a531. No historical repair or production mutation.

## Proven boundary

initializeWorkspaceHub and setActiveWorkspace called writeWorkspaceHubState.
However, clonePersistableWorkspaceHubState deliberately excludes activeWorkspaceId;
rememberActiveWorkspaceId already stores navigation in the existing local/session
key. Boot reads and repairs a working projection (defaults, workspace definitions,
access presentation and profile), then the old write persisted that projection as
new intent against football-workspace-hub-v3. Ordinary navigation could therefore
publish shared settings despite the user only choosing a page.

Three controller assertions and two real Chromium boot regressions fail before
this fix. The browser cases cover both an existing central record and a verified
absent record; both produced a hub POST without a user settings edit. This does
not prove every production platform-shell conflict has the same cause.

## Change

Remove the two automatic writes and the shell controller's writer dependency.
The shell still normalizes in memory, remembers the selected page locally,
updates browser history and renders. Actual writes remain at the existing
explicit settings handlers (Admin access form and sidebar preference). No central
key, API, permissions, conflict protocol, queued generation or stored record is
changed. Old records continue to normalize on read; no migration is required.

The next supported explicit settings save may persist its normal working
projection, as before. This fix does not introduce field-level settings merging
or certify concurrent whole-settings edits. Backend authorization remains the
source of truth; frontend normalization is not a permission change.

## Evidence

- 244 focused tests passed, plus two added first-record browser cases: 246 total
  distinct cases. Coverage includes shell/access/history, explicit Admin forms,
  central reload, data safety, sync generation/receipt handling and Sessions
  online/offline recovery.
- Six new Chromium cases cover zero hub POSTs during boot/navigation/back/forward/
  reload/fresh read, and accepted or initially failed settings saves for both
  existing and initially absent central records.
- The retained sidebar compatibility control is hidden by the current layout.
  Its browser tests dispatch its real click handler; they are handler/storage
  acceptance, not a claim that the control is currently user-visible.
- One older Sessions failure-isolation test depended on boot creating an unwanted
  hub write. It now explicitly injects two synthetic save intents through normal
  protected storage and requires both failed keys to remain pending while the
  real Sessions editor saves successfully. No assertion was weakened.
- 17 combined Home/shell/recovery tests passed with the exact Home candidate
  40daa6b85023ef3b0968c8e8ecc50f0eb42a90b6 temporarily applied in this isolated
  worktree. The overlay was restored afterward; it is not part of this candidate.
- npm run qa:static and git diff --check passed. Existing size warnings remain.

These are local synthetic-backend results. Full candidate CI and the official
Safe Lane deployment/production checks remain separate. Release requires a direct
user deploy instruction. This follows the existing saved-work contract rather
than creating another persistence framework; other module read/write boundaries
remain separately testable work.
