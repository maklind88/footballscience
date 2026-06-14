# Local Video Server

Device-local loopback server for Football Science video playback preparation.

It binds to `127.0.0.1:47831`, accepts a selected local video from the web UI, creates a browser-playable H.264/AAC MP4 copy with FFmpeg, and serves that copy back from the same local machine.

No match video is uploaded to Supabase or any cloud service.

## Start

```bash
node desktop/local-video-app/local-video-server/server.mjs
```

FFmpeg must be installed and available in `PATH`.

## Endpoints

- `GET /health`
- `POST /transcode`
- `GET /playback/:id/playback.mp4`

The server only binds to loopback and is intended for a packaged desktop companion app in the next phase.
