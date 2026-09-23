# FS Player Seattle Review Readiness

Checked on 2026-09-08. This is local candidate preparation for practical testing,
not a production release or tracking-quality approval.

Release follow-up: the subsequently discovered remote schema gap has been
repaired and verified in both environments. See `DATABASE_RELEASE_20260908.md`
for the exact migration set, preservation checks and remaining code-release gate.

## Candidate

- Working branch: `codex/fs-player-seattle-review-20260908`.
- Preserved original branch: `codex/fs-player-stage-runner-v1-20260830` at
  `1662541b45b4a4478a978f6ff87215a6a5c6e4d3`.
- Updated base: `origin/main` at `eb49a7cf50a270a7c3a3bf1adad44ea60e128c63`.
- All 75 original FS Player commits replayed without conflicts. `git range-diff`
  reports unchanged patches for all 75 commits; rebased tip is `f374fb24`.
- The working copy now lives in a persistent Documents folder. The original
  branch is retained even though its old temporary worktree no longer exists.

## Selected Source

- Match selected by the user: North Carolina Courage vs Seattle, 4 July 2026.
- Local source: `NCC v Seattle 4 July.mp4`, 2,153,665,046 bytes.
- SHA-256: `58f51dda5c540feaa75bf09004149eee3e95e1eda04b083998289e19e2b30be6`.
- Native browser playback: 1920 x 1080, approximately 7,167.2 seconds.
- Test interval: video time 4:16 onwards. No match-clock conversion is claimed.
- Original media, saved production clips and the separate Match 11 benchmark
  campaign were not modified. Match 11 references cannot serve as Seattle ground
  truth, and no Seattle reference has been attested by these checks.

## Fix Found During Preparation

The new tracking-stage client sent three headers missing from the local companion's
CORS allowlist. A real browser could therefore block a tracking request before it
reached the stage runner. The companion now explicitly permits the provider id,
provider version and encoded stage request headers.

HTTP OPTIONS tests cover both approved-provider and benchmark-candidate endpoints.
The configured origin must match; an untrusted origin still receives 403 without
an allow-origin response. Session and provider approval checks remain in force.

## Verification

| Check | Result |
| --- | --- |
| FS Player API/module contracts | 410 passed |
| Existing FS Player browser flows | 63 passed |
| Seattle original-media acceptance | 2 passed, at 1468 x 900 and 390 x 844 |
| Syntax (`npm run check --silent`) | Passed |
| Architecture budget guard | Passed; existing oversized-file warnings remain |
| Performance asset budget guard | Passed; existing long-term CSS warnings remain |
| Static migration safety | Passed, 65 migration files checked |
| SAM 2.1 provider 1.3.1 installation/preflight | Passed |
| SAM 2.1 warm inference smoke | Produced tracks; worker reused; speed budget not met |
| Pinned TrackEval preflight | Passed synthetic control; not a Seattle quality score |

The original-media test loads the real file through the normal local-file input.
It verifies native decoding, full duration, changing decoded pixels, playback,
two overlapping 15-second test clips, proportional overview width, a 60-second
focus window, and entry into Tracking/Review Studio. Reference locking remains
disabled without review evidence. Test screenshots stay in the ignored local
`test-results/seattle-original-proof/` directory.

The test uses isolated synthetic clip records and the existing mock API harness;
its Build Up labels are test inputs, not newly reviewed football observations.
Non-loopback network requests are blocked. It does not exercise authenticated
production writes, actual provider accuracy on Seattle, or production media
reconnection. Existing browser checks separately cover correction/undo, timeline
operations, collaboration, search, spatial layers, media and portable sharing.

Reproduce the private-media check with a local source path:

```sh
FS_PLAYER_REVIEW_SOURCE='/absolute/local/NCC v Seattle 4 July.mp4' \
FS_PLAYER_REVIEW_DURATION_SECONDS=7167.2 QA_PORT=4289 \
npx playwright test --config=qa/playwright.config.mjs --project=chromium \
  qa/video-analysis-real-media.smoke.spec.mjs \
  --output=test-results/seattle-original-proof --reporter=line
```

Without `FS_PLAYER_REVIEW_SOURCE`, these two private-media checks are skipped.
The default source-time anchor is 256 seconds and can be changed with
`FS_PLAYER_REVIEW_START_SECONDS` for another source. No private video is committed.

## Local Engine And Remaining Gates

The updated main baseline requires provider 1.3.1. A separate installation was
created using the pinned source, the existing verified SAM checkpoint and the
approved dependency policy. Earlier provider installations were preserved.
Preflight reports Python 3.12.14, Torch 2.13.0, CPU with eight threads and no
network during inference. The warm synthetic smoke produced six points, reused
the resident worker and took 7,263 ms for 1,000 ms of video (7.263x real time).
This proves operation, not the required realtime speed or real-match quality.

TrackEval still uses commit `12c8791b303e0a0b50f753af204249e622d0281a` and source
SHA-256 `435f0e6d865918332155f8104a98a04d50c2c3de5b985b96c8a71a0f5b62a0ac`.
Its synthetic perfect-control result cannot approve a tracking provider.

A later user-authorized Safe Lane must validate the current main baseline and
apply/verify the two existing tracking correction migrations before the new
`reject`, `restore` and `entity` operations are used against production data.
These files expand correction types; they do not alter access policies.
Authenticated staging/production verification and deployment are still pending.

For quality measurement, Seattle needs its own representative source-bound
reference cases, exhaustive human review and locked annotations before official
TrackEval measurement. That requirement is separate from releasing the tools
for practical review and testing with their capability limits visible.
