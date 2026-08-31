# FS Player Tracking Provider Decision

## Decision

Tracking Intelligence v2 uses a local, replaceable five-stage pipeline:

1. detection for player, ball, and referee observations
2. segmentation and selected-object propagation
3. multi-object association
4. player re-identification
5. team and shirt classification

No candidate is activated by installation alone. The provider contract requires a pinned source commit, source, model, and packaged-runtime SHA-256 hashes, explicit code and model licences, model-card and training-dataset provenance, bounded input duration, wall time, memory, output size, and concurrency, inference with no network access, and capability-specific real-match benchmark evidence. Re-identification and shirt-number providers need a separate reviewed identity-use decision for every declared training dataset. Readiness also requires the original metadata-only report and a reproducible provider-evidence artifact bound to the exact source, models, provenance, runtime limits, capabilities, thresholds, and report hash.

SAM 2.1 remains the installed, approved selected-object propagation engine and safe manual-prompt fallback. Provider `1.3.0` can propagate 2-8 analyst-selected objects in one shared video state when every prompt uses the same frame and synchronized range. It keeps the verified model resident across sequential bounded jobs, while every job creates and resets its own video state. Cancellation, timeout, protocol drift, inconsistent runtime identity, or invalid stage telemetry terminates that worker generation before another job can run. It still returns separate review tracks and is not treated as an automatic detector or a re-identification engine.

FS Player exposes that distinction in a fail-honest tracking-readiness matrix. The installed SAM provider can make only the selected-object row available; it can never promote player/ball/referee detection, association/re-identification, or team/shirt classification. Partial future provider sets remain visibly incomplete, and full-scene readiness appears only when every required capability is installed. Match evidence and TrackEval readiness remain separate statuses rather than being inferred from installation.

Future stage providers enter the companion through `football-science-tracking-provider-registry-v1`, a read-only local trust boundary. Each installation has one strict `football-science-tracking-provider-installation-v1` marker that binds the canonical provider manifest, original benchmark report, reproducible evidence artifact, sealed runtime artifact, and exact model files by path, byte size, and SHA-256. The registry rejects path escape, symbolic links, duplicate provider identities, hidden manifest fields, changed runtime/model bytes, and a locally rehashed report that no longer reproduces its evidence. It exposes only bounded capability metadata and reason codes to FS Player; local paths, source URLs, model records, reports, and evidence remain private. Registration proves readiness metadata only and never executes provider code.

Execution is a second independent gate. `football-science-tracking-stage-execution-v1` privately resolves the exact verified installation, accepts only one sealed native executable, and on macOS runs it through a default-deny sandbox with network denied. Runtime, model, and source inputs must be regular non-link files, are write-sealed, and bind SHA-256, size, inode, device, mode, modification time, and change time before execution. The same descriptor identity is checked after the process exits and before output is accepted, so a provider or match-source change invalidates the result even if the child reports success. The child receives a scrubbed environment and only the verified provider/model tree, exact session-owned match source, system runtime files, and a private job directory. Output size, wall time, process-group resident memory, provider concurrency, cancellation, provider fingerprint, stage inputs, and the final `football-science-tracking-stage-result-v1` artifact are enforced independently. The public registry reports `executionAvailable` only after both registry and sandbox preflights pass. A provider that is evidence-ready but lacks this executable boundary remains visibly `activation pending`.

Candidate evidence has a deliberately separate path to avoid an approval cycle. `football-science-tracking-candidate-registry-v1` accepts only canonical manifests whose approval state is `candidate`, whose inference network is disabled, and whose licence, training data, dataset rights, runtime, and model hashes are reviewable. It omits benchmark report/evidence because those are the artifacts the candidate run must produce. The same sandbox executor is used in `benchmark-candidate` mode, but the companion exposes a distinct route and marks the registry, job, and client result `benchmarkOnly`. The activated parser still rejects that manifest. Moving a candidate into the approved registry requires a new exact installation marker containing the passed report and reproducible evidence; files are not promoted by changing a status flag in place.

The candidate registry now has one official local installer rather than relying on hand-built directory layouts. It takes a canonical manifest and exact local artifacts, requires explicit licence acceptance, rejects symbolic links and model-set drift, copies through stable open descriptors, checks source identity before and after every copy, seals runtime/models read-only, and performs an atomic no-overwrite install under a per-registry lock. The installation is removed if registry resolution or native sandbox preflight fails. `tracking:candidate:plan`, `tracking:candidate:install`, and `tracking:candidate:preflight` deliberately have no network downloader and never turn a candidate into an approved provider.

Operational readiness has two local checks. `fs-player:tracking:preflight` verifies the pinned install, full manifest, Football Science runtime hash, exact upstream execution tree, checkpoint, Python, PyTorch, device, and FFmpeg. `fs-player:tracking:smoke` additionally performs real model inference over generated synthetic video, validates propagation through the production artifact boundary, and removes all temporary media. The fixture uses a deterministic textured pitch and two internally striped targets; a flat-color fixture is not a valid propagation test because it gives a segmentation model no stable visual boundary after the prompt frame. With `--batch`, the smoke compares one shared-state two-object run against two repeated single-target jobs. With `--warm`, it runs the same target twice in one resident worker and separately reports startup, model load, first-job, and warm-job latency.

The installed `1.3.0` checks on 2026-08-26 are deliberately reported without hiding latency. The verified macOS profile uses eight CPU threads and an effective 6.25 sampled frames per second. Two consecutive strict process runs completed the identical warm one-second fixture in 7.394 and 7.501 seconds, a 7.394-7.501 real-time factor against the reference maximum of 1. The first post-install run loaded the resident worker in 2.064 seconds, including 1.358 seconds of model load, and completed its first job in 10.086 seconds. An immediate process restart benefited from OS caches and started faster, but did not improve warm inference. Across the final runs, sampling took 33-76 ms and forward propagation took 6.450-6.506 seconds. Forward propagation consistently consumed about 87% of end-to-end latency, so lowering media-quality or weakening output checks would not solve the measured bottleneck. Both runs produced the same 6 points, 80% observed coverage, and 0.966 mean confidence. A same-provider MPS comparison produced denser synthetic output, 13 points at 96% coverage and 0.994 confidence, but its 24.959-second warm job was more than three times slower than CPU. macOS therefore defaults to CPU while reviewed device and thread-count overrides remain available for comparison. Resident reuse, runtime identity, stage measurement, and inference wiring are proven; workstation-speed approval and real-match football quality are not. Only the representative real-match benchmark can establish football quality.

The 2026-08-31 branch verification preserves that fail-visible result. Provider preflight passed for the exact `1.3.0` CPU installation with eight threads, PyTorch `2.5.1`, no inference network, and the pinned checkpoint. The warm smoke returned the same 6 points, 80% observed coverage, and 0.966 mean confidence, but required 8.221 seconds for one second of video; `warmWithinReferenceBudget` and `realMatchQualityProven` therefore remained false. The native stage-runner probe separately passed the real macOS default-deny sandbox, proved network denial, emitted no stdout/stderr, and accepted only 29 bounded result bytes after input-identity revalidation. These are operational and isolation proofs, not substitute football-quality evidence.

## Benchmark Evidence Profiles

Segmentation/propagation and full-scene tracking use separate ground-truth contracts. `selected-player-pilot-v1` contains exactly one prompted, verified player and measures only the selected-object capability that SAM claims. `football-scene-pilot-v1` contains every visible player, ball, and referee, requires an exhaustive-scene attestation, and remains mandatory for detection, association, re-identification, and classification approval through TrackEval. One suite can contain only one profile, and its type becomes immutable when a locked case or raw provider run exists. This reduces unnecessary annotation for the installed SAM benchmark without weakening any future full-scene approval requirement.

## Execution Result Boundary

Every future pipeline stage returns `football-science-tracking-stage-result-v1` through one strict local validator. Serialized output is size-bounded and UTF-8 validated before parsing. The result is then bound to the exact provider runtime fingerprint, capability set, video-source fingerprint, requested time range, and a canonical SHA-256 fingerprint of the complete stage request before any value can reach FS Player. Detection binds the source/range request; segmentation binds geometry-only prompts; association binds complete ordered observations; and re-identification/classification bind complete trajectories containing those observations. Nested unknown fields, changed ordering, hidden media/identity data, or cross-provider inputs therefore invalidate the result instead of silently creating a mixed pipeline run.

- detection may return only bounded boxes, timestamps, entity class, and confidence for separately approved player, ball, or referee capabilities
- association may reference each known observation at most once and cannot introduce identity data
- re-identification may return only an opaque device-local identity key and confidence for known player trajectories; embeddings, images, paths, and player identities are rejected
- team and shirt classification may return only capability-approved labels and confidence for known player trajectories; it cannot assign a Football Science player identity or classify a ball/referee
- segmentation reuses the existing bounded selected-object track validator

Candidate outputs can pass this structural boundary for benchmark evaluation, but normal activation uses the stricter activated boundary and fails closed unless the exact provider manifest, original report, raw-run evidence, and reproducible evidence artifact all pass readiness. Each candidate run is additionally sealed into `football-science-tracking-candidate-stage-run-v1`: an immutable raw-evidence artifact containing only canonical stage data, provider/build fingerprints, source/range checksums, result checksum, and bounded sandbox telemetry. The browser verifies the exact evidence response SHA-256 and same-origin route before accepting it.

The benchmark-only full-scene orchestrator executes detection, association, re-identification, and classification sequentially. It materializes association references from the exact detection observations, requires one source/range across all four stages, and hashes every stage evidence/result into one composite lineage. The composite player, ball, and referee tracks enter the existing professional review workflow with confidence and discontinuity evidence; identity assignment, box correction, visibility, split, continuity, and identity-swap operations affect review copies only. Raw candidate evidence stays unchanged so later quality reports can measure both model output and analyst correction burden. The immutable pipeline artifact is stored only inside the exact on-device organization/team/user/source/item scope and is revalidated on restore. Benchmark predictions are then split into four provider-run artifacts, and the analyst must select the exact stage provider under evaluation; this selection cannot activate that candidate for normal tracking.

Provider evidence also applies a non-overridable workstation policy of at most `1.0x` real time to every attested case. A benchmark profile may demand faster inference, but it cannot raise that ceiling. Each raw run binds the coarse execution profile that produced that time: device class, runtime mode, CPU threads, effective sample rate, model residency, and worker reuse. One approval suite must use one exact profile; mixed or incomplete profiles cannot be hidden behind an aggregate. Missing processing evidence, a weakened report threshold, or one slower case prevents provider approval even when all quality metrics pass.

## Raw Run Evidence Boundary

FS Player snapshots normalized provider output immediately after local inference and before persistence, merge, identity correction, continuity repair, or any other analyst edit. Every `football-science-tracking-provider-run-v1` artifact records the exact provider id, version, contract protocol, stage, capability set and shared execution fingerprint over upstream commit/source, model hashes and packaged runtime, plus source SHA-256, angle, frame, range, positive measured processing time, and automatic trajectory output. Corrected points or correction records are rejected. The execution fingerprint is deliberately separate from the broader reviewed-manifest fingerprint that also binds provenance, licence policy and runtime limits.

Provider runs remain separate from ground truth until the local assembler validates both suites and binds their SHA-256 hashes and exact used run ids into `football-science-tracking-provider-run-evidence-v1`. Provider approval carries those hashes and the run-id set hash into the reviewed manifest. A report made from another provider build, video, range, frame, or post-correction output therefore cannot approve the installed engine.

## Independent Reference Evaluator

Provider approval for detection, association, or re-identification requires a second report from the official TrackEval metric implementation. Football Science packages TrackEval as a local evaluator, not as a tracking provider:

- official source: https://github.com/JonathonLuiten/TrackEval
- pinned commit: `12c8791b303e0a0b50f753af204249e622d0281a`
- pinned source SHA-256: `435f0e6d865918332155f8104a98a04d50c2c3de5b985b96c8a71a0f5b62a0ac`
- licence: MIT
- metrics: HOTA, DetA, AssA, LocA, CLEAR/MOTA, and Identity/IDF1

The adapter sends normalized boxes, trajectory IDs, entity class, timestamps, and a source fingerprint to an isolated local process. It sends no video, image frames, file paths, URLs, analyst identity, player identity, team identity, or shirt numbers. The report is schema-validated, bounded, deterministic, and hashed before it can be referenced by a provider manifest.

## Candidate Stack

### Detection: YOLOX

YOLOX is the first detector candidate because its official implementation is a high-performance anchor-free detector under Apache-2.0 and supports several local deployment targets. Generic weights are not enough for elite football: the exact checkpoint and its training-data rights must be reviewed, pinned, fine-tuned where necessary, and passed through FS Player's real-match benchmark before approval.

- Source: https://github.com/Megvii-BaseDetection/YOLOX
- Licence: https://github.com/Megvii-BaseDetection/YOLOX/blob/main/LICENSE

### Association: ByteTrack

ByteTrack is the first association candidate because it accepts detections from another detector and explicitly retains low-score observations to recover occluded objects. Its official code is MIT-licensed. MOT benchmark results do not prove football-specific identity continuity, so FS Player requires its own occlusion, camera-motion, and correction benchmark.

- Source: https://github.com/FoundationVision/ByteTrack
- Licence: https://github.com/FoundationVision/ByteTrack/blob/main/LICENSE

### Re-identification: Torchreid OSNet

Torchreid is the first re-identification candidate because it supports image and video re-ID, cross-dataset evaluation, pretrained models, and OSNet-family architectures. Its code is MIT-licensed. Model weights and every training dataset have separate provenance, and no weight is approved until that chain and the football benchmark are complete.

- Source: https://github.com/KaiyangZhou/deep-person-reid
- Licence: https://github.com/KaiyangZhou/deep-person-reid/blob/master/LICENSE

### Segmentation: SAM 2.1

SAM 2.1 remains the selected-object segmentation and propagation stage. The official code and checkpoints are Apache-2.0. FS Player keeps its current pinned tiny checkpoint as the workstation baseline and can benchmark larger variants later against latency and memory budgets.

- Source: https://github.com/facebookresearch/sam2
- Licence: https://github.com/facebookresearch/sam2/blob/main/LICENSE

### Football reference: SoccerNet Game State

The official SoccerNet Game State baseline is a valuable research reference for person detection, role, team, shirt number, re-identification, pitch calibration, and game-state evaluation. It is not the complete FS Player candidate: the audited baseline does not provide the required ball stage, its source is GPL-3.0, its locked TrackLab dependency includes Ultralytics, and model downloads are not bound to checksums in the source contract. It therefore remains an isolated benchmark reference until every model, dataset right, identity-use decision, runtime artifact, and missing ball provider is separately pinned. See `TRACKING_SOCCERNET_GSR_AUDIT.md`.

## Deliberate Hold

The detector, association, re-ID, team, and shirt stages now have approval, runtime-integrity, resource-limit, approved and benchmark-only candidate registries, isolated execution, session-owned source reuse, and capability-scoped result boundaries, but no full-scene model is installed or activated. Choosing arbitrary public weights now would create false confidence and unresolved data/licence risk. The reference evaluator can be installed independently because it contains no tracking model and approves no provider by itself. The next provider approval point is a local real-match benchmark using representative Football Science footage. Only providers that improve measured quality without breaking workstation performance and whose report/evidence pair verifies exactly move from `candidate` to `approved-local-optional`.
