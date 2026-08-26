# FS Player Tracking Provider Decision

## Decision

Tracking Intelligence v2 uses a local, replaceable five-stage pipeline:

1. detection for player, ball, and referee observations
2. segmentation and selected-object propagation
3. multi-object association
4. player re-identification
5. team and shirt classification

No candidate is activated by installation alone. The provider contract requires a pinned source commit, source and model SHA-256 hashes, explicit code and model licences, bounded memory/time/concurrency, inference with no network access, and capability-specific real-match benchmark evidence.

SAM 2.1 remains the installed, approved selected-object propagation engine and safe manual-prompt fallback. It is not treated as an automatic detector or a re-identification engine.

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

The detector, association, re-ID, team, and shirt stages are architecture-ready but not yet installed or activated. Choosing arbitrary public weights now would create false confidence and unresolved data/licence risk. The next approval point is a local real-match benchmark using representative Football Science footage. Only providers that improve measured quality without breaking workstation performance move from `candidate` to `approved-local-optional`.
