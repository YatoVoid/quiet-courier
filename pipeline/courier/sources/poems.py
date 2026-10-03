import datetime as dt
import json
from pathlib import Path

from . import LICENSES, Context

LIBRARY = Path(__file__).resolve().parent.parent / "data" / "poems.json"
SEASONS = {12: "winter", 1: "winter", 2: "winter", 3: "spring", 4: "spring", 5: "spring",
           6: "summer", 7: "summer", 8: "summer", 9: "autumn", 10: "autumn", 11: "autumn"}


def library() -> list[dict]:
    return json.loads(LIBRARY.read_text(encoding="utf-8"))


def choose(date: dt.date, recently_used: set[str] = frozenset(), added: list[dict] = ()) -> dict:
    poems = library() + list(added)
    season = SEASONS[date.month]
    fresh = [p for p in poems if p["id"] not in recently_used] or poems
    pool = [p for p in fresh if season in p["seasons"]] or [p for p in fresh if "any" in p["seasons"]] or fresh
    p = pool[date.toordinal() % len(pool)]
    if p["year"] >= 1931:
        raise ValueError(f"{p['id']} is not old enough to be public domain")
    return {
        "id": p["id"], "title": p["title"], "author": p["author"], "year": p["year"],
        "source_name": p["source_name"], "source_url": p["source_url"], "license": LICENSES["pd-expired"],
        "attribution": (f"From {p['book']}, {p['year']}. Public domain." if p.get("book")
                        else f"First published {p['year']}. Public domain."), "stanzas": p["stanzas"],
    }


def fetch(ctx: Context, recently_used: set[str] = frozenset(), added: list[dict] = ()) -> dict:
    return choose(ctx.date, recently_used, added)
