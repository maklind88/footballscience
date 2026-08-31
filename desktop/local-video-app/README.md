# Local Video App

The FS Player local companion keeps raw match video and dense tracking samples on the analyst device while exposing bounded processing capabilities to the browser over loopback only.

Implemented capabilities include:

- probe/transcode jobs and expiring byte-range playback;
- content-addressed scrub proxies and bounded replay buffers;
- multi-angle rendered H.264/AAC exports with burned-in drawings and tracking graphics;
- progressive device-local live capture;
- checksum-verified private portable-review publishing; and
- capability-gated SAM 2.1 tracking through an isolated, pinned provider runtime.

The server validates origin and expiring session capabilities, bounds jobs and ranges, and never grants the web app arbitrary filesystem access. Central `/api/video-analysis` storage remains metadata-only except for an explicit portable-review publish.

See `local-video-server/README.md` for the security model and server command. Tracking provider setup is available through:

```bash
npm --prefix desktop/local-video-app run tracking:plan
npm --prefix desktop/local-video-app run tracking:install -- --accept-license
npm --prefix desktop/local-video-app run tracking:preflight
```

The web release does not install model weights or accept the provider license on the analyst's behalf. FS Player checks the companion capability when Auto follow opens and enables `Track locally` only after preflight is ready; manual keyframes and corrections remain available otherwise.

Reviewed SoccerNet/MOTChallenge ground truth can be converted into the same local, checksum-bound benchmark suite without exposing source paths:

```bash
npm --prefix desktop/local-video-app run tracking:mot:import -- \
  --manifest /absolute/local/soccernet-import.json \
  --output /absolute/local/fs-player-ground-truth-suite.json
```

The import is intentionally strict: every MOT track needs an explicit player/ball/referee and identity mapping, dataset rights must be attested, player visibility must cover at least 95% of each full-scene range, and no output is written until ten unique minutes and all required football scenarios are present. See `docs/video-analysis/TRACKING_MOT_IMPORT_MANIFEST.example.json` from the repository root.

A long local match can first be converted into a reproducible annotation pack. The plan must contain 5-20 non-overlapping cases, 10-20 unique minutes, and every required football scenario:

```bash
npm --prefix desktop/local-video-app run tracking:benchmark:prepare -- \
  --plan /absolute/local/annotation-plan.json \
  --source /absolute/local/match.mp4 \
  --output /absolute/local/fs-player-annotation-pack
```

The pack contains private normalized clips, empty MOT files, exact source/clip/FFmpeg hashes, and a deliberately non-attested import template. It never records the original local source path. The analyst must complete exhaustive annotations, track mappings, rights review, and both attestations before `tracking:mot:import` can accept it.

Reviewed full-scene stage candidates use a separate benchmark-only registry. The installer never downloads assets, follows links, overwrites an installation, or infers a licence decision. It accepts only a canonical candidate manifest plus exact local native-runtime and model files whose bytes and SHA-256 hashes match that manifest:

```bash
npm --prefix desktop/local-video-app run tracking:candidate:plan -- \
  --manifest /absolute/local/provider-manifest.json

npm --prefix desktop/local-video-app run tracking:candidate:install -- \
  --manifest /absolute/local/provider-manifest.json \
  --runtime /absolute/local/provider-runtime \
  --model model-id=/absolute/local/model.bin \
  --accept-license

npm --prefix desktop/local-video-app run tracking:candidate:preflight
```

Installation seals the copied runtime and models read-only, writes the installation marker last, and verifies both the candidate registry and the native macOS network-denied sandbox. A successful installation remains `benchmarkOnly`; only passed, reproducible real-match evidence can create a separate approved-provider installation.

The YOLOX reference runtime has a separate offline arm64 build command. It accepts only the exact official PyInstaller `6.15.0` source distribution, verifies its SHA-256, applies the reviewed macOS no-SysV patch, and rejects any built runtime that still imports `semget`, `semctl`, or `semop`:

```bash
npm --prefix desktop/local-video-app run tracking:candidate:build:yolox -- \
  --python /absolute/local/venv/bin/python \
  --pyinstaller-sdist /absolute/local/pyinstaller-6.15.0.tar.gz \
  --output /absolute/local/fs-yolox-reference-detection
```

The Python environment must already contain the pinned ONNX Runtime and OpenCV build dependencies. The command performs no download and never installs or activates the result.

The separate CoreML candidate reuses that exact base provider and model while requiring ONNX Runtime's local CoreML execution provider first:

```bash
npm --prefix desktop/local-video-app run tracking:candidate:build:yolox-coreml -- \
  --python /absolute/local/venv/bin/python \
  --pyinstaller-sdist /absolute/local/pyinstaller-6.15.0.tar.gz \
  --output /absolute/local/fs-yolox-coreml-reference-detection
```

Its build pins both provider sources, the no-SysV bootloader patch, architecture, imported symbols, runtime size, and runtime SHA-256. Building does not install, approve, or activate the candidate.

An installed candidate can then be screened across every case in a private annotation pack before expensive ground-truth review:

```bash
npm --prefix desktop/local-video-app run tracking:candidate:screen -- \
  --pack /absolute/local/annotation-pack.json \
  --provider yolox-s-coco-reference@0.1.2 \
  --sample-ms 5000 \
  --output /absolute/local/yolox-screening
```

The output contains immutable raw candidate evidence per case plus one metadata-only screening report. It measures sandbox isolation, wall time, real-time factor, observation counts, confidence distribution, and declared entity coverage. Raw detections may be shown only as a separate suggestion layer: the report always forbids ground-truth mutation and locking and requires exhaustive human review. It deliberately cannot report precision, recall, identity continuity, or provider approval before reviewed ground truth exists.

Reverify a completed bundle without rerunning inference:

```bash
npm --prefix desktop/local-video-app run tracking:candidate:screen:verify -- \
  --pack /absolute/local/annotation-pack.json \
  --screening /absolute/local/yolox-screening
```

Verification reopens the exact installed provider, rejects linked or writable evidence, revalidates every candidate-stage artifact, recomputes every case summary, and reproduces the canonical screening SHA-256. One changed byte fails the complete bundle.

After detection has been screened over each complete case (`--sample-ms 120000` for the current two-minute pack), it can seed a separate review workspace. A verified full-range association bundle may be added only when its sealed review gate permits a suggestion layer. A failed association screen remains failed and cannot approve a provider, but its partial trajectories can still reduce analyst work without hiding unassociated detections:

```bash
npm --prefix desktop/local-video-app run tracking:candidate:preannotation -- \
  --pack /absolute/local/annotation-pack.json \
  --detection-screening /absolute/local/full-detection-screening \
  --output /absolute/local/preannotation-workspace

npm --prefix desktop/local-video-app run tracking:candidate:preannotation:verify -- \
  --pack /absolute/local/annotation-pack.json \
  --detection-screening /absolute/local/full-detection-screening \
  --workspace /absolute/local/preannotation-workspace
```

Add `--association-screening /absolute/local/full-association-screening` to both commands only when that bundle independently verifies. Without it, every detection remains explicitly unassociated and `associationReviewRequired` stays true. The workspace contains immutable MOT suggestions and per-case track maps, but it never writes the pack's `annotations/*.txt`, cannot be promoted by changing a status field, and remains `suggestionOnly`, `approvalReady: false`, and `groundTruthEvaluated: false`. An analyst must still find false negatives and missing entities, correct every box and identity, assign player/team metadata, review dataset rights, and create a new independently attested MOT import manifest.
