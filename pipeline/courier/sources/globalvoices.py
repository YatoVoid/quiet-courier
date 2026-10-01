import re
import xml.etree.ElementTree as ET

from .. import clean
from . import LICENSES, Context, article_id

FEED = "https://globalvoices.org/feed/"
NS = {"content": "http://purl.org/rss/1.0/modules/content/", "dc": "http://purl.org/dc/elements/1.1/"}
ATTRIBUTION = "Originally published on Global Voices (globalvoices.org) under CC BY 3.0."
# Partner stories carry the partner's own terms, not Global Voices' CC BY.
PARTNER = re.compile(r"originally\s+(?:published|appeared)\s+(?:on|in|by)\s+(?!global\s+voices)|global voices[’']\s+partners|\bpartners? (?:in|with) global voices", re.I)
TAIL = re.compile(r"^(Originally published on Global Voices|Written by |This post is part of|This article is part of)")


def fetch(ctx: Context) -> list[dict]:
    root = ET.fromstring(ctx.http.get(FEED))
    out = []
    for item in root.iter("item"):
        markup = item.findtext("content:encoded", default="", namespaces=NS)
        plain = clean.text(markup)
        if PARTNER.search(plain[:1500]):
            continue
        categories = {c.text.strip().lower() for c in item.findall("category") if c.text}
        if "announcements" in " ".join(categories) or item.findtext("title", default="").startswith("Support Global Voices"):
            continue
        body = [b for b in clean.blocks(markup) if not TAIL.match(b["text"])]
        captions = clean.strip_inline_captions(body)
        other_language = clean.drop_non_latin(body)
        if len(body) < 4:
            continue
        extra = (["photo captions"] if captions else []) + (
            ["original-language quotations (the article's English translations are kept)"] if other_language else [])
        url = item.findtext("link")
        out.append({
            "id": article_id("gv", url),
            "section": "world",
            "title": clean.text(item.findtext("title", default="")),
            "deck": None,
            "author": item.findtext("dc:creator", namespaces=NS),
            "author_affiliation": None,
            "source_name": "Global Voices",
            "source_url": url,
            "published": item.findtext("pubDate"),
            "license": LICENSES["cc-by-3.0"],
            "attribution": ATTRIBUTION,
            "changes": clean.changes_note(clean.omitted_media(markup), extra, edited=bool(extra)),
            "body": body,
        })
    return out
