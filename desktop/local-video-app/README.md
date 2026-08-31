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
