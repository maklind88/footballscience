# Anchor-calibrated Role and Team Reference

## Status

`anchor-color-role-team-reference@0.1.0` is a local, deterministic classification candidate. It is not an activated tracking provider and it is not evidence of elite football quality. Installation is benchmark-only until representative, independently reviewed real-match cases establish role and team accuracy, abstention quality, correction burden, and workstation performance.

The candidate exists to close one precise gap safely: a generic person detector can produce trajectories without claiming that those people are players or referees. An analyst supplies bounded role and team anchors from the same sealed association artifact. The provider uses those anchors to classify other trajectories and abstains with `unknown` when the colour evidence is weak or ambiguous.

## Algorithm boundary

- Input is one sealed local H.264 MOV/MP4 source and canonical person/player trajectories.
- At most eight role anchors and eight team anchors are accepted, with at most four per label.
- Role anchors may reference only compatible person/player trajectories. A known player cannot be anchored as a referee.
- Team anchors may reference only person/player trajectories, never ball or referee trajectories.
- A narrow torso crop is sampled from each trajectory at a bounded rate and frame count.
- Grass-like hue is excluded. The remaining hue, achromatic brightness, and saturation histograms form a small normalized feature vector.
- Role output requires both player and referee prototypes. Team output requires both home and away prototypes.
- Distance, margin, and confidence thresholds are exact model-specification inputs. Any failed threshold returns `unknown`.
- No image, crop, embedding, player identity, team identity, path, or URL appears in the result artifact.

The implementation is a reference baseline, not the final learned classifier. Its purpose is to make analyst calibration, abstention, source binding, local execution, and benchmark evidence measurable before a more capable model is considered.

## Security and reproducibility

The arm64 macOS runtime is built from checksum-pinned provider sources and FFmpeg `9.0.1`. FFmpeg is configured with network, programs, shared libraries, hardware decoding, AVDevice, AVFilter, and unrelated codecs disabled. Only the H.264 decoder/parser, MOV demuxer, and local file protocol are enabled.

The build rejects the runtime unless architecture, byte size, SHA-256, code signature, dynamic dependencies, and imported network symbols match the reviewed boundary. Candidate execution still passes through FS Player's default-deny macOS sandbox with network denied and exact source/model/runtime file seals checked before and after execution.

Canonical runtime:

- architecture: `arm64`
- minimum macOS: `13.0`
- bytes: `3,000,560`
- SHA-256: `7c167a3e5a7e9021a0b3584a3a660bdd6880938b0d14128699486d97e12996b9`

## Licence and data boundary

The Football Science adapter and deterministic specification are internal product artifacts under `LicenseRef-Football-Science-Internal`. No redistribution right is granted by this repository record. The candidate manifest explicitly sets `redistributeUpstreamAssets` to false.

The runtime statically links a minimal reviewed FFmpeg `9.0.1` build. FFmpeg's own applicable licence and notice obligations remain separate and must be satisfied before any redistribution. This candidate is currently for local internal evaluation only.

There is no learned model and no training dataset. The pinned "model" artifact is a 713-byte deterministic feature/decision specification. Its sole provenance dataset record points to the synthetic fixture below because the provider contract requires every executable classification artifact to carry explicit provenance. Real match video is never training data and remains local session-owned input.

## Synthetic reference fixture

`qa/fixtures/video-analysis/anchor-color-classifier-synthetic-fixture.json` describes a deterministic scene with no real people or personal data: green background, two red home players, two blue away players, and one yellow referee. It is used only to verify calibration semantics, abstention, exact labels, and output contracts. It cannot establish real-match quality.

## Local build and candidate manifest

The build accepts only already available, exact local release artifacts and has no downloader:

```bash
npm --prefix desktop/local-video-app run tracking:candidate:build:anchor-color -- \
  --ffmpeg-archive /private/path/ffmpeg-9.0.1.tar.xz \
  --ffmpeg-signature /private/path/ffmpeg-9.0.1.tar.xz.asc \
  --output /private/path/anchor-color-provider
```

After the source is committed, create a canonical manifest pinned to that exact commit:

```bash
npm --prefix desktop/local-video-app run tracking:candidate:manifest:anchor-color -- \
  --source-commit <40-character-commit> \
  --output /private/path/anchor-color-manifest.json
```

Installation uses the existing candidate-only installer and requires explicit licence acceptance. It never activates the provider:

```bash
npm --prefix desktop/local-video-app run tracking:candidate:install -- \
  --manifest /private/path/anchor-color-manifest.json \
  --runtime /private/path/anchor-color-provider \
  --model anchor-color-classifier-spec-v1=desktop/local-video-app/tracking-stage-candidates/providers/anchor-color-classifier-spec.json \
  --accept-license
```

## Approval work still required

Before local optional activation, the exact candidate must pass representative real-match cases with independent exhaustive ground truth. Required evidence includes player/referee role accuracy, home/away accuracy, per-class coverage, false assignment rate, abstention quality, camera/lighting/kit variation, worst-case real-time factor, correction count and time, and exact provider-run lineage. Synthetic or anchor-echo success is never sufficient.
