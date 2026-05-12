#!/usr/bin/env python3
"""Generate the lazy-loaded Scouting database from the Wyscout Excel export."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from openpyxl import load_workbook


DEFAULT_SOURCE = Path("/Users/maklind/Desktop/Womens Football (Stats).xlsx")
DEFAULT_OUTPUT = Path("scouting-import-data.js")

CORE_HEADERS = {
    "league",
    "season",
    "player",
    "team",
    "team within selected timeframe",
    "position",
    "age",
    "matches",
    "minutes",
    "minutes played",
    "birth country",
    "passport country",
    "height",
    "weight",
}


def clean_text(value, limit=240):
    if value is None:
        return ""
    return re.sub(r"\s+", " ", str(value)).strip()[:limit]


def slugify(value, fallback="item"):
    slug = re.sub(r"[^a-z0-9]+", "-", clean_text(value).lower()).strip("-")
    return slug or fallback


def to_number(value):
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = clean_text(value)
    if not text or text in {"-", "n/a", "N/A"}:
        return None
    text = text.replace(",", ".").replace("%", "")
    try:
        return float(text)
    except ValueError:
        return None


def normalize_header(value, index):
    text = clean_text(value, 180)
    if index == 0 and text.lower() not in {"league", "leagie"}:
        return "League"
    if index == 1 and text.lower() != "season":
        return "Season"
    if text.lower() == "leagie":
        return "League"
    return text


def metric_group(label):
    text = label.lower()
    if any(token in text for token in ["save", "goal against", "conceded", "gk", "exit"]):
        return "Goalkeeping"
    if any(token in text for token in ["goal", "xg", "shot", "touches in box", "penalty area"]):
        return "Goal threat"
    if any(token in text for token in ["assist", "xa", "key pass", "smart pass", "through pass", "cross"]):
        return "Chance creation"
    if any(token in text for token in ["progressive", "dribble", "carry", "run"]):
        return "Progression"
    if any(token in text for token in ["pass", "received"]):
        return "Passing"
    if any(token in text for token in ["duel", "interception", "recover", "defensive", "aerial"]):
        return "Duels and defending"
    if any(token in text for token in ["yellow", "red", "foul", "loss"]):
        return "Risk"
    return "General"


def metric_direction(label):
    text = label.lower()
    lower_is_better_tokens = [
        "losses",
        "lost",
        "fouls",
        "yellow cards",
        "red cards",
        "goals conceded",
        "goal against",
        "unsuccessful",
        "errors",
    ]
    return "lower" if any(token in text for token in lower_is_better_tokens) else "higher"


def rounded_number(value):
    if value is None:
        return None
    if abs(value) >= 100:
        return round(value, 1)
    return round(value, 4)


def main():
    source = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SOURCE
    output = Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_OUTPUT
    workbook = load_workbook(source, read_only=True, data_only=True)

    metric_by_label = {}
    metric_defs = []
    records = []
    sheet_summaries = []

    def metric_id_for(label):
        if label in metric_by_label:
            return metric_by_label[label]
        base = slugify(label, "metric")
        metric_id = base
        counter = 2
        existing_ids = {metric["id"] for metric in metric_defs}
        while metric_id in existing_ids:
            metric_id = f"{base}-{counter}"
            counter += 1
        metric_by_label[label] = metric_id
        metric_defs.append(
            {
                "id": metric_id,
                "key": base,
                "label": label,
                "group": metric_group(label),
                "direction": metric_direction(label),
            }
        )
        return metric_id

    def value_by(headers, row, names):
        wanted = {name.lower() for name in names}
        for index, header in enumerate(headers):
            if header.lower() in wanted and index < len(row):
                return row[index]
        return None

    for worksheet in workbook.worksheets:
        iterator = worksheet.iter_rows(values_only=True)
        header_row = next(iterator, None)
        if not header_row or not any(cell is not None for cell in header_row):
            continue
        headers = [normalize_header(value, index) for index, value in enumerate(header_row)]
        if not any(headers):
            continue

        row_count = 0
        for row in iterator:
            if not row or not any(cell is not None and clean_text(cell) for cell in row):
                continue
            player = clean_text(value_by(headers, row, ["Player"]), 160)
            if not player:
                continue
            league = clean_text(value_by(headers, row, ["League"]), 160) or worksheet.title
            season = clean_text(value_by(headers, row, ["Season"]), 80)
            team = clean_text(value_by(headers, row, ["Team"]), 160)
            team_within_timeframe = clean_text(value_by(headers, row, ["Team within selected timeframe"]), 180)
            position = clean_text(value_by(headers, row, ["Position"]), 80)
            age = rounded_number(to_number(value_by(headers, row, ["Age"])))
            matches = rounded_number(to_number(value_by(headers, row, ["Matches"])))
            minutes = rounded_number(to_number(value_by(headers, row, ["Minutes", "Minutes played"])))
            birth_country = clean_text(value_by(headers, row, ["Birth country"]), 120)
            passport_country = clean_text(value_by(headers, row, ["Passport country"]), 120)
            height = rounded_number(to_number(value_by(headers, row, ["Height"])))
            weight = rounded_number(to_number(value_by(headers, row, ["Weight"])))

            metrics = {}
            for index, header in enumerate(headers):
                if not header or header.lower() in CORE_HEADERS or index >= len(row):
                    continue
                number = rounded_number(to_number(row[index]))
                if number is None:
                    continue
                metrics[metric_id_for(header)] = number

            record_id = "--".join(
                [
                    slugify(player, "player"),
                    slugify(team or team_within_timeframe or league, "team"),
                    slugify(league, "league"),
                    slugify(season, "season"),
                    str(len(records) + 1),
                ]
            )
            records.append(
                [
                    record_id,
                    player,
                    team,
                    team_within_timeframe,
                    league,
                    season,
                    position,
                    age,
                    matches,
                    minutes,
                    birth_country,
                    passport_country,
                    height,
                    weight,
                    metrics,
                ]
            )
            row_count += 1

        sheet_summaries.append({"name": worksheet.title, "rows": row_count})

    payload = {
        "schema": "football-science-scouting-import",
        "version": f"excel-womens-football-v1-{len(records)}-{len(metric_defs)}",
        "source": source.name,
        "recordColumns": [
            "id",
            "player",
            "team",
            "teamWithinTimeframe",
            "league",
            "season",
            "position",
            "age",
            "matches",
            "minutes",
            "birthCountry",
            "passportCountry",
            "height",
            "weight",
            "metrics",
        ],
        "metrics": metric_defs,
        "sheets": sheet_summaries,
        "records": records,
    }

    output.write_text(
        "window.__footballScienceScoutingDatabase="
        + json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )
    print(f"Wrote {output} with {len(records)} records and {len(metric_defs)} metrics.")


if __name__ == "__main__":
    main()
