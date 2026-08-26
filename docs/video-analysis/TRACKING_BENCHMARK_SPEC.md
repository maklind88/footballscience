# FS Player Tracking Benchmark v1

## Purpose

Tracking quality must be measured against independent ground truth before a provider can be described as production-ready. Visual inspection remains useful for review, but it is not an acceptance test.

The benchmark is local-first and provider-neutral. It evaluates normalized metadata only. Raw video, local paths, object URLs, signed URLs, frames, binary buffers, and base64 media are rejected by the contract and never copied into a report.

## Source Of Truth

- The analyst's local match video remains on the device.
- A benchmark case references that source only by a SHA-256 fingerprint.
- Human-reviewed ground-truth points are the benchmark truth for the selected time range.
- The provider run captured before any analyst correction is the prediction under test.
- Ground truth and provider runs are exported as separate immutable artifacts. Their validated SHA-256 hashes are bound into the assembled benchmark and final provider evidence.
- Ground truth and raw runs remain in the local FS Player workspace and are excluded from the centrally saved presentation payload. The working copy is restored from a versioned IndexedDB record scoped to the exact organization, team, authenticated user, and match source. Atomic debounced writes flush before a match switch, while per-item, total-run, and serialized-byte budgets fail visibly before one workspace can grow without bound.
- The generated report contains metrics, thresholds, failed gates, and bounded worst-sample timestamps, but no track arrays or media references.

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

## Initial Profile

`selected-player-pilot-v1` is an explicit, calibratable starting gate for a single prompted player. It is not presented as a universal industry standard. Threshold changes require a versioned profile or explicit case override so historical reports remain reproducible.

Run one case or a suite locally:

```bash
npm run fs-player:tracking:benchmark -- --input /absolute/local/benchmark.json
npm run fs-player:tracking:benchmark -- --input /absolute/local/suite.json --output /absolute/local/report.json --json
npm run fs-player:tracking:assemble -- --ground-truth /absolute/local/ground-truth-suite.json --runs /absolute/local/provider-runs.json --output /absolute/local/benchmark.json
npm run fs-player:tracking:smoke -- --json
npm run fs-player:tracking:smoke -- --batch --json --progress
npm run fs-player:tracking:trackeval:plan
npm run fs-player:tracking:trackeval:install -- --accept-license --python /absolute/path/to/python3.12
npm run fs-player:tracking:trackeval:preflight -- --json
npm run fs-player:tracking:benchmark -- --input /absolute/local/football-scene.json --trackeval --output /absolute/local/report.json --json
```

Exit code `0` means every active quality gate passed, `1` means valid evidence failed one or more thresholds, and `2` means the input was invalid or unsafe.

The engine smoke command is a separate operational check. It creates a one-second synthetic local video, invokes the exact installed SAM 2.1 runtime, validates that more than one timestamp was propagated through the strict artifact boundary, reports cold-start processing time and real-time factor against the reference maximum of `1`, returns only bounded aggregate evidence, and deletes the video and trajectories before exit. The explicit `--batch` mode generates two targets, runs one shared video state and two repeated single-target jobs, and reports the measured speedup without turning it into a quality claim. Passing either mode proves installation and inference wiring, not acceptable speed or football accuracy; `withinReferenceBudget` and `realMatchQualityProven` remain independent fail-visible facts.

`--trackeval` is deliberately explicit. Without it, a multi-object report remains `providerApprovalReady: false`. With it, the report contains only bounded metric evidence and hashes, never source paths, raw tracks, frames, or media. Real provider approval still requires human-verified real-match cases and reviewed model/data provenance.

## Provider Approval Evidence

A provider manifest cannot self-assert benchmark approval. FS Player creates a separate `football-science-tracking-provider-evidence-v1` artifact from the exact metadata-only benchmark report. Creation requires every case to pass, at least ten attested real-match minutes, one profile across the suite, capability-specific metrics, and valid `football-science-tracking-provider-run-evidence-v1` data from the assembler. Detection, association, and re-identification additionally require verified TrackEval metrics and exact internal/reference cross-validation.

The evidence binds the provider id/version, protocol, stage, capabilities, exact execution fingerprint, full reviewed manifest fingerprint, upstream source commit and checksum, every model checksum, model card and training-dataset provenance, runtime limits, benchmark report, source set, ground-truth suite checksum, provider-run suite checksum, exact run-id set, and review date. The execution fingerprint answers exactly what code/model/runtime ran; the separate manifest fingerprint also binds licence, provenance, policy and resource limits. Learned providers must identify every training/finetuning dataset with version, source and terms, and record separate reviews for usage rights. Re-identification and shirt-number providers additionally require an explicit identity-use review. Runtime readiness requires the evidence artifact and original report, regenerates the evidence, and rejects any changed model, source, dataset record, capability, threshold, metric, raw-run reference, report, or manifest benchmark field.

Capabilities are approved independently and the approval layer enforces policy floors even when a benchmark input supplies weaker overrides. Player, ball, and referee detection have separate precision and recall gates. Association uses continuity, HOTA and AssA. Player re-identification uses internal and TrackEval IDF1. Team classification has its own accuracy gate. Shirt-number accuracy is measured separately and its threshold is deliberately inactive unless that capability is being evaluated, so missing or unreadable shirt numbers cannot be disguised by player identity accuracy.

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
2. Track and correct every visible player, the ball, and referees across the benchmark range. Brief appearances use their declared visible segment rather than being forced to span the whole range.
3. Assign player identity and team side, then verify every reference track with no annotation gap above 500 ms and at least 80% review coverage of each declared visible span. Locked trajectories are deterministically reduced to that cadence while preserving manual corrections and occlusion transitions.
4. Add the verified tracks to `Benchmark reference`, choose one included player as the selected-object benchmark target, refresh the exact source/frame evidence, and classify the football scenarios in the range.
5. Separately attest that every visible player, ball, and referee is included and that the selected tracks were reviewed frame by frame. Both attestations reset after any relevant track or source/range change.
6. Lock the reference. The locked artifact is added to the local real-match suite automatically.
7. Repeat with at least five reviewed ranges until the suite contains ten unique minutes and covers transition, crowded-box, occlusion, camera-motion/cut, set-piece, and compact-unit scenarios.
8. Export the immutable `football-science-ground-truth-suite-v1` and `football-science-tracking-provider-run-suite-v1` files. Assemble them with `fs-player:tracking:assemble`; any missing/duplicate target, source/range/frame mismatch, changed provider build, corrected provider point, non-positive processing time, malformed input, or checksum mismatch fails closed.

Locking creates a new revisioned snapshot. Later edits to live tracks do not mutate the locked reference. The artifact contains reviewed normalized trajectories, source fingerprint, frame/range, object identity, and bounded analyst evidence. Provider metadata, confidence values, correction authors, local paths, URLs, video, frames, and binary data are removed. Ground truth is not written through the central tracking repository.

The suite treats time as unique only within each exact source fingerprint and camera angle. Overlapping ranges are merged before duration is counted, and relocking the same source, angle, and range replaces that case instead of inflating the evidence. Readiness is fail-closed when a case is malformed, sparse, unattested, missing required entities, below five cases, below ten unique minutes, or missing a required football scenario. Twenty unique minutes remains the recommended pilot ceiling rather than an approval shortcut.

The assembler matches artifacts only by exact source fingerprint, camera angle, time range, and frame. Segmentation evaluates exactly the selected player target and requires one matching raw prediction. Multi-object stages combine disjoint runs for the same case and reject duplicate track ids. The resulting metadata-only benchmark carries both input checksums and the exact used run ids through evaluation and provider approval. Until this workflow has produced a representative reviewed suite from real matches, synthetic fixtures prove evaluator correctness but do not prove elite football performance.

## Provider Boundary

Future tracking intelligence remains split into replaceable local providers:

1. Detection proposes player, ball, and referee observations.
2. Segmentation/refinement improves the selected object mask and box.
3. Re-identification maintains identity through occlusion and cuts.
4. Team and shirt classification add confidence-gated identity evidence.
5. The tracker fuses observations into continuity segments and exposes uncertainty.

SAM 2.1 remains the selected-object propagation provider and fallback. Detection, re-identification, and classification providers must have pinned versions, verified source/model/runtime checksums, reviewed licences, no inference-time network dependency, bounded input duration, wall time, memory, output size, concurrency, and the same benchmark evidence before activation.

All stage outputs use `football-science-tracking-stage-result-v1`. Serialized output is size-bounded and UTF-8 validated before JSON parsing. The local validator then binds the result to the exact provider fingerprint, declared capabilities, source fingerprint, and requested time range before applying a stage-specific allowlist. Detection cannot emit player identities; association cannot reuse or invent observations; re-identification cannot emit embeddings, frames, paths, or Football Science identities; team/shirt classification is limited to known player trajectories; and ball/referee detection is approved and measured independently. Candidate mode exists only to create benchmark predictions. Activated mode additionally regenerates provider readiness from the exact manifest, report, and evidence and fails closed on any mismatch.
