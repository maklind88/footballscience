#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
import runpy
import sys
from pathlib import Path

import onnxruntime


COREML_PROVIDER = "CoreMLExecutionProvider"
CPU_PROVIDER = "CPUExecutionProvider"
BASE_PROVIDER_FILE = "yolox-reference-detection-provider.py"
_inference_session = onnxruntime.InferenceSession


def coreml_inference_session(*args, **kwargs):
    if kwargs.get("providers") != [CPU_PROVIDER]:
        raise RuntimeError("coreml-wrapper-provider-request-invalid")
    available = onnxruntime.get_available_providers()
    if COREML_PROVIDER not in available:
        raise RuntimeError("coreml-execution-provider-unavailable")
    session_options = kwargs.get("sess_options")
    if session_options is not None:
        session_options.log_severity_level = 3
    kwargs["providers"] = [COREML_PROVIDER, CPU_PROVIDER]
    session = _inference_session(*args, **kwargs)
    if session.get_providers()[:2] != [COREML_PROVIDER, CPU_PROVIDER]:
        raise RuntimeError("coreml-execution-provider-not-active")
    return session


def main():
    bundle_root = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
    base_provider = bundle_root / BASE_PROVIDER_FILE
    if not base_provider.is_file() or base_provider.is_symlink():
        raise RuntimeError("base-provider-source-unavailable")
    onnxruntime.InferenceSession = coreml_inference_session
    runpy.run_path(str(base_provider), run_name="__main__")


if __name__ == "__main__":
    main()
