# Local Video Server

Device-local loopback server for Football Science video playback preparation.

It binds to `127.0.0.1:47831`, accepts a selected local video from the web UI, creates a browser-playable MP4 copy with the bundled FFmpeg engine, and serves that copy back from the same local machine.

The preparation path is intentionally conservative:

- H.264/AAC MP4 files are remuxed first, preserving quality and finishing quickly.
- Non-browser-safe files fall back to an H.264/AAC transcode.
- Playback responses support byte ranges so large match files can seek and stream correctly.

No match video is uploaded to Supabase or any cloud service.

## Start

```bash
node desktop/local-video-app/local-video-server/server.mjs
```

The server uses `ffmpeg-static` by default. Set `FS_FFMPEG_PATH` only when you need to override the bundled binary.

## Endpoints

- `GET /health`
- `POST /transcode`
- `GET /playback/:id/playback.mp4`

The server only binds to loopback and is intended for a packaged desktop companion app in the next phase.
