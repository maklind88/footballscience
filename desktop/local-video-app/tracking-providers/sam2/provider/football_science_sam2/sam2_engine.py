from __future__ import annotations

import gc
import os
import platform
import time
from typing import Any, Callable, Dict, List, Optional

from .protocol import ProviderError


def _elapsed_ms(started_at: float) -> int:
    return max(0, round((time.perf_counter() - started_at) * 1000))


class Sam2Engine:
    def __init__(self, checkpoint: str, config: str, requested_device: str = "auto") -> None:
        if platform.system() == "Darwin":
            os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")
        try:
            import torch
        except ImportError as error:
            raise ProviderError("The isolated PyTorch runtime is not installed.") from error
        self.torch = torch
        self.checkpoint = checkpoint
        self.config = config
        self.requested_device = str(requested_device or "auto").lower()
        self.device = self._resolve_device(self.requested_device)
        self.cpu_threads = int(torch.get_num_threads())
        if self.device.type == "cpu":
            configured_threads = str(os.environ.get("FS_SAM2_CPU_THREADS", "0")).strip()
            try:
                requested_threads = int(configured_threads or "0")
            except ValueError as error:
                raise ProviderError("The configured tracking CPU thread count is invalid.") from error
            if requested_threads < 0 or requested_threads > 64:
                raise ProviderError("The configured tracking CPU thread count is invalid.")
            if requested_threads:
                torch.set_num_threads(requested_threads)
            self.cpu_threads = int(torch.get_num_threads())
        self._predictor = None
        self.last_job_telemetry: Dict[str, int] = {}
        self.model_load_ms = 0

    def _resolve_device(self, requested: str):
        torch = self.torch
        available = {
            "cpu": True,
            "cuda": bool(torch.cuda.is_available()),
            "mps": bool(getattr(torch.backends, "mps", None) and torch.backends.mps.is_available()),
        }
        if requested != "auto":
            if requested not in available or not available[requested]:
                raise ProviderError(f"The requested tracking device '{requested}' is unavailable.")
            return torch.device(requested)
        if available["cuda"]:
            return torch.device("cuda")
        if available["mps"]:
            return torch.device("mps")
        return torch.device("cpu")

    @property
    def device_name(self) -> str:
        return str(self.device.type)

    def _observation(self, mask_logits, frame_index: int) -> Optional[Dict[str, float]]:
        torch = self.torch
        logits = mask_logits.detach()
        while logits.ndim > 2:
            logits = logits[0]
        positive = logits > 0
        positive_count = int(positive.sum().item())
        height, width = int(logits.shape[-2]), int(logits.shape[-1])
        area_ratio = positive_count / max(1, height * width)
        if positive_count < 4 or area_ratio > 0.5:
            return None
        indexes = torch.nonzero(positive, as_tuple=False)
        minimum_y = int(indexes[:, 0].min().item())
        maximum_y = int(indexes[:, 0].max().item())
        minimum_x = int(indexes[:, 1].min().item())
        maximum_x = int(indexes[:, 1].max().item())
        box_width = (maximum_x - minimum_x + 1) / width
        box_height = (maximum_y - minimum_y + 1) / height
        center_x = (minimum_x + maximum_x + 1) / (2 * width)
        center_y = (minimum_y + maximum_y + 1) / (2 * height)
        confidence = float(torch.sigmoid(logits[positive]).mean().item())
        return {
            "frameIndex": frame_index,
            "x": center_x,
            "y": center_y,
            "width": box_width,
            "height": box_height,
            "groundX": center_x,
            "groundY": min(1.0, (maximum_y + 1) / height),
            "confidence": confidence,
        }

    def warm(self):
        if self._predictor is not None:
            return self._predictor
        try:
            from sam2.build_sam import build_sam2_video_predictor
        except ImportError as error:
            raise ProviderError("The approved SAM 2 source package is not installed.") from error
        torch = self.torch
        if self.device.type == "cuda":
            torch.backends.cuda.matmul.allow_tf32 = True
            torch.backends.cudnn.allow_tf32 = True
        started_at = time.perf_counter()
        self._predictor = build_sam2_video_predictor(
            self.config,
            self.checkpoint,
            device=self.device,
            apply_postprocessing=False,
        )
        self.model_load_ms = max(1, round((time.perf_counter() - started_at) * 1000))
        return self._predictor

    def close(self) -> None:
        predictor = self._predictor
        self._predictor = None
        if predictor is not None:
            del predictor
        gc.collect()
        torch = self.torch
        if self.device.type == "cuda":
            torch.cuda.empty_cache()
        elif self.device.type == "mps" and hasattr(torch.mps, "empty_cache"):
            torch.mps.empty_cache()

    def _track_many_once(
        self,
        frames_dir: str,
        prompts: List[Dict[str, Any]],
        prompt_index: int,
        progress: Callable[[str, float], None],
    ) -> List[Dict[int, Dict[str, float]]]:
        torch = self.torch
        predictor = self.warm()
        state = None
        observations: List[Dict[int, Dict[str, float]]] = [{} for _ in prompts]
        state_init_ms = 0
        prompt_ms = 0
        forward_propagation_ms = 0
        reverse_propagation_ms = 0
        propagated_frame_count = 0
        cleanup_ms = 0
        try:
            state_started_at = time.perf_counter()
            state = predictor.init_state(
                video_path=frames_dir,
                offload_video_to_cpu=self.device.type != "cpu",
                offload_state_to_cpu=False,
                async_loading_frames=False,
            )
            state_init_ms = _elapsed_ms(state_started_at)
            frame_count = int(state["num_frames"])
            width = int(state["video_width"])
            height = int(state["video_height"])
            object_indexes = {}
            prompt_started_at = time.perf_counter()
            for index, prompt in enumerate(prompts):
                object_id = index + 1
                object_indexes[object_id] = index
                box = prompt["box"]
                box_pixels = [
                    box["left"] * width,
                    box["top"] * height,
                    (box["left"] + box["width"]) * width,
                    (box["top"] + box["height"]) * height,
                ]
                _, object_ids, masks = predictor.add_new_points_or_box(
                    state,
                    frame_idx=prompt_index,
                    obj_id=object_id,
                    box=box_pixels,
                )
                normalized_ids = [int(value) for value in object_ids]
                mask_index = normalized_ids.index(object_id)
                prompted = self._observation(masks[mask_index], prompt_index)
                if prompted:
                    observations[index][prompt_index] = prompted
            prompt_ms = _elapsed_ms(prompt_started_at)
            directions = [
                ("forward", False, max(0, frame_count - prompt_index - 1), frame_count - prompt_index),
                ("reverse", True, max(0, prompt_index), prompt_index + 1 if prompt_index > 0 else 0),
            ]
            processed_frames = 0
            total_frames = max(1, sum(expected for _, _, _, expected in directions))
            for direction, reverse, maximum, expected in directions:
                if expected < 1:
                    continue
                direction_started_at = time.perf_counter()
                for frame_index, object_ids, mask_logits in predictor.propagate_in_video(
                    state,
                    start_frame_idx=prompt_index,
                    max_frame_num_to_track=maximum,
                    reverse=reverse,
                ):
                    for mask_index, object_id in enumerate(object_ids):
                        result_index = object_indexes.get(int(object_id))
                        if result_index is None:
                            continue
                        observation = self._observation(mask_logits[mask_index], int(frame_index))
                        if observation:
                            observations[result_index][int(frame_index)] = observation
                    processed_frames += 1
                    progress(
                        f"Tracking {len(prompts)} objects" if len(prompts) > 1 else "Tracking object",
                        0.35 + 0.55 * processed_frames / total_frames,
                    )
                direction_ms = _elapsed_ms(direction_started_at)
                if direction == "reverse":
                    reverse_propagation_ms = direction_ms
                else:
                    forward_propagation_ms = direction_ms
            propagated_frame_count = processed_frames
            return observations
        finally:
            cleanup_started_at = time.perf_counter()
            if state is not None:
                predictor.reset_state(state)
            gc.collect()
            if self.device.type == "cuda":
                torch.cuda.empty_cache()
            elif self.device.type == "mps" and hasattr(torch.mps, "empty_cache"):
                torch.mps.empty_cache()
            cleanup_ms = _elapsed_ms(cleanup_started_at)
            self.last_job_telemetry = {
                "stateInitMs": state_init_ms,
                "promptMs": prompt_ms,
                "forwardPropagationMs": forward_propagation_ms,
                "reversePropagationMs": reverse_propagation_ms,
                "cleanupMs": cleanup_ms,
                "propagatedFrameCount": propagated_frame_count,
                "objectCount": len(prompts),
            }

    def track(
        self,
        frames_dir: str,
        prompt: Dict[str, Any],
        prompt_index: int,
        progress: Callable[[str, float], None],
    ) -> Dict[int, Dict[str, float]]:
        return self.track_many(frames_dir, [prompt], prompt_index, progress)[0]

    def track_many(
        self,
        frames_dir: str,
        prompts: List[Dict[str, Any]],
        prompt_index: int,
        progress: Callable[[str, float], None],
    ) -> List[Dict[int, Dict[str, float]]]:
        try:
            return self._track_many_once(frames_dir, prompts, prompt_index, progress)
        except RuntimeError as error:
            if self.requested_device != "auto" or self.device.type != "mps":
                raise
            progress("Retrying tracking on CPU", 0.32)
            self.close()
            self.device = self.torch.device("cpu")
            try:
                return self._track_many_once(frames_dir, prompts, prompt_index, progress)
            except RuntimeError as fallback_error:
                self.close()
                raise ProviderError("SAM 2 could not complete tracking on this computer.") from fallback_error
