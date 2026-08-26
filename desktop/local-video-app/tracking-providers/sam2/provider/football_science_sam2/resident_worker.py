from __future__ import annotations

import argparse
import contextlib
import json
import re
import sys
import time
from typing import Any, Dict

from . import PROTOCOL, PROVIDER_VERSION
from .cli import _runtime_report, _settings, _tracking
from .protocol import ProviderError, require_protocol
from .sam2_engine import Sam2Engine


WORKER_PROTOCOL = "football-science-tracking-worker-v1"
MAXIMUM_COMMAND_BYTES = 16_384
JOB_ID_PATTERN = re.compile(
    r"^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$",
    re.IGNORECASE,
)
PROTOCOL_OUTPUT = sys.stdout


def _message(value: Dict[str, Any]) -> None:
    print(
        json.dumps(value, separators=(",", ":"), ensure_ascii=True),
        file=PROTOCOL_OUTPUT,
        flush=True,
    )


def parse_worker_job(value: Any) -> Dict[str, str]:
    required = {"protocol", "type", "jobId", "inputPath", "requestPath", "outputPath"}
    if not isinstance(value, dict) or set(value) != required:
        raise ProviderError("The resident tracking command is invalid.")
    if value.get("protocol") != WORKER_PROTOCOL or value.get("type") != "job":
        raise ProviderError("The resident tracking protocol is not supported.")
    job_id = str(value.get("jobId") or "")
    if not JOB_ID_PATTERN.fullmatch(job_id):
        raise ProviderError("The resident tracking job id is invalid.")
    result = {"jobId": job_id}
    for key in ("inputPath", "requestPath", "outputPath"):
        text = str(value.get(key) or "")
        if not text or len(text) > 4096 or "\x00" in text or "\r" in text or "\n" in text:
            raise ProviderError("The resident tracking job path is invalid.")
        result[key] = text
    return result


def _read_job(line: str) -> Dict[str, str]:
    if not line or len(line.encode("utf-8")) > MAXIMUM_COMMAND_BYTES:
        raise ProviderError("The resident tracking command exceeded its safety limit.")
    try:
        return parse_worker_job(json.loads(line))
    except (UnicodeError, json.JSONDecodeError) as error:
        raise ProviderError("The resident tracking command is invalid JSON.") from error


def run_resident_worker(arguments: argparse.Namespace) -> int:
    require_protocol(arguments.protocol)
    worker_started_at = time.perf_counter()
    _message({
        "protocol": WORKER_PROTOCOL,
        "type": "startup",
        "stage": "Verifying resident tracking provider",
        "ratio": 0.05,
    })
    with contextlib.redirect_stdout(sys.stderr):
        report = _runtime_report()
        settings = _settings(report)
        engine = Sam2Engine(settings["checkpoint"], settings["config"], settings["device"])
    try:
        _message({
            "protocol": WORKER_PROTOCOL,
            "type": "startup",
            "stage": "Loading resident SAM 2.1",
            "ratio": 0.15,
        })
        with contextlib.redirect_stdout(sys.stderr):
            engine.warm()
        startup_ms = max(1, round((time.perf_counter() - worker_started_at) * 1000))
        _message({
            "protocol": WORKER_PROTOCOL,
            "type": "ready",
            "provider": "sam2.1-hiera-tiny",
            "providerVersion": PROVIDER_VERSION,
            "device": engine.device_name,
            "cpuThreads": engine.cpu_threads if engine.device_name == "cpu" else 0,
            "sampleFps": settings["sampleFps"],
            "modelResident": True,
            "modelLoadMs": engine.model_load_ms,
            "startupMs": startup_ms,
        })
        sequence = 0
        for raw_line in sys.stdin:
            try:
                job = _read_job(raw_line.rstrip("\r\n"))
            except ProviderError as error:
                _message({
                    "protocol": WORKER_PROTOCOL,
                    "type": "fatal",
                    "error": str(error)[:1000],
                })
                return 2
            sequence += 1
            job_started_at = time.perf_counter()

            def emit(stage: str, ratio: float) -> None:
                _message({
                    "protocol": WORKER_PROTOCOL,
                    "type": "progress",
                    "jobId": job["jobId"],
                    "stage": str(stage)[:120],
                    "ratio": min(1.0, max(0.0, float(ratio))),
                })

            job_arguments = argparse.Namespace(
                protocol=PROTOCOL,
                input=job["inputPath"],
                request=job["requestPath"],
                output=job["outputPath"],
            )
            job_telemetry: Dict[str, Any] = {}
            try:
                with contextlib.redirect_stdout(sys.stderr):
                    _tracking(
                        job_arguments,
                        report=report,
                        settings=settings,
                        engine=engine,
                        emit=emit,
                        telemetry=job_telemetry,
                    )
            except ProviderError as error:
                _message({
                    "protocol": WORKER_PROTOCOL,
                    "type": "result",
                    "jobId": job["jobId"],
                    "ok": False,
                    "error": str(error)[:1000],
                })
                return 2
            except KeyboardInterrupt:
                raise
            except Exception as error:
                _message({
                    "protocol": WORKER_PROTOCOL,
                    "type": "result",
                    "jobId": job["jobId"],
                    "ok": False,
                    "error": f"Tracking provider failed safely: {type(error).__name__}",
                })
                return 3
            _message({
                "protocol": WORKER_PROTOCOL,
                "type": "result",
                "jobId": job["jobId"],
                "ok": True,
                "device": engine.device_name,
                "cpuThreads": engine.cpu_threads if engine.device_name == "cpu" else 0,
                "jobProcessingMs": max(1, round((time.perf_counter() - job_started_at) * 1000)),
                "modelLoadMs": engine.model_load_ms,
                "modelResident": True,
                "workerJobSequence": sequence,
                "telemetry": job_telemetry,
            })
        return 0
    finally:
        engine.close()
