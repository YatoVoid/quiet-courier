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
        self.db = sqlite3.connect(path, timeout=30)
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

    def wikisource_seen(self) -> set[str]:
        with closing(self.db.execute("SELECT title FROM wikisource_pages")) as cur:
            return {r[0] for r in cur}

    def wikisource_mark(self, title: str, poem: dict | None, reason: str | None) -> None:
        with self.db:
            self.db.execute(
                "INSERT OR REPLACE INTO wikisource_pages VALUES (?, ?, ?, ?)",
                (title, json.dumps(poem, ensure_ascii=False) if poem else None, reason,
                 dt.datetime.now(dt.UTC).isoformat(timespec="seconds")))

    def added_poems(self) -> list[dict]:
        with closing(self.db.execute(
                "SELECT poem FROM wikisource_pages WHERE poem IS NOT NULL ORDER BY checked_at, title")) as cur:
            return [json.loads(r[0]) for r in cur]

    def serial_books(self) -> dict[int, dict]:
        with closing(self.db.execute("SELECT id, book, reason, started_on, checked_at FROM serial_books")) as cur:
            return {i: {"book": json.loads(b) if b else None, "reason": r,
                        "started_on": dt.date.fromisoformat(s) if s else None,
                        "checked_at": dt.datetime.fromisoformat(c)} for i, b, r, s, c in cur}

    def serial_save(self, book_id: int, book: dict | None, reason: str | None) -> None:
        with self.db:
            self.db.execute(
                "INSERT OR REPLACE INTO serial_books (id, book, reason, started_on, checked_at) VALUES (?, ?, ?, NULL, ?)",
                (book_id, json.dumps(book, ensure_ascii=False) if book else None, reason,
                 dt.datetime.now(dt.UTC).isoformat(timespec="seconds")))

    def serial_start(self, book_id: int, date: dt.date) -> None:
        with self.db:
            self.db.execute("UPDATE serial_books SET started_on = ? WHERE id = ? AND started_on IS NULL",
                            (date.isoformat(), book_id))

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
        if edition.get("serial"):
            s = edition["serial"]
            items.append(("serial", s | {"title": f"{s['title']}, instalment {s['number']}",
                                          "body": [b for b in s["blocks"] if b["kind"] == "p"]}))
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
