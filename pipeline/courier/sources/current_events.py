"""The World in Brief: selected items from Wikipedia's Current events portal (CC BY-SA 4.0).

One page per UTC day. Only a revision at least MIN_AGE old is used, so a fresh bad edit
can't reach the paper, and only a day that has already ended.
"""

from __future__ import annotations

import datetime as dt
import json
import re
import urllib.parse
from html.parser import HTMLParser

from .. import clean
from ..http import Http

API = "https://en.wikipedia.org/w/api.php"
MIN_AGE = dt.timedelta(hours=3)
LICENSE = {"id": "cc-by-sa-4.0", "name": "CC BY-SA 4.0",
           "url": "https://creativecommons.org/licenses/by-sa/4.0/", "commercial": True, "derivatives": True}

# A calm paper: everyday news first, conflicts last.
HEADING_ORDER = [
    "Politics and elections", "International relations", "Business and economy", "Science and technology",
    "Health and environment", "Arts and culture", "Disasters and accidents", "Law and crime", "Sports",
    "Armed conflicts and attacks",
]
MIN_CHARS, MAX_CHARS = 40, 320


def brief_day(now: dt.datetime) -> dt.date:
    return (now.astimezone(dt.UTC) - MIN_AGE).date() - dt.timedelta(days=1)


def page_title(day: dt.date) -> str:
    return f"Portal:Current_events/{day.year}_{day:%B}_{day.day}"


class _Tree(HTMLParser):
    """Just enough of a DOM for the portal's markup: headings in <p><b>, items in nested <ul><li>."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = {"tag": "root", "attrs": {}, "children": []}
        self.stack = [self.root]

    def handle_starttag(self, tag, attrs):
        node = {"tag": tag, "attrs": dict(attrs), "children": []}
        self.stack[-1]["children"].append(node)
        if tag not in {"br", "img", "wbr"}:
            self.stack.append(node)

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i]["tag"] == tag:
                del self.stack[i:]
                return

    def handle_data(self, data):
        self.stack[-1]["children"].append(data)


def _text(node, skip_external: bool = False) -> str:
    if isinstance(node, str):
        return node
    if node["tag"] == "ul":
        return ""
    if skip_external and node["tag"] == "a" and "external" in node["attrs"].get("class", ""):
        return ""
    if node["tag"] in {"sup", "style"}:
        return ""
    return "".join(_text(c, skip_external) for c in node["children"])


def _externals(node) -> list[str]:
    out = []
    for c in node["children"]:
        if isinstance(c, str) or c["tag"] == "ul":
            continue
        if c["tag"] == "a" and "external" in c["attrs"].get("class", ""):
            out.append(_text(c).strip().strip("()"))
        else:
            out.extend(_externals(c))
    return out


def _find(node, pred):
    if isinstance(node, str):
        return None
    if pred(node):
        return node
    for c in node["children"]:
        hit = _find(c, pred)
        if hit:
            return hit
    return None


def _items(ul, heading: str, topic: str | None, out: list[dict]) -> None:
    for li in (c for c in ul["children"] if not isinstance(c, str) and c["tag"] == "li"):
        nested = [c for c in li["children"] if not isinstance(c, str) and c["tag"] == "ul"]
        own = re.sub(r"\s+", " ", _text(li, skip_external=True)).strip()
        if nested:
            for sub in nested:
                _items(sub, heading, topic or own, out)
        elif own:
            out.append({"heading": heading, "topic": topic, "text": own, "outlets": _externals(li)})


def parse(html: str) -> list[dict]:
    tree = _Tree()
    tree.feed(html)
    body = _find(tree.root, lambda n: "current-events-content" in n["attrs"].get("class", "")) or tree.root
    out: list[dict] = []
    heading = None
    for c in body["children"]:
        if isinstance(c, str):
            continue
        if c["tag"] == "p":
            heading = re.sub(r"\s+", " ", _text(c)).strip() or heading
        elif c["tag"] == "ul" and heading:
            _items(c, heading, None, out)
    return out


def select(items: list[dict], avoid: tuple[str, ...], limit: int) -> list[dict]:
    usable = [i for i in items
              if MIN_CHARS <= len(i["text"]) <= MAX_CHARS
              and not clean.mentions({"title": i["text"], "body": []}, avoid)]
    rank = {h: n for n, h in enumerate(HEADING_ORDER)}
    by_heading: dict[str, list[dict]] = {}
    topics: set[str] = set()
    for i in usable:
        if i["topic"] and i["topic"] in topics:
            continue
        topics.add(i["topic"] or "")
        by_heading.setdefault(i["heading"], []).append(i)
    order = sorted(by_heading, key=lambda h: rank.get(h, len(rank)))
    picked: list[dict] = []
    while len(picked) < limit and any(by_heading.values()):
        for h in order:
            if by_heading[h] and len(picked) < limit:
                picked.append(by_heading[h].pop(0))
    return sorted(picked, key=lambda i: rank.get(i["heading"], len(rank)))


def fetch(http: Http, now: dt.datetime, avoid: tuple[str, ...], limit: int = 10) -> dict | None:
    day = brief_day(now)
    title = page_title(day)
    before = (now.astimezone(dt.UTC) - MIN_AGE).replace(minute=0, second=0, microsecond=0)
    query = urllib.parse.urlencode({
        "action": "query", "prop": "revisions", "titles": title, "rvprop": "ids|timestamp", "rvlimit": 1,
        "rvdir": "older", "rvstart": before.strftime("%Y-%m-%dT%H:%M:%SZ"), "format": "json", "formatversion": 2,
    })
    pages = json.loads(http.get(f"{API}?{query}", accept="application/json"))["query"]["pages"]
    revisions = pages[0].get("revisions") if pages else None
    if not revisions:
        return None
    revid = revisions[0]["revid"]
    parsed = json.loads(http.get(f"{API}?" + urllib.parse.urlencode({
        "action": "parse", "oldid": revid, "prop": "text", "format": "json", "formatversion": 2,
        "disablelimitreport": 1}), accept="application/json"))
    items = select(parse(parsed["parse"]["text"]), avoid, limit)
    if not items:
        return None
    permalink = f"https://en.wikipedia.org/w/index.php?title={urllib.parse.quote(title)}&oldid={revid}"
    return {
        "day": day.isoformat(),
        "items": items,
        "source_url": permalink,
        "license": LICENSE,
        "attribution": f"From Wikipedia's Current events portal for {day:%B} {day.day}, {day.year}, "
                       f"by Wikipedia contributors.",
        "changes": "Selected items; links removed.",
    }
