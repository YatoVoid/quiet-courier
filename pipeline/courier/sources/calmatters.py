import datetime as dt
import re
import xml.etree.ElementTree as ET

from .. import clean
from . import LICENSES, Context, article_id

FEED = "https://calmatters.org/feed/"
NS = {"content": "http://purl.org/rss/1.0/modules/content/", "dc": "http://purl.org/dc/elements/1.1/"}
SOURCE_NAME = "CalMatters"
# Their republishing page asks for this line at the top of the story; print drops the newsletter sentence.
TAGLINE = "This story was originally published by CalMatters."
ATTRIBUTION = "Republished with permission from CalMatters (calmatters.org), a nonprofit newsroom."
# Dan Hu (Director of Partnerships) gave written permission on 2026-10-15 and said more than our
# offered one or two a week is fine. Each run takes the Ideas slot, so the spacing leaves Ideas
# the other mornings.
PER_WEEK = 3
MIN_GAP_DAYS = 2
# Commentary needs a different tagline and byline, newsletter posts round up other outlets' links,
# and Spanish stories can't be set in the print fonts' language. News stories only.
SKIP_CATEGORIES = {"commentary", "newsletters", "calmatters en español"}
# A city race reads as noise to a reader in Ohio or Lagos; statewide policy usually doesn't.
LOCAL = re.compile(r"\b(mayor|mayoral|city council|board of supervisors|supervisor race)\b", re.I)
SUMMARY = re.compile(r'<div class="[^"]*calmatters-summary[^"]*">.*?</div>\s*</div>', re.S)


def allowed(ran_on: list[dt.date], date: dt.date) -> bool:
    week = [d for d in ran_on if 0 < (date - d).days < 7]
    recent = [d for d in ran_on if 0 < (date - d).days < MIN_GAP_DAYS]
    return len(week) < PER_WEEK and not recent


def fetch(ctx: Context) -> list[dict]:
    root = ET.fromstring(ctx.http.get(FEED))
    out = []
    for item in root.iter("item"):
        categories = {c.text.strip().lower() for c in item.findall("category") if c.text}
        url = (item.findtext("link") or "").strip()
        title = clean.text(item.findtext("title", default=""))
        if categories & SKIP_CATEGORIES or "/commentary/" in url or LOCAL.search(title):
            continue
        markup = item.findtext("content:encoded", default="", namespaces=NS)
        summary = SUMMARY.search(markup)
        deck = None
        if summary:
            m = re.search(r'<p class="calmatters-summary-content[^"]*">(.*?)</p>', summary.group(0), re.S)
            deck = clean.text(m.group(1)) if m else None
            markup = markup.replace(summary.group(0), "")
        body = clean.blocks(markup)
        if len(body) < 4:
            continue
        authors = [clean.text(c.text) for c in item.findall("dc:creator", NS) if c.text]
        out.append({
            "id": article_id("cm", url),
            "section": "states",
            "title": title,
            "deck": deck,
            "author": " and ".join(authors) or None,
            "author_affiliation": None,
            "source_name": SOURCE_NAME,
            "source_url": url,
            "published": item.findtext("pubDate"),
            "license": LICENSES["calmatters-permission"],
            "tagline": TAGLINE,
            "attribution": ATTRIBUTION,
            "changes": clean.changes_note(clean.omitted_media(markup)),
            "body": body,
        })
    return out
