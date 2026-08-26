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
| Active normalized tracking samples | Browser tracking workspace | Versioned chunked IndexedDB, exact organization/team/user/source/clip scope |
| Provider inference artifacts and cache | Local tracking engine | Bounded device files with expiring capability access |
| Tracking benchmark inputs and evidence | Browser benchmark workspace and local evaluator | Versioned exact-scope IndexedDB inputs; bounded in-memory result until explicit device-local evidence export |
| Track identity, review status, corrections, summaries | Local correction outbox, then Video Analysis API | Versioned scoped IndexedDB pending records and Postgres metadata |
| Calibration matrices and quality | Video Analysis API | Postgres metadata |
| Rendered exports | Local media engine | Device filesystem until explicit share/export |
| Presence, cursors, active coding state | Collaboration transport | Authenticated API heartbeat/polling; private Realtime only after separate policy approval |

Large tracking arrays must not be copied into one unbounded JSON column. The active working copy is chunked per track in IndexedDB and capped per track and scope; provider artifacts remain in the local engine. Central records carry identity, review state, hashes, summaries, and local artifact references. Restoring or retrying a track requires the exact tenant, authenticated user, media source, and clip scope. Correction audits use a separate bounded queue in the same scope: the client writes an immutable metadata-only operation before the network call, retries with the same idempotency key, and removes it only after the central write is confirmed.

## Module Boundaries

### Coding And Collaboration

- Coding templates define buttons, activation mode, pre/post-roll, hotkeys, colors, and exclusive-link groups.
- Exclusive groups guarantee that mutually exclusive labels cannot coexist on the same coding event while independent MG Principles remain repeatable.
- Batch operations are commands over explicit clip IDs and return an inverse command for undo.
- Multi-analyst coding uses idempotency keys, expected revisions, server ordering, presence, and conflict feedback. A generic CRDT is not used for clip intervals because deterministic domain commands are easier to audit and undo.
- The first collaboration transport uses the authenticated Video Analysis API with 1.2-second operation polling and 10-second participant heartbeats. It is tenant-scoped, replayable, and requires no new direct client grants.
- A remote timeline revision never replaces dirty local work silently. FS Player exposes the waiting update and either creates independent recovery timelines for every dirty local timeline before reload, or requires explicit confirmation before using the team version. Operations arriving during resolution remain pending.
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
- The tracking workflow supports manual prompt/keyframes, review and correction, track-bound highlights, metadata-only central persistence, and a secure local provider protocol.
- A completed or corrected track is retained locally before central metadata is written. Central failure leaves a visible device-only track with an explicit retry; successful retry reconciles the generated central ID through selections and graphic bindings without dropping dense samples.
- Correction audits remain append-only across offline retry. A tenant-scoped unique operation id makes central replay idempotent, while changed content under an existing operation id and lookup uncertainty both fail closed.
- Structural correction is sample-preserving: split creates one explicitly unassigned continuation, while identity swap exchanges only plausible post-playhead trajectory continuations between two identified players. Each operation updates all affected tracks and graphic bindings atomically, persists in user-action order, and is reversible as one audited history entry.
- Split continuations keep a stable client UUID through undo, redo, reload, and central retry. A concurrent create winner is adopted only when the exact tenant, clip, UUID, and local workspace track key agree; unrelated UUID reuse fails closed.
- Workspace reconciliation rejects duplicate or ambiguous stable track identities. A dynamic graphic cannot bind to a device-only, unprotected, or sample-missing track because its durable central binding would otherwise be misleading.
- The approved SAM 2.1 provider has a pinned manifest, checksum-verifying installer, exact upstream execution-tree verification, isolated runtime, capability preflight, forward/backward propagation, and bounded artifact validation. Provider `1.3.0` keeps one verified model resident for sequential jobs, creates a fresh video state per job, uses an eight-thread macOS CPU default, exposes bounded generation/cold/warm and stage telemetry, and destroys the generation on cancellation, timeout, runtime-identity drift, or invalid telemetry. Model assets are installed explicitly on the analyst device and are never bundled into the web deployment; dense samples remain local.
- Long ranges run as bounded, overlapping continuation jobs. `Complete range` chains them automatically with cumulative progress and cancellation, while each continuation reuses the retained source only inside the same secure local session, reconnects from a real endpoint sample, preserves the original player and track ID, and fails closed when the seam breaks identity continuity or time coverage stops growing.
- The tracking sidebar checks the companion capability before enabling automatic tracking and distinguishes ready, provider-not-installed, and companion-offline states. Manual keyframes remain available without pretending that automatic inference ran.
- Real-match benchmark evaluation is an in-product local job. Exact ground-truth and raw-run artifacts are checksum-bound before dispatch; selected-object reports are recomputed independently, multi-object reports require pinned TrackEval identity and cross-validation, changed inputs invalidate an in-flight result, and only an explicit metadata/trajectory evidence-set download leaves application memory.
- Benchmark ground truth is capability-scoped. Selected-object suites contain exactly one prompted player and never claim scene completeness; full-scene suites retain every player/ball/referee requirement and exhaustive attestation. Suite type is persisted, immutable after evidence exists, and mixed-profile assembly fails closed.

### Pitch Calibration And Spatial Analysis

- Each camera angle has time-bounded calibration frames because pan, tilt, and zoom can change the image-to-pitch mapping.
- Homographies map normalized image coordinates or image pixels to pitch metres.
- Every metric carries confidence and calibration error.
- Initial metrics are pair distance, unit width/length, centroid, pair spacing, line/unit gap, movement path, and distance-over-time.

### Media Engine

- The local engine owns probe, remux, transcode, angle synchronization, proxy generation, capture fragments, replay buffers, tracking inference, and rendered export.
- Browser live capture uses two explicit analyst gestures: first reserve a device-local file, then grant screen or camera access. MediaRecorder chunks stream progressively to that file and never accumulate as a central upload or long-lived in-memory recording.
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
| Elite foundation | Implemented in candidate branch | Domain models, secure loopback job engine, metre-safe geometry, angle synchronization, and multi-timeline contracts |
| Coding and collaboration | Implemented in candidate branch | Exclusive coding groups, repeatable MG Principles, batch commands, two-client presence and operation exchange, audited replay, optimistic revisions, visible remote conflicts, and data-safe local recovery copies |
| Timeline workspace | Implemented in candidate branch | Multiple persisted timelines, true millisecond scale, overview/focus zoom, overlap stacking, row colors/order/locks, clip move/copy/merge/delete, and undo |
| Presentation and export | Implemented in candidate branch | Presentation builder, freehand/arrow/circle/spotlight/text/freeze/zoom layers, track-bound graphics, deterministic overlay compilation, and burned-in H.264/AAC MP4 export |
| Tracking and dynamic telestration | Implemented in candidate branch | Prompt/keyframe UX, provider readiness, automatic cancellable full-range continuation, identity-safe seam merge, cumulative elapsed/ETA, confidence and occlusion gates, atomic split/identity-swap repair with undo, chunked reload-safe local workspaces, fail-visible idempotent metadata retry, track-bound graphics, secure local source reuse, and pinned resident SAM 2.1 installer/runtime with measured cold/warm telemetry |
| Tracking quality and provider governance | Implemented in candidate branch | In-product checksum-bound real-match workflow, selected-object and football-scene benchmarks, optimal frame assignment, unique non-overlapping evidence time, class/identity/fragment diagnostics, pinned TrackEval reference gates, non-overridable workstation-speed approval bound to one non-identifying execution profile, cancellable loopback evaluation, portable evidence sets, and request-fingerprinted fail-closed stage contracts for detection, segmentation, association, re-ID, and classification |
| Spatial analysis | Implemented in candidate branch | Manual pitch-plane calibration, server-recomputed confidence/RMS, perspective overlay, true-metre pair and unit metrics, movement curves, and track-bound distance/unit/path layers |
| Media production | Implemented in candidate branch | Multi-angle workspace, offset/drift sync, compare playback, progressive device-local capture, content-addressed proxies, byte-range playback, bounded replay buffers, source swaps, rendering, progress/cancel/download, and output checksums |
| Search and intelligence | Implemented in candidate branch | Visible natural-language query compilation, advanced two-dimensional matrix, metric drilldown, cohort comparison, stable evidence snapshots, and generated analysis reports |
| Portable sharing | Implemented in candidate branch | Explicit private publishing, checksum verification, presentation share targets, recipient authorization, short-lived playback/download capabilities, revoke, and playback without the original local source |

## Product Coverage

| Requested area | Delivered behavior | Primary verification |
| --- | --- | --- |
| Coding | Exclusive links, repeatable independent principles, batch operations, keyboard coding, multi-analyst attribution/presence/replay | `qa/video-analysis-elite-workstation.api.spec.mjs`, `qa/video-analysis-elite-workstation.smoke.spec.mjs` |
| Timeline | Multiple timelines, row operations/colors/order, true time scale, zoom/focus, overlap lanes, move/copy/merge/delete and undo | `qa/video-analysis-module-contract.api.spec.mjs`, `qa/video-analysis-playback.smoke.spec.mjs` |
| Search | Advanced matrix, clip drilldown, natural-language interpretation, cohort comparison and report output | `qa/video-analysis-clip-intelligence.api.spec.mjs`, `qa/video-analysis-clip-intelligence.smoke.spec.mjs` |
| Presentation | Freehand and structured drawings, dynamic tracked layers, presenter workflow and rendered video export | `qa/video-analysis-freehand-telestration.api.spec.mjs`, `qa/video-analysis-tracking-telestration.smoke.spec.mjs`, `qa/video-analysis-media-composite.api.spec.mjs` |
| Media | Multi-angle synchronization, compare playback, live local capture, scrub proxies, replay and cancellable export | `qa/video-analysis-media-production.api.spec.mjs`, `qa/video-analysis-media-production.smoke.spec.mjs`, `qa/video-analysis-media-capture.api.spec.mjs`, `qa/video-analysis-media-proxy.api.spec.mjs` |
| Tracking | Automatic local SAM 2.1 tracking, bounded earlier/later continuation under one identity, confidence/occlusion visibility, atomic trajectory split and crossed-identity repair, reversible audited correction, track-bound highlights, and checksum-bound local real-match provider evaluation | `qa/video-analysis-sam2-provider.api.spec.mjs`, `qa/video-analysis-tracking-review.api.spec.mjs`, `qa/video-analysis-tracking-suite.api.spec.mjs`, `qa/video-analysis-trackeval-reference.api.spec.mjs`, `qa/video-analysis-tracking-telestration.api.spec.mjs`, `qa/video-analysis-tracking-telestration.smoke.spec.mjs` |
| Spatial analysis | Pitch calibration, real metres, pair/unit measures, gaps and continuity-aware movement curves | `qa/video-analysis-spatial-workbench.api.spec.mjs`, `qa/video-analysis-spatial-workbench.smoke.spec.mjs` |
| Sharing | Metadata reconnection plus private portable reviews that authorized recipients can stream or download without the source file | `qa/video-analysis-portable-media.api.spec.mjs`, `qa/video-analysis-media-production.smoke.spec.mjs` |

## Local Tracking Activation

Automatic tracking is intentionally a device capability, not a web-deployment side effect. A workstation is ready only when `npm run fs-player:tracking:preflight` reports `ok: true`. Installation requires an explicit Apache-2.0 acknowledgement and a supported Python 3.10-3.12 runtime:

```bash
npm run fs-player:tracking:plan
npm run fs-player:tracking:install -- --accept-license --python /path/to/python3.12
npm run fs-player:tracking:preflight
npm run fs-player:tracking:smoke -- --warm --json
npm run fs-player:tracking:benchmark -- --input /absolute/local/benchmark.json
npm run fs-player:tracking:trackeval:plan
npm run fs-player:tracking:trackeval:install -- --accept-license --python /path/to/python3.12
npm run fs-player:tracking:trackeval:preflight
npm run fs-player:tracking:benchmark -- --input /absolute/local/football-scene.json --trackeval
```

Until the SAM preflight succeeds, FS Player shows the provider as unavailable, keeps `Track locally` disabled, and preserves manual keyframe/correction workflows. TrackEval is a separate optional quality evaluator; its preflight is required before producing provider-approval evidence. These are operational provisioning prerequisites, not permission to upload match video or model samples.

## Elite Acceptance Standard

- A professional analyst can code without the mouse and batch-correct mistakes without data loss.
- Two analysts can work on the same match and see authorship, presence, revisions, and recoverable conflicts.
- A 15-second clip is represented as 15 seconds at every zoom level.
- A highlighted player remains attached through movement until the requested end time or a visible tracking-confidence break.
- A provider can be described as approved only after exact non-overlapping real-match evidence passes the in-product checksum and pinned-reference workflow; synthetic smoke output remains installation evidence only.
- Distances and unit gaps are shown in metres only when calibration is valid, with uncertainty visible.
- Multi-angle playback remains synchronized through long clips and can be corrected at reference points.
- Export is deterministic, cancellable, resumable at job level, and produces a verifiable local artifact.
- Shared review works either through fingerprint reconnection or an explicit portable package.
- Tracking installation, latency approval, and real-match quality evidence are independent gates. The pinned SAM 2.1 resident worker now proves model reuse, runtime identity, and bounded stage telemetry, but its measured eight-thread CPU warm factor is 7.394-7.501x real time and therefore not yet an elite workstation budget. Forward SAM propagation accounts for about 87% of the measured end-to-end latency; media sampling is not the limiting stage. SAM remains the selected-object refinement and manual-prompt fallback, while real-time full-scene tracking requires an independently approved detector and association provider. Performance remains fail-visible until an optimized provider passes the warm reference gate without reducing representative real-match quality.

## Media Production Security Boundary

- Browser state may contain session-only `blob:` or loopback playback URLs, but they are rejected by central media contracts and never persisted.
- `/api/video-analysis` stores camera synchronization metadata and immutable export evidence only: source IDs, match-time range, preset, layer summary, byte size, and SHA-256 hashes.
- The local loopback engine receives source bytes only after an explicit analyst action, enforces origin plus expiring session capability, bounds input/range/queue/concurrency, writes atomically, and serves results through expiring access tokens.
- A completed render is not a portable share until the analyst explicitly publishes it through the separately authorized package flow with presentation-derived recipient access.
- Supported static drawings and confidence-qualified dynamic graphics are compiled into a bounded, checksummed ASS overlay and burned into the local MP4. Tracking discontinuities intentionally produce visible gaps rather than fabricated motion.
- Live capture requires progressive File System Access. Cancelling before or during media permission aborts the reserved file, stops late streams, and cannot publish a partial camera angle; completed captures are linked with their match-time offset and remain device-local.
- Scrub proxies are content-addressed by streaming source SHA-256 plus profile, generated with bounded resolution and keyframe cadence, reused inside the quota-managed device cache, and served with expiring byte-range access. Replay buffers are short re-encoded segments derived from an authorized proxy, never a second source upload, and their temporary video clock is explicitly mapped back to match time.
- The downloadable MP4 plus checksum manifest is first a device-local artifact. Explicit publishing verifies the artifact in the local companion, uploads it to a private content path, preserves recipient authorization in metadata, and returns only short-lived playback/download capabilities. The recipient does not need the original source file, and the publisher can revoke the review.
