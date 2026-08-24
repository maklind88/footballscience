# FS Player Elite Platform Architecture

## Purpose

FS Player should combine the speed of professional coding software with Football Science's coaching language, collaboration, player development, and spatial intelligence. It remains an existing live product, so the elite platform is delivered as reversible vertical slices instead of a rewrite.

This document supersedes the scope boundaries in `WORKSTATION_V2_SPEC.md`. That document remains the historical Workstation V2 baseline.

## Non-Negotiable Invariants

1. Raw video is local-first. It is never silently uploaded to Supabase or another cloud service.
2. Coaching metadata has one central source of truth and is tenant- and team-scoped.
3. Pixel coordinates are never presented as metres. Spatial metrics require a usable pitch calibration and retain calibration confidence/error.
4. Automatic tracking is always reviewable. Identity continuity, confidence, occlusion, and manual corrections are first-class data.
5. Existing clips, presentations, playlists, permissions, and local file references remain compatible through every phase.
6. Realtime presence is ephemeral. Durable coding changes use idempotent operations and audited revisions in product-owned tables, never custom objects in the locked Supabase `realtime` schema.
7. The local processing service binds only to loopback, validates origin, requires an expiring session, bounds work, and serves media through expiring capability URLs.

## Sources Of Truth

| Data | Primary owner | Storage |
| --- | --- | --- |
| Raw video and capture fragments | Local media engine | Device filesystem |
| Browser file permission | Browser | File System Access handle store |
| Match, clips, coding, playlists, presentations | Video Analysis API | Postgres metadata |
| Timeline definitions and row settings | Video Analysis API | Postgres metadata |
| Collaboration operations and revisions | Video Analysis API | Append-only Postgres log plus materialized records |
| Tracking samples and local inference cache | Local tracking engine | Chunked device files |
| Track identity, review status, corrections, summaries | Video Analysis API | Postgres metadata |
| Calibration matrices and quality | Video Analysis API | Postgres metadata |
| Rendered exports | Local media engine | Device filesystem until explicit share/export |
| Presence, cursors, active coding state | Collaboration transport | Authenticated API heartbeat/polling; private Realtime only after separate policy approval |

Large tracking arrays must not be copied into generic application state or one unbounded JSON column. They are chunked by track and time range; central records carry identity, review state, hashes, summaries, and local artifact references.

## Module Boundaries

### Coding And Collaboration

- Coding templates define buttons, activation mode, pre/post-roll, hotkeys, colors, and exclusive-link groups.
- Exclusive groups guarantee that mutually exclusive labels cannot coexist on the same coding event while independent MG Principles remain repeatable.
- Batch operations are commands over explicit clip IDs and return an inverse command for undo.
- Multi-analyst coding uses idempotency keys, expected revisions, server ordering, presence, and conflict feedback. A generic CRDT is not used for clip intervals because deterministic domain commands are easier to audit and undo.
- The first collaboration transport uses the authenticated Video Analysis API with 1.2-second operation polling and 10-second participant heartbeats. It is tenant-scoped, replayable, and requires no new direct client grants.
- A private Supabase Broadcast/Presence adapter is available behind the transport boundary, but remains disabled until its exact `realtime.messages` membership policies receive a dedicated security approval. Public Realtime channels are never used for analysis data.

### Timeline Workspace

- One match can own several named timelines.
- Each timeline owns ordered rows with stable IDs, colors, visibility, locks, and query/manual membership.
- Moving, duplicating, recoloring, hiding, and deleting rows are batch commands.
- Clip time remains true milliseconds. Zoom changes the viewport, never event duration.

### Tracking And Dynamic Graphics

- A tracking engine adapter accepts clip-local video frames and prompts, then returns normalized tracks.
- A track owns time-bounded segments, points, detection confidence, identity confidence, occlusion, engine provenance, and correction history.
- Dynamic graphics bind to track anchors over an explicit time range. Distance, unit hull, unit line, trail, and movement curve graphics are spatial layers, not static drawing records.
- Low-confidence or discontinuous sections are visible and require correction before verification.
- The current vertical slice supports manual prompt/keyframes, review and correction, track-bound highlights, metadata-only central persistence, and a secure local provider protocol. Automatic inference is capability-gated until an approved model/provider package is installed; dense samples remain local.

### Pitch Calibration And Spatial Analysis

- Each camera angle has time-bounded calibration frames because pan, tilt, and zoom can change the image-to-pitch mapping.
- Homographies map normalized image coordinates or image pixels to pitch metres.
- Every metric carries confidence and calibration error.
- Initial metrics are pair distance, unit width/length, centroid, pair spacing, line/unit gap, movement path, and distance-over-time.

### Media Engine

- The local engine owns probe, remux, transcode, angle synchronization, proxy generation, capture fragments, replay buffers, tracking inference, and rendered export.
- All operations use the same bounded job lifecycle: receive, queue, run, report progress, cancel, complete, expire.
- Multi-angle time is represented as match time plus per-angle offset and clock drift correction.
- Export manifests pin source fingerprints, angle synchronization, clip ranges, drawing/tracking revisions, codec settings, and output hash.

### Search And Intelligence

- Structured filtering remains the deterministic base.
- The matrix groups any two dimensions and supports drilldown to clips.
- Natural-language requests compile into a visible structured query. The user can inspect and correct it before results are used in reports.
- Reports reference stable query and clip revisions so results remain reproducible.

### Sharing

There are two explicit sharing modes:

1. Metadata collaboration: the recipient reconnects a local source with a matching fingerprint.
2. Portable review package: an authorized export contains rendered or proxy media, a signed manifest, selected metadata, checksums, expiry, and optional encryption.

Portable packages are deliberate exports. They do not weaken the local-first default or create an ungoverned cloud video library.

## Delivery Sequence

1. Elite Foundation: domain contracts, metre-safe geometry, multi-angle clock model, multi-timeline model, secure local job engine.
2. Workstation Operations: visible multi-timeline UI, row commands, clip batch move/duplicate, exclusive coding links, shared undo command format.
3. Collaborative Coding: operation API, revisions, presence, analyst attribution, reconnect/replay, conflict handling.
4. Tracking And Telestration: prompt selection, local inference adapter, review/correction UX, track-bound graphics.
5. Spatial Analysis: calibration UX, pitch overlay, distance/unit measurements, time-series charts, confidence gates.
6. Media Production: multi-angle workspace, sync tools, live capture/replay, proxy and rendered export.
7. Intelligence And Sharing: advanced matrix, drilldowns, natural-language query compiler, reports, portable packages.

Each phase must ship behind capability checks, preserve old records, pass module contracts and risk-relevant browser flows, and have a rollback path before the next phase begins.

## Implementation Status

| Slice | Status | Evidence |
| --- | --- | --- |
| Elite foundation | Implemented in candidate branch | Domain models, secure local job engine, geometry and sync contracts |
| Workstation operations | Implemented in candidate branch | Multiple persisted timelines, row colors/order/locks, clip move/copy, save/undo, exclusive coding groups |
| Collaborative coding foundation | Implemented in candidate branch | Participant heartbeat, append-only operation log, clip/timeline revisions, reconnect polling, private Realtime adapter held behind approval |
| Tracking and dynamic telestration | Implemented vertical slice in candidate branch | Prompt/keyframe UX, review/correction, identity and confidence gates, track-bound graphics, secure local provider jobs, metadata-only API; approved provider packaging and local artifact restoration remain |
| Spatial analysis | Domain foundation only | Calibration UI, confidence gates, overlays, and charts remain |
| Media production | Secure job foundation only | Multi-angle UI, capture/replay, proxy/export orchestration remain |
| Intelligence and portable sharing | Planned | Matrix drilldown, query compiler, reports, package format and encrypted delivery remain |

## Elite Acceptance Standard

- A professional analyst can code without the mouse and batch-correct mistakes without data loss.
- Two analysts can work on the same match and see authorship, presence, revisions, and recoverable conflicts.
- A 15-second clip is represented as 15 seconds at every zoom level.
- A highlighted player remains attached through movement until the requested end time or a visible tracking-confidence break.
- Distances and unit gaps are shown in metres only when calibration is valid, with uncertainty visible.
- Multi-angle playback remains synchronized through long clips and can be corrected at reference points.
- Export is deterministic, cancellable, resumable at job level, and produces a verifiable local artifact.
- Shared review works either through fingerprint reconnection or an explicit portable package.
