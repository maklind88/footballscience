# FS Player Tracking Provider Decision

## Decision

Tracking Intelligence v2 uses a local, replaceable five-stage pipeline:

1. detection for player, ball, and referee observations
2. segmentation and selected-object propagation
3. multi-object association
4. player re-identification
5. team and shirt classification

No candidate is activated by installation alone. The provider contract requires a pinned source commit, source and model SHA-256 hashes, explicit code and model licences, model-card and training-dataset provenance, bounded memory/time/concurrency, inference with no network access, and capability-specific real-match benchmark evidence. Re-identification and shirt-number providers need a separate reviewed identity-use decision for every declared training dataset. Readiness also requires the original metadata-only report and a reproducible provider-evidence artifact bound to the exact source, models, provenance, runtime limits, capabilities, thresholds, and report hash.

SAM 2.1 remains the installed, approved selected-object propagation engine and safe manual-prompt fallback. It is not treated as an automatic detector or a re-identification engine.

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

## Deliberate Hold

The detector, association, re-ID, team, and shirt stages are architecture-ready but not yet installed or activated. Choosing arbitrary public weights now would create false confidence and unresolved data/licence risk. The reference evaluator can be installed independently because it contains no tracking model and approves no provider by itself. The next provider approval point is a local real-match benchmark using representative Football Science footage. Only providers that improve measured quality without breaking workstation performance and whose report/evidence pair verifies exactly move from `candidate` to `approved-local-optional`.
