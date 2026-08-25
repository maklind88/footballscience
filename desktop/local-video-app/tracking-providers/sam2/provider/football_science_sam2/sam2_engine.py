from __future__ import annotations

import gc
import os
import platform
from typing import Any, Callable, Dict, Optional

from .protocol import ProviderError


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

    def _track_once(
        self,
        frames_dir: str,
        prompt: Dict[str, Any],
        prompt_index: int,
        progress: Callable[[str, float], None],
    ) -> Dict[int, Dict[str, float]]:
        try:
            from sam2.build_sam import build_sam2_video_predictor
        except ImportError as error:
            raise ProviderError("The approved SAM 2 source package is not installed.") from error
        torch = self.torch
        if self.device.type == "cuda":
            torch.backends.cuda.matmul.allow_tf32 = True
            torch.backends.cudnn.allow_tf32 = True
        predictor = build_sam2_video_predictor(
            self.config,
            self.checkpoint,
            device=self.device,
            apply_postprocessing=False,
        )
        state = None
        observations: Dict[int, Dict[str, float]] = {}
        try:
            state = predictor.init_state(
                video_path=frames_dir,
                offload_video_to_cpu=self.device.type != "cpu",
                offload_state_to_cpu=False,
                async_loading_frames=False,
            )
            frame_count = int(state["num_frames"])
            width = int(state["video_width"])
            height = int(state["video_height"])
            box = prompt["box"]
            box_pixels = [
                box["left"] * width,
                box["top"] * height,
                (box["left"] + box["width"]) * width,
                (box["top"] + box["height"]) * height,
            ]
            _, _, masks = predictor.add_new_points_or_box(
                state,
                frame_idx=prompt_index,
                obj_id=1,
                box=box_pixels,
            )
            prompted = self._observation(masks[0], prompt_index)
            if prompted:
                observations[prompt_index] = prompted
            directions = [
                (False, max(0, frame_count - prompt_index - 1)),
                (True, max(0, prompt_index)),
            ]
            for reverse, maximum in directions:
                for frame_index, object_ids, mask_logits in predictor.propagate_in_video(
                    state,
                    start_frame_idx=prompt_index,
                    max_frame_num_to_track=maximum,
                    reverse=reverse,
                ):
                    object_index = list(object_ids).index(1)
                    observation = self._observation(mask_logits[object_index], int(frame_index))
                    if observation:
                        observations[int(frame_index)] = observation
                    progress("Tracking player", 0.35 + 0.55 * len(observations) / max(1, frame_count))
            return observations
        finally:
            if state is not None:
                predictor.reset_state(state)
            del predictor
            gc.collect()
            if self.device.type == "cuda":
                torch.cuda.empty_cache()
            elif self.device.type == "mps" and hasattr(torch.mps, "empty_cache"):
                torch.mps.empty_cache()

    def track(
        self,
        frames_dir: str,
        prompt: Dict[str, Any],
        prompt_index: int,
        progress: Callable[[str, float], None],
    ) -> Dict[int, Dict[str, float]]:
        try:
            return self._track_once(frames_dir, prompt, prompt_index, progress)
        except RuntimeError as error:
            if self.requested_device != "auto" or self.device.type != "mps":
                raise
            progress("Retrying tracking on CPU", 0.32)
            self.device = self.torch.device("cpu")
            try:
                return self._track_once(frames_dir, prompt, prompt_index, progress)
            except RuntimeError as fallback_error:
                raise ProviderError("SAM 2 could not complete tracking on this computer.") from fallback_error
