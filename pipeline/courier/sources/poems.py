import datetime as dt
import json
import random
import re
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


SENTENCE = re.compile(r"[^.!?;]+[.!?]")
QUOTE_LETTERS = (40, 90)


def _sentences(stanza: list[str]) -> list[str]:
    text = re.sub(r"\s+", " ", " ".join(stanza)).strip()
    out = []
    for m in SENTENCE.finditer(text):
        q = m.group(0).strip(" ,—-’'\"“”")
        letters = sum(ch.isalpha() for ch in q)
        if QUOTE_LETTERS[0] <= letters <= QUOTE_LETTERS[1] and q.isascii() and q[:1].isupper():
            out.append(q)
    return out


def quote(date: dt.date, exclude: set[str], added: list[dict] = ()) -> dict | None:
    """A whole sentence from a public-domain poem for the cryptogram, never from a poem in
    `exclude` (today's, so the answer isn't printed a few pages earlier)."""
    pool = [p for p in library() + list(added) if p["id"] not in exclude and p["year"] < 1931]
    rng = random.Random(f"quote:{date.isoformat()}")
    rng.shuffle(pool)
    for p in pool:
        options = [q for stanza in p["stanzas"] for q in _sentences(stanza)]
        if options:
            return {"text": rng.choice(options), "author": p["author"], "title": p["title"],
                    "source_url": p["source_url"], "license": LICENSES["pd-expired"]}
    return None
