"""Prepare a private Wellness import from reviewed per-player workbook sheets and a Squad snapshot."""
import argparse
from collections import Counter, defaultdict
from datetime import date
import hashlib
import json
import os
from pathlib import Path
import re
import unicodedata
from uuid import UUID

from openpyxl import load_workbook

COLUMNS = {
    "score": "Wellness Score",
    "sleepDuration": "Sleep Quantity",
    "sleepQuality": "Sleep Quality",
    "stress": "Stress",
    "fatigue": "Fatigue",
    "soreness": "Muscle Soreness",
}
CHOICES = {
    "sleepQuality": {"Normal", "Better than usual", "Worse than usual", "Very Good", "Disrupted / restless", "Outstanding"},
    "stress": {"Normal", "Minimal stress/relaxed", "Better than usual", "Worse than usual", "No stress/feeling great"},
    "fatigue": {"Normal", "Worse than usual", "Minimal fatigue", "Better than usual", "Very Fatigued",
                "Exhausted - major fatigue", "No fatigue"},
    "soreness": {"Mild Soreness", "Moderate Soreness", "Very Sore", "Extremely Sore", "No Soreness"},
}
SLEEP_RANGE = re.compile(r"(?:[0-9]|1[0-9])(?::[0-5][0-9])?\s*[-–]\s*(?:[0-9]|1[0-9])(?::[0-5][0-9])?")


def name_key(value):
    decomposed = unicodedata.normalize("NFKD", value.casefold())
    return " ".join(re.findall(r"[^\W_]+", "".join(c for c in decomposed if not unicodedata.combining(c))))


def read_wellness(workbook):
    required = set(COLUMNS.values()) | {"Date", "Record ID", "Detail Row"}
    for sheet in workbook:
        if sheet.title == "Team Wellness":
            continue
        columns = None
        for cells in sheet.values:
            if required.issubset(cells):
                columns = {label: cells.index(label) for label in required}
                continue
            if columns is None:
                continue
            try:
                day = date.fromisoformat(str(cells[columns["Date"]])[:10])
            except ValueError:
                columns = None
                continue
            row = {key: cells[columns[label]] for key, label in COLUMNS.items()}
            row["date"] = day.isoformat()
            row["sourceRecordId"] = cells[columns["Record ID"]]
            yield sheet.title, row


def normalize(row, unsupported):
    clean = {key: row[key] for key in ("date", "score", "sourceRecordId")}
    if type(clean["score"]) not in (int, float) or not 0 <= clean["score"] <= 100:
        raise ValueError("Expected a Wellness score between 0 and 100")
    if not isinstance(clean["sourceRecordId"], str) or not 0 < len(clean["sourceRecordId"]) <= 200:
        raise ValueError("Expected a stable Wellness source record ID")
    sleep_duration = row["sleepDuration"]
    if isinstance(sleep_duration, str) and SLEEP_RANGE.fullmatch(sleep_duration.strip()):
        clean["sleepDuration"] = sleep_duration.strip()
    elif sleep_duration:
        unsupported["sleepDuration"] += 1
    for key, values in CHOICES.items():
        value = row[key]
        if value in values:
            clean[key] = value
        elif value:
            unsupported[key] += 1
    return clean


def prepare(workbook_path, owner_snapshot, aliases):
    squad = owner_snapshot["squad"]
    if squad.get("removed"):
        raise ValueError("Expected a current Squad snapshot")
    ids = Counter(p["id"] for p in squad["players"])
    roster = defaultdict(list)
    removed = set(squad.get("removedIds") or [])
    for player in squad["players"]:
        if ids[player["id"]] == 1 and not player.get("archivedAt") and not player.get("deletedAt") and player["id"] not in removed:
            roster[name_key(player["name"])].append(player["id"])

    book = load_workbook(workbook_path, read_only=True, data_only=True)
    matched = defaultdict(list)
    recorded = set()
    counts = Counter()
    unsupported = Counter()
    try:
        for name, row in read_wellness(book):
            counts["sourceRows"] += 1
            identity = name_key(name)
            matches = roster[aliases.get(identity, identity)]
            if len(matches) != 1:
                counts["unmatchedRows"] += 1
                continue
            clean = normalize(row, unsupported)
            record_id = clean["sourceRecordId"]
            if record_id in recorded:
                raise ValueError("Duplicate Wellness source record ID requires review")
            recorded.add(record_id)
            clean["playerId"] = matches[0]
            matched[matches[0], row["date"]].append(clean)
    finally:
        book.close()

    rows = []
    for candidates in matched.values():
        if len(candidates) == 1:
            rows.extend(candidates)
        else:
            counts["ambiguousRows"] += len(candidates)
    if not rows:
        raise ValueError("No Wellness rows match the current Squad snapshot")
    rows.sort(key=lambda row: (row["date"], row["playerId"]))
    source_digest = hashlib.sha256(workbook_path.read_bytes()).hexdigest()
    canonical = json.dumps([source_digest, rows], ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)
    dataset = {
        "scope": owner_snapshot["scope"],
        "sourceSha256": source_digest,
        "datasetSha256": hashlib.sha256(canonical.encode()).hexdigest(),
        "squadRevision": squad["revision"],
        "rows": rows,
    }
    report = {
        **counts, "matchedRows": len(rows), "matchedPlayers": len({row["playerId"] for row in rows}),
        "firstDay": rows[0]["date"], "lastDay": rows[-1]["date"], "unsupportedValues": dict(unsupported),
    }
    return dataset, report


def write_private(path, writer):
    with open(path, "x", encoding="utf-8", opener=lambda name, flags: os.open(name, flags, 0o600)) as file:
        writer(file)


def sql_literal(value):
    return "'" + str(value).replace("'", "''") + "'"


def write_import_sql(file, dataset, squad):
    org, team = (sql_literal(UUID(dataset["scope"][key])) for key in ("organizationId", "teamId"))
    version = sql_literal(dataset["datasetSha256"])
    source = sql_literal(dataset["sourceSha256"])
    revision = int(squad["revision"])
    snapshot_hash = sql_literal(squad["hash"])
    rows = dataset["rows"]
    file.write(f"""begin;
set local standard_conforming_strings = on;
lock table public.performance_wellness_imports in share row exclusive mode;
do $wellness$
begin
  if not exists (
    select 1 from public.platform_teams t join public.platform_organizations o on o.id = t.organization_id
    where t.organization_id = {org} and t.id = {team} and t.status = 'active' and t.deleted_at is null
      and o.status = 'active' and o.deleted_at is null
      and o.metadata ->> 'legacyOrganization' = 'football-science-live'
      and t.metadata ->> 'legacyTeamId' = 'team-north-carolina-courage'
  ) then raise exception 'Courage scope is unavailable'; end if;
  if not exists (
    select 1 from public.platform_app_state_records
    where organization_id = 'global' and state_key = 'football-player-profiles-v1'
      and revision = {revision} and value_hash = {snapshot_hash} and not removed
  ) then raise exception 'Squad source changed. Prepare a new import from the current snapshot'; end if;
end;
$wellness$;
insert into public.performance_wellness_imports (organization_id, team_id, dataset_sha256, source_sha256)
values ({org}, {team}, {version}, {source}) on conflict do nothing;
""")
    keys = ("date", "playerId", "score", "sleepDuration", "sleepQuality", "stress", "fatigue", "soreness", "sourceRecordId")
    for start in range(0, len(rows), 250):
        file.write("""insert into public.performance_wellness_days
  (organization_id, team_id, dataset_sha256, day, player_id, score, sleep_duration, sleep_quality, stress, fatigue, soreness, source_record_id)
values\n""")
        values = []
        for row in rows[start:start + 250]:
            fields = [sql_literal(row[key]) if key in row else "null" for key in keys]
            values.append("(" + ", ".join([org, team, version, *fields]) + ")")
        file.write(",\n".join(values) + "\non conflict do nothing;\n")
    file.write(f"""do $wellness$
begin
  if (select count(*) from public.performance_wellness_days
    where organization_id = {org} and team_id = {team} and dataset_sha256 = {version}) <> {len(rows)}
    then raise exception 'Wellness import row count mismatch'; end if;
end;
$wellness$;
update public.performance_wellness_imports set is_current = false
where organization_id = {org} and team_id = {team} and is_current and dataset_sha256 <> {version};
update public.performance_wellness_imports set is_current = true, published_at = coalesce(published_at, now())
where organization_id = {org} and team_id = {team} and dataset_sha256 = {version};
commit;
""")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workbook", type=Path)
    parser.add_argument("owner_snapshot", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--aliases", type=Path, help="Private reviewed JSON mapping from source names to Squad names")
    parser.add_argument("--sql", type=Path, help="Private optional transactional SQL import artifact")
    args = parser.parse_args()
    names = json.loads(args.aliases.read_text()) if args.aliases else {}
    aliases = {name_key(source): name_key(target) for source, target in names.items()}
    owner_snapshot = json.loads(args.owner_snapshot.read_text())
    dataset, report = prepare(args.workbook, owner_snapshot, aliases)
    write_private(args.output, lambda file: json.dump(dataset, file, ensure_ascii=False, separators=(",", ":"), allow_nan=False))
    if args.sql:
        write_private(args.sql, lambda file: write_import_sql(file, dataset, owner_snapshot["squad"]))
    print(json.dumps(report, sort_keys=True))


if __name__ == "__main__":
    main()
