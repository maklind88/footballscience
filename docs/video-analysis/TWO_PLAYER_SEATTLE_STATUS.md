# Seattle Two-Player Pilot

Updated: 2026-11-21. Local candidate; no deployment authorization or production writes.

## Scope and ownership

The FS Player chat owns the two-click clip-popup workflow and, by explicit user
approval, calibration for this two-player Seattle interval only. Full-scene
analysis, 3D, provider promotion, auth, central writes, original tags and saved
playlists remain outside this change.

- Worktree: `/private/tmp/footballscience-two-player-20261119`.
- Branch: `codex/fs-player-two-player-distance-20261119`.
- Base: `d267eb7852d6c8132ffd8866bcbacd80cb330b8a`.
- Original: `NCC v Seattle 4 July.mp4`, 1920x1080, nominal 30 fps.
- Source SHA-256: `58f51dda5c540feaa75bf09004149eee3e95e1eda04b083998289e19e2b30be6`.
- Supported source interval: **177515-192515 ms (2:57-3:12)**, not the entire match.
- Container title is Hudl; camera manufacturer and panorama projection are unknown.

## User flow

One ruler tool in the existing clip popup. Pause at a suitable frame and select
two players. Two clicks automatically launch the installed local SAM 2.1 batch
provider. A dragged box is also supported. The same Play/Pause, seek and shuttle
controls operate the connecting line and distance; there is no new transport.

The prepared Seattle profile is loaded only after the companion returns the exact
original source hash. It follows the changing camera on every source frame.
Approximate metres use an approximation sign and whole metres, with the tooltip
`Estimated distance`. This is an image-checked estimate, **not surveyed or
independently metric-validated distance**. Other videos and unsupported parts of
this match retain tracking but withhold metres.

Tracking requests include up to 320 ms of real source footage after the visible
clip end, bounded by the actual file duration. This gives interpolation a real
following observation without extending the saved clip or extrapolating positions.
Clips that end at the file boundary still withhold the line after their last
usable observation.

## Preservation and failure handling

- Original tags, playlist edits, saved clip ranges and central calibration are untouched.
- The existing verified-calibration contract remains strict and separate from estimates.
- Closing, hiding, reselecting or changing context invalidates late work and cancels tracking.
- Mixed source/camera results are rejected before caching.
- Cache is session-only, bounded to ten entries, requiring exact File identity and
  user/team/match/video/camera/range. A reload requires tracking again.
- Unsupported regions, missing/weak/occluded tracking, wrong hash, wrong resolution,
  gaps or times outside the prepared interval withhold distance.
- Calibration fetch failure does not discard working player tracking.
- No new model, model hash, engine installation, backend, schema or write path.
- The pilot accepts original-file clips up to 30 seconds, not proxies or portable windows.

## Calibration evidence

The [club's published dimensions](https://www.nccourage.com/history) are 120 by
75 yards, represented as 109.728 by 68.58 metres. The
[IFAB field specification](https://theifab.com/laws/latest/the-field-of-play/)
provides the 9.15-metre circle radius and penalty-box geometry. Published dimensions
are not a survey of this match's markings; projection and feet placement add uncertainty.

Preparation uses a manually traced initial line/circle fit, existing OpenCV
LK/RANSAC camera-motion helpers, bounded source-paint correction and per-frame
source-paint checks. The unfinished full-scene helpers were read/reused offline,
not modified, promoted or introduced as a runtime dependency.

All four base references (circle, halfway line, both touchlines) require at least
40 visible samples and at least 75% support within 6 source pixels. The supported
measurement region is the convex hull of actual paint-supported samples, including
independently observed penalty-box lines where visible. A first-frame-only hull
was insufficient when the second player ran toward the penalty area.

- QA transcode: 450/450 frames pass after adding a real final camera anchor.
- Original lossless excerpt: **451/451 frames pass**, including both visible boundaries.
- Both tested players lie inside the supported region in that image-check pass.
- All 451 translated-camera and 451 20%-scale-error negative controls rejected.
- These controls test rejection, not independent physical measurement accuracy.
- The first original frame has PTS 2726395 at timebase 1/15360. Actual source PTS,
  rather than the QA transcode's zero-based time, anchors the production profile.
- Asset: `src/modules/video-analysis/calibration/seattle-177515-192515.json`.
- Asset SHA-256: `5f256667aaf75a7eaa6f7c77a1e295f7a5e0b0ddd40d96a9175fef6b43ddb27c`.
- The asset contains only camera geometry and validation, not video or player identities.

The earlier `platform-clips-v1/high-press` evidence concerns 298136-313136 ms,
not this interval. Its results must not be used as acceptance evidence here.
The automatic keypoint/radial candidate also failed on this exact interval and
was not enabled or relabelled as verified.

## Verification

`npm run check`, `git diff --check` and **64 API/contract tests** pass. The 29
focused tracking/preview tests run with:

```sh
QA_PORT=9441 node node_modules/@playwright/test/cli.js test \
  --config=qa/playwright.config.mjs --project=api-contracts \
  qa/video-analysis-player-pair.api.spec.mjs \
  qa/video-analysis-player-pair-lifecycle.api.spec.mjs \
  qa/video-analysis-player-pair-calibration.api.spec.mjs \
  qa/video-analysis-clip-preview.api.spec.mjs
```

These tests cover coordinate mapping, strict interpolation, profile validation,
every-frame projection and interval boundaries, source/resolution rejection,
approximate formatting, cancellation, stale results, context/cache isolation and
existing clip-preview timing. Algebraic projection tests are not ground-truth
accuracy benchmarks.

The other 35 regression tests cover timeline row order, playlist library,
timeline clip targets and playlist selection:

```sh
QA_PORT=9441 node node_modules/@playwright/test/cli.js test \
  --config=qa/playwright.config.mjs --project=api-contracts \
  qa/video-analysis-timeline-row-order.api.spec.mjs \
  qa/video-analysis-playlist-library.api.spec.mjs \
  qa/video-analysis-timeline-clip-targets.api.spec.mjs \
  qa/video-analysis-playlist-selection.api.spec.mjs
```

Real SAM 2.1 runs on the source video, not mock tracks. An earlier trim run took
266832 ms on CPU and retained the two identities in a six-frame visual review.
MPS was unavailable; no provider configuration was changed to bypass that limit.

The final two-click browser run used the full original source and produced two
96-sample tracks spanning 177515-192715 ms. Artifact:
`companion-cache/5060c7e4-1e1e-44c8-b575-ac3fb7725778/tracks.json`.
All **451 time samples** across the visible 177515-192515 ms interval yield a
distance with real bracketing tracking observations, no extrapolation and no
missing calibration. This proves continuity, not independent metric accuracy.

Browser checks passed for playback, pause, seeking, automatic stop at the clip
end and close/reopen reuse without a new tracking job. Visual review at the
middle and end retains the selected white-shirted player 22 and blue-shirted
player. Desktop and 390x844 mobile layouts were checked. Screenshots under the
evidence directory:

- `desktop-middle-distance.jpg`: middle playback paused, approximately 8 m.
- `desktop-end-distance.jpg`: visible clip end, approximately 19 m.
- `desktop-reopened-distance.jpg`: cached tracking after reopening, approximately 8 m.
- `mobile-distance.jpg`: mobile start, approximately 9 m.

## Reproduction and remaining limitations

Raw local evidence is in `/private/tmp/fs-two-player-evidence-20261119`, including
`calibration-probe.py`, `camera-motion-probe.py`, `validate-calibration.py`,
`validated-original-calibration.json` and actual companion `tracks.json` artifacts.
The checked profile can be repackaged using:

```sh
node scripts/video-analysis/build-pair-calibration-profile.mjs \
  /private/tmp/fs-two-player-evidence-20261119/validated-original-calibration.json \
  "/Users/maklind/Desktop/Games 2026/NCC v Seattle 4 July.mp4"
```

This packaging command checks source bytes and validation, but does not itself
infer or approve new geometry. The profile is a bounded prepared Seattle pilot,
not a general camera-calibration pipeline. General automatic calibration,
independent metric accuracy, fast inference and durable tracking reuse remain
separate follow-up work. No production behaviour has been verified for this candidate.

Preview: `http://127.0.0.1:9441/qa/fixtures/video-analysis/player-pair/index.html`.
The fixture uses the actual shared popup and companion. Select the original file;
its save callback rejects writes. The old 15-second transcode is not a registered
source for the prepared metre profile.
