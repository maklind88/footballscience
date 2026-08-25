# Scouting StatsBomb Read-Only Analysis

## Purpose

This tool measures the StatsBomb API schema and identity coverage before any provider data is imported into Football Science DB or exposed in Scouting.

It is deliberately analysis-only:

- no Supabase or Football Science DB writes
- no Scouting payload changes
- no raw provider records in the generated report
- no credentials in arguments, files, logs, or reports
- no staging or publish action

The current `scouting-statsbomb-data.js` remains isolated and unloaded by the application.

## Install

Use an isolated Python environment:

```bash
python3 -m venv .venv-statsbomb
.venv-statsbomb/bin/python -m pip install -r requirements-scouting-statsbomb.txt
```

The dependency is pinned to the reviewed official package version. Review the StatsBomb/Hudl customer agreement before handling licensed data.

## Open Data Connectivity

This verifies the official package and public competitions endpoint without customer credentials:

```bash
.venv-statsbomb/bin/python scripts/analyze-statsbomb-api.py --mode open-data
```

Add a public competition and season to inspect the match schema:

```bash
.venv-statsbomb/bin/python scripts/analyze-statsbomb-api.py \
  --mode open-data \
  --competition-id <competition-id> \
  --season-id <season-id>
```

Open data cannot verify aggregated player-season metrics.

## Customer Player-Season Schema

Set credentials only in the process environment. Never pass them as command arguments or commit them to an env file.

```bash
export SB_USERNAME='<managed-secret>'
export SB_PASSWORD='<managed-secret>'
.venv-statsbomb/bin/python scripts/analyze-statsbomb-api.py \
  --mode customer \
  --competition-id <competition-id> \
  --season-id <season-id>
```

The default report is written under ignored `data/scouting/statsbomb/`. It contains row counts, field names, identity coverage, schema mappings, blockers, and a deterministic fingerprint. It does not contain player or team values.

## Promotion Gates

This analysis does not make the source safe to import. A later provider import requires all of the following:

1. Written confirmation of storage and display rights.
2. Server-managed StatsBomb credentials in the target environment.
3. Stable player and team ID crosswalks to Football Science DB.
4. Versioned source artifact and import-run metadata.
5. Staging validation, preview, explicit publish, audit, and rollback.
6. A Scouting-owned Safe Lane release through the shared automatic release lock; no central release slot is required.

Official package: <https://github.com/statsbomb/statsbombpy>

Hudl support topic: <https://support.hudl.com/s/topic/0TOVY000000BOBw4AO/statsbombpythontools?language=en_US>
