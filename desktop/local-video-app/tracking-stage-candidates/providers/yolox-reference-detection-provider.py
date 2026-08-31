#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
# Detection pre/post-processing is derived from the official YOLOX ONNX Runtime demo.
# Copyright (c) Megvii, Inc. and its affiliates.
import argparse
import hashlib
import json
import os
import sys
from pathlib import Path

import cv2
import numpy as np
import onnxruntime


RESULT_PROTOCOL = "football-science-tracking-stage-result-v1"
REQUEST_PROTOCOL = "football-science-tracking-stage-request-v1"
INVOCATION_PROTOCOL = "football-science-tracking-stage-invocation-v1"
MODEL_ID = "yolox-s-coco-onnx"
MODEL_SHA256 = "c5c2d13e59ae883e6af3b45daea64af4833a4951c92d116ec270d9ddbe998063"
PERSON_CLASS = 0
BALL_CLASS = 32
INPUT_SHAPE = (640, 640)
PERSON_THRESHOLD = 0.2
BALL_THRESHOLD = 0.02
NMS_THRESHOLD = 0.45


def fail(message):
    raise RuntimeError(message)


def canonical_json(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def sha256_bytes(value):
    return hashlib.sha256(value).hexdigest()


def sha256_file(file_path):
    digest = hashlib.sha256()
    with open(file_path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def exact_keys(value, keys, label):
    if not isinstance(value, dict) or set(value) != set(keys):
        fail(f"{label}-invalid")


def load_json(file_path, maximum_bytes, label):
    path = Path(file_path).resolve(strict=True)
    if path.is_symlink() or not path.is_file() or path.stat().st_size > maximum_bytes:
        fail(f"{label}-unsafe")
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def provider_manifest(runtime_path):
    manifest_path = Path(runtime_path).resolve(strict=True).parent.parent / "manifest.json"
    manifest = load_json(manifest_path, 2 * 1024 * 1024, "manifest")
    if manifest.get("schemaVersion") != 1 or manifest.get("protocol") != "football-science-tracking-stage-v1":
        fail("manifest-protocol-invalid")
    if manifest.get("stage") != "detection" or manifest.get("approval", {}).get("status") != "candidate":
        fail("manifest-scope-invalid")
    if manifest.get("approval", {}).get("networkAtInference") is not False:
        fail("manifest-network-invalid")
    return manifest


def provider_fingerprint(manifest):
    runtime = manifest["runtime"]
    runtime_payload = {
        "providerSha256": runtime["providerSha256"],
        "maxFrames": runtime["maxFrames"],
        "maxDurationMs": runtime["maxDurationMs"],
        "maxWallTimeMs": runtime["maxWallTimeMs"],
        "maxMemoryMb": runtime["maxMemoryMb"],
        "maxOutputBytes": runtime["maxOutputBytes"],
        "maxConcurrentJobs": runtime["maxConcurrentJobs"],
        "device": runtime["device"],
        "runtimeMode": runtime["runtimeMode"],
        "cpuThreads": runtime["cpuThreads"],
        "sampleFps": runtime["sampleFps"],
        "modelResident": runtime["modelResident"],
    }
    payload = {
        "schemaVersion": manifest["schemaVersion"],
        "protocol": manifest["protocol"],
        "providerId": manifest["providerId"],
        "providerVersion": manifest["providerVersion"],
        "displayName": manifest["displayName"],
        "stage": manifest["stage"],
        "priority": manifest["priority"],
        "capabilities": sorted(manifest["capabilities"]),
        "upstream": manifest["upstream"],
        "models": manifest["models"],
        "runtime": runtime_payload,
    }
    return sha256_bytes(canonical_json(payload).encode("utf-8"))


def request_fingerprint(manifest, request, fingerprint):
    payload = {
        "schemaVersion": 1,
        "protocol": REQUEST_PROTOCOL,
        "provider": {
            "id": manifest["providerId"],
            "version": manifest["providerVersion"],
            "fingerprintSha256": fingerprint,
        },
        "stage": manifest["stage"],
        "capabilities": sorted(manifest["capabilities"]),
        "sourceFingerprint": request["sourceFingerprint"],
        "range": request["range"],
    }
    return sha256_bytes(canonical_json(payload).encode("utf-8"))


def preprocess(image):
    padded = np.full((INPUT_SHAPE[0], INPUT_SHAPE[1], 3), 114, dtype=np.uint8)
    ratio = min(INPUT_SHAPE[0] / image.shape[0], INPUT_SHAPE[1] / image.shape[1])
    resized = cv2.resize(
        image,
        (int(image.shape[1] * ratio), int(image.shape[0] * ratio)),
        interpolation=cv2.INTER_LINEAR,
    )
    padded[: resized.shape[0], : resized.shape[1]] = resized
    return np.ascontiguousarray(padded.transpose(2, 0, 1).astype(np.float32)), ratio


def decode(outputs):
    grids = []
    strides = []
    for stride in (8, 16, 32):
        height, width = INPUT_SHAPE[0] // stride, INPUT_SHAPE[1] // stride
        x, y = np.meshgrid(np.arange(width), np.arange(height))
        grid = np.stack((x, y), axis=2).reshape(1, -1, 2)
        grids.append(grid)
        strides.append(np.full((*grid.shape[:2], 1), stride))
    grid = np.concatenate(grids, axis=1)
    expanded = np.concatenate(strides, axis=1)
    outputs[..., :2] = (outputs[..., :2] + grid) * expanded
    outputs[..., 2:4] = np.exp(outputs[..., 2:4]) * expanded
    return outputs


def nms(boxes, scores):
    x1, y1, x2, y2 = boxes.T
    areas = (x2 - x1 + 1) * (y2 - y1 + 1)
    order = scores.argsort()[::-1]
    keep = []
    while order.size:
        index = order[0]
        keep.append(index)
        xx1 = np.maximum(x1[index], x1[order[1:]])
        yy1 = np.maximum(y1[index], y1[order[1:]])
        xx2 = np.minimum(x2[index], x2[order[1:]])
        yy2 = np.minimum(y2[index], y2[order[1:]])
        width = np.maximum(0.0, xx2 - xx1 + 1)
        height = np.maximum(0.0, yy2 - yy1 + 1)
        overlap = width * height / (areas[index] + areas[order[1:]] - width * height)
        order = order[np.where(overlap <= NMS_THRESHOLD)[0] + 1]
    return keep


def frame_detections(prediction, ratio, width, height, capabilities):
    raw_boxes = prediction[:, :4]
    scores = prediction[:, 4:5] * prediction[:, 5:]
    boxes = np.empty_like(raw_boxes)
    boxes[:, 0] = raw_boxes[:, 0] - raw_boxes[:, 2] / 2
    boxes[:, 1] = raw_boxes[:, 1] - raw_boxes[:, 3] / 2
    boxes[:, 2] = raw_boxes[:, 0] + raw_boxes[:, 2] / 2
    boxes[:, 3] = raw_boxes[:, 1] + raw_boxes[:, 3] / 2
    boxes /= ratio
    definitions = []
    if "detect:player" in capabilities:
        definitions.append((PERSON_CLASS, "player", PERSON_THRESHOLD))
    if "detect:ball" in capabilities:
        definitions.append((BALL_CLASS, "ball", BALL_THRESHOLD))
    result = []
    for class_index, entity_type, threshold in definitions:
        class_scores = scores[:, class_index]
        mask = class_scores > threshold
        if not mask.any():
            continue
        class_boxes = boxes[mask]
        class_scores = class_scores[mask]
        for index in nms(class_boxes, class_scores):
            left, top, right, bottom = class_boxes[index]
            left = min(width - 1, max(0.0, float(left)))
            top = min(height - 1, max(0.0, float(top)))
            right = min(float(width), max(left + 1.0, float(right)))
            bottom = min(float(height), max(top + 1.0, float(bottom)))
            result.append({
                "entityType": entity_type,
                "confidence": float(class_scores[index]),
                "box": {
                    "left": left / width,
                    "top": top / height,
                    "width": (right - left) / width,
                    "height": (bottom - top) / height,
                },
            })
    return sorted(result, key=lambda item: (-item["confidence"], item["entityType"]))


def run_detection(invocation, manifest, model_path):
    request = invocation["request"]
    start_ms = int(request["range"]["startMs"])
    end_ms = int(request["range"]["endMs"])
    if end_ms <= start_ms or end_ms - start_ms > int(manifest["runtime"]["maxDurationMs"]):
        fail("request-range-invalid")
    source_path = Path(invocation["source"]["filePath"]).resolve(strict=True)
    capture = cv2.VideoCapture(str(source_path))
    if not capture.isOpened():
        fail("source-open-failed")
    fps = float(capture.get(cv2.CAP_PROP_FPS))
    width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
    if not np.isfinite(fps) or fps <= 0 or width < 2 or height < 2:
        fail("source-metadata-invalid")
    sample_fps = float(manifest["runtime"]["sampleFps"])
    frame_step = fps / sample_fps
    start_frame = round(start_ms * fps / 1000)
    end_frame = round(end_ms * fps / 1000)
    capture.set(cv2.CAP_PROP_POS_FRAMES, start_frame)
    session_options = onnxruntime.SessionOptions()
    session_options.intra_op_num_threads = int(manifest["runtime"]["cpuThreads"])
    session_options.inter_op_num_threads = 1
    session = onnxruntime.InferenceSession(
        str(model_path),
        sess_options=session_options,
        providers=["CPUExecutionProvider"],
    )
    observations = []
    source_frame = start_frame
    next_sample = float(start_frame)
    sample_index = 0
    try:
        while source_frame < end_frame:
            ok, image = capture.read()
            if not ok:
                break
            if source_frame + 1e-6 >= next_sample:
                tensor, ratio = preprocess(image)
                raw = session.run(None, {session.get_inputs()[0].name: tensor[None]})[0]
                values = frame_detections(
                    decode(raw)[0], ratio, width, height, set(manifest["capabilities"]),
                )
                frame_index = source_frame - start_frame
                at_ms = min(end_ms, start_ms + round(frame_index * 1000 / fps))
                for ordinal, value in enumerate(values):
                    observations.append({
                        "id": f"det-{frame_index}-{value['entityType']}-{ordinal}",
                        "atMs": at_ms,
                        "frameIndex": frame_index,
                        **value,
                    })
                sample_index += 1
                next_sample = start_frame + sample_index * frame_step
            source_frame += 1
    finally:
        capture.release()
    if source_frame < end_frame - max(2, round(fps)):
        fail("source-ended-before-request")
    if len(observations) > 250_000:
        fail("observation-limit-exceeded")
    return observations


def main():
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--fs-tracking-stage-invocation", required=True)
    parser.add_argument("--fs-tracking-stage-output", required=True)
    args = parser.parse_args()
    if os.environ.get("FS_TRACKING_NETWORK_DISABLED") != "1":
        fail("network-boundary-missing")
    invocation = load_json(args.fs_tracking_stage_invocation, 64 * 1024 * 1024, "invocation")
    exact_keys(invocation, ["schemaVersion", "protocol", "provider", "request", "source", "models", "output"], "invocation")
    if invocation.get("schemaVersion") != 1 or invocation.get("protocol") != INVOCATION_PROTOCOL:
        fail("invocation-protocol-invalid")
    manifest = provider_manifest(sys.executable)
    provider = invocation["provider"]
    if provider != {
        "id": manifest["providerId"],
        "version": manifest["providerVersion"],
        "stage": manifest["stage"],
    }:
        fail("invocation-provider-mismatch")
    models = invocation["models"]
    if not isinstance(models, list) or len(models) != 1 or models[0].get("id") != MODEL_ID:
        fail("model-set-invalid")
    model_path = Path(models[0]["filePath"]).resolve(strict=True)
    if models[0].get("sha256") != MODEL_SHA256 or sha256_file(model_path) != MODEL_SHA256:
        fail("model-checksum-mismatch")
    fingerprint = provider_fingerprint(manifest)
    observations = run_detection(invocation, manifest, model_path)
    request = invocation["request"]
    result = {
        "schemaVersion": 1,
        "protocol": RESULT_PROTOCOL,
        "provider": {
            "id": manifest["providerId"],
            "version": manifest["providerVersion"],
            "fingerprintSha256": fingerprint,
        },
        "stage": manifest["stage"],
        "capabilities": sorted(manifest["capabilities"]),
        "sourceFingerprint": request["sourceFingerprint"],
        "requestFingerprint": request_fingerprint(manifest, request, fingerprint),
        "range": request["range"],
        "payload": {"observations": observations},
    }
    encoded = (canonical_json(result) + "\n").encode("utf-8")
    maximum_bytes = min(int(invocation["output"]["maximumBytes"]), int(manifest["runtime"]["maxOutputBytes"]))
    if not encoded or len(encoded) > maximum_bytes:
        fail("result-size-invalid")
    output_path = Path(args.fs_tracking_stage_output).resolve()
    if output_path != Path(invocation["output"]["filePath"]).resolve():
        fail("output-path-mismatch")
    temporary = output_path.with_suffix(".tmp")
    with temporary.open("xb") as handle:
        handle.write(encoded)
        handle.flush()
        os.fsync(handle.fileno())
    temporary.replace(output_path)


if __name__ == "__main__":
    main()
