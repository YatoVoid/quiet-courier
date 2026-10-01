import html as htmllib
import re
import xml.etree.ElementTree as ET

from .. import clean
from . import LICENSES, Context, article_id

FEED = "https://www.nasa.gov/news-release/feed/"
NS = {"content": "http://purl.org/rss/1.0/modules/content/", "dc": "http://purl.org/dc/elements/1.1/"}
ATTRIBUTION = "NASA. U.S. government work, public domain. NASA does not endorse this publication."
EO_ATTRIBUTION = "NASA Earth Observatory. U.S. government work, public domain."
# Credits naming anyone but NASA (partner agencies, wire services, photographers) may not be public domain.
FOREIGN_CREDIT = re.compile(r"ESA|CSA|JAXA|Getty|AP Photo|Reuters|©|Copyright|courtesy|STScI", re.I)
MIN_WORDS = 120


def _images(markup: str) -> list[dict]:
    out, seen = [], set()
    # NASA puts the caption and credit in a <figcaption> after the <figure>, so pair each
    # image with the next caption that comes before the following image.
    chunks = re.split(r"(?=<img\b)", markup)
    for chunk in chunks[1:]:
        src = re.match(r'<img[^>]+src="([^"]+)"', chunk)
        credit = re.search(r'hds-credits">(.*?)</div>', chunk, flags=re.S)
        caption = re.search(r'hds-caption-text[^>]*>(.*?)</div>', chunk, flags=re.S)
        if not (src and credit):
            continue
        credit_text = clean.text(credit.group(1))
        if "NASA" not in credit_text or FOREIGN_CREDIT.search(credit_text):
            continue
        url = htmllib.unescape(src.group(1)).split("?")[0]
        if url in seen or url.endswith((".svg", ".gif")) or "logo" in url.lower():
            continue
        seen.add(url)
        cap = clean.text(caption.group(1)) if caption else ""
        cap = re.split(r"(?<=[.!?])\s", cap, maxsplit=1)[0][:160].rstrip(".")
        out.append({"url": url + "?w=1200", "caption": cap, "credit": credit_text, "license": LICENSES["us-gov-pd"]})
    return out


def fetch(ctx: Context) -> list[dict]:
    root = ET.fromstring(ctx.http.get(FEED))
    out = []
    for item in root.iter("item"):
        url = item.findtext("link", default="")
        title = clean.text(item.findtext("title", default=""))
        if title.startswith("APOD") or "/image-article/" in url:
            continue
        markup = item.findtext("content:encoded", default="", namespaces=NS)
        raw = clean.blocks(markup)
        author = item.findtext("dc:creator", namespaces=NS) or None
        affiliation = None
        byline = next((b for b in raw[:4] if b["text"].startswith("Written by ")), None)
        if byline:
            raw.remove(byline)
            author, _, affiliation = byline["text"][len("Written by "):].partition(", ")
        body = clean.trim_site_chrome(raw)
        if body and body[0]["text"].startswith("Editor’s note"):
            body.pop(0)
        clean.mark_labels(body)
        if sum(len(b["text"].split()) for b in body) < MIN_WORDS:
            continue
        observatory = "earth-observatory" in url
        images = _images(markup)
        out.append({
            "id": article_id("nasa", url),
            "section": "science",
            "title": title,
            "deck": None,
            "author": author if author and author != "HQ Web Team" else None,
            "author_affiliation": affiliation or None,
            "source_name": "NASA Earth Observatory" if observatory else "NASA",
            "source_url": url,
            "published": item.findtext("pubDate"),
            "license": LICENSES["us-gov-pd"],
            "attribution": EO_ATTRIBUTION if observatory else ATTRIBUTION,
            "changes": None,
            "body": body,
            "images": images[:2] if observatory else images[:1],
        })
    return out
