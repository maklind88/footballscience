from __future__ import annotations

import math
import shutil
import subprocess
from pathlib import Path
from typing import Any, Dict, List

from .protocol import ProviderError

_active_process = None


def _ffmpeg_command(value: str) -> str:
    candidate = str(value or "ffmpeg")
    resolved = candidate if Path(candidate).is_file() else shutil.which(candidate)
    if not resolved:
        raise ProviderError("The approved local FFmpeg engine is unavailable.")
    return resolved


def cancel_active_process() -> None:
    process = _active_process
    if process and process.poll() is None:
        process.terminate()


def prompt_frame_index(prompt: Dict[str, Any], sample_fps: float, frame_count: int) -> int:
    relative_ms = prompt["sourcePromptAtMs"] - prompt["sourceStartMs"]
    requested = int(round(relative_ms * sample_fps / 1000))
    return min(max(0, frame_count - 1), max(0, requested))


def extract_sample_frames(
    input_path: Path,
    frames_dir: Path,
    prompt: Dict[str, Any],
    ffmpeg_path: str,
    sample_fps: float,
    maximum_frames: int,
) -> List[Path]:
    global _active_process
    source_duration_ms = prompt["sourceEndMs"] - prompt["sourceStartMs"]
    expected_frames = max(1, int(math.ceil(source_duration_ms * sample_fps / 1000)) + 1)
    if expected_frames > maximum_frames:
        raise ProviderError("The requested tracking range would create too many sampled frames.")
    frames_dir.mkdir(parents=True, exist_ok=False)
    filter_graph = f"fps={sample_fps:g},scale=w='min(1280,iw)':h=-2:flags=lanczos"
    arguments = [
        _ffmpeg_command(ffmpeg_path),
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        str(input_path),
        "-ss",
        f"{prompt['sourceStartMs'] / 1000:.6f}",
        "-t",
        f"{source_duration_ms / 1000:.6f}",
        "-map",
        "0:v:0",
        "-an",
        "-vf",
        filter_graph,
        "-frames:v",
        str(maximum_frames),
        "-q:v",
        "3",
        "-start_number",
        "0",
        str(frames_dir / "%06d.jpg"),
    ]
    _active_process = subprocess.Popen(arguments, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    try:
        _, stderr = _active_process.communicate()
        if _active_process.returncode != 0:
            message = stderr.decode("utf-8", errors="replace").strip()[-1000:]
            raise ProviderError(message or "The local video frames could not be sampled.")
    finally:
        _active_process = None
    frames = sorted(frames_dir.glob("*.jpg"), key=lambda item: int(item.stem))
    if not frames:
        raise ProviderError("No video frames were found in the synchronized tracking range.")
    if len(frames) > maximum_frames:
        raise ProviderError("The tracking frame count exceeded the local safety limit.")
    return frames
