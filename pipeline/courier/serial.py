"""The daily serial: a public-domain novel printed one instalment a day.

Books come from Project Gutenberg's plain-text files. Their license only governs copies that
keep Gutenberg's name and trademark, so the header, the footer and every mention of the project
are removed and nothing printed refers to it. What is left is the public-domain text itself.
"""

from __future__ import annotations

import datetime as dt
import json
import logging
import math
import re
from pathlib import Path

from .sources import LICENSES

log = logging.getLogger(__name__)

CATALOG = Path(__file__).resolve().parent / "data" / "serials.json"
TEXT_URL = "https://www.gutenberg.org/cache/epub/{id}/pg{id}.txt"
BOOK_URL = "https://www.gutenberg.org/ebooks/{id}"

TARGET_WORDS = 1200
MAX_WORDS = 1600
# A chapter this short is printed together with the one after it.
SHORT_CHAPTER = 450
MIN_CHAPTERS = 5
# Public domain everywhere the paper goes means published before 1931 (US) and an author dead
# more than 70 years (most other countries).
LIFE_PLUS = 70

START = re.compile(r"^\*\*\* ?START OF (THE|THIS) PROJECT GUTENBERG.*$", re.M)
END = re.compile(r"^\*\*\* ?END OF (THE|THIS) PROJECT GUTENBERG.*$", re.M)
NUMBER = r"(?:\d{1,3}|[IVXLC]{1,7})"
WORD_NUMBER = r"(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|[a-z]+teen|twenty|thirty|forty|fifty)(?:[- ][a-z]+)?"
NAMED = re.compile(rf"^(chapter|letter|stave)\s+(?:{NUMBER}|{WORD_NUMBER})\b[.:]?\]?(?:(?:\s*[—–]\s*|\s*--\s*|\s+)(.*))?$", re.I)
# A bare number only counts on its own or followed by a full stop, so a one-line paragraph
# such as "I said nothing." is never taken for a heading.
BARE = re.compile(rf"^{NUMBER}(?:[.:]\]?(?:\s+(.*))?)?$")
PART = re.compile(r"^(book|part|volume)\s+(\w+)\b[.:]?(?:\s*(?:--|—|-)?\s*(.*))?$", re.I)
# Editors' notes, footnote lists and the like after the story. Some were written by later
# publishers and are not public domain, so the book ends at the first of these.
END_MATTER = re.compile(r"^(the end|finis|a note on the text|transcriber.?s notes?|footnotes|endnotes|appendix)\.?$", re.I)
FOOTNOTE = re.compile(r"^\[\d{1,3}\]\s")
BREAK = re.compile(r"^(\*\s*){3,}$")
ILLUSTRATION = re.compile(r"\[(Illustration|Sidenote)[^\]]*\]", re.I | re.S)


class SerialError(ValueError):
    pass


def catalog() -> list[dict]:
    return json.loads(CATALOG.read_text(encoding="utf-8"))


def public_domain_everywhere(entry: dict, today: dt.date) -> bool:
    return entry["year"] < 1931 and entry["died"] < today.year - LIFE_PLUS


def _body(raw: str) -> str:
    text = raw.replace("\r\n", "\n").replace("\r", "\n").lstrip("﻿")
    start, end = START.search(text), END.search(text)
    if not start or not end:
        raise SerialError("no start and end markers")
    return text[start.end():end.start()]


def _paragraphs(body: str) -> list[list[str]]:
    body = ILLUSTRATION.sub("", body)
    out = []
    for block in re.split(r"\n\s*\n", body):
        lines = [ln.strip() for ln in block.split("\n") if ln.strip()]
        if lines:
            out.append(lines)
    return out


def _clean(text: str) -> str:
    text = re.sub(r"_(.+?)_", r"\1", text)
    text = text.replace("--", "—")
    return re.sub(r"\s+", " ", text).strip()


def _words(text: str) -> int:
    return len(text.split())


ROMAN = re.compile(r"^[IVXLC]+$", re.I)


def _title_case(s: str) -> str:
    s = s.strip(" .:—-")
    if not s.isupper():
        return s
    small = {"a", "an", "and", "at", "by", "for", "in", "of", "on", "the", "to", "with", "from", "as"}
    words = s.lower().split()
    return " ".join(w if i and w in small else w[:1].upper() + w[1:] for i, w in enumerate(words))


def _label(text: str) -> str:
    words = text.strip(" .:]—–-").split()
    return " ".join(w.upper() if ROMAN.match(w) and (i or len(words) == 1) else w.capitalize() for i, w in enumerate(words))


def _heading(lines: list[str]) -> tuple[str, str | None] | None:
    if len(lines) > 4 or sum(len(ln) for ln in lines) > 240:
        return None
    named = NAMED.match(lines[0])
    m = named or BARE.match(lines[0])
    if not m:
        return None
    group = 2 if named else 1
    title = m.group(group)
    label = _label(lines[0][: m.start(group)] if title else lines[0])
    if not named:
        label = f"Chapter {label}"
    if not title and len(lines) > 1:
        title = " ".join(lines[1:])
    return label, _title_case(title) if title else None


def _part(lines: list[str]) -> str | None:
    if len(lines) > 2 or any(len(ln) > 90 for ln in lines):
        return None
    m = PART.match(lines[0])
    if not m:
        return None
    title = m.group(3) or (lines[1] if len(lines) == 2 else "")
    label = _title_case(f"{m.group(1)} {m.group(2)}")
    return f"{label}: {_title_case(title)}" if title.strip() else label


def _prose_after(paras: list[list[str]], i: int) -> int:
    words = 0
    for p in paras[i + 1:i + 8]:
        if _heading(p) or _part(p):
            break
        words += _words(" ".join(p))
    return words


def chapters(raw: str) -> list[dict]:
    """Splits a Gutenberg text into chapters of blocks, dropping everything before the first
    chapter (title page, contents, preface) and everything from the end matter on."""
    paras = _paragraphs(_body(raw))
    out: list[dict] = []
    part = None
    skip = set()
    for i, lines in enumerate(paras):
        if i in skip:
            continue
        h = _heading(lines)
        # A contents page lists headings one after another; a real heading is followed by prose.
        if h and _prose_after(paras, i) >= 60:
            label, title = h
            nxt = paras[i + 1] if i + 1 < len(paras) else []
            if not title and len(nxt) == 1 and len(nxt[0]) <= 90 and nxt[0].isupper():
                title = _title_case(nxt[0])
                skip.add(i + 1)
            out.append({"label": label, "title": title, "part": part, "blocks": []})
            part = None
            continue
        p = _part(lines)
        if p:
            part = p
            continue
        if not out:
            continue
        text = _clean(" ".join(lines))
        if END_MATTER.match(text):
            break
        if not text or "gutenberg" in text.lower():
            continue
        if BREAK.match(text):
            kind = "break"
        elif FOOTNOTE.match(text):
            kind = "note"
        else:
            kind = "p"
        out[-1]["blocks"].append({"kind": kind, "text": "* * *" if kind == "break" else text})
    out = [c for c in out if any(b["kind"] == "p" for b in c["blocks"])]
    if len(out) < MIN_CHAPTERS:
        raise SerialError(f"found {len(out)} chapters")
    return out


def _block_words(blocks: list[dict]) -> int:
    return sum(_words(b["text"]) for b in blocks if b["kind"] == "p")


def _split(blocks: list[dict], parts: int) -> list[list[dict]]:
    total = _block_words(blocks)
    out, current, done = [], [], 0
    for b in blocks:
        # Cut only before a paragraph, so a footnote stays with the text it explains.
        if b["kind"] == "p" and current and len(out) < parts - 1 and done >= total * (len(out) + 1) / parts:
            out.append(current)
            current = []
        current.append(b)
        if b["kind"] == "p":
            done += _words(b["text"])
    if current:
        out.append(current)
    return out


def instalments(chs: list[dict]) -> list[list[dict]]:
    """Each instalment is a list of blocks: a "chapter" block opens a chapter, "continued" reopens
    one cut the day before, then "p", "note" and "break" blocks. Long chapters are cut at
    paragraph breaks into near-equal parts; short ones share a day."""
    out: list[list[dict]] = []
    pending: list[dict] = []
    for ch in chs:
        head = {"kind": "chapter", "text": ch["label"], "title": ch["title"], "part": ch["part"]}
        words = _block_words(ch["blocks"])
        if words > MAX_WORDS:
            if pending:
                out.append(pending)
                pending = []
            pieces = _split(ch["blocks"], math.ceil(words / TARGET_WORDS))
            for n, piece in enumerate(pieces):
                opener = head if n == 0 else {"kind": "continued", "text": ch["label"], "title": ch["title"]}
                out.append([opener, *piece])
            continue
        if pending and _block_words(pending) + words > MAX_WORDS:
            out.append(pending)
            pending = []
        pending += [head, *ch["blocks"]]
        if _block_words(pending) >= SHORT_CHAPTER:
            out.append(pending)
            pending = []
    if pending:
        if out and _block_words(out[-1]) + _block_words(pending) <= MAX_WORDS * 1.2:
            out[-1] += pending
        else:
            out.append(pending)
    return out


_ROMAN_VALUES = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100}


def _number(label: str) -> int | None:
    word = label.split()[-1].upper()
    if word.isdigit():
        return int(word)
    if not ROMAN.match(word):
        return None
    total = 0
    for a, b in zip(word, word[1:] + " "):
        v = _ROMAN_VALUES[a]
        total += -v if b != " " and _ROMAN_VALUES[b] > v else v
    return total


def _roman(n: int) -> str:
    out = ""
    for v, r in ((100, "C"), (90, "XC"), (50, "L"), (40, "XL"), (10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I")):
        while n >= v:
            out += r
            n -= v
    return out


def fix_misprints(chs: list[dict]) -> None:
    """Corrects a single misprinted chapter number when its neighbours agree on what it should be,
    such as "XXVII" printed between XVI and XVIII."""
    for i in range(1, len(chs) - 1):
        before, here, after = (_number(c["label"]) for c in chs[i - 1:i + 2])
        if None in (before, here, after) or chs[i]["part"] or chs[i + 1]["part"]:
            continue
        if here != before + 1 and after == before + 2:
            head, word = chs[i]["label"].rsplit(" ", 1)
            chs[i]["label"] = f"{head} {before + 1 if word.isdigit() else _roman(before + 1)}"


def in_sequence(chs: list[dict]) -> bool:
    """Chapter numbers must count up by one, starting again at 1 where a new part or a run of
    letters begins. Anything else means a heading was missed or misread."""
    prev = None
    kind = None
    for ch in chs:
        n = _number(ch["label"])
        k = ch["label"].split()[0]
        if n is None:
            return False
        if not (n == 1 and (prev is None or ch["part"] or k != kind)) and n != (prev or 0) + 1:
            return False
        prev, kind = n, k
    return True


def author_of(raw: str) -> str | None:
    m = re.search(r"^Author:\s*(.+)$", raw, re.M)
    return m.group(1).strip() if m else None


def title_of(raw: str) -> str | None:
    m = re.search(r"^Title:\s*(.+)$", raw, re.M)
    return m.group(1).strip() if m else None


def prepare(entry: dict, raw: str) -> dict:
    """Checks a downloaded text against its catalog entry and cuts it into instalments."""
    title = title_of(raw) or ""
    if not title.lower().startswith(entry["match"].lower()):
        raise SerialError(f"downloaded title {title!r} does not match {entry['match']!r}")
    chs = chapters(raw)
    fix_misprints(chs)
    if not in_sequence(chs):
        raise SerialError("chapter numbers are not in sequence")
    parts = instalments(chs)
    words = [_block_words(i) for i in parts]
    if max(words) > MAX_WORDS * 1.25:
        raise SerialError(f"an instalment came out at {max(words)} words")
    return {"id": entry["id"], "title": entry["title"], "author": entry["author"], "year": entry["year"],
            "instalments": parts}


def instalment_entry(book: dict, number: int, started: dt.date, next_title: str | None) -> dict:
    """The serial part of an edition's JSON. number counts from 1."""
    total = len(book["instalments"])
    return {
        "id": f"serial-{book['id']}-{number}",
        "title": book["title"],
        "author": book["author"],
        "year": book["year"],
        "number": number,
        "total": total,
        "started": started.isoformat(),
        "blocks": book["instalments"][number - 1],
        "last": number == total,
        "next_title": next_title if number == total else None,
        "source_name": "Public domain",
        "source_url": BOOK_URL.format(id=book["id"]),
        "license": LICENSES["pd-expired"],
        "attribution": f"{book['title']}, by {book['author']}, first published {book['year']}. Public domain.",
    }


def _order(entries: list[dict]) -> dict[int, int]:
    return {e["id"]: n for n, e in enumerate(entries)}


def ready_books(store, entries: list[dict]) -> list[dict]:
    """Prepared books in catalog order, each with its start date if it has started."""
    rows = store.serial_books()
    order = _order(entries)
    out = [dict(r["book"], started_on=r["started_on"]) for i, r in rows.items() if r["book"] and i in order]
    return sorted(out, key=lambda b: order[b["id"]])


def download(store, http, entry: dict, today: dt.date) -> dict | None:
    """Fetches and prepares one catalog book. A book that can't be used is recorded with the
    reason so it is never tried again; a network failure is raised so the next run retries."""
    if not public_domain_everywhere(entry, today):
        store.serial_save(entry["id"], None, "not public domain everywhere the paper goes")
        return None
    raw = http.get(TEXT_URL.format(id=entry["id"])).decode("utf-8")
    try:
        book = prepare(entry, raw)
    except SerialError as e:
        log.warning("serial book %s turned down: %s", entry["id"], e)
        store.serial_save(entry["id"], None, str(e))
        return None
    store.serial_save(entry["id"], book, None)
    return book


def queue_ahead(store, http, today: dt.date, ahead: int = 2, entries: list[dict] | None = None) -> list[str]:
    """Keeps `ahead` unstarted books prepared, so a book never has to be downloaded on the
    morning it begins. Returns the titles added."""
    entries = entries if entries is not None else catalog()
    known = store.serial_books()
    waiting = sum(1 for b in ready_books(store, entries) if b["started_on"] is None)
    added = []
    for entry in entries:
        if waiting >= ahead:
            break
        if entry["id"] in known:
            continue
        if download(store, http, entry, today):
            added.append(entry["title"])
            waiting += 1
    return added


def books_left(store, entries: list[dict] | None = None) -> int:
    """Catalog books not yet finished or turned down."""
    entries = entries if entries is not None else catalog()
    known = store.serial_books()
    unstarted = sum(1 for e in entries if e["id"] not in known or (known[e["id"]]["book"] and not known[e["id"]]["started_on"]))
    return unstarted


def _fetch_next(store, http, entries: list[dict], today: dt.date) -> list[dict]:
    known = store.serial_books()
    for entry in entries:
        if entry["id"] not in known and download(store, http, entry, today):
            break
    return [b for b in ready_books(store, entries) if not b["started_on"]]


def for_date(store, date: dt.date, http=None, entries: list[dict] | None = None) -> dict | None:
    """The instalment that runs on `date`. When the running book has ended, the next prepared
    book starts that day, downloaded now if the weekly queue hasn't fetched it."""
    entries = entries if entries is not None else catalog()
    books = ready_books(store, entries)
    started = [b for b in books if b["started_on"]]
    waiting = [b for b in books if not b["started_on"]]
    for b in started:
        n = (date - b["started_on"]).days + 1
        if 1 <= n <= len(b["instalments"]):
            if n == len(b["instalments"]) and not waiting and http is not None:
                # Only to name tomorrow's book; the last instalment prints either way.
                try:
                    waiting = _fetch_next(store, http, entries, date)
                except Exception as e:
                    log.warning("couldn't fetch the next serial book: %s", e)
            return instalment_entry(b, n, b["started_on"], waiting[0]["title"] if waiting else None)
    ended = max((b["started_on"] + dt.timedelta(days=len(b["instalments"])) for b in started), default=None)
    if ended and date < ended:
        return None
    if not waiting and http is not None:
        waiting = _fetch_next(store, http, entries, date)
    if not waiting:
        return None
    nxt = waiting[0]
    store.serial_start(nxt["id"], date)
    return instalment_entry(nxt, 1, date, waiting[1]["title"] if len(waiting) > 1 else None)
