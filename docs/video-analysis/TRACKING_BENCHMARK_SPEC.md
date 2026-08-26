# FS Player Tracking Benchmark v1

## Purpose

Tracking quality must be measured against independent ground truth before a provider can be described as production-ready. Visual inspection remains useful for review, but it is not an acceptance test.

The benchmark is local-first and provider-neutral. It evaluates normalized metadata only. Raw video, local paths, object URLs, signed URLs, frames, binary buffers, and base64 media are rejected by the contract and never copied into a report.

## Source Of Truth

- The analyst's local match video remains on the device.
- A benchmark case references that source only by a SHA-256 fingerprint.
- Human-reviewed ground-truth points are the benchmark truth for the selected time range.
- Provider output is the prediction under test.
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
npm run fs-player:tracking:trackeval:plan
npm run fs-player:tracking:trackeval:install -- --accept-license --python /absolute/path/to/python3.12
npm run fs-player:tracking:trackeval:preflight -- --json
npm run fs-player:tracking:benchmark -- --input /absolute/local/football-scene.json --trackeval --output /absolute/local/report.json --json
```

Exit code `0` means every active quality gate passed, `1` means valid evidence failed one or more thresholds, and `2` means the input was invalid or unsafe.

`--trackeval` is deliberately explicit. Without it, a multi-object report remains `providerApprovalReady: false`. With it, the report contains only bounded metric evidence and hashes, never source paths, raw tracks, frames, or media. Real provider approval still requires human-verified real-match cases and reviewed model/data provenance.

## Real Match Pilot

The first real benchmark should contain at least one legally usable tactical wide-angle match source, preferably 1080p or better. A representative 10-20 minute range is enough for the pilot. A second synchronized angle is useful but not required.

The selected range should deliberately include:

- fast transitions and direction changes
- crowded penalty-area play
- partial and full player occlusions
- camera pan, tilt, zoom, and at least one cut if present in normal use
- set pieces and compact team units
- similar shirt colours or difficult lighting when available

The user only needs to reconnect the source in FS Player or provide its absolute local path for the local benchmark session. No advance annotation is required. FS Player should create and review ground truth in a dedicated workflow, record who verified it, and retain only the local benchmark artifact plus metadata-safe reports. Until that workflow has produced a representative reviewed suite, synthetic fixtures prove evaluator correctness but do not prove elite football performance.

## Provider Boundary

Future tracking intelligence remains split into replaceable local providers:

1. Detection proposes player, ball, and referee observations.
2. Segmentation/refinement improves the selected object mask and box.
3. Re-identification maintains identity through occlusion and cuts.
4. Team and shirt classification add confidence-gated identity evidence.
5. The tracker fuses observations into continuity segments and exposes uncertainty.

SAM 2.1 remains the selected-object propagation provider and fallback. Detection, re-identification, and classification providers must have pinned versions, verified checksums, reviewed licences, no inference-time network dependency, bounded resources, and the same benchmark evidence before activation.
