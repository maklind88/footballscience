# Offline Capability Matrix — Draft 1

This matrix describes the smallest safe initial target, not the current live capability. Today, only browser-local compatibility caches and the local video companion provide partial offline behavior; there is no general authenticated offline cold-start workflow.

`FULL OFFLINE` means selected content can be read and edited with durable operations. `READ-ONLY OFFLINE` means an authorized snapshot can be viewed but not mutated. `ONLINE ONLY` means content is not deliberately persisted for offline product use.

| Feature | Initial classification | Offline availability | Offline edits | Internet-only behavior | Conflict/sync direction | Storage policy |
| --- | --- | --- | --- | --- | --- | --- |
| Desktop shell and navigation | FULL OFFLINE | Versioned shell, last compatible build, local status | Device preferences only | Compatibility/update check | No domain conflict | Small fixed shell cache |
| Current user/team metadata | READ-ONLY OFFLINE | Minimum display identity and active scope within lease | None | Revalidate membership/permissions | Server authoritative | Small encrypted/secured metadata target |
| Home personal tasks | READ-ONLY OFFLINE initially | Selected current task list | None in first slice | Delegation and completion writes | Later append/record merge | Small current-user scope |
| Chat | ONLINE ONLY | No message-body cache in first release | No | Messages, presence, reactions, attachments, push | Database/Realtime authoritative | No deliberate message cache |
| Schedule | READ-ONLY OFFLINE | Current week and explicitly selected match metadata | No initially | Admin edits and full-season refresh | Server revision authoritative | Current week, bounded season window |
| Periodization | READ-ONLY OFFLINE initially | Current week around selected session | No initially | Full calendar editing | Later field-level/revision merge | Bounded working window |
| Session Planner | FULL OFFLINE — first vertical slice | Explicitly selected session, blocks, board data, referenced exercise snapshots | Yes after durable outbox phase | Initial authorization/snapshot and sync | Optimistic row revision; preserve local/base/server versions | Selected sessions/current week only |
| Exercise Library | FULL OFFLINE after Session Planner | Selected collections and referenced exercises | Later create/edit/copy/archive operations | Whole-library search and sharing | Append-preserve-newer plus explicit revisions | User-selected collections; media separate |
| Gameplan | READ-ONLY OFFLINE | Explicitly selected match brief, staff-safe view | No initially | Publishing, receipts, signed player links | Server authoritative initially | Selected matches only |
| Set Pieces Room | READ-ONLY OFFLINE initially | Explicitly selected plans | No initially | Collaborative/published updates | Later structured record revisions | Selected plans only |
| Game Simulator | FULL OFFLINE later | Local selected sequence/library | Local sequence edits | Central sharing/sync | Append-preserve-newer | Small structured records |
| Squad | READ-ONLY OFFLINE | Minimal roster identity needed by selected sessions | No | Roster/admin/profile changes | Server authoritative | No medical fields; current team only |
| IDP | ONLINE ONLY initially | None by default | No | All development records and evidence | Database/API authoritative | Reassess after local-security hardening |
| Medical Team / RTP | ONLINE ONLY | No patient/clinical cache in first desktop release | No | All clinical and clearance activity | Database/API authoritative | Explicitly excluded initially |
| Scouting | ONLINE ONLY initially | No confidential dossier cache | No | Dataset search, lists, reports, imports | Database/API authoritative | Reassess selected datasets later |
| Transfer Room | ONLINE ONLY | None | No | Financial/recruitment planning | Server authoritative | Explicitly excluded initially |
| Leaderboard | ONLINE ONLY | Optional transient display cache only | No | Scores/transactions/current standings | Database authoritative | Rebuildable transient cache |
| Football Science DB | ONLINE ONLY | None initially | No | Search/import/identity resolution | Database/API authoritative | No broad database mirror |
| FS Player metadata | READ-ONLY OFFLINE initially | Locally selected match/media metadata | Local-only tracking/project state continues | Central collaboration and publishing | Existing metadata APIs; future explicit sync | Metadata in local DB, not raw paths |
| Raw video and exports | FULL OFFLINE when explicitly local | Existing local companion files | Local analysis/export | Portable upload/publish | Explicit upload queue later | Managed files; never SQLite blobs |
| Chat/RTP/profile images and attachments | ONLINE ONLY initially | None unless separately approved | No | Signed URL/download/upload | Storage authoritative | No automatic download |
| Admin, audit, permissions | ONLINE ONLY | Only last authorization summary for lease enforcement | No | All administration and audit | Server authoritative | No admin dataset cache |
| Realtime and push | ONLINE ONLY | Not applicable | Not applicable | Signals and notifications | Never the reliable sync cursor | No offline dependency |

## First vertical slice

Use one explicitly selected Session Planner session and its blocks, with only the minimal roster identities and referenced exercise snapshots needed to render it.

Reasons:

- it is one of the highest-value pitch/travel workflows;
- its current state is already organized by date and blocks;
- the repository already contains deterministic session/block conversion and undeployed typed row groundwork;
- the existing merge policy is field-aware, so conflict semantics have a starting point;
- it avoids caching Medical, chat, transfer, scouting, or raw media data;
- it is bounded enough to prove repository, local schema, cold start, and later durable mutation without mirroring the platform.

The first delivery should be read-only cold-start before offline writes. Offline editing begins only after an atomic local transaction/outbox and idempotent server operation are proven.
