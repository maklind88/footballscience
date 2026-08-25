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
npm run fs-player:tracking:plan
npm run fs-player:tracking:install -- --accept-license
npm run fs-player:tracking:preflight
```
