"""Adds public-domain poems from Wikisource to the store, a few at a time.

Each collection below was published before 1931 and has one Wikisource page per poem.
Pages are read once; whether a page became a poem or was turned down is recorded, so
later runs only look at pages they haven't seen.
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
import time
import urllib.parse
from dataclasses import dataclass, field
from html.parser import HTMLParser

from . import clean, puzzle
from .devices import DEVICES
from .http import Http
from .store import Store

log = logging.getLogger("courier")

API = "https://en.wikisource.org/w/api.php"
PD_BEFORE = 1931


@dataclass(frozen=True)
class Collection:
    root: str
    author: str
    year: int


COLLECTIONS = [
    Collection("A Boy's Will", "Robert Frost", 1913),
    Collection("North of Boston", "Robert Frost", 1914),
    Collection("Mountain Interval", "Robert Frost", 1916),
    Collection("A Shropshire Lad", "A. E. Housman", 1896),
    Collection("Last Poems (Housman)", "A. E. Housman", 1922),
    Collection("Poems (Dickinson)", "Emily Dickinson", 1890),
    Collection("Harlem Shadows", "Claude McKay", 1922),
    Collection("Flame and Shadow", "Sara Teasdale", 1920),
    Collection("Lyrics of Lowly Life", "Paul Laurence Dunbar", 1896),
    Collection("Renascence and Other Poems", "Edna St. Vincent Millay", 1917),
    Collection("Poems of Gerard Manley Hopkins", "Gerard Manley Hopkins", 1918),
    Collection("A Child's Garden of Verses", "Robert Louis Stevenson", 1885),
    Collection("Poems (Jackson)", "Helen Hunt Jackson", 1892),
    Collection("Lyrical Ballads (1798)", "William Wordsworth", 1798),
]

NOT_POEMS = re.compile(r"\b(preface|contents|introduction|index|notes?|dedication|advertisement|title page|"
                       r"appendix|errata|biographical|bibliography)\b", re.I)
MIN_LINES, MAX_LINES, MAX_LINE_CHARS = 4, 40, 90


class _Tree(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = {"tag": "root", "attrs": {}, "children": []}
        self.stack = [self.root]

    def handle_starttag(self, tag, attrs):
        node = {"tag": tag, "attrs": dict(attrs), "children": []}
        self.stack[-1]["children"].append(node)
        if tag not in {"br", "img", "wbr", "hr"}:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.stack[-1]["children"].append({"tag": tag, "attrs": dict(attrs), "children": []})

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i]["tag"] == tag:
                del self.stack[i:]
                return

    def handle_data(self, data):
        self.stack[-1]["children"].append(data)


def _classes(node) -> set[str]:
    return set(node["attrs"].get("class", "").split()) if isinstance(node, dict) else set()


def _all(node, pred) -> list[dict]:
    if isinstance(node, str):
        return []
    found = [node] if pred(node) else []
    if found:
        return found
    for c in node["children"]:
        found.extend(_all(c, pred))
    return found


def _by_id(node, ident: str) -> str | None:
    hit = _all(node, lambda n: n["attrs"].get("id") == ident)
    return _flat(hit[0]).strip() if hit else None


def _skip(node) -> bool:
    return bool(_classes(node) & {"ws-noexport", "pagenum", "ws-pagenum", "reference", "mw-ref"}) \
        or node["tag"] in {"style", "sup", "script"}


def _flat(node) -> str:
    if isinstance(node, str):
        return node
    if _skip(node):
        return ""
    return "".join(_flat(c) for c in node["children"])


def _lines_with_breaks(node, out: list[str | None]) -> None:
    """Appends text pieces, with None marking a <br>."""
    if isinstance(node, str):
        out.append(node)
        return
    if _skip(node):
        return
    if node["tag"] == "br":
        out.append(None)
        return
    for c in node["children"]:
        _lines_with_breaks(c, out)


def _split_lines(node) -> list[list[str]]:
    pieces: list[str | None] = []
    _lines_with_breaks(node, pieces)
    stanzas, stanza, line = [], [], ""
    for p in [*pieces, None]:
        if p is not None:
            line += p
            continue
        text = re.sub(r"\s+", " ", line).strip()
        line = ""
        if text:
            stanza.append(text)
        elif stanza:
            stanzas.append(stanza)
            stanza = []
    if stanza:
        stanzas.append(stanza)
    return stanzas


def extract(html: str) -> dict | None:
    """Stanzas, plus the author and year Wikisource records for the page, or None if no poem is found."""
    tree = _Tree()
    tree.feed(html)
    meta = {"author": _by_id(tree.root, "ws-author"), "year": _by_id(tree.root, "ws-year")}

    stanzas: list[list[str]] = []
    poem_divs = _all(tree.root, lambda n: "poem" in _classes(n) and n["tag"] == "div")
    ws_poems = _all(tree.root, lambda n: "ws-poem" in _classes(n))
    centered = _all(tree.root, lambda n: "wst-block-center" in _classes(n))
    if poem_divs:
        for div in poem_divs:
            for p in (c for c in div["children"] if isinstance(c, dict) and c["tag"] == "p"):
                stanzas.extend(_split_lines(p))
    elif ws_poems:
        for div in ws_poems:
            for st in _all(div, lambda n: "ws-poem-stanza" in _classes(n)):
                lines = [re.sub(r"\s+", " ", _flat(ln)).strip()
                         for ln in _all(st, lambda n: "ws-poem-line" in _classes(n))]
                if any(lines):
                    stanzas.append([ln for ln in lines if ln])
    elif centered:
        for div in centered:
            for p in (c for c in div["children"] if isinstance(c, dict) and c["tag"] == "p"):
                stanzas.extend(_split_lines(p))
    if not stanzas:
        return None
    return {"stanzas": stanzas, **meta}


def tidy(name: str, stanzas: list[list[str]]) -> tuple[str, list[list[str]]]:
    """Undo print conventions that read oddly on their own: a title in quotes, and a first word
    set in capitals as the book's opening flourish ("HE ate and drank")."""
    title = name.replace("_", " ").strip().strip('"“”').strip()
    first = stanzas[0][0]
    word = re.match(r"[A-Z][A-Z'’]+\b", first)
    if word and len(word.group()) > 1:
        stanzas = [[word.group().capitalize() + first[word.end():], *stanzas[0][1:]], *stanzas[1:]]
    return title, stanzas


def check(poem: dict, avoid: tuple[str, ...]) -> str | None:
    """The reason a poem can't be used, or None."""
    lines = [ln for st in poem["stanzas"] for ln in st]
    if len(lines) < MIN_LINES:
        return "too short"
    if len(lines) > MAX_LINES:
        return "too long"
    if max(len(ln) for ln in lines) > MAX_LINE_CHARS:
        return "lines too long for a poem column"
    if poem["year"] >= PD_BEFORE:
        return f"published {poem['year']}, not yet public domain"
    article = {"title": poem["title"], "deck": None, "body": [{"text": ln} for ln in lines]}
    if not clean.is_english(article):
        return "not English"
    if clean.mentions(article, avoid, opening_only=False):
        return "mentions an avoided word"
    text = "\n".join(lines)
    for device in DEVICES.values():
        for seed in ("a", "b", "c"):
            try:
                puzzle.build(text, size=device.puzzle_size, count=device.puzzle_words, seed=seed)
            except ValueError:
                return "too few words for the word search"
    return None


def _api(http: Http, **params) -> dict:
    params.update(format="json", formatversion=2)
    return json.loads(http.get(f"{API}?{urllib.parse.urlencode(params)}", accept="application/json"))


def page_titles(http: Http, root: str) -> list[str]:
    titles, cont = [], {}
    while True:
        d = _api(http, action="query", list="allpages", apprefix=f"{root}/", apnamespace=0,
                 apfilterredir="nonredirects", aplimit=500, **cont)
        titles += [p["title"] for p in d["query"]["allpages"]]
        if "continue" not in d:
            return titles
        cont = {"apcontinue": d["continue"]["apcontinue"]}


def poem_id(title: str) -> str:
    return "ws-" + hashlib.sha1(title.encode()).hexdigest()[:10]


@dataclass
class RefillResult:
    added: list[str] = field(default_factory=list)
    rejected: int = 0
    errors: list[str] = field(default_factory=list)


def refill(http: Http, store: Store, avoid: tuple[str, ...], limit: int = 30, pause: float = 1.0,
           collections: list[Collection] = COLLECTIONS) -> RefillResult:
    result = RefillResult()
    seen = store.wikisource_seen()
    queue: list[tuple[Collection, str]] = []
    for col in collections:
        try:
            queue.append((col, [t for t in page_titles(http, col.root) if t not in seen]))
        except Exception as e:  # one missing collection must not stop the others
            result.errors.append(f"{col.root}: {e}")
    # Take pages from each collection in turn, so one book doesn't fill the pool.
    rounds = max((len(titles) for _, titles in queue), default=0)
    order = [(col, titles[i]) for i in range(rounds) for col, titles in queue if i < len(titles)]
    looked = 0
    for col, title in order:
        if len(result.added) >= limit or looked >= limit * 4:
            break
        looked += 1
        name = title.split("/", 1)[1]
        if NOT_POEMS.search(name):
            store.wikisource_mark(title, None, "not a poem page")
            result.rejected += 1
            continue
        if pause:
            time.sleep(pause)
        try:
            html = _api(http, action="parse", page=title, prop="text", disablelimitreport=1)["parse"]["text"]
        except Exception as e:
            result.errors.append(f"{title}: {e}")
            continue
        found = extract(html)
        if not found:
            store.wikisource_mark(title, None, "no poem layout found")
            result.rejected += 1
            continue
        year = int(found["year"]) if (found["year"] or "").isdigit() else col.year
        clean_title, stanzas = tidy(name, found["stanzas"])
        poem = {
            "id": poem_id(title), "title": clean_title, "author": found["author"] or col.author,
            "year": year, "seasons": ["any"], "stanzas": stanzas, "book": re.sub(r" \(.*\)$", "", col.root),
            "source_name": "Wikisource",
            "source_url": "https://en.wikisource.org/wiki/" + urllib.parse.quote(title.replace(" ", "_")),
        }
        reason = check(poem, avoid)
        store.wikisource_mark(title, None if reason else poem, reason)
        if reason:
            result.rejected += 1
        else:
            result.added.append(poem["title"])
    return result
