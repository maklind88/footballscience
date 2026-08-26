from __future__ import annotations

import math
import uuid
from typing import Any, Dict, Iterable, List, Optional

from .protocol import ProviderError


def _clamp(value: float, minimum: float = 0.0, maximum: float = 1.0) -> float:
    return min(maximum, max(minimum, float(value)))


def _iou(first: Dict[str, float], second: Dict[str, float]) -> float:
    first_left = first["x"] - first["width"] / 2
    first_top = first["y"] - first["height"] / 2
    second_left = second["x"] - second["width"] / 2
    second_top = second["y"] - second["height"] / 2
    overlap_width = max(0.0, min(first_left + first["width"], second_left + second["width"]) - max(first_left, second_left))
    overlap_height = max(0.0, min(first_top + first["height"], second_top + second["height"]) - max(first_top, second_top))
    intersection = overlap_width * overlap_height
    union = first["width"] * first["height"] + second["width"] * second["height"] - intersection
    return intersection / union if union > 0 else 0.0


def _continuity(current: Dict[str, float], neighbor: Dict[str, float]) -> float:
    overlap = _iou(current, neighbor)
    current_area = max(0.000001, current["width"] * current["height"])
    neighbor_area = max(0.000001, neighbor["width"] * neighbor["height"])
    area_similarity = min(current_area, neighbor_area) / max(current_area, neighbor_area)
    distance = math.hypot(current["x"] - neighbor["x"], current["y"] - neighbor["y"])
    scale = max(0.02, math.sqrt(max(current_area, neighbor_area)))
    movement_score = max(0.0, 1.0 - distance / (scale * 3.5))
    geometry = 0.45 * overlap + 0.25 * area_similarity + 0.30 * movement_score
    return _clamp(current["confidence"] * geometry)


def _identity_scores(observations: Dict[int, Dict[str, float]], prompt_index: int) -> Dict[int, float]:
    indexes = sorted(observations)
    if not indexes:
        return {}
    anchor = min(indexes, key=lambda index: abs(index - prompt_index))
    scores = {anchor: 1.0}
    anchor_position = indexes.index(anchor)
    previous_index = anchor
    for index in indexes[anchor_position + 1 :]:
        continuity = _continuity(observations[index], observations[previous_index])
        scores[index] = min(scores[previous_index], continuity)
        previous_index = index
    previous_index = anchor
    for index in reversed(indexes[:anchor_position]):
        continuity = _continuity(observations[index], observations[previous_index])
        scores[index] = min(scores[previous_index], continuity)
        previous_index = index
    return scores


def _match_time(frame_index: int, prompt: Dict[str, Any], sample_fps: float) -> int:
    source_at_ms = min(
        prompt["sourceEndMs"],
        prompt["sourceStartMs"] + int(round(frame_index * 1000 / sample_fps)),
    )
    source_span = max(1, prompt["sourceEndMs"] - prompt["sourceStartMs"])
    match_span = prompt["endMs"] - prompt["startMs"]
    ratio = (source_at_ms - prompt["sourceStartMs"]) / source_span
    return min(prompt["endMs"], prompt["startMs"] + int(round(ratio * match_span)))


def _point(observation: Dict[str, float], identity: float, at_ms: int) -> Dict[str, Any]:
    return {
        "atMs": at_ms,
        "frameIndex": int(observation["frameIndex"]),
        "x": _clamp(observation["x"]),
        "y": _clamp(observation["y"]),
        "width": _clamp(observation["width"]),
        "height": _clamp(observation["height"]),
        "groundX": _clamp(observation.get("groundX", observation["x"])),
        "groundY": _clamp(observation.get("groundY", observation["y"] + observation["height"] / 2)),
        "confidence": _clamp(observation["confidence"]),
        "identityConfidence": _clamp(identity),
        "occluded": False,
        "source": "automatic",
    }


def _segments(points: Iterable[Dict[str, Any]], sample_fps: float) -> List[Dict[str, Any]]:
    maximum_gap = max(2, int(math.ceil(sample_fps * 0.24)))
    groups: List[List[Dict[str, Any]]] = []
    for point in sorted(points, key=lambda item: item["frameIndex"]):
        if not groups or point["frameIndex"] - groups[-1][-1]["frameIndex"] > maximum_gap:
            groups.append([point])
        else:
            groups[-1].append(point)
    result = []
    for index, group in enumerate(groups):
        unique_by_time = {}
        for point in group:
            current = unique_by_time.get(point["atMs"])
            if not current or point["identityConfidence"] > current["identityConfidence"]:
                unique_by_time[point["atMs"]] = point
        ordered = [unique_by_time[key] for key in sorted(unique_by_time)]
        if not ordered:
            continue
        result.append({
            "id": f"segment-{index + 1}",
            "startMs": ordered[0]["atMs"],
            "endMs": ordered[-1]["atMs"],
            "confidence": sum(point["confidence"] for point in ordered) / len(ordered),
            "discontinuityBefore": index > 0,
            "points": ordered,
        })
    return result


def build_track(
    observations: Dict[int, Dict[str, float]],
    prompt: Dict[str, Any],
    prompt_index: int,
    sample_fps: float,
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    identities = _identity_scores(observations, prompt_index)
    points = []
    for frame_index, observation in observations.items():
        identity = identities.get(frame_index, 0.0)
        if observation["confidence"] < 0.35 or identity < 0.25:
            continue
        points.append(_point(observation, identity, _match_time(frame_index, prompt, sample_fps)))
    segments = _segments(points, sample_fps)
    if not segments:
        raise ProviderError("The provider could not maintain the selected object's continuity.")
    all_points = [point for segment in segments for point in segment["points"]]
    return {
        "id": f"track-{uuid.uuid4()}",
        "entityType": "player",
        "status": "review",
        "startMs": prompt["startMs"],
        "endMs": prompt["endMs"],
        "confidence": sum(point["confidence"] for point in all_points) / len(all_points),
        "identityConfidence": sum(point["identityConfidence"] for point in all_points) / len(all_points),
        "segments": segments,
        "metadata": dict(metadata or {}),
    }
