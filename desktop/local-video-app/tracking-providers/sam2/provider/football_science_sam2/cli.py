from __future__ import annotations

import argparse
import json
import os
import shutil
import signal
import sys
import tempfile
from pathlib import Path
from typing import Any, Dict

from . import PROTOCOL, PROVIDER_VERSION
from .media import cancel_active_process, extract_sample_frames, prompt_frame_index
from .protocol import (
    ProviderError,
    atomic_write_json,
    read_request,
    require_protocol,
    sha256_file,
    validate_job_paths,
)
from .sam2_engine import Sam2Engine
from .track_builder import build_track


def _emit(stage: str, ratio: float) -> None:
    print(json.dumps({"stage": str(stage)[:120], "ratio": min(1.0, max(0.0, float(ratio)))}), flush=True)


def _environment_path(name: str) -> Path:
    value = str(os.environ.get(name, "")).strip()
    if not value:
        raise ProviderError(f"The approved provider setting {name} is missing.")
    return Path(value).expanduser().resolve()


def _runtime_report() -> Dict[str, Any]:
    if sys.version_info < (3, 10) or sys.version_info >= (3, 13):
        raise ProviderError("The SAM 2 provider requires Python 3.10, 3.11, or 3.12.")
    checkpoint = _environment_path("FS_SAM2_CHECKPOINT")
    if not checkpoint.is_file() or checkpoint.is_symlink():
        raise ProviderError("The approved SAM 2 checkpoint is unavailable.")
    expected_sha256 = str(os.environ.get("FS_SAM2_CHECKPOINT_SHA256", "")).lower()
    if len(expected_sha256) != 64 or sha256_file(checkpoint) != expected_sha256:
        raise ProviderError("The SAM 2 checkpoint failed its integrity check.")
    ffmpeg_value = str(os.environ.get("FS_SAM2_FFMPEG_PATH", "ffmpeg"))
    ffmpeg_path = ffmpeg_value if Path(ffmpeg_value).is_file() else shutil.which(ffmpeg_value)
    if not ffmpeg_path:
        raise ProviderError("The approved local FFmpeg engine is unavailable.")
    config = str(os.environ.get("FS_SAM2_CONFIG", "configs/sam2.1/sam2.1_hiera_t.yaml"))
    engine = Sam2Engine(str(checkpoint), config, os.environ.get("FS_SAM2_DEVICE", "auto"))
    try:
        from sam2.build_sam import build_sam2_video_predictor  # noqa: F401
    except ImportError as error:
        raise ProviderError("The approved SAM 2 source package is unavailable.") from error
    return {
        "ok": True,
        "provider": "sam2.1-hiera-tiny",
        "providerVersion": PROVIDER_VERSION,
        "protocol": PROTOCOL,
        "device": engine.device_name,
        "python": ".".join(map(str, sys.version_info[:3])),
        "torch": str(engine.torch.__version__),
        "checkpointSha256": expected_sha256,
        "networkAtInference": False,
    }


def _settings(report: Dict[str, Any]) -> Dict[str, Any]:
    configured_fps = float(os.environ.get("FS_SAM2_SAMPLE_FPS", "12.5"))
    sample_fps = min(25.0, max(1.0, configured_fps))
    if report["device"] == "cpu":
        sample_fps = min(sample_fps, 6.25)
    maximum_frames = min(30_000, max(1, int(os.environ.get("FS_SAM2_MAX_FRAMES", "30000"))))
    return {
        "checkpoint": str(_environment_path("FS_SAM2_CHECKPOINT")),
        "config": str(os.environ.get("FS_SAM2_CONFIG", "configs/sam2.1/sam2.1_hiera_t.yaml")),
        "device": str(os.environ.get("FS_SAM2_DEVICE", "auto")),
        "ffmpeg": str(os.environ.get("FS_SAM2_FFMPEG_PATH", "ffmpeg")),
        "maximumFrames": maximum_frames,
        "model": str(os.environ.get("FS_SAM2_MODEL_NAME", "SAM 2.1 Hiera Tiny"))[:120],
        "sampleFps": sample_fps,
    }


def _tracking(arguments: argparse.Namespace) -> int:
    require_protocol(arguments.protocol)
    input_path = Path(arguments.input)
    request_path = Path(arguments.request)
    output_path = Path(arguments.output)
    validate_job_paths(input_path, request_path, output_path)
    request = read_request(request_path)
    prompts = request["prompts"] if isinstance(request.get("prompts"), list) else [request]
    prompt = prompts[0]
    _emit("Verifying local tracking provider", 0.03)
    report = _runtime_report()
    settings = _settings(report)
    engine = Sam2Engine(settings["checkpoint"], settings["config"], settings["device"])
    with tempfile.TemporaryDirectory(prefix="fs-sam2-", dir=str(request_path.resolve().parent)) as temporary:
        frames_dir = Path(temporary) / "frames"
        _emit("Sampling synchronized video frames", 0.12)
        frames = extract_sample_frames(
            input_path.resolve(),
            frames_dir,
            prompt,
            settings["ffmpeg"],
            settings["sampleFps"],
            settings["maximumFrames"],
        )
        prompt_index = prompt_frame_index(prompt, settings["sampleFps"], len(frames))
        _emit("Loading SAM 2.1", 0.30)
        observations = engine.track_many(frames_dir.as_posix(), prompts, prompt_index, _emit)
        tracks = [
            build_track(
                object_observations,
                target_prompt,
                prompt_index,
                settings["sampleFps"],
                {
                    "device": engine.device_name,
                    "model": settings["model"],
                    "promptFrameIndex": prompt_index,
                    "providerProtocol": PROTOCOL,
                    "sampleFps": settings["sampleFps"],
                },
            )
            for object_observations, target_prompt in zip(observations, prompts)
        ]
    _emit("Writing review tracks" if len(tracks) > 1 else "Writing review track", 0.96)
    artifact = {"schemaVersion": 1, "tracks": tracks} if len(tracks) > 1 else tracks[0]
    atomic_write_json(output_path, artifact)
    _emit("Tracking ready for review", 1.0)
    return 0


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="football-science-sam2-provider")
    parser.add_argument("--protocol", default="")
    parser.add_argument("--input", default="")
    parser.add_argument("--request", default="")
    parser.add_argument("--output", default="")
    parser.add_argument("--preflight", action="store_true")
    parser.add_argument("--json", action="store_true")
    return parser


def main(values=None) -> int:
    arguments = _parser().parse_args(values)
    def cancel_tracking(*_):
        cancel_active_process()
        raise KeyboardInterrupt

    signal.signal(signal.SIGTERM, cancel_tracking)
    signal.signal(signal.SIGINT, cancel_tracking)
    try:
        if arguments.preflight:
            report = _runtime_report()
            print(json.dumps(report) if arguments.json else json.dumps(report, indent=2))
            return 0
        if not arguments.input or not arguments.request or not arguments.output:
            raise ProviderError("Tracking requires input, request, and output paths.")
        return _tracking(arguments)
    except ProviderError as error:
        print(str(error)[:1000], file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        print("Tracking was cancelled.", file=sys.stderr)
        return 130
    except Exception as error:
        print(f"Tracking provider failed safely: {type(error).__name__}: {str(error)[:500]}", file=sys.stderr)
        return 3
