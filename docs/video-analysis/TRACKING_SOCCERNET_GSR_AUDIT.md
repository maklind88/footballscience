# SoccerNet Game State Candidate Audit

Audit date: 2026-08-31

## Scope and identity

This audit evaluates the official SoccerNet Game State Reconstruction baseline as a local, benchmark-only technical reference for Tracking Intelligence v2. It does not approve the baseline for activated FS Player tracking and does not approve any downloaded model weight.

- repository: https://github.com/SoccerNet/sn-gamestate
- pinned commit: `1c958345067218297d221e45e1a6405f975f83e0`
- deterministic Git archive SHA-256: `abf513eec40db336b9efcb6f33564cdc9adaf7aedcdd9904138b79fac1b5859b`
- `pyproject.toml` SHA-256: `a8c682553338a866d99426cd3e0d1049a5cef2353bda4be9419c7f260bcca7e2`
- `uv.lock` SHA-256: `9141f2b2ccc7e2a0d02b9d0ac505e9c9da7fc362e223c2eef6a64001f0e65a4f`
- `LICENSE` SHA-256: `3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986`
- project licence: GPL-3.0
- required Python: `>=3.9,<3.10`
- pinned baseline version: `0.2.0`
- pinned TrackLab package: `1.3.24`

## Locked dependency findings

The audit continued through the exact package and Git revisions locked by `uv.lock`, rather than relying on repository badges or package names:

- TrackLab `1.3.24` wheel SHA-256: `ff06ebfbb7f5ed8aa57a090c252b60fc346c118159da6172d965c65af401ebc7`
- Ultralytics `8.3.123` wheel SHA-256: `26addbd95d4724fa29b3cacd9eeaf5e22a39b2299395b2ec8cb8e274087ab78a`
- PRTReID commit: `30617a75967e84d5d516959c4b84cbeea6f56493`
- PRTReID deterministic archive SHA-256: `f8cdc10424e12a021a690f7e799a9fe37d971e43a6917d60d27b1bed592bf570`
- BPBreID commit: `02570d5c893977685de7a547a58c0aa87fa4788c`
- BPBreID deterministic archive SHA-256: `7a2978bfe6ce0fbb63e084111d8cc47036d91cae94429c8e0289e48ea83e0286`

The locked TrackLab wheel declares a direct Ultralytics dependency but declares no package licence in its wheel metadata. The locked Ultralytics wheel declares `AGPL-3.0`. The default SoccerNet detector constructs `ultralytics.YOLO` with `yolo11m.pt`, so this is an executed dependency boundary and not an unused optional package.

PRTReID and BPBreID each contain a Hippocratic License 3.0 `LICENSE` file with SHA-256 `67bddcd8fa213e00543728ba9aa3e3b23ee96d67cf33f67d05f22339b8e9cb28`, while each `setup.py` declares `MIT`. The repository-level licence therefore conflicts with its package metadata. FS Player resolves that conflict fail-closed and does not accept the package metadata as permission to integrate or distribute the source.

The SoccerNet baseline downloads `prtreid-soccernet-baseline.pth.tar` and its HRNet backbone from Zenodo at runtime. Both Zenodo records declare `CC-BY-4.0`, and the source checks only their MD5 values. The PRTReID weight is 396,287,605 bytes with MD5 `9633825232bc89f23a94522c5561650e`; the HRNet weight is 165,587,602 bytes with MD5 `58ea12b0420aa3adaa2f74114c9f9721`. Those artifact licences do not resolve the conflicting source-code licence or establish the training-dataset and identity-use rights required by FS Player.

TrackLab's newer KPR path downloads `trackinglaboratory/keypoint_promptable_reid` from Hugging Face without pinning a repository revision or checksum. The model repository metadata exposes no licence tag. It is blocked independently even before football-quality evaluation.

## Capability fit

The reference is relevant to these FS Player stages:

- person detection and role classification for player, goalkeeper, referee, and other
- multi-object association and re-identification
- team affiliation and shirt-number recognition
- pitch localization, calibration, and metric-space game-state evaluation

It is not a complete full-scene provider. The baseline task is athlete game-state reconstruction and does not supply the separately required `detect:ball` capability. Ball detection and continuity need their own reviewed model and real-match evidence.

## Blocking evidence

The source cannot enter `football-science-tracking-candidate-registry-v1` in its audited form:

1. The GPL-3.0 source and its dependency boundary need a product-distribution decision before any packaged runtime can be shipped.
2. TrackLab depends on Ultralytics `8.3.123`, whose exact wheel declares `AGPL-3.0`; FS Player blocks this product boundary unless a separate reviewed commercial/product decision replaces it.
3. The baseline downloads detector, re-ID, OCR, and calibration weights dynamically. Their exact byte sizes, SHA-256 hashes, model licences, model cards, and training-dataset rights are not pinned by the audited project manifest.
4. PRTReID and BPBreID contain a repository licence that conflicts with their package metadata. They remain blocked even though the downloaded weight records declare `CC-BY-4.0`.
5. PRTReID and shirt-number processing are identity-sensitive. Every training dataset needs an explicit identity-use review under the FS Player provider contract.
6. The Python process tree is not the single sealed native executable required by the macOS network-denied stage sandbox.
7. The baseline does not satisfy ball detection, so it cannot make the four-stage full-scene pipeline ready by itself.
8. No result from the baseline has yet passed the Football Science ten-minute real-match suite, the independent TrackEval cross-check, or the `<=1.0x` workstation policy.

## Safe integration route

1. Treat SoccerNet Game State as a research and benchmark reference only.
2. Do not package the audited Ultralytics, PRTReID, BPBreID, or unlicensed KPR boundaries. A separately acquired commercial licence must be represented as its own reviewed source contract; changing a manifest boolean is not an exception.
3. Inventory every downloaded weight before inference and record exact origin, bytes, SHA-256, model card, licence, datasets, terms, rights review, and identity-use review.
4. Export only reviewed stage models into a sealed native runtime compatible with the FS Player invocation/result protocol. Do not grant a Python environment or arbitrary child-process execution to the product sandbox.
5. Add a separately reviewed ball detector and ball association policy.
6. Install each stage through `tracking:candidate:install`; installation remains benchmark-only.
7. Run at least five exhaustive cases and ten non-overlapping minutes from representative local match footage through the immutable candidate pipeline.
8. Evaluate detection, association, re-identification, team, shirt number, referee, and ball evidence against Football Science policy and TrackEval.
9. Create a new `approved-local-optional` installation only for exact providers whose report and evidence reproduce. Never promote a candidate by editing its status.

## Current decision

`research-reference-only`

The codebase, local match source, strict ground-truth importer, TrackEval evaluator, candidate runtime boundary, and atomic candidate installer are ready. Full-scene model approval remains intentionally false until the model/data/licence inventory and ten-minute evidence exist.
