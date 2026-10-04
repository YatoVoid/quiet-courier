import datetime as dt
import functools
import gzip
import json
import logging
import os
import random
import re
import time
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path

from .. import clean
from ..http import FetchError
from . import LICENSES, Context, article_id

log = logging.getLogger(__name__)

SEARCH = ("https://www.loc.gov/collections/chronicling-america/?dates={d}/{d}"
          "&fa=online-format:image|language:english&fo=json&c=100&sp={page}")
TILE = "https://tile.loc.gov/storage-services/"
IIIF_PAGE = re.compile(r"/iiif/(service:[^/]+)/")
WORDS = Path(__file__).resolve().parent.parent / "data" / "words.txt"
INDEX = Path(__file__).resolve().parent.parent / "data" / "archive-index.json.gz"
# A newer copy built by the repo's "Archive index" GitHub workflow, fetched by `courier maintain`
# and kept beside the pipeline's database, so the server never needs loc.gov's search.
INDEX_URL = "https://raw.githubusercontent.com/YatoVoid/quiet-courier/main/pipeline/courier/data/archive-index.json.gz"
DOWNLOADED = Path(os.environ.get("COURIER_DB", Path(__file__).resolve().parents[3] / "data" / "courier.db")).parent \
    / "archive-index.json.gz"
MAX_INDEX_BYTES = 20 * 1024**2
GRIM = ("funeral", "died", "death", "dead", "killed", "slain", "murder", "hanged", "lynch", "suicide",
        "bandit", "robbery", "shot", "corpse", "body of", "wreck", "drowned", "burned to")
# Court and estate notices fill the 1920s front pages and read as boilerplate. One of these
# phrases marks a notice; plain trial reporting only trips the weaker terms below.
LEGAL = ("hereby", "show cause", "notice is", "legal notice", "notice to creditors", "sheriff's sale",
         "sheriff’s sale", "trustee's sale", "trustee’s sale", "public auction", "foreclos", "the said ",
         "said premises", "aforesaid", "whereas", "to whom it may concern", "in the matter of",
         "executrix", "administratrix", "probate", "summons", "deed of trust")
LEGAL_WEAK = ("mortgage", "plaintiff", "defendant", "petition", "premises", "estate of", "chancery", "decree")
ALLOWED = re.compile(r"^[\w.,;:'\"’‘“”!?()$&%\-—–/]+$")
MIN_WORDS, MAX_WORDS = 40, 320
MAX_PAPERS = 6
PER_PAPER = 2
SMALL_WORDS = {"a", "an", "and", "at", "for", "in", "of", "on", "the", "to"}


def title_case(s: str) -> str:
    words = s.split()
    return " ".join(w if (i and w.lower() in SMALL_WORDS) or not w.islower() else w.capitalize()
                    for i, w in enumerate(words))


@dataclass
class Story:
    headline: list[str]
    paragraphs: list[str]
    quality: float

    @property
    def words(self) -> int:
        return sum(len(p.split()) for p in self.paragraphs)


@functools.cache
def dictionary() -> frozenset[str]:
    return frozenset(WORDS.read_text().split())


def known(word: str) -> bool:
    w = word.lower().strip(".,;:'\"’‘“”!?()-—–")
    if not w or not w.isalpha():
        return bool(w) and any(c.isdigit() for c in w)
    d = dictionary()
    if w in d:
        return True
    for suffix, repl in (("s", ""), ("es", ""), ("ed", ""), ("ed", "e"), ("ing", ""), ("ing", "e"),
                         ("ly", ""), ("ies", "y"), ("ied", "y"), ("er", ""), ("est", ""), ("'s", ""), ("’s", "")):
        if w.endswith(suffix) and w[: -len(suffix)] + repl in d:
            return True
    return False


def hundred_years_before(d: dt.date) -> dt.date:
    try:
        return d.replace(year=d.year - 100)
    except ValueError:
        return d.replace(year=d.year - 100, day=28)


def _line_words(line: ET.Element) -> list[str]:
    out = []
    for el in line:
        tag = el.tag.rsplit("}", 1)[-1]
        if tag != "String":
            continue
        kind = el.get("SUBS_TYPE")
        if kind == "HypPart2":
            continue
        out.append(el.get("SUBS_CONTENT") if kind == "HypPart1" else el.get("CONTENT", ""))
    return [w for w in out if w]


def _tidy(words: list[str]) -> tuple[str, int]:
    out, bad = [], 0
    for w in words:
        w = w.replace("■", "").replace("|", "").replace("¦", "")
        if not w:
            continue
        if not ALLOWED.match(w) or (w.isalpha() and len(w) <= 3 and not known(w) and not w.isupper()):
            bad += 1
            if not out or out[-1] != "[illegible]":
                out.append("[illegible]")
            continue
        out.append(w)
    return " ".join(out), bad


def _is_heading(line: str) -> bool:
    letters = [c for c in line if c.isalpha()]
    return len(letters) >= 3 and sum(c.isupper() for c in letters) / len(letters) > 0.8


BYLINE = re.compile(r"^by\s", re.I)
CREDIT_LINE = re.compile(r"^\S{1,4}\s+(United|Associated|Universal)\s+Pr|Times Special$", re.I)
DATELINE = re.compile(r"^[A-Z][A-Za-z.]*(?:\s[A-Z][A-Za-z.]*)*,\s+(?:[A-Z][a-z]*\.?,?\s+)?(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)")
MONTH_ONE = re.compile(r"\b((?:Jan|Feb|Mar|Apr|May|June?|July?|Aug|Sept?|Oct|Nov|Dec)[a-z]*\.?,?\s+)[Il!](?=[.,:;]?(?:\s|[—\-(]))")
AP_MARK = re.compile(r"\s*[—\-]+\s*\(?\s*(?:/P|#|OP|4\*|<P|\(P|IP|\(/P|0P|Of\*|oW|MB|Mß)\s*\)?\s*[—\-]+\s*")


def fix_ocr(t: str) -> str:
    t = MONTH_ONE.sub(lambda m: m.group(1) + "1", t)
    t = AP_MARK.sub("—(AP)—", t)
    t = re.sub(r"\s+([.,;:!?])", r"\1", t)
    t = re.sub(r"(\w)- (?=[a-z])", r"\1", t)
    return re.sub(r"\s{2,}", " ", t).strip()


def stories(alto: bytes) -> list[Story]:
    root = ET.fromstring(alto)
    out = []
    for block in root.iter():
        if not block.tag.endswith("TextBlock"):
            continue
        bx = int(float(block.get("HPOS", 0)))
        bw = max(1, int(float(block.get("WIDTH", 1))))
        lines = []
        for ln in block:
            if not ln.tag.endswith("TextLine"):
                continue
            words = _line_words(ln)
            if words:
                indent = (int(float(ln.get("HPOS", bx))) - bx) / bw
                width = int(float(ln.get("WIDTH", bw))) / bw
                lines.append((words, indent, width))
        headline, deck, pending, paragraphs, current = [], [], [], [], []
        deck_open = True
        for words, indent, width in lines:
            raw = " ".join(words)
            started = bool(paragraphs or current)
            if not started and not deck and not pending and _is_heading(raw):
                if not BYLINE.match(raw):
                    headline.append(raw)
                continue
            if not started and CREDIT_LINE.search(raw):
                deck_open = False
                continue
            # Under the headline, lines up to the first one ending in a period form the deck.
            if not started and headline and deck_open and not DATELINE.match(raw) and len(pending) < 4:
                pending.append(raw)
                if raw.rstrip().endswith("."):
                    deck, pending, deck_open = pending, [], False
                continue
            if pending:
                current.extend(" ".join(pending).split())
                pending = []
            deck_open = False
            if started and _is_heading(raw) and len(raw) > 8:
                break
            # Ragged scans make many lines look indented; only break after a sentence ends.
            if current and indent > 0.04 and current[-1].rstrip("”’\"'").endswith((".", "?", "!", ":")):
                paragraphs.append(current)
                current = []
            current.extend(words)
        if pending:
            current = " ".join(pending).split() + current
        if current:
            paragraphs.append(current)
        merged = []
        for p in paragraphs:
            if merged and len(p) < 4:
                merged[-1] = merged[-1] + p
            else:
                merged.append(p)
        paragraphs = merged
        texts, total, bad, hits = [], 0, 0, 0
        for p in paragraphs:
            t, b = _tidy(p)
            bad += b
            total += len(p)
            hits += sum(known(w) for w in p)
            texts.append(fix_ocr(t))
        if not texts or total == 0:
            continue
        quality = (hits / total) * (1 - bad / total)
        if deck:
            headline = headline + [fix_ocr(" ".join(deck))]
        out.append(Story(headline, texts, quality))
    return out


def acceptable(s: Story, avoid: tuple[str, ...]) -> bool:
    if not s.headline or not (MIN_WORDS <= s.words <= MAX_WORDS) or s.quality < 0.86:
        return False
    head_words = " ".join(s.headline).split()
    if sum(known(w) for w in head_words) / len(head_words) < 0.85 or not all(ALLOWED.match(w) for w in head_words):
        return False
    hay = (" ".join(s.headline) + " " + " ".join(s.paragraphs)).lower()
    if any(g in hay for g in GRIM) or any(a.lower() in hay for a in avoid):
        return False
    if any(t in hay for t in LEGAL) or sum(t in hay for t in LEGAL_WEAK) >= 2:
        return False
    return sum(p.count("[illegible]") for p in s.paragraphs) <= max(2, s.words // 60)


def _search(http, day: dt.date) -> list[dict]:
    found = {}
    for page in (1, 2, 3):
        data = http.json(SEARCH.format(d=day.isoformat(), page=page))
        for r in data.get("results", []):
            rid = r.get("id", "")
            m = IIIF_PAGE.search((r.get("image_url") or [""])[0])
            if f"/{day.isoformat()}/" in rid and m and rid not in found:
                found[rid] = {"id": rid.replace("http://", "https://"), "title": r.get("title", ""),
                              "alto": m.group(1).replace(":", "/")}
        if not data.get("pagination", {}).get("next"):
            break
    return list(found.values())


def _load(path: Path) -> dict[str, list[dict]]:
    if not path.exists():
        return {}
    return json.loads(gzip.decompress(path.read_bytes()))


@functools.cache
def _index() -> dict[str, list[dict]]:
    return _load(INDEX) | _load(DOWNLOADED)


def _valid_index(data) -> bool:
    if not isinstance(data, dict):
        return False
    for day, issues in data.items():
        if not (isinstance(day, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", day) and isinstance(issues, list)):
            return False
        if not all(isinstance(i, dict) and isinstance(i.get("id"), str) for i in issues):
            return False
    return True


def refresh_index(http) -> dt.date | None:
    """Downloads the index the GitHub workflow keeps up to date. Returns the new last 1920s day,
    or None when the published copy adds nothing."""
    body = http.get(INDEX_URL)
    if len(body) > MAX_INDEX_BYTES:
        raise ValueError(f"published archive index is {len(body)} bytes, over the limit")
    data = json.loads(gzip.decompress(body))
    if not _valid_index(data):
        raise ValueError("published archive index is not in the expected shape")
    current = _index()
    if data and current and max(data) <= max(current):
        return None
    DOWNLOADED.parent.mkdir(parents=True, exist_ok=True)
    tmp = DOWNLOADED.with_suffix(".tmp")
    tmp.write_bytes(body)
    tmp.replace(DOWNLOADED)
    _index.cache_clear()
    return dt.date.fromisoformat(max(data)) if data else None


def next_index_range(today: dt.date, ahead_days: int = 400, step_days: int = 45) -> tuple[dt.date, dt.date] | None:
    """Edition dates the next workflow run should add: from the day after the index ends,
    a step at a time, until it reaches `ahead_days` past today."""
    days = _index()
    start = today
    if days:
        last = dt.date.fromisoformat(max(days))
        start = max(today, last.replace(year=last.year + 100) + dt.timedelta(days=1))
    end = min(start + dt.timedelta(days=step_days - 1), today + dt.timedelta(days=ahead_days))
    return (start, end) if start <= end else None


def _issues(ctx: Context, day: dt.date) -> list[dict]:
    # www.loc.gov answers some server IPs with a Cloudflare challenge, while the OCR files on
    # tile.loc.gov stay reachable, so the issue list is shipped with the code when it can be.
    indexed = _index().get(day.isoformat())
    if indexed is not None:
        return indexed
    log.warning("no archive index for %s, searching loc.gov", day)
    return _search(ctx.http, day)


def update_index(http, days: list[dt.date], pause: float = 3.5) -> int:
    index = dict(_index())
    added = failures = 0
    for day in days:
        if day.isoformat() in index:
            continue
        try:
            issues = _search(http, day)
            failures = 0
        except FetchError as e:
            log.warning("%s: %s", day, e)
            failures += 1
            if failures >= 5:
                log.warning("stopping after %d failures in a row", failures)
                break
            issues = []
        log.info("%s: %d issues", day, len(issues))
        time.sleep(pause)
        if not issues:
            continue
        index[day.isoformat()] = issues
        added += 1
        INDEX.write_bytes(gzip.compress(json.dumps(index, sort_keys=True, separators=(",", ":")).encode(), mtime=0))
    _index.cache_clear()
    return added


def fetch(ctx: Context, want: int = 4) -> list[dict]:
    day = hundred_years_before(ctx.date)
    issues = _issues(ctx, day)
    random.Random(f"{ctx.date}:{ctx.city.id if ctx.city else ''}").shuffle(issues)
    out = []
    for issue in issues[:MAX_PAPERS]:
        url = issue["id"]
        try:
            alto = ctx.http.get(TILE + issue["alto"] + ".xml")
        except Exception:
            continue
        full_title = clean.text(issue["title"])
        paper = title_case(full_title.split(" (")[0].split(",")[0]) or "Unknown newspaper"
        place = re.search(r"\(([^)]+)\)", full_title)
        picks = [s for s in stories(alto) if acceptable(s, ctx.config.avoid)]
        picks.sort(key=lambda s: (not any(DATELINE.match(p) for p in s.paragraphs[:1]), -s.quality))
        picks = picks[:PER_PAPER]
        source_url = url.replace("/item/", "/resource/") + "?sp=1"
        for s in picks[: want - len(out)]:
            heads = [h for h in s.headline if _is_heading(h)]
            title = " ".join(heads)
            deck = " ".join(h for h in s.headline if not _is_heading(h)) or None
            out.append({
                "id": article_id("ca", source_url + title),
                "section": "archives",
                "title": title,
                "deck": deck,
                "author": None,
                "author_affiliation": None,
                "source_name": f"{paper}, {day.strftime('%b. %-d, %Y')}",
                "source_url": source_url,
                "published": day.isoformat(),
                "license": LICENSES["pd-expired"],
                "attribution": (f"{paper}{f' ({place.group(1)})' if place else ''}, {day.strftime('%B %-d, %Y')}, page 1. "
                                "Library of Congress, Chronicling America. Public domain. Text is the page scan's OCR, "
                                "lightly cleaned; [illegible] marks words the scan could not read."),
                "changes": "OCR text, lightly cleaned.",
                "body": [{"kind": "p", "text": p} for p in s.paragraphs],
            })
        if len(out) >= want:
            break
    return out
