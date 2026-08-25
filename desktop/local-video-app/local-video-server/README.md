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
- `FS_LOCAL_VIDEO_ALLOW_LOCAL_DEV=0`: disable localhost development origins.
- `FS_LOCAL_VIDEO_MAX_INPUT_BYTES`: maximum accepted request body.
- `FS_LOCAL_VIDEO_MAX_CACHE_BYTES`: total cache quota.
- `FS_LOCAL_VIDEO_MAX_CONCURRENT_JOBS`: processing concurrency, capped at four.
- `FS_LOCAL_VIDEO_MAX_QUEUED_JOBS`: bounded waiting queue.
- `FS_LOCAL_VIDEO_MAX_TRACKING_DURATION_MS`: maximum range for one tracking job.
- `FS_LOCAL_VIDEO_MAX_REPLAY_DURATION_MS`: maximum range for one replay buffer, capped at ten minutes.
- `FS_TRACKING_ENGINE_PATH`: approved local executable implementing the tracking provider protocol.

## Endpoints

- `GET /health`
- `POST /session`
- `GET /capabilities`
- `POST /jobs/prepare-playback`
- `POST /jobs/track-object`
- `POST /jobs/create-proxy`
- `POST /jobs/create-replay-buffer`
- `POST /jobs/render-export`
- `GET /jobs/:id`
- `DELETE /jobs/:id`
- `POST /transcode`
- `GET /playback/:id/playback.mp4`
- `GET /tracking/:id/track.json`
- `GET /proxies/:id/proxy.mp4`
- `GET /replays/:id/replay.mp4`
- `GET /exports/:id/render.mp4`

`POST /transcode` remains the synchronous compatibility route and now runs through the same protected job queue. New clients should prefer the asynchronous job route.

The server only binds to loopback. Raw match video and generated media stay on the device unless an authorized user explicitly exports or shares a portable package.

Object tracking uses a provider boundary instead of embedding an unreviewable model in the web app. The provider receives an input path, a bounded prompt request, and an output path under the `football-science-tracking-v1` protocol. It writes normalized track JSON and may stream JSON progress lines. Without an approved provider, the capability is hidden and analysts can still add reviewed manual keyframes.
