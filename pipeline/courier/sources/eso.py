import datetime as dt
import email.utils
import html as htmllib
import re
import xml.etree.ElementTree as ET

from .. import clean
from ..http import FetchError
from . import LICENSES, Context, article_id

FEED = "https://www.eso.org/public/news/feed/"
# ESO publishes roughly one release every week or two, so a discovery can sit at the top of the feed
# for a while. Only run one within this many days of its release, so the paper never prints a
# months-old result as if it were news. 60 days matches history_days, so each release runs once.
MAX_AGE_DAYS = 60
# Press releases run under CC BY 4.0 (eso.org/public/outreach/copyright). The licence does not
# cover the ESO logo, scientific papers, or the photographs, so we omit images and credit the text.
ATTRIBUTION = "European Southern Observatory (ESO), CC BY 4.0. ESO does not endorse this publication."
# Everything from these headings on is press-release tail matter, not the story.
TAIL = re.compile(r"^(More information|Links|Contacts|Notes|Science paper)\b", re.I)
MAX_ITEMS = 6
MIN_WORDS = 150
MAX_WORDS = 900


def _body(markup: str) -> list[dict]:
    head = re.split(r"<h[2-4][^>]*>\s*(?:More information|Links|Contacts|Notes)\b", markup, maxsplit=1)[0]
    out = []
    for raw in re.findall(r"<p\b[^>]*>(.*?)</p>", head, flags=re.S | re.I):
        text = clean.text(raw)
        if len(text) < 60 or TAIL.match(text):
            continue
        out.append({"kind": "p", "text": text})
    return out


def fetch(ctx: Context) -> list[dict]:
    root = ET.fromstring(ctx.http.get(FEED))
    out = []
    for item in list(root.iter("item"))[:MAX_ITEMS]:
        url = (item.findtext("link") or "").strip()
        title = clean.text(item.findtext("title", default=""))
        if not url or not title:
            continue
        try:
            published = email.utils.parsedate_to_datetime(item.findtext("pubDate") or "")
        except (TypeError, ValueError):
            published = None
        if published and (ctx.date - published.date()).days > MAX_AGE_DAYS:
            continue
        deck = clean.text(htmllib.unescape(item.findtext("description") or ""))
        deck = re.split(r"(?<=[.!?])\s", deck, maxsplit=1)[0][:200] if deck else None
        try:
            page = ctx.http.get(url)
        except (OSError, FetchError):
            continue
        if isinstance(page, bytes):
            page = page.decode("utf-8", "replace")
        body = _body(page)
        words = sum(len(b["text"].split()) for b in body)
        if words < MIN_WORDS:
            continue
        while body and sum(len(b["text"].split()) for b in body) > MAX_WORDS:
            body.pop()
        clean.mark_labels(body)
        out.append({
            "id": article_id("eso", url),
            "section": "science",
            "title": title,
            "deck": deck,
            "author": None,
            "author_affiliation": None,
            "source_name": "European Southern Observatory",
            "source_url": url,
            "published": item.findtext("pubDate"),
            "license": LICENSES["cc-by-4.0"],
            "attribution": ATTRIBUTION,
            "changes": clean.changes_note(["images"]),
            "body": body,
            "images": [],
        })
    return out
