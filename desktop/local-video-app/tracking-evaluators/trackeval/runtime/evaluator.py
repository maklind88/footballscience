#!/usr/bin/env python3
"""Bounded local adapter for the pinned TrackEval metric implementation."""

from __future__ import annotations

import argparse
import importlib
import json
import math
import os
from pathlib import Path
import re
import sys
import tempfile
import types
from typing import Any


PROTOCOL = "football-science-trackeval-reference-v1"
ENTITY_TYPES = ("player", "ball", "referee")
HEX_64 = re.compile(r"^[a-f0-9]{64}$")
HEX_40 = re.compile(r"^[a-f0-9]{40}$")
MAX_REQUEST_BYTES = 32 * 1024 * 1024
MAX_REPORT_BYTES = 8 * 1024 * 1024
MAX_SEQUENCES = 100
MAX_TIMESTEPS = 50_000
MAX_OBSERVATIONS = 500_000


class EvaluationError(Exception):
    pass


def _bounded_string(value: Any, label: str, maximum: int = 160) -> str:
    text = str(value or "").strip()
    if not text or len(text) > maximum or "\n" in text or "\r" in text:
        raise EvaluationError(f"Invalid {label}.")
    return text


def _finite(value: Any, label: str) -> float:
    if isinstance(value, bool):
        raise EvaluationError(f"Invalid {label}.")
    try:
        number = float(value)
    except (TypeError, ValueError) as error:
        raise EvaluationError(f"Invalid {label}.") from error
    if not math.isfinite(number):
        raise EvaluationError(f"Invalid {label}.")
    return number


def _source_metadata() -> tuple[Path, str, str]:
    source_dir = Path(os.environ.get("FS_TRACKEVAL_SOURCE_DIR", "")).resolve()
    commit = str(os.environ.get("FS_TRACKEVAL_SOURCE_COMMIT", "")).lower()
    source_sha256 = str(os.environ.get("FS_TRACKEVAL_SOURCE_SHA256", "")).lower()
    required = (
        source_dir / "LICENSE",
        source_dir / "trackeval" / "metrics" / "hota.py",
        source_dir / "trackeval" / "metrics" / "clear.py",
        source_dir / "trackeval" / "metrics" / "identity.py",
    )
    if not HEX_40.fullmatch(commit) or not HEX_64.fullmatch(source_sha256) or not all(path.is_file() for path in required):
        raise EvaluationError("Pinned TrackEval source is unavailable or incomplete.")
    return source_dir, commit, source_sha256


def _load_metrics(source_dir: Path):
    import numpy as np

    if not hasattr(np, "float"):
        np.float = float
    if not hasattr(np, "int"):
        np.int = int

    package_dir = source_dir / "trackeval"
    root = types.ModuleType("trackeval")
    root.__path__ = [str(package_dir)]
    metrics_package = types.ModuleType("trackeval.metrics")
    metrics_package.__path__ = [str(package_dir / "metrics")]
    sys.modules["trackeval"] = root
    sys.modules["trackeval.metrics"] = metrics_package
    hota = importlib.import_module("trackeval.metrics.hota").HOTA
    clear = importlib.import_module("trackeval.metrics.clear").CLEAR
    identity = importlib.import_module("trackeval.metrics.identity").Identity
    return np, hota, clear, identity


def _validate_box(value: Any, label: str) -> list[float]:
    if not isinstance(value, list) or len(value) != 4:
        raise EvaluationError(f"Invalid {label}.")
    x, y, width, height = (_finite(entry, label) for entry in value)
    if width <= 0 or height <= 0 or width > 1 or height > 1 or x < 0 or x > 1 or y < 0 or y > 1:
        raise EvaluationError(f"Invalid {label}.")
    if x - width / 2 < -0.0001 or x + width / 2 > 1.0001 or y - height / 2 < -0.0001 or y + height / 2 > 1.0001:
        raise EvaluationError(f"Invalid {label}.")
    return [x, y, width, height]


def _validate_observations(values: Any, label: str) -> list[dict[str, Any]]:
    if not isinstance(values, list) or len(values) > 1000:
        raise EvaluationError(f"Invalid {label}.")
    observations = []
    seen_ids = set()
    for index, value in enumerate(values):
        if not isinstance(value, dict):
            raise EvaluationError(f"Invalid {label} observation.")
        track_id = _bounded_string(value.get("id"), f"{label} id")
        entity_type = _bounded_string(value.get("entityType"), f"{label} entity type", 20).lower()
        if entity_type not in ENTITY_TYPES or track_id in seen_ids:
            raise EvaluationError(f"Invalid {label} observation identity.")
        seen_ids.add(track_id)
        observations.append({
            "id": track_id,
            "entityType": entity_type,
            "box": _validate_box(value.get("box"), f"{label} box {index + 1}"),
        })
    return observations


def _validate_sequence(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise EvaluationError("Invalid TrackEval sequence.")
    sequence_id = _bounded_string(value.get("benchmarkId"), "benchmark id", 120)
    fingerprint = str(value.get("sourceFingerprint", "")).lower()
    if not HEX_64.fullmatch(fingerprint):
        raise EvaluationError("Invalid source fingerprint.")
    timesteps = value.get("timesteps")
    if not isinstance(timesteps, list) or not timesteps or len(timesteps) > MAX_TIMESTEPS:
        raise EvaluationError("Invalid TrackEval timestep count.")
    normalized = []
    previous_at = -1
    observed_types = set()
    for timestep in timesteps:
        if not isinstance(timestep, dict):
            raise EvaluationError("Invalid TrackEval timestep.")
        at_ms = int(_finite(timestep.get("atMs"), "timestep time"))
        if at_ms < 0 or at_ms <= previous_at:
            raise EvaluationError("TrackEval timesteps must be strictly ordered.")
        previous_at = at_ms
        truth = _validate_observations(timestep.get("truth"), "ground truth")
        prediction = _validate_observations(timestep.get("prediction"), "prediction")
        observed_types.update(entry["entityType"] for entry in truth)
        normalized.append({"atMs": at_ms, "truth": truth, "prediction": prediction})
    if observed_types != set(ENTITY_TYPES):
        raise EvaluationError("Ground truth must include players, the ball, and referees.")
    return {"benchmarkId": sequence_id, "sourceFingerprint": fingerprint, "timesteps": normalized}


def _validate_request(value: Any, expected_commit: str, expected_sha256: str) -> dict[str, Any]:
    if not isinstance(value, dict) or value.get("schemaVersion") != 1 or value.get("protocol") != PROTOCOL:
        raise EvaluationError("Unsupported TrackEval request protocol.")
    evaluator = value.get("evaluator")
    if not isinstance(evaluator, dict) or evaluator.get("commit") != expected_commit or evaluator.get("sourceSha256") != expected_sha256:
        raise EvaluationError("TrackEval request does not match the installed pinned source.")
    threshold = _finite(value.get("threshold"), "matching threshold")
    if abs(threshold - 0.5) > 1e-12:
        raise EvaluationError("The TrackEval reference threshold must be 0.5.")
    raw_sequences = value.get("sequences")
    if not isinstance(raw_sequences, list) or not raw_sequences or len(raw_sequences) > MAX_SEQUENCES:
        raise EvaluationError("Invalid TrackEval sequence count.")
    sequences = [_validate_sequence(sequence) for sequence in raw_sequences]
    ids = [sequence["benchmarkId"] for sequence in sequences]
    if len(ids) != len(set(ids)):
        raise EvaluationError("TrackEval benchmark ids must be unique.")
    observation_count = sum(
        len(timestep[side])
        for sequence in sequences
        for timestep in sequence["timesteps"]
        for side in ("truth", "prediction")
    )
    if observation_count > MAX_OBSERVATIONS:
        raise EvaluationError("TrackEval request has too many observations.")
    return {"threshold": threshold, "sequences": sequences}


def _box_iou(np, truth_boxes: list[list[float]], prediction_boxes: list[list[float]]):
    scores = np.zeros((len(truth_boxes), len(prediction_boxes)), dtype=float)
    for truth_index, (tx, ty, tw, th) in enumerate(truth_boxes):
        truth_left, truth_top = tx - tw / 2, ty - th / 2
        truth_right, truth_bottom = tx + tw / 2, ty + th / 2
        for prediction_index, (px, py, pw, ph) in enumerate(prediction_boxes):
            prediction_left, prediction_top = px - pw / 2, py - ph / 2
            prediction_right, prediction_bottom = px + pw / 2, py + ph / 2
            overlap_width = max(0.0, min(truth_right, prediction_right) - max(truth_left, prediction_left))
            overlap_height = max(0.0, min(truth_bottom, prediction_bottom) - max(truth_top, prediction_top))
            intersection = overlap_width * overlap_height
            union = tw * th + pw * ph - intersection
            scores[truth_index, prediction_index] = intersection / union if union > 0 else 0.0
    return scores


def _sequence_data(np, sequence: dict[str, Any], entity_type: str | None = None) -> dict[str, Any]:
    filtered = []
    for timestep in sequence["timesteps"]:
        truth = [entry for entry in timestep["truth"] if entity_type is None or entry["entityType"] == entity_type]
        prediction = [entry for entry in timestep["prediction"] if entity_type is None or entry["entityType"] == entity_type]
        filtered.append((truth, prediction))
    truth_ids = {track_id: index for index, track_id in enumerate(sorted({entry["id"] for truth, _ in filtered for entry in truth}))}
    prediction_ids = {track_id: index for index, track_id in enumerate(sorted({entry["id"] for _, prediction in filtered for entry in prediction}))}
    return {
        "num_timesteps": len(filtered),
        "num_gt_ids": len(truth_ids),
        "num_tracker_ids": len(prediction_ids),
        "num_gt_dets": sum(len(truth) for truth, _ in filtered),
        "num_tracker_dets": sum(len(prediction) for _, prediction in filtered),
        "gt_ids": [np.asarray([truth_ids[entry["id"]] for entry in truth], dtype=int) for truth, _ in filtered],
        "tracker_ids": [np.asarray([prediction_ids[entry["id"]] for entry in prediction], dtype=int) for _, prediction in filtered],
        "similarity_scores": [
            _box_iou(np, [entry["box"] for entry in truth], [entry["box"] for entry in prediction])
            for truth, prediction in filtered
        ],
    }


def _ratio(value: Any) -> float:
    number = float(value)
    if -1e-9 <= number <= 1 + 1e-9:
        return min(1.0, max(0.0, number))
    return number


def _metrics_payload(np, hota_result: dict[str, Any], clear_result: dict[str, Any], identity_result: dict[str, Any]):
    return {
        "HOTA": _ratio(np.mean(hota_result["HOTA"])),
        "DetA": _ratio(np.mean(hota_result["DetA"])),
        "AssA": _ratio(np.mean(hota_result["AssA"])),
        "LocA": _ratio(np.mean(hota_result["LocA"])),
        "MOTA": _ratio(clear_result["MOTA"]),
        "IDF1": _ratio(identity_result["IDF1"]),
        "IDP": _ratio(identity_result["IDP"]),
        "IDR": _ratio(identity_result["IDR"]),
        "identitySwitches": int(clear_result["IDSW"]),
        "fragmentations": int(clear_result["Frag"]),
    }


def _counts(data: dict[str, Any]) -> dict[str, int]:
    return {
        "timesteps": int(data["num_timesteps"]),
        "groundTruthDetections": int(data["num_gt_dets"]),
        "predictionDetections": int(data["num_tracker_dets"]),
        "groundTruthIdentities": int(data["num_gt_ids"]),
        "predictionIdentities": int(data["num_tracker_ids"]),
    }


def _evaluate(request: dict[str, Any], source_dir: Path, commit: str, source_sha256: str) -> dict[str, Any]:
    np, hota_class, clear_class, identity_class = _load_metrics(source_dir)
    hota_metric = hota_class()
    clear_metric = clear_class({"THRESHOLD": request["threshold"], "PRINT_CONFIG": False})
    identity_metric = identity_class({"THRESHOLD": request["threshold"], "PRINT_CONFIG": False})

    def run(data):
        return (
            hota_metric.eval_sequence(data),
            clear_metric.eval_sequence(data),
            identity_metric.eval_sequence(data),
        )

    raw_sequences = {}
    raw_entities = {entity_type: {} for entity_type in ENTITY_TYPES}
    sequence_reports = []
    for sequence in request["sequences"]:
        data = _sequence_data(np, sequence)
        raw = run(data)
        raw_sequences[sequence["benchmarkId"]] = raw
        per_entity = {}
        for entity_type in ENTITY_TYPES:
            entity_data = _sequence_data(np, sequence, entity_type)
            entity_raw = run(entity_data)
            raw_entities[entity_type][sequence["benchmarkId"]] = entity_raw
            per_entity[entity_type] = {
                "metrics": _metrics_payload(np, *entity_raw),
                "counts": _counts(entity_data),
            }
        sequence_reports.append({
            "benchmarkId": sequence["benchmarkId"],
            "sourceFingerprint": sequence["sourceFingerprint"],
            "metrics": _metrics_payload(np, *raw),
            "counts": _counts(data),
            "perEntity": per_entity,
        })

    def combine(results):
        hota_results = {key: value[0] for key, value in results.items()}
        clear_results = {key: value[1] for key, value in results.items()}
        identity_results = {key: value[2] for key, value in results.items()}
        return _metrics_payload(
            np,
            hota_metric.combine_sequences(hota_results),
            clear_metric.combine_sequences(clear_results),
            identity_metric.combine_sequences(identity_results),
        )

    summary_counts = {
        key: sum(report["counts"][key] for report in sequence_reports)
        for key in sequence_reports[0]["counts"]
    }
    summary_entities = {}
    for entity_type in ENTITY_TYPES:
        summary_entities[entity_type] = {
            "metrics": combine(raw_entities[entity_type]),
            "counts": {
                key: sum(report["perEntity"][entity_type]["counts"][key] for report in sequence_reports)
                for key in sequence_reports[0]["counts"]
            },
        }
    return {
        "schemaVersion": 1,
        "protocol": PROTOCOL,
        "evaluator": {"name": "TrackEval", "commit": commit, "sourceSha256": source_sha256},
        "threshold": request["threshold"],
        "sequenceCount": len(sequence_reports),
        "summary": {"metrics": combine(raw_sequences), "counts": summary_counts, "perEntity": summary_entities},
        "sequences": sequence_reports,
    }


def _read_json(path_value: str) -> Any:
    path = Path(path_value).resolve()
    size = path.stat().st_size
    if size <= 0 or size > MAX_REQUEST_BYTES:
        raise EvaluationError("TrackEval request is empty or outside the size limit.")
    return json.loads(path.read_text(encoding="utf-8"))


def _write_json(path_value: str, value: Any) -> None:
    target = Path(path_value).resolve()
    payload = json.dumps(value, ensure_ascii=True, allow_nan=False, separators=(",", ":")) + "\n"
    if len(payload.encode("utf-8")) > MAX_REPORT_BYTES:
        raise EvaluationError("TrackEval report exceeded the size limit.")
    target.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix=f".{target.name}.", dir=str(target.parent))
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            handle.write(payload)
        os.chmod(temporary, 0o600)
        os.replace(temporary, target)
    except Exception:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass
        raise


def _preflight(source_dir: Path, commit: str, source_sha256: str) -> dict[str, Any]:
    request = {
        "threshold": 0.5,
        "sequences": [{
            "benchmarkId": "preflight",
            "sourceFingerprint": "0" * 64,
            "timesteps": [
                {
                    "atMs": at_ms,
                    "truth": [
                        {"id": "player", "entityType": "player", "box": [0.2, 0.5, 0.1, 0.2]},
                        {"id": "ball", "entityType": "ball", "box": [0.5, 0.6, 0.03, 0.03]},
                        {"id": "referee", "entityType": "referee", "box": [0.7, 0.5, 0.08, 0.2]},
                    ],
                    "prediction": [
                        {"id": "player", "entityType": "player", "box": [0.2, 0.5, 0.1, 0.2]},
                        {"id": "ball", "entityType": "ball", "box": [0.5, 0.6, 0.03, 0.03]},
                        {"id": "referee", "entityType": "referee", "box": [0.7, 0.5, 0.08, 0.2]},
                    ],
                }
                for at_ms in (0, 40)
            ],
        }],
    }
    report = _evaluate(request, source_dir, commit, source_sha256)
    metrics = report["summary"]["metrics"]
    ok = all(abs(metrics[name] - 1.0) < 1e-12 for name in ("HOTA", "DetA", "AssA", "LocA", "MOTA", "IDF1"))
    return {
        "ok": ok,
        "protocol": PROTOCOL,
        "evaluator": "TrackEval",
        "commit": commit,
        "sourceSha256": source_sha256,
        "metrics": metrics,
        "python": sys.version.split()[0],
    }


def main() -> int:
    parser = argparse.ArgumentParser(prog="football-science-trackeval")
    parser.add_argument("--input")
    parser.add_argument("--output")
    parser.add_argument("--preflight", action="store_true")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    source_dir, commit, source_sha256 = _source_metadata()
    if args.preflight:
        report = _preflight(source_dir, commit, source_sha256)
        print(json.dumps(report, separators=(",", ":")) if args.json else json.dumps(report, indent=2))
        return 0 if report["ok"] else 1
    if not args.input or not args.output:
        raise EvaluationError("--input and --output are required.")
    request = _validate_request(_read_json(args.input), commit, source_sha256)
    _write_json(args.output, _evaluate(request, source_dir, commit, source_sha256))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (EvaluationError, OSError, ValueError, json.JSONDecodeError) as error:
        print(f"ERROR | {error}", file=sys.stderr)
        raise SystemExit(2)
