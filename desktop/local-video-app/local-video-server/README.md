# Local Video Server

Device-local loopback processing engine for Football Science playback preparation, proxy generation, replay buffers, tracking, synchronization, and rendered exports.

It binds to `127.0.0.1:47831`, accepts a selected local video from the web UI, creates a browser-playable MP4 copy with the bundled FFmpeg engine, and serves that copy back from the same local machine.

The preparation path is intentionally conservative:

- H.264/AAC MP4 files are remuxed first, preserving quality and finishing quickly.
- Non-browser-safe files fall back to an H.264/AAC transcode.
- Playback responses support byte ranges so large match files can seek and stream correctly.
- Processing is serialized by default to protect CPU, memory, and thermals during live analysis.
- Jobs expose status, progress, cancellation, and bounded retention.
- Cache usage is quota-controlled and old inactive entries are removed before new work begins.
- Scrub proxies are content-addressed with streaming SHA-256 and reused when the source and profile match.
- Replay buffers are bounded, frame-accurate MP4 segments created from an authorized local proxy without re-uploading the source.

The bridge is not an open localhost upload endpoint. Browser clients must originate from an approved Football Science or local development origin, open an ephemeral session, and send that session token with protected requests. Playback URLs use separate expiring capability tokens.

No match video is uploaded to Supabase or any cloud service.

## Start

```bash
node desktop/local-video-app/local-video-server/server.mjs
```

The server uses `ffmpeg-static` by default. Set `FS_FFMPEG_PATH` only when you need to override the bundled binary.

Optional limits and policy:

- `FS_LOCAL_VIDEO_ALLOWED_ORIGINS`: comma-separated additional exact origins.
- `FS_LOCAL_VIDEO_PORTABLE_STORAGE_HOSTS`: comma-separated additional exact HTTPS storage hosts for portable review publishing.
- `FS_LOCAL_VIDEO_ALLOW_LOCAL_DEV=0`: disable localhost development origins.
- `FS_LOCAL_VIDEO_MAX_INPUT_BYTES`: maximum accepted request body.
- `FS_LOCAL_VIDEO_MAX_CACHE_BYTES`: total cache quota.
- `FS_LOCAL_VIDEO_MAX_CONCURRENT_JOBS`: processing concurrency, capped at four.
- `FS_LOCAL_VIDEO_MAX_QUEUED_JOBS`: bounded waiting queue.
- `FS_LOCAL_VIDEO_MAX_TRACKING_DURATION_MS`: maximum range for one tracking job.
- `FS_LOCAL_VIDEO_MAX_TRACKING_STAGE_REQUEST_BYTES`: maximum metadata request for one verified pipeline stage, capped at 64 MiB.
- `FS_LOCAL_VIDEO_MAX_REPLAY_DURATION_MS`: maximum range for one replay buffer, capped at ten minutes.
- `FS_TRACKING_ENGINE_PATH`: approved local executable implementing the tracking provider protocol.

## Endpoints

- `GET /health`
- `POST /session`
- `GET /capabilities`
- `POST /jobs/prepare-playback`
- `POST /jobs/track-object`
- `POST /jobs/track-objects`
- `POST /jobs/run-tracking-stage`
- `POST /jobs/run-tracking-candidate-stage`
- `POST /jobs/create-proxy`
- `POST /jobs/create-replay-buffer`
- `POST /jobs/render-export`
- `GET /jobs/:id`
- `DELETE /jobs/:id`
- `POST /transcode`
- `GET /playback/:id/playback.mp4`
- `GET /tracking/:id/track.json`
- `GET /tracking/:id/tracks.json`
- `GET /tracking-stage/:id/result.json`
- `GET /proxies/:id/proxy.mp4`
- `GET /replays/:id/replay.mp4`
- `GET /exports/:id/render.mp4`

`POST /transcode` remains the synchronous compatibility route and now runs through the same protected job queue. New clients should prefer the asynchronous job route.

The server only binds to loopback. Raw match video and generated media stay on the device unless an authorized user explicitly exports or shares a portable package.

Object tracking uses a provider boundary instead of embedding an unreviewable model in the web app. The provider receives an input path, a bounded prompt request, and an output path under the `football-science-tracking-v1` protocol. It writes normalized track JSON and may stream JSON progress lines. The batch route accepts 2-8 unique targets on the same clip, angle, range, and prompt frame; all targets share one video state and the bridge rejects partial or mismatched output. Without an approved provider, the capability is hidden and analysts can still add reviewed manual keyframes.

Future full-scene stages use the separate `football-science-tracking-stage-execution-v1` runner. A registered provider becomes executable only when its exact manifest, report, evidence, native runtime, and model bytes reverify and the runtime passes the local sandbox preflight. Runtime, models, and retained match sources must be regular, non-link, read-only files. Their SHA-256, byte length, and descriptor identity are sealed before execution and the identity is checked again before any output is accepted. On macOS the runner denies network access, permits execution of only the sealed native runtime, limits readable provider/source/system paths, scrubs the environment, bounds output and wall time, monitors resident memory for the whole process group, enforces provider concurrency, and validates the returned stage artifact against the exact request fingerprint. A timeout, cancellation, memory/output breach, changed source, changed provider, or malformed result terminates the job fail-closed.

The first stage upload retains one session-owned local source artifact. Later association, re-identification, and classification jobs can reuse that exact source by job id while sending their bounded metadata request as JSON. Another bridge session cannot read or reuse it. The browser receives expiring access only to the normalized result JSON; provider paths, model paths, raw frames, and source paths are never returned. No full-scene provider ships with the companion today, so this boundary does not by itself make detection, re-identification, team, ball, referee, or shirt classification available.

Benchmark candidates use a separate `football-science-tracking-candidate-registry-v1` root and `run-tracking-candidate-stage` route. A candidate installation contains only its canonical `candidate` manifest, native runtime, and model descriptors; it must declare offline inference, reviewed licence and dataset rights, and exact source/runtime/model checksums. It runs through the same network-denied sandbox and file seals, but every registry record, job, and browser result is marked `benchmarkOnly`. Candidate output is never listed as `run-tracking-stage`, never satisfies activated readiness, and must still collect and pass real-match evidence before it can be installed in the approved registry.

The generic approved-provider installer consumes that exact candidate plus a passed benchmark report and reproducible provider evidence. It derives a new approved manifest and atomically copies sealed artifacts into the separate approved registry; it never edits or removes the candidate installation. `tracking:provider:plan` performs the full read-only readiness check. `tracking:provider:install` additionally requires `--accept-license` and `--approve-local-activation`, then keeps the target only after approved-registry resolution and network-denied sandbox preflight both pass.

Candidate jobs also emit a separate `evidence.json` using `football-science-tracking-candidate-stage-run-v1`. The exact response bytes have their own SHA-256, while the artifact binds the canonical request, provider manifest and execution fingerprints, normalized stage result, source/range, sandbox isolation, wall time, output size, and real-time factor. The browser accepts it only from the same loopback origin and verifies the response checksum plus provider/source/request/result binding. Stage inputs use nested allowlists: association receives complete bounded observations, re-identification and classification receive complete materialized trajectories, and segmentation receives geometry and synchronized times without Football Science player, clip, or file identities.

`tracking-intelligence-v2-pipeline` composes benchmark-only detection, association, re-identification, and classification candidates in that order. Association output is joined back to the exact detection observations before the learned identity stages run. The resulting player, ball, and referee tracks enter the existing analyst review workflow with stage-evidence hashes, confidence, discontinuities, team, and shirt evidence. Raw stage runs are recursively immutable; manual position, continuity, visibility, split, identity-swap, and identity-assignment corrections operate only on review copies.

## Approved tracking provider

The packaged optional provider uses the official Apache-2.0 SAM 2.1 Hiera Tiny source and checkpoint. Neither asset is stored in Git or deployed with the web app. Installation is explicit, device-local, hash-verified, and isolated from the system Python environment. Startup verifies the installed Football Science provider runtime hash as well as the upstream source and checkpoint evidence.

Review the immutable asset plan first:

```bash
npm --prefix desktop/local-video-app run tracking:plan
```

Install after reviewing `tracking-providers/sam2/THIRD_PARTY_NOTICES.md`:

```bash
npm --prefix desktop/local-video-app run tracking:install -- --accept-license
```

Python 3.10, 3.11, or 3.12 is required. The installer finds a supported version without replacing the system Python. Verify the finished local installation with:

```bash
npm --prefix desktop/local-video-app run tracking:preflight
npm --prefix desktop/local-video-app run tracking:smoke -- --batch --json --progress
```

Inference performs no network calls. It samples only the bounded synchronized source range, tracks forward and backward from the analyst's exact prompt frame, and returns review-state metadata with detection confidence, identity confidence, and explicit continuity breaks. The batch smoke compares one shared-state run with repeated single-target runs and returns aggregate timing and quality evidence only. Match video and dense tracking points remain on the device.

## Independent tracking evaluation

The optional TrackEval package is a separate reference evaluator. It does not track video or approve a model by installation alone. It recomputes HOTA, CLEAR/MOTA, and Identity/IDF1 from normalized benchmark trajectories using a pinned, hash-verified upstream source and an isolated Python environment.

```bash
npm --prefix desktop/local-video-app run tracking:trackeval:plan
npm --prefix desktop/local-video-app run tracking:trackeval:install -- --accept-license
npm --prefix desktop/local-video-app run tracking:trackeval:preflight
npm --prefix desktop/local-video-app run tracking:benchmark -- --input /absolute/local/football-scene.json --trackeval
```

Evaluation receives no video, image frame, source path, player identity, team identity, or shirt number. Only normalized boxes, opaque trajectory IDs, entity class, timestamps, and the source SHA-256 fingerprint enter the temporary local request; the request is deleted after the bounded evaluation process exits.
