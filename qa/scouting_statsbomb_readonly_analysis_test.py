import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SCRIPT_PATH = PROJECT_ROOT / "scripts" / "analyze-statsbomb-api.py"
FIXTURE_PATH = PROJECT_ROOT / "qa" / "fixtures" / "statsbomb-player-season-schema.json"
EXISTING_PAYLOAD = PROJECT_ROOT / "scouting-statsbomb-data.js"


def load_analysis_module():
    spec = importlib.util.spec_from_file_location("statsbomb_readonly_analysis", SCRIPT_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class StatsBombReadonlyAnalysisTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.analysis = load_analysis_module()

    def test_fixture_report_is_read_only_redacted_and_maps_known_fields(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            output = Path(temporary_directory) / "report.json"
            report = self.analysis.run(
                [
                    "--mode",
                    "fixture",
                    "--fixture",
                    str(FIXTURE_PATH),
                    "--existing-payload",
                    str(EXISTING_PAYLOAD),
                    "--competition-id",
                    "999",
                    "--season-id",
                    "2026",
                    "--output",
                    str(output),
                ],
                environment={},
            )
            serialized = output.read_text(encoding="utf-8")

        self.assertEqual(report["schema"], "football-science-statsbomb-readonly-analysis-v1")
        self.assertEqual(report["existingDataset"]["records"], 354)
        self.assertEqual(report["existingDataset"]["columnCount"], 217)
        self.assertTrue(report["guardrails"]["readOnly"])
        self.assertFalse(report["guardrails"]["writesEnabled"])
        self.assertFalse(report["guardrails"]["activeScoutingDatasetTouched"])
        self.assertFalse(report["readiness"]["apiConnectivityVerified"])
        self.assertFalse(report["readiness"]["safeToStageImport"])
        self.assertFalse(report["readiness"]["safeToPublish"])
        self.assertNotIn("Secret Fixture Player", serialized)
        self.assertNotIn("Secret Fixture Team", serialized)
        mapped = {item["existingColumnId"] for item in report["mapping"]["matches"]}
        self.assertTrue({"player-sbd-id", "current-team-sbd-id", "minutes", "non-penalty-xg"}.issubset(mapped))

    def test_report_is_deterministic_for_the_same_schema(self):
        fixture = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
        existing = self.analysis.existing_dataset_summary(
            self.analysis.parse_javascript_payload(EXISTING_PAYLOAD), EXISTING_PAYLOAD
        )
        provider = {
            "packageVersion": fixture["packageVersion"],
            "authenticated": False,
            "competitions": fixture["competitions"],
            "matches": [],
            "playerSeasonStats": fixture["playerSeasonStats"],
            "endpointsUsed": ["fixture"],
        }
        first = self.analysis.build_report("fixture", provider, existing, 999, 2026)
        second = self.analysis.build_report("fixture", provider, existing, 999, 2026)
        self.assertEqual(first, second)
        self.assertRegex(first["fingerprintSha256"], r"^[a-f0-9]{64}$")

    def test_customer_mode_fails_closed_without_credentials(self):
        environment = {
            key: value
            for key, value in os.environ.items()
            if key not in {"SB_USERNAME", "SB_PASSWORD"}
        }
        environment["SB_USERNAME"] = "do-not-print-this-username"
        output = PROJECT_ROOT / "data" / "should-not-exist.json"
        result = subprocess.run(
            [
                sys.executable,
                str(SCRIPT_PATH),
                "--mode",
                "customer",
                "--competition-id",
                "999",
                "--season-id",
                "2026",
                "--existing-payload",
                str(EXISTING_PAYLOAD),
                "--output",
                str(output),
            ],
            cwd=PROJECT_ROOT,
            env=environment,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 2)
        self.assertIn("requires both SB_USERNAME and SB_PASSWORD", result.stderr)
        self.assertNotIn("do-not-print-this-username", result.stderr)
        self.assertFalse(output.exists())


if __name__ == "__main__":
    unittest.main()
