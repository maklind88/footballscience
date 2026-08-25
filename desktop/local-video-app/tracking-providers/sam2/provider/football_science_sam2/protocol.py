from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
from typing import Any, Dict

from . import PROTOCOL


class ProviderError(RuntimeError):
    """A bounded error that is safe to return through the local bridge."""


def _integer(value: Any, fallback: int = 0) -> int:
    try:
        return int(round(float(value)))
    except (TypeError, ValueError, OverflowError):
        return fallback


def _number(value: Any, fallback: float = 0.0) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError, OverflowError):
        return fallback
    return number if number == number and abs(number) != float("inf") else fallback


def _text(value: Any, maximum: int = 160) -> str:
    return str(value or "").strip()[:maximum]


def _box(value: Any) -> Dict[str, float]:
    source = value if isinstance(value, dict) else {}
    result = {
        "left": _number(source.get("left")),
        "top": _number(source.get("top")),
        "width": _number(source.get("width")),
        "height": _number(source.get("height")),
    }
    if (
        result["left"] < 0
        or result["top"] < 0
        or result["width"] <= 0
        or result["height"] <= 0
        or result["left"] + result["width"] > 1
        or result["top"] + result["height"] > 1
    ):
        raise ProviderError("The tracking target must be a normalized box inside the video frame.")
    return result


def normalize_request(value: Any, maximum_duration_ms: int = 1_200_000) -> Dict[str, Any]:
    if not isinstance(value, dict) or value.get("protocolVersion") != 1:
        raise ProviderError("The tracking request protocol version is not supported.")
    source = value.get("prompt")
    if not isinstance(source, dict):
        raise ProviderError("The tracking request does not contain a prompt.")
    start_ms = max(0, _integer(source.get("startMs")))
    end_ms = max(start_ms + 1, _integer(source.get("endMs"), start_ms + 5000))
    source_start_ms = max(0, _integer(source.get("sourceStartMs"), start_ms))
    source_end_ms = max(source_start_ms + 1, _integer(source.get("sourceEndMs"), source_start_ms + end_ms - start_ms))
    if end_ms - start_ms > maximum_duration_ms or source_end_ms - source_start_ms > maximum_duration_ms:
        raise ProviderError("The requested tracking range exceeds the provider safety limit.")
    prompt_at_ms = min(end_ms, max(start_ms, _integer(source.get("promptAtMs"), start_ms)))
    source_prompt_at_ms = min(
        source_end_ms,
        max(source_start_ms, _integer(source.get("sourcePromptAtMs"), source_start_ms + prompt_at_ms - start_ms)),
    )
    return {
        "id": _text(source.get("id")),
        "clipId": _text(source.get("clipId")),
        "videoId": _text(source.get("videoId")),
        "playerId": _text(source.get("playerId")),
        "playerLabel": _text(source.get("playerLabel")),
        "teamSide": _text(source.get("teamSide"), 40),
        "angleId": _text(source.get("angleId")),
        "startMs": start_ms,
        "endMs": end_ms,
        "promptAtMs": prompt_at_ms,
        "sourceStartMs": source_start_ms,
        "sourceEndMs": source_end_ms,
        "sourcePromptAtMs": source_prompt_at_ms,
        "box": _box(source.get("box")),
    }


def read_request(file_path: Path, maximum_bytes: int = 65_536) -> Dict[str, Any]:
    if not file_path.is_file() or file_path.is_symlink():
        raise ProviderError("The tracking request file is unavailable.")
    if file_path.stat().st_size > maximum_bytes:
        raise ProviderError("The tracking request exceeded its safety limit.")
    try:
        value = json.loads(file_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise ProviderError("The tracking request is invalid JSON.") from error
    return normalize_request(value)


def validate_job_paths(input_path: Path, request_path: Path, output_path: Path) -> None:
    input_resolved = input_path.resolve(strict=True)
    request_resolved = request_path.resolve(strict=True)
    output_resolved = output_path.resolve(strict=False)
    if input_path.is_symlink() or request_path.is_symlink() or not input_resolved.is_file():
        raise ProviderError("Tracking inputs must be regular local job files.")
    if input_resolved.parent != request_resolved.parent or output_resolved.parent != request_resolved.parent:
        raise ProviderError("Tracking files must remain inside one local job directory.")
    if output_path.exists() or output_path.is_symlink():
        raise ProviderError("The tracking output path must be new.")


def sha256_file(file_path: Path) -> str:
    digest = hashlib.sha256()
    with file_path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def atomic_write_json(file_path: Path, value: Dict[str, Any]) -> None:
    temporary = file_path.with_name(f".{file_path.name}.{os.getpid()}.partial")
    try:
        with temporary.open("x", encoding="utf-8") as output:
            json.dump(value, output, separators=(",", ":"), ensure_ascii=True)
            output.flush()
            os.fsync(output.fileno())
        temporary.replace(file_path)
    finally:
        temporary.unlink(missing_ok=True)


def require_protocol(value: str) -> None:
    if value != PROTOCOL:
        raise ProviderError("The requested tracking provider protocol is not supported.")
