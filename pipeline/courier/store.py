import datetime as dt
import json
import sqlite3
from contextlib import closing
from dataclasses import dataclass
from pathlib import Path

SCHEMA = Path(__file__).resolve().parent / "schema.sql"


@dataclass(frozen=True)
class SourceRun:
    source: str
    ok: bool
    items: int
    duration_ms: int
    error: str | None = None


class Store:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path)
        self.db.execute("PRAGMA foreign_keys = ON")
        self.db.executescript(SCHEMA.read_text())

    def close(self) -> None:
        self.db.close()

    def recent_urls(self, before: dt.date, days: int) -> set[str]:
        since = (before - dt.timedelta(days=days)).isoformat()
        with closing(self.db.execute(
            "SELECT DISTINCT i.source_url FROM edition_items i JOIN editions e ON e.id = i.edition_id "
            "WHERE e.edition_date >= ? AND e.edition_date < ?", (since, before.isoformat()))) as cur:
            return {r[0] for r in cur}

    def recent_poems(self, before: dt.date, days: int) -> set[str]:
        since = (before - dt.timedelta(days=days)).isoformat()
        with closing(self.db.execute(
            "SELECT DISTINCT i.item_id FROM edition_items i JOIN editions e ON e.id = i.edition_id "
            "WHERE i.kind = 'poem' AND e.edition_date >= ? AND e.edition_date < ?", (since, before.isoformat()))) as cur:
            return {r[0] for r in cur}

    def conversation_usage(self, first: dt.date, last: dt.date) -> list[dict]:
        with closing(self.db.execute(
            "SELECT i.title, i.source_url, group_concat(DISTINCT e.edition_date) FROM edition_items i "
            "JOIN editions e ON e.id = i.edition_id "
            "WHERE i.source_name = 'The Conversation' AND e.edition_date BETWEEN ? AND ? "
            "GROUP BY i.source_url ORDER BY min(e.edition_date), i.title",
            (first.isoformat(), last.isoformat()))) as cur:
            return [{"title": t, "source_url": u, "dates": sorted(d.split(","))} for t, u, d in cur]

    def save(self, edition: dict, city_id: str, word_count: int, reading_min: int, runs: list[SourceRun]) -> str:
        edition_id = f"{edition['date']}/{city_id}"
        items = [("article", a) for a in edition["articles"]]
        items.append(("poem", edition["poem"]))
        if edition.get("weather"):
            w = edition["weather"]
            items.append(("weather", {"id": f"weather-{city_id}", "title": f"Forecast for {w['city']}",
                                      "source_name": w["office"], "source_url": w["source_url"],
                                      "license": w["license"], "attribution": w["attribution"]}))
        with self.db:
            self.db.execute("DELETE FROM editions WHERE id = ?", (edition_id,))
            self.db.execute(
                "INSERT INTO editions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (edition_id, edition["date"], city_id, edition["paper_name"], edition["edition_number"],
                 word_count, reading_min, dt.datetime.now(dt.UTC).isoformat(timespec="seconds"),
                 json.dumps(edition, ensure_ascii=False)))
            for pos, (kind, it) in enumerate(items):
                words = sum(len(b["text"].split()) for b in it.get("body", []))
                self.db.execute(
                    "INSERT INTO edition_items VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (edition_id, pos, it["id"], kind, it.get("section"), it["title"], it["source_name"],
                     it["source_url"], it["license"]["id"], it["attribution"], it.get("changes"), words))
            for r in runs:
                self.db.execute("INSERT INTO source_runs VALUES (?, ?, ?, ?, ?, ?)",
                                (edition_id, r.source, int(r.ok), r.items, r.duration_ms, r.error))
        return edition_id
