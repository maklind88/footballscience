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
2. TrackLab depends on Ultralytics `8.3.123`; its source and model licence boundary must be reviewed independently.
3. The baseline downloads detector, re-ID, OCR, and calibration weights dynamically. Their exact byte sizes, SHA-256 hashes, model licences, model cards, and training-dataset rights are not pinned by the audited project manifest.
4. PRTReID and shirt-number processing are identity-sensitive. Every training dataset needs an explicit identity-use review under the FS Player provider contract.
5. The Python process tree is not the single sealed native executable required by the macOS network-denied stage sandbox.
6. The baseline does not satisfy ball detection, so it cannot make the four-stage full-scene pipeline ready by itself.
7. No result from the baseline has yet passed the Football Science ten-minute real-match suite, the independent TrackEval cross-check, or the `<=1.0x` workstation policy.

## Safe integration route

1. Treat SoccerNet Game State as a research and benchmark reference only.
2. Inventory every downloaded weight before inference and record exact origin, bytes, SHA-256, model card, licence, datasets, terms, rights review, and identity-use review.
3. Export only reviewed stage models into a sealed native runtime compatible with the FS Player invocation/result protocol. Do not grant a Python environment or arbitrary child-process execution to the product sandbox.
4. Add a separately reviewed ball detector and ball association policy.
5. Install each stage through `tracking:candidate:install`; installation remains benchmark-only.
6. Run at least five exhaustive cases and ten non-overlapping minutes from representative local match footage through the immutable candidate pipeline.
7. Evaluate detection, association, re-identification, team, shirt number, referee, and ball evidence against Football Science policy and TrackEval.
8. Create a new `approved-local-optional` installation only for exact providers whose report and evidence reproduce. Never promote a candidate by editing its status.

## Current decision

`research-reference-only`

The codebase, local match source, strict ground-truth importer, TrackEval evaluator, candidate runtime boundary, and atomic candidate installer are ready. Full-scene model approval remains intentionally false until the model/data/licence inventory and ten-minute evidence exist.
