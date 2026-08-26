import sys
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROVIDER = ROOT / "desktop/local-video-app/tracking-providers/sam2/provider"
sys.path.insert(0, str(PROVIDER))

from football_science_sam2.media import prompt_frame_index
from football_science_sam2.protocol import ProviderError, normalize_batch_request, normalize_request, read_request
from football_science_sam2.resident_worker import WORKER_PROTOCOL, parse_worker_job
from football_science_sam2.track_builder import build_track


def request_value(**prompt_overrides):
    prompt = {
        "startMs": 5000,
        "endMs": 7000,
        "promptAtMs": 6000,
        "sourceStartMs": 1000,
        "sourceEndMs": 3000,
        "sourcePromptAtMs": 2000,
        "box": {"left": 0.2, "top": 0.2, "width": 0.1, "height": 0.3},
    }
    prompt.update(prompt_overrides)
    return {"protocolVersion": 1, "prompt": prompt}


def observation(frame_index, x=0.4, confidence=0.95):
    return {
        "frameIndex": frame_index,
        "x": x,
        "y": 0.45,
        "width": 0.08,
        "height": 0.22,
        "groundX": x,
        "groundY": 0.56,
        "confidence": confidence,
    }


class ProtocolTests(unittest.TestCase):
    def test_resident_worker_accepts_only_the_exact_bounded_job_envelope(self):
        value = {
            "protocol": WORKER_PROTOCOL,
            "type": "job",
            "jobId": "9f3e1a68-0f0c-4c43-bdb5-fc51834f7d11",
            "inputPath": "/tmp/job/input.mp4",
            "requestPath": "/tmp/job/request.json",
            "outputPath": "/tmp/job/output.json",
        }
        self.assertEqual(parse_worker_job(value)["jobId"], value["jobId"])
        with self.assertRaises(ProviderError):
            parse_worker_job({**value, "unexpected": True})
        with self.assertRaises(ProviderError):
            parse_worker_job({**value, "jobId": "not-a-job-id"})
        with self.assertRaises(ProviderError):
            parse_worker_job({**value, "outputPath": "/tmp/job/output.json\nnext"})

    def test_normalizes_independent_match_and_source_ranges(self):
        prompt = normalize_request(request_value())
        self.assertEqual(prompt["promptAtMs"], 6000)
        self.assertEqual(prompt["sourcePromptAtMs"], 2000)
        self.assertEqual(prompt["sourceStartMs"], 1000)

    def test_rejects_boxes_outside_the_frame(self):
        with self.assertRaises(ProviderError):
            normalize_request(request_value(box={"left": 0.95, "top": 0.2, "width": 0.1, "height": 0.2}))

    def test_prompt_frame_uses_source_time(self):
        prompt = normalize_request(request_value())
        self.assertEqual(prompt_frame_index(prompt, 10, 25), 10)

    def test_batch_requires_unique_targets_on_one_prompt_frame(self):
        first = request_value(id="target-a")["prompt"]
        second = request_value(
            id="target-b",
            box={"left": 0.5, "top": 0.2, "width": 0.1, "height": 0.3},
        )["prompt"]
        prompts = normalize_batch_request({"protocolVersion": 1, "prompts": [first, second]})
        self.assertEqual([prompt["id"] for prompt in prompts], ["target-a", "target-b"])
        with self.assertRaises(ProviderError):
            normalize_batch_request({"protocolVersion": 1, "prompts": [first, {**second, "promptAtMs": 6100}]})
        with self.assertRaises(ProviderError):
            normalize_batch_request({"protocolVersion": 1, "prompts": [first, {**second, "id": "target-a"}]})

    def test_reads_a_bounded_batch_request_from_disk(self):
        first = request_value(id="target-a")["prompt"]
        second = request_value(
            id="target-b",
            box={"left": 0.5, "top": 0.2, "width": 0.1, "height": 0.3},
        )["prompt"]
        with tempfile.TemporaryDirectory() as directory:
            request_path = Path(directory) / "request.json"
            request_path.write_text(json.dumps({"protocolVersion": 1, "prompts": [first, second]}))
            self.assertEqual(len(read_request(request_path)["prompts"]), 2)

    def test_disk_request_respects_the_host_duration_limit(self):
        with tempfile.TemporaryDirectory() as directory:
            request_path = Path(directory) / "request.json"
            request_path.write_text(json.dumps(request_value()))
            with self.assertRaises(ProviderError):
                read_request(request_path, maximum_duration_ms=1000)


class TrackBuilderTests(unittest.TestCase):
    def test_builds_review_segments_on_continuity_gaps(self):
        prompt = normalize_request(request_value())
        observations = {
            0: observation(0, 0.38),
            1: observation(1, 0.39),
            2: observation(2, 0.40),
            8: observation(8, 0.41),
            9: observation(9, 0.42),
        }
        track = build_track(observations, prompt, prompt_index=2, sample_fps=10, metadata={"device": "test"})
        self.assertEqual(track["promptId"], prompt["id"])
        self.assertEqual(track["status"], "review")
        self.assertEqual(len(track["segments"]), 2)
        self.assertTrue(track["segments"][1]["discontinuityBefore"])
        self.assertEqual(track["segments"][0]["points"][2]["identityConfidence"], 1.0)

    def test_does_not_recover_identity_after_an_implausible_jump(self):
        prompt = normalize_request(request_value())
        observations = {
            8: observation(8, 0.4),
            9: observation(9, 0.41),
            10: observation(10, 0.42),
            11: observation(11, 0.9),
            12: observation(12, 0.9),
        }
        track = build_track(observations, prompt, prompt_index=10, sample_fps=10)
        frames = [point["frameIndex"] for segment in track["segments"] for point in segment["points"]]
        self.assertNotIn(11, frames)
        self.assertNotIn(12, frames)


if __name__ == "__main__":
    unittest.main()
