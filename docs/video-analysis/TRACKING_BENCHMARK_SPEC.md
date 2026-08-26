# FS Player Tracking Benchmark v1

## Purpose

Tracking quality must be measured against independent ground truth before a provider can be described as production-ready. Visual inspection remains useful for review, but it is not an acceptance test.

The benchmark is local-first and provider-neutral. It evaluates normalized metadata only. Raw video, local paths, object URLs, signed URLs, frames, binary buffers, and base64 media are rejected by the contract and never copied into a report.

## Source Of Truth

- The analyst's local match video remains on the device.
- A benchmark case references that source only by a SHA-256 fingerprint.
- Human-reviewed ground-truth points are the benchmark truth for the selected time range.
- The provider run captured before any analyst correction is the prediction under test.
- Every new provider run also captures a bounded non-identifying execution profile: device class, runtime mode, CPU thread count, effective sample rate, model residency, and whether the resident worker was reused. Hostname, username, serial number, local path, and raw hardware identifiers are never recorded.
- Ground truth and provider runs are materialized as separate immutable artifacts. Their exact pretty-JSON byte serializations are SHA-256 hashed, bound into the assembled benchmark, and preserved with the final report in one portable evidence set.
- Ground truth and raw runs remain in the local FS Player workspace and are excluded from the centrally saved presentation payload. The working copy is restored from a versioned IndexedDB record scoped to the exact organization, team, authenticated user, and match source. Atomic debounced writes flush before a match switch, while per-item, total-run, and serialized-byte budgets fail visibly before one workspace can grow without bound.
- The generated report contains metrics, thresholds, failed gates, and bounded worst-sample timestamps, but no media references. The portable evidence set additionally contains the exact reviewed trajectories and raw provider trajectories needed to reproduce the report; it remains a deliberate device-local download and is never included in central presentation persistence.

## In-Product Evidence Workflow

FS Player owns the complete benchmark flow in the tracking sidebar. Once the real-match suite, matching raw provider runs, exact provider build, and required evaluator are ready, `Run benchmark` performs the following fail-closed sequence:

1. Materialize and validate the exact ground-truth and provider-run suite artifacts at one revision.
2. SHA-256 hash their declared `pretty-json-lf-v1` serializations and bind both hashes plus the exact run-id set into the assembled metadata-only benchmark.
3. Send only that bounded benchmark JSON through an origin- and session-protected loopback job. No raw video, local path, URL, frame buffer, or model secret crosses the boundary.
4. Recompute selected-object metrics in the local companion, or compute the internal football-scene diagnostic plus the pinned TrackEval reference for multi-object evidence.
5. Cross-check internal MOTA and IDF1 against TrackEval, verify the expected evaluator commit and source checksum, and reject changed or incomplete reference evidence.
6. Recompute the browser-side source signature before accepting the result. Any ground-truth, provider-run, provider-build, or reference-runtime change during evaluation invalidates the run.
7. Export one `football-science-tracking-benchmark-evidence-set-v1` JSON containing the exact inputs, checksums, report, source signature, and evaluator identity.

The job exposes bounded progress and can be cancelled. The active session token remains controller-private, reports are capped at 16 MiB, the assembled request at 64 MiB, and neither the result nor the evidence set is written to the central API automatically. The CLI remains a reproducibility and offline-audit path, not a required product workflow.

## Selected-Object Metrics

The v1 evaluator measures:

- visible ground-truth coverage
- box overlap as mean, median, and p10 IoU
- centre and ground-point error in normalized coordinates and pixels
- continuity breaks and maximum tracking gap
- manual corrections per minute
- entity, team, and player identity accuracy
- detection-confidence Brier score
- processing time as a real-time factor

Prediction samples may be interpolated only inside one continuity segment and only across a bounded time gap. The evaluator never fabricates motion across an occlusion break or cut.

## Multi-Object Football Scene

`football-scene-pilot-v1` evaluates every human-annotated ground-truth timestep across players, ball, and referees. Spatial matching is globally optimal per frame rather than greedy. The internal diagnostic reports:

- detection precision, recall, F1, IoU, false positives, and false negatives
- entity, team, shirt/player identity, and confidence calibration
- identity switches, trajectory fragmentation, mostly tracked/lost, and correction load
- separate player, ball, and referee coverage
- internal diagnostic MOTA and IDF1 for immediate review feedback

Internal MOTA and IDF1 are diagnostics, not the independent provider approval result. Provider evidence additionally requires the pinned official TrackEval implementation. TrackEval independently recomputes IoU and returns HOTA, DetA, AssA, LocA, CLEAR/MOTA, and Identity/IDF1 for the full scene and each entity class.

The initial reference gates are explicit and versioned: HOTA 0.65, DetA 0.75, AssA 0.65, LocA 0.75, MOTA 0.80, and IDF1 0.85. These are pilot acceptance thresholds, not claims of universal industry standards. Threshold changes remain part of the benchmark input and report so old evidence stays reproducible.

The packaged reference is pinned to TrackEval commit `12c8791b303e0a0b50f753af204249e622d0281a`, source SHA-256 `435f0e6d865918332155f8104a98a04d50c2c3de5b985b96c8a71a0f5b62a0ac`, and the MIT licence. Installation creates an isolated Python environment and evaluation performs no network requests.

## Evidence Profiles

FS Player separates two scientific questions instead of forcing one annotation protocol onto every provider:

- `selected-player-pilot-v1` measures one explicitly prompted and frame-reviewed player for segmentation and propagation providers such as SAM 2.1. The locked reference contains exactly that player. Ball, referee, and exhaustive-scene attestation are neither requested nor claimed.
- `football-scene-pilot-v1` measures every visible player, ball, and referee for detection, association, re-identification, and classification providers. It retains the exhaustive-scene attestation and pinned TrackEval requirement.

A suite declares one benchmark type before evidence is collected. Every locked case must match it, the type and profile are included in immutable case and suite evidence, and the mode is locked once cases or raw provider runs exist. Mixed suites and attempts to send selected-object evidence through the full-scene evaluator fail closed. A new local workspace starts in selected-object mode because that matches the installed SAM provider; imported legacy evidence without an explicit type remains full-scene for backward compatibility.

Both profiles are explicit, calibratable pilot gates rather than universal industry standards. Threshold changes require a versioned profile or explicit case override so historical reports remain reproducible.

Run one case or a suite locally:

```bash
npm run fs-player:tracking:benchmark -- --input /absolute/local/benchmark.json
npm run fs-player:tracking:benchmark -- --input /absolute/local/suite.json --output /absolute/local/report.json --json
npm run fs-player:tracking:assemble -- --ground-truth /absolute/local/ground-truth-suite.json --runs /absolute/local/provider-runs.json --output /absolute/local/benchmark.json
npm run fs-player:tracking:smoke -- --json
npm run fs-player:tracking:smoke -- --batch --json --progress
npm run fs-player:tracking:smoke -- --warm --json
npm run fs-player:tracking:trackeval:plan
npm run fs-player:tracking:trackeval:install -- --accept-license --python /absolute/path/to/python3.12
npm run fs-player:tracking:trackeval:preflight -- --json
npm run fs-player:tracking:benchmark -- --input /absolute/local/football-scene.json --trackeval --output /absolute/local/report.json --json
```

Exit code `0` means every active quality gate passed, `1` means valid evidence failed one or more thresholds, and `2` means the input was invalid or unsafe.

The engine smoke command is a separate operational check. It creates a one-second synthetic local video, invokes the exact installed SAM 2.1 runtime, validates that more than one timestamp was propagated through the strict artifact boundary, returns only bounded aggregate evidence, and deletes the video and trajectories before exit. The explicit `--batch` mode generates two targets, runs one shared video state and two repeated single-target jobs, and reports the measured speedup without turning it into a quality claim. The explicit `--warm` mode runs the same target twice in one resident process and proves the worker generation, model residency, job sequence, cold start, model load, first-job latency, warm-job latency, and recovery boundary. Passing any smoke mode proves installation and inference wiring, not acceptable speed or football accuracy; `withinReferenceBudget`, `warmWithinReferenceBudget`, and `realMatchQualityProven` remain independent fail-visible facts.

The reference workstation measurement for provider `1.3.0` on 2026-08-26 used the verified macOS profile of eight CPU threads and an effective 6.25 sampled frames per second. Two consecutive strict process runs measured warm end-to-end inference at 7.394 and 7.501 seconds for one second of synthetic video. The first post-install run measured 2.064 seconds worker startup, 1.358 seconds model load, and 10.086 seconds first-job latency; an immediate process restart loaded faster from OS caches without materially changing warm inference. Across the final runs, frame sampling took 33-76 ms and forward SAM propagation took 6.450-6.506 seconds. Bounded stage telemetry is checked against the worker wall time, requested object count, resident device, effective sample rate, thread count, and model-load identity before it is accepted. Model reuse and the bottleneck location are therefore verified, while the 7.394-7.501 warm real-time factor explicitly fails the reference maximum of 1. This measurement is an optimization baseline, not provider approval. Performance work must improve or replace the selected-object inference path without weakening trajectory quality, then repeat both synthetic and real-match evidence.

`--trackeval` is deliberately explicit. Without it, a multi-object report remains `providerApprovalReady: false`. With it, the report contains only bounded metric evidence and hashes, never source paths, raw tracks, frames, or media. Real provider approval still requires human-verified real-match cases and reviewed model/data provenance.

## Provider Approval Evidence

A provider manifest cannot self-assert benchmark approval. FS Player creates a separate `football-science-tracking-provider-evidence-v1` artifact from the exact metadata-only benchmark report. Creation requires every case to pass, at least ten unique attested real-match minutes, one evidence profile across the suite, one complete execution profile across every raw run, capability-specific metrics, a measured real-time factor at or below the non-overridable `1.0x` workstation policy, and valid `football-science-tracking-provider-run-evidence-v1` data from the assembler. A benchmark profile may require faster execution but cannot weaken this policy floor. Mixed device/runtime/sample profiles, missing execution telemetry, mismatched run counts, or impossible resident-worker reuse fail closed. Older local raw runs remain readable but cannot be exported as approval evidence until rerun with complete telemetry. Overlapping ranges from the same exact source fingerprint are merged, and a forged evidence duration that differs from the case range is rejected. Detection, association, and re-identification additionally require verified TrackEval metrics and exact internal/reference cross-validation.

The evidence binds the provider id/version, protocol, stage, capabilities, exact execution fingerprint, full reviewed manifest fingerprint, upstream source commit and checksum, every model checksum, model card and training-dataset provenance, runtime limits, execution profile and reuse count, benchmark report, source set, ground-truth suite checksum, provider-run suite checksum, exact run-id set, and review date. The execution fingerprint answers exactly what code/model/runtime package ran; the separate execution profile answers how that package ran for the measured result; and the manifest fingerprint also binds licence, provenance, policy and resource limits. Learned providers must identify every training/finetuning dataset with version, source and terms, and record separate reviews for usage rights. Re-identification and shirt-number providers additionally require an explicit identity-use review. Runtime readiness requires the evidence artifact and original report, regenerates the evidence, and rejects any changed model, source, dataset record, capability, threshold, metric, execution profile, raw-run reference, report, or manifest benchmark field.

Capabilities are approved independently and the approval layer enforces policy floors even when a benchmark input supplies weaker overrides. The real-time policy is universal rather than capability-specific and missing latency evidence fails closed. Player, ball, and referee detection have separate precision and recall gates. Association uses continuity, HOTA and AssA. Player re-identification uses internal and TrackEval IDF1. Team classification has its own accuracy gate. Shirt-number accuracy is measured separately and its threshold is deliberately inactive unless that capability is being evaluated, so missing or unreadable shirt numbers cannot be disguised by player identity accuracy.

Create evidence after the real-match report passes, then verify it again after copying the generated benchmark fields into the reviewed provider manifest:

```bash
npm run fs-player:tracking:provider:evidence -- --manifest /absolute/local/provider-manifest.json --report /absolute/local/report.json --output /absolute/local/provider-evidence.json
npm run fs-player:tracking:provider:evidence -- --manifest /absolute/local/approved-provider-manifest.json --report /absolute/local/report.json --evidence /absolute/local/provider-evidence.json
```

The command never changes approval status. Licence, model-data provenance, and redistribution review remain explicit human decisions.

## Analyst Review Workflow

Tracking review is a local, append-only correction workflow rather than an automatic confidence override. Each selected track exposes a bounded chronological queue for low detection confidence, low player-identity confidence, sparse tracking, and continuity breaks. Previous and next navigation seeks in match time so the same review flow remains correct across synchronized camera angles.

Analysts can correct the box, assign or confirm player identity, and mark a frame occluded or visible. Identity confirmation affects the reviewed frame and does not silently raise confidence across the rest of the trajectory. The latest 20 local changes are reversible with undo and redo; correction audit records remain append-only. A monotonically increasing local revision prevents a late persistence response from overwriting a newer correction or undo.

Every track change returns the track to review status and invalidates any unlocked frame-by-frame benchmark attestation. Locked ground-truth artifacts remain immutable. Verification is enabled only after the remaining continuity, detection, and identity gates pass.

The on-device workspace is reload protection, not an external backup. Its status is visible beside the real-match suite, unrelated playhead updates do not rewrite it, and a different user or match scope cannot restore it. Clearing browser site data can still remove IndexedDB, so the exported ground-truth and provider-run suites remain the portable long-term evidence and the inputs to the checksum-bound assembler.

Ordinary tracking trajectories use a separate versioned local workspace with the same privacy boundary. Dense samples are split into bounded per-segment chunks and scoped to the exact organization, team, authenticated user, source, and clip. FS Player retains those samples before attempting the metadata-only central write. If that write fails, the track remains usable and visibly device-only; retry reconciles the stable local workspace key to the generated central track ID and updates live selections and graphic bindings atomically. Ambiguous identity keys, incomplete chunks, changed byte counts, unsafe media fields, and cross-scope restores fail closed.

Every correction audit is also retained before its central request in a separate metadata-only IndexedDB outbox. The record has a strict allowlist, byte and count budgets, no media/path fields, the exact workspace scope, and an immutable client-generated operation id. Offline retry reuses that id; Postgres accepts an identical replay once, rejects changed content, and keeps the audit queued on the device if either the lookup or write outcome is uncertain. Track-id reconciliation migrates queued audits before retry. The workspace exposes pending audits and clears the warning only after central confirmation.

Structural repair is explicit and sample-preserving. `Split at playhead` partitions only existing samples, keeps the prefix identity, and creates a new client-UUID continuation whose player, team, shirt number, and identity confidence are cleared for review. It never interpolates a synthetic boundary point. `Swap after playhead` is enabled only for two different identified player tracks in the same clip with samples on both sides and spatially plausible joins; it exchanges trajectory continuations while preserving the two player identities and total sample count. The first sample after each repaired join is marked as manually identity-confirmed.

Split and identity swap are compound correction transactions. Both affected tracks, selected-track state, and dynamic-graphic bindings change atomically in memory and share one audited operation group. Undo of a split restores the original track, remaps graphics from the temporary continuation, and archives that continuation centrally only after its active metadata writes have completed. Redo recreates the same stable client track id and binding migration. Identity-swap undo and redo restore both trajectories together. Local persistence is serialized in user-action order, so an immediate undo cannot race ahead of the initial structural write.

Client-generated track creation is idempotent at the central boundary. A serial retry updates the same UUID. If two identical create attempts race, FS Player adopts and updates the database winner only when tenant scope, clip id, UUID, and the exact local workspace track key all match; a reused UUID with different content fails with a conflict rather than being overwritten.

## Real Match Pilot

The first real benchmark should contain at least one legally usable tactical wide-angle match source, preferably 1080p or better. The pilot should be a suite of reviewed windows totalling 10-20 minutes. Each locked case is bounded to two minutes for reliable human review, reproducible memory use, and safe local evaluation. A second synchronized angle is useful but not required.

The selected range should deliberately include:

- fast transitions and direction changes
- crowded penalty-area play
- partial and full player occlusions
- camera pan, tilt, zoom, and at least one cut if present in normal use
- set pieces and compact team units
- similar shirt colours or difficult lighting when available

The user only needs to reconnect the source in FS Player or provide its absolute local path for the local benchmark session. No advance annotation is required. The local tracking or proxy job computes the SHA-256 source fingerprint while receiving the source; it is not inferred from a file name or mutable metadata.

FS Player now creates the reference through the tracking sidebar:

1. Run the provider before manual corrections. FS Player captures the normalized automatic output, exact provider fingerprint, source/range/frame, and measured positive processing time as an immutable `football-science-tracking-provider-run-v1` snapshot.
2. Choose `Selected object` for one prompted-player propagation or `Full scene` for detection, association, re-identification, and classification evidence. The mode cannot change after the suite contains a case or raw run.
3. In selected-object mode, track and correct exactly the prompted player. In full-scene mode, track and correct every visible player, ball, and referee; brief appearances use their declared visible span rather than being forced across the full range.
4. Assign the required player and team identity, then verify every reference track with no annotation gap above 500 ms and at least 80% review coverage. Locked trajectories are deterministically reduced to that cadence while preserving manual corrections and occlusion transitions.
5. Add the reference, refresh exact source/frame evidence, and classify the scenarios. Selected-object mode automatically makes the included player the benchmark target and requires only frame-by-frame target review. Full-scene mode additionally requires an exhaustive-scene attestation and one included player target.
6. Lock the reference. The locked artifact is added to the local real-match suite automatically.
7. Repeat with at least five reviewed ranges until the suite contains ten unique minutes and covers transition, crowded-box, occlusion, camera-motion/cut, set-piece, and compact-unit scenarios.
8. Run the benchmark directly in the suite panel and export the immutable `football-science-tracking-benchmark-evidence-set-v1`. Any missing/duplicate target, source/range/frame mismatch, changed provider build, corrected provider point, non-positive processing time, malformed input, TrackEval drift, or checksum mismatch fails closed. Separate suite exports and `fs-player:tracking:assemble` remain available for independent audit.

Locking creates a new revisioned snapshot. Later edits to live tracks do not mutate the locked reference. The artifact contains reviewed normalized trajectories, source fingerprint, frame/range, object identity, and bounded analyst evidence. Provider metadata, confidence values, correction authors, local paths, URLs, video, frames, and binary data are removed. Ground truth is not written through the central tracking repository.

The suite treats time as unique only within each exact source fingerprint and camera angle. Overlapping ranges are merged before duration is counted, and relocking the same source, angle, and range replaces that case instead of inflating the evidence. Readiness is fail-closed when a case is malformed, sparse, unattested, profile-mismatched, missing the entities required by its profile, below five cases, below ten unique minutes, or missing a required football scenario. Twenty unique minutes remains the recommended pilot ceiling rather than an approval shortcut.

The assembler matches artifacts only by exact source fingerprint, camera angle, time range, and frame. Segmentation evaluates exactly the selected player target and requires one matching raw prediction. Multi-object stages combine disjoint runs for the same case and reject duplicate track ids. The resulting metadata-only benchmark carries both input checksums and the exact used run ids through evaluation and provider approval. Until this workflow has produced a representative reviewed suite from real matches, synthetic fixtures prove evaluator correctness but do not prove elite football performance.

## Provider Boundary

Future tracking intelligence remains split into replaceable local providers:

1. Detection proposes player, ball, and referee observations.
2. Segmentation/refinement improves the selected object mask and box.
3. Re-identification maintains identity through occlusion and cuts.
4. Team and shirt classification add confidence-gated identity evidence.
5. The tracker fuses observations into continuity segments and exposes uncertainty.

SAM 2.1 remains the selected-object propagation provider and fallback. Detection, re-identification, and classification providers must have pinned versions, verified source/model/runtime checksums, reviewed licences, no inference-time network dependency, bounded input duration, wall time, memory, output size, concurrency, and the same benchmark evidence before activation.

An approved future stage is discoverable only through the local `football-science-tracking-provider-registry-v1` boundary. Its installation marker binds the exact canonical manifest, original report, reproducible evidence, sealed runtime, and every model artifact by relative path, byte count, and SHA-256. Registry discovery rejects links, path escape, duplicate provider ids, changed artifacts, and self-consistently rehashed reports whose evidence no longer reproduces. The browser receives bounded public capability metadata only; registry readiness is not permission to execute the provider and remains `activation pending` until a separate stage runner passes its boundary.

All stage outputs use `football-science-tracking-stage-result-v1`. Serialized output is size-bounded and UTF-8 validated before JSON parsing. The local validator then binds the result to the exact provider fingerprint, declared capabilities, source fingerprint, and requested time range before applying a stage-specific allowlist. Detection cannot emit player identities; association cannot reuse or invent observations; re-identification cannot emit embeddings, frames, paths, or Football Science identities; team/shirt classification is limited to known player trajectories; and ball/referee detection is approved and measured independently. Candidate mode exists only to create benchmark predictions. Activated mode additionally regenerates provider readiness from the exact manifest, report, and evidence and fails closed on any mismatch.
