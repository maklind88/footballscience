#!/usr/bin/env python3
"""Analyze StatsBomb API coverage without importing or publishing player data."""

from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import json
import os
import re
import sys
from pathlib import Path


REPORT_SCHEMA = "football-science-statsbomb-readonly-analysis-v1"
DEFAULT_EXISTING_PAYLOAD = Path("scouting-statsbomb-data.js")
DEFAULT_OUTPUT = Path("data/scouting/statsbomb/statsbomb-readonly-analysis.json")
MAX_SCHEMA_ROWS = 500
CUSTOMER_CREDENTIAL_KEYS = ("SB_USERNAME", "SB_PASSWORD")

FIELD_ALIASES = {
    "player-id": "player-sbd-id",
    "player-name": "player",
    "team-id": "current-team-sbd-id",
    "team-name": "current-team",
    "current-team-id": "current-team-sbd-id",
    "np-xg": "non-penalty-xg",
    "np-xg-shot": "non-penalty-xg-shot",
    "np-shots": "non-penalty-shots",
    "np-goals": "non-penalty-goals",
    "op-assists": "open-play-assists",
    "op-key-passes": "open-play-key-passes",
    "op-passes": "open-play-passes",
}

IDENTITY_FIELDS = {
    "playerId": {"player-id", "player-sbd-id"},
    "playerName": {"player", "player-name"},
    "teamId": {"team-id", "current-team-id", "current-team-sbd-id"},
    "teamName": {"team-name", "current-team"},
    "competitionId": {"competition-id"},
    "seasonId": {"season-id"},
}


class AnalysisError(RuntimeError):
    """Expected fail-closed analysis error."""


def clean_text(value, limit=240):
    return re.sub(r"\s+", " ", str(value or "")).strip()[:limit]


def canonical_field(value):
    text = clean_text(value, 300).lower()
    text = re.sub(r"^(?:player|team)[-_](?:season|match)[-_]", "", text)
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return FIELD_ALIASES.get(text, text)


def parse_javascript_payload(path):
    source = path.read_text(encoding="utf-8").strip()
    assignment_index = source.find("=")
    if assignment_index < 0:
        raise AnalysisError(f"Existing payload {path} has no JavaScript assignment.")
    payload_source = source[assignment_index + 1 :].rstrip(";\n ")
    try:
        payload = json.loads(payload_source)
    except json.JSONDecodeError as error:
        raise AnalysisError(f"Existing payload {path} is not valid generated JSON: {error}.") from error
    if not isinstance(payload, dict):
        raise AnalysisError(f"Existing payload {path} must contain an object.")
    return payload


def file_sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def records_from_provider(value):
    if isinstance(value, dict):
        values = list(value.values())
        return values if all(isinstance(item, dict) for item in values) else [value]
    if isinstance(value, list):
        return [item for item in value if isinstance(item, dict)]
    return []


def collect_leaf_paths(value, prefix=""):
    paths = set()
    if isinstance(value, dict):
        for key, child in value.items():
            next_prefix = f"{prefix}.{key}" if prefix else str(key)
            paths.update(collect_leaf_paths(child, next_prefix))
        if not value and prefix:
            paths.add(prefix)
        return paths
    if isinstance(value, list):
        for child in value[:10]:
            paths.update(collect_leaf_paths(child, prefix))
        if not value and prefix:
            paths.add(prefix)
        return paths
    if prefix:
        paths.add(prefix)
    return paths


def schema_fields(records):
    fields = set()
    for record in records[:MAX_SCHEMA_ROWS]:
        fields.update(collect_leaf_paths(record))
    return sorted(fields)


def existing_dataset_summary(payload, path):
    columns = payload.get("columns") if isinstance(payload.get("columns"), list) else []
    normalized_columns = []
    for column in columns:
        if not isinstance(column, dict):
            continue
        column_id = clean_text(column.get("id"), 180)
        label = clean_text(column.get("label"), 240)
        if column_id:
            normalized_columns.append({"id": column_id, "label": label})
    records = payload.get("records") if isinstance(payload.get("records"), list) else []
    return {
        "schema": clean_text(payload.get("schema"), 120),
        "version": clean_text(payload.get("version"), 160),
        "records": len(records),
        "columns": normalized_columns,
        "columnCount": len(normalized_columns),
        "primaryKeyColumn": clean_text(payload.get("primaryKeyColumn"), 180),
        "sourceFileSha256": clean_text(payload.get("sourceFileSha256"), 128),
        "payloadSha256": file_sha256(path),
        "integrationStatus": clean_text(payload.get("integrationStatus"), 120),
        "loadedByApplication": bool(payload.get("loadedByApplication")),
    }


def compare_provider_fields(provider_fields, existing_columns):
    existing_by_id = {canonical_field(column["id"]): column["id"] for column in existing_columns}
    existing_by_label = {
        canonical_field(column.get("label")): column["id"]
        for column in existing_columns
        if canonical_field(column.get("label"))
    }
    matches = []
    unmatched_provider = []
    matched_existing = set()

    for provider_field in provider_fields:
        leaf = provider_field.rsplit(".", 1)[-1]
        raw_canonical = re.sub(r"[^a-z0-9]+", "-", leaf.lower()).strip("-")
        canonical = canonical_field(leaf)
        alias_target = FIELD_ALIASES.get(raw_canonical)
        existing_id = None
        method = ""
        if alias_target and canonical_field(alias_target) in existing_by_id:
            existing_id = existing_by_id[canonical_field(alias_target)]
            method = "explicit-alias"
        elif canonical in existing_by_id:
            existing_id = existing_by_id[canonical]
            method = "normalized-id"
        elif canonical in existing_by_label:
            existing_id = existing_by_label[canonical]
            method = "normalized-label"

        if existing_id:
            matches.append(
                {
                    "providerField": provider_field,
                    "existingColumnId": existing_id,
                    "method": method,
                }
            )
            matched_existing.add(existing_id)
        else:
            unmatched_provider.append(provider_field)

    existing_ids = [column["id"] for column in existing_columns]
    return {
        "providerFieldCount": len(provider_fields),
        "existingColumnCount": len(existing_ids),
        "matchedCount": len(matches),
        "providerCoveragePercent": round((len(matches) / len(provider_fields)) * 100, 1) if provider_fields else 0,
        "existingCoveragePercent": round((len(matched_existing) / len(existing_ids)) * 100, 1) if existing_ids else 0,
        "matches": matches,
        "unmatchedProviderFields": unmatched_provider,
        "unmatchedExistingColumnIds": sorted(set(existing_ids) - matched_existing),
    }


def identity_coverage(provider_fields):
    canonical_fields = {canonical_field(field.rsplit(".", 1)[-1]) for field in provider_fields}
    return {
        label: any(canonical_field(candidate) in canonical_fields for candidate in candidates)
        for label, candidates in IDENTITY_FIELDS.items()
    }


def endpoint_observation(records):
    fields = schema_fields(records)
    return {
        "recordCount": len(records),
        "fieldCount": len(fields),
        "fields": fields,
    }


def package_version():
    try:
        return importlib.metadata.version("statsbombpy")
    except importlib.metadata.PackageNotFoundError:
        return "not-installed"


def load_statsbomb_client():
    try:
        from statsbombpy import sb
    except ImportError as error:
        raise AnalysisError(
            "statsbombpy is not installed. Run: python3 -m pip install -r requirements-scouting-statsbomb.txt"
        ) from error
    return sb


def require_customer_credentials(environment):
    values = {key: environment.get(key) for key in CUSTOMER_CREDENTIAL_KEYS}
    missing = [key for key, value in values.items() if not isinstance(value, str) or not value.strip()]
    if missing:
        raise AnalysisError(
            "Customer mode requires both SB_USERNAME and SB_PASSWORD in the process environment."
        )
    return {"user": values["SB_USERNAME"], "passwd": values["SB_PASSWORD"]}


def load_fixture(path):
    if not path:
        raise AnalysisError("Fixture mode requires --fixture.")
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise AnalysisError(f"Could not read fixture {path}: {error}.") from error
    if not isinstance(payload, dict):
        raise AnalysisError("StatsBomb fixture must be an object.")
    return payload


def fetch_provider_data(mode, competition_id, season_id, fixture_path=None, environment=None):
    environment = environment or os.environ
    if mode == "fixture":
        fixture = load_fixture(fixture_path)
        return {
            "packageVersion": clean_text(fixture.get("packageVersion"), 40) or "fixture",
            "authenticated": False,
            "competitions": records_from_provider(fixture.get("competitions", [])),
            "matches": records_from_provider(fixture.get("matches", [])),
            "playerSeasonStats": records_from_provider(fixture.get("playerSeasonStats", [])),
            "endpointsUsed": ["fixture"],
        }

    if mode == "customer":
        creds = require_customer_credentials(environment)
        if competition_id is None or season_id is None:
            raise AnalysisError("Customer mode requires --competition-id and --season-id.")
        sb = load_statsbomb_client()
        competitions = records_from_provider(sb.competitions(fmt="dict", creds=creds))
        player_stats = records_from_provider(
            sb.player_season_stats(
                competition_id=competition_id,
                season_id=season_id,
                fmt="dict",
                creds=creds,
            )
        )
        return {
            "packageVersion": package_version(),
            "authenticated": True,
            "competitions": competitions,
            "matches": [],
            "playerSeasonStats": player_stats,
            "endpointsUsed": ["competitions", "player-season-stats"],
        }

    sb = load_statsbomb_client()
    competitions = records_from_provider(sb.competitions(fmt="dict", creds={}))
    matches = []
    endpoints = ["competitions"]
    if (competition_id is None) != (season_id is None):
        raise AnalysisError("Open-data mode requires both --competition-id and --season-id when either is provided.")
    if competition_id is not None and season_id is not None:
        matches = records_from_provider(
            sb.matches(competition_id=competition_id, season_id=season_id, fmt="dict", creds={})
        )
        endpoints.append("matches")
    return {
        "packageVersion": package_version(),
        "authenticated": False,
        "competitions": competitions,
        "matches": matches,
        "playerSeasonStats": [],
        "endpointsUsed": endpoints,
    }


def report_fingerprint(report):
    fingerprint_input = {
        "mode": report["mode"],
        "provider": report["provider"],
        "selection": report["selection"],
        "existingDataset": {
            "version": report["existingDataset"]["version"],
            "records": report["existingDataset"]["records"],
            "columnCount": report["existingDataset"]["columnCount"],
            "sourceFileSha256": report["existingDataset"]["sourceFileSha256"],
            "payloadSha256": report["existingDataset"]["payloadSha256"],
        },
        "observations": report["observations"],
        "mapping": report["mapping"],
        "identityCoverage": report["identityCoverage"],
    }
    serialized = json.dumps(fingerprint_input, ensure_ascii=True, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def build_report(mode, provider_data, existing_summary, competition_id=None, season_id=None):
    competition_observation = endpoint_observation(provider_data["competitions"])
    match_observation = endpoint_observation(provider_data["matches"])
    player_observation = endpoint_observation(provider_data["playerSeasonStats"])
    player_fields = player_observation["fields"]
    mapping_status = "analyzed" if player_fields else "customer-player-season-endpoint-required"
    mapping = compare_provider_fields(player_fields, existing_summary["columns"])
    mapping["status"] = mapping_status
    identity = identity_coverage(player_fields)

    blockers = []
    if mode != "customer":
        blockers.append("Authenticated customer player-season endpoint has not been verified.")
    if not player_fields:
        blockers.append("No player-season schema was observed.")
    if not identity["playerId"]:
        blockers.append("A stable StatsBomb player ID was not observed.")
    if not identity["teamId"]:
        blockers.append("A stable StatsBomb team ID was not observed.")
    blockers.append("Provider licensing and storage/display rights require explicit review before import.")
    blockers.append("No write, staging-import, publish, or FSDB mutation path is enabled by this tool.")

    report = {
        "schema": REPORT_SCHEMA,
        "mode": mode,
        "provider": {
            "package": "statsbombpy",
            "packageVersion": provider_data["packageVersion"],
            "authenticated": provider_data["authenticated"],
            "endpointsUsed": provider_data["endpointsUsed"],
        },
        "selection": {
            "competitionId": competition_id,
            "seasonId": season_id,
        },
        "guardrails": {
            "readOnly": True,
            "credentialsFromEnvironmentOnly": True,
            "credentialsIncludedInReport": False,
            "rawProviderRecordsIncludedInReport": False,
            "writesEnabled": False,
            "activeScoutingDatasetTouched": False,
            "footballScienceDbTouched": False,
        },
        "existingDataset": existing_summary,
        "observations": {
            "competitions": competition_observation,
            "matches": match_observation,
            "playerSeasonStats": player_observation,
        },
        "mapping": mapping,
        "identityCoverage": identity,
        "readiness": {
            "apiConnectivityVerified": mode in {"open-data", "customer"}
            and bool(competition_observation["recordCount"]),
            "customerAggregatedStatsVerified": mode == "customer" and bool(player_fields),
            "safeToStageImport": False,
            "safeToPublish": False,
            "blockers": blockers,
        },
    }
    report["fingerprintSha256"] = report_fingerprint(report)
    return report


def parse_args(argv=None):
    parser = argparse.ArgumentParser(
        description="Analyze StatsBomb schema coverage without importing or publishing data."
    )
    parser.add_argument("--mode", choices=("open-data", "customer", "fixture"), default="open-data")
    parser.add_argument("--competition-id", type=int)
    parser.add_argument("--season-id", type=int)
    parser.add_argument("--fixture", type=Path)
    parser.add_argument("--existing-payload", type=Path, default=DEFAULT_EXISTING_PAYLOAD)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    return parser.parse_args(argv)


def run(argv=None, environment=None):
    options = parse_args(argv)
    if options.mode != "fixture" and options.fixture:
        raise AnalysisError("--fixture is only allowed with --mode fixture.")
    if not options.existing_payload.is_file():
        raise AnalysisError(f"Existing StatsBomb payload was not found: {options.existing_payload}.")

    existing_payload = parse_javascript_payload(options.existing_payload)
    existing_summary = existing_dataset_summary(existing_payload, options.existing_payload)
    provider_data = fetch_provider_data(
        mode=options.mode,
        competition_id=options.competition_id,
        season_id=options.season_id,
        fixture_path=options.fixture,
        environment=environment,
    )
    report = build_report(
        mode=options.mode,
        provider_data=provider_data,
        existing_summary=existing_summary,
        competition_id=options.competition_id,
        season_id=options.season_id,
    )
    options.output.parent.mkdir(parents=True, exist_ok=True)
    options.output.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(
        f"StatsBomb read-only analysis: mode={options.mode}, "
        f"competitions={report['observations']['competitions']['recordCount']}, "
        f"playerSeasonRows={report['observations']['playerSeasonStats']['recordCount']}, "
        f"mappedFields={report['mapping']['matchedCount']}, output={options.output}"
    )
    return report


def main():
    try:
        run()
    except AnalysisError as error:
        print(f"StatsBomb read-only analysis stopped: {error}", file=sys.stderr)
        raise SystemExit(2) from error


if __name__ == "__main__":
    main()
