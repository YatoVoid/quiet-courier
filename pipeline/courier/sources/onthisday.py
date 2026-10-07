"""A short "This Day in History" note from Wikipedia's selected anniversaries for the calendar day
(CC BY-SA 4.0). Reachable from the server, unlike loc.gov. Choosing a few items and leaving the
rest out is an adaptation, so the box carries the ShareAlike licence; the individual sentences are
Wikipedia's own, unedited.

The Library of Congress "Today in History" would be the obvious source, but loc.gov answers the
server with a Cloudflare challenge (the same block that moved the 1926 archive index to a shipped
file) and has no JSON API for it, so this uses Wikipedia instead.
"""

import datetime as dt
import json

from ..clean import text as clean_text
from ..http import FetchError
from . import Context, article_id

FEED = "https://en.wikipedia.org/api/rest_v1/feed/onthisday/selected/{month:02d}/{day:02d}"
LICENSE = {"id": "cc-by-sa-4.0", "name": "CC BY-SA 4.0",
           "url": "https://creativecommons.org/licenses/by-sa/4.0/", "commercial": True, "derivatives": True}
# The paper is calm and the box is meant as a cultural note, so war and bloodshed are left out,
# even for old events. On a day with too few gentle anniversaries the box is simply skipped.
AVOID = ("assassinat", "massacre", "murder", "killed", "execut", "bombing", "bombed", "shooting",
         "genocide", "atrocit", "lynch", "slaughter", "hanged", "hostage", "war", "battle", "siege",
         "troops", "army", "armies", "invaded", "invasion", "defeated", "sacked", "rebellion",
         "revolt", "coup", "uprising", "military", "soldier", "fought", "conquest", "warship",
         "bombard", "massacr", "terror", "riot", "rebel", "insurgen", "privateer", "captured",
         "capture", "raid", "warfare", "combat", "mutiny", "slave",
         "flood", "earthquake", "disaster", "crashed", " crash", "sank", "shipwreck", "famine",
         "epidemic", "plague", "wildfire", "eruption", "tornado", "cyclone", "hurricane", "tsunami",
         "avalanche", "derail", "collapsed", "explosion", "exploded", "people died", "were drowned")
MAX_ITEMS = 5
MIN_ITEMS = 3


def fetch(ctx: Context) -> list[dict]:
    url = FEED.format(month=ctx.date.month, day=ctx.date.day)
    try:
        raw = ctx.http.get(url, accept="application/json")
    except (OSError, FetchError):
        return []
    try:
        selected = json.loads(raw.decode("utf-8") if isinstance(raw, bytes) else raw).get("selected", [])
    except json.JSONDecodeError:
        return []

    events = []
    seen_years = set()
    for e in sorted(selected, key=lambda z: z.get("year", 0)):
        year = e.get("year")
        body = clean_text(e.get("text", "")).replace(" ", " ").strip()
        if not year or not body or year in seen_years:
            continue
        low = body.lower()
        if any(w in low for w in AVOID):
            continue
        seen_years.add(year)
        label = f"{year} BC" if year < 0 else str(year)
        events.append({"label": label.replace("-", "") if year < 0 else label, "value": "", "note": body})
    if len(events) < MIN_ITEMS:
        return []
    events = events[:MAX_ITEMS]

    page = f"https://en.wikipedia.org/wiki/{ctx.date:%B}_{ctx.date.day}"
    return [{
        "id": article_id("onthisday", f"{ctx.date.month:02d}-{ctx.date.day:02d}"),
        "section": "history",
        "title": "This Day in History",
        "deck": None,
        "author": None,
        "author_affiliation": None,
        "source_name": "Wikipedia",
        "source_url": page,
        "published": ctx.date.isoformat(),
        "license": LICENSE,
        "attribution": "Selected anniversaries from Wikipedia, CC BY-SA 4.0. This selection is shared under the same licence.",
        "changes": "A few of the day's anniversaries, chosen from a longer list. Text unedited.",
        "body": [{"kind": "p", "text": f"Notable events on this day through the years, from the {ctx.date:%B} {ctx.date.day} record."}],
        "stats": events,
        "images": [],
    }]
