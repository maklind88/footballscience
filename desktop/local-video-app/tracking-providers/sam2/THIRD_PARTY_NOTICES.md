# SAM 2.1 tracking provider

Football Science does not commit or redistribute SAM 2 source archives, model weights, or Python wheels in this repository. The optional installer downloads them directly from the pinned upstream locations in `manifest.json` after explicit user acceptance and verifies both the source archive and checkpoint with SHA-256 before use.

The pinned SAM 2 source and SAM 2.1 model checkpoint are published by Meta Platforms, Inc. under Apache License 2.0. The complete upstream license remains at `source/LICENSE` in every local installation.

Runtime packages are installed into a provider-only virtual environment from the exact direct versions listed in `torch-requirements.txt` and `runtime-requirements.txt`, with transitive versions constrained by `runtime-constraints.txt`. Their package metadata and license files remain in that environment, and `installed-packages.txt` records the resolved dependency set. They are not bundled into the Football Science web deployment.

Official sources:

- SAM 2 repository and license: https://github.com/facebookresearch/sam2
- Pinned source commit: https://github.com/facebookresearch/sam2/tree/2b90b9f5ceec907a1c18123530e92e794ad901a4
- PyTorch: https://github.com/pytorch/pytorch
- Torchvision: https://github.com/pytorch/vision

The approval in `manifest.json` is a Football Science packaging decision for optional device-local use, not legal advice and not permission to remove upstream notices.
