import xml.etree.ElementTree as ET

from .. import clean
from . import LICENSES, Context, article_id

FEED = "https://theconversation.com/us/articles.atom"
NS = {"a": "http://www.w3.org/2005/Atom"}
ATTRIBUTION = ("This article is republished from The Conversation under a Creative Commons license. "
               "Read the original article at theconversation.com.")


def fetch(ctx: Context) -> list[dict]:
    root = ET.fromstring(ctx.http.get(FEED))
    out = []
    for e in root.findall("a:entry", NS):
        rights = (e.findtext("a:rights", default="", namespaces=NS) or "").lower()
        # Each entry states its own license; skip anything that is not the usual CC BY-ND.
        if "creative commons" not in rights or "no derivatives" not in rights:
            continue
        markup = e.findtext("a:content", default="", namespaces=NS)
        body = clean.blocks(markup)
        if not body:
            continue
        name, _, affiliation = (e.findtext("a:author/a:name", default="", namespaces=NS) or "").partition(", ")
        url = e.find("a:link", NS).get("href")
        out.append({
            "id": article_id("conv", url),
            "section": None,
            "title": clean.text(e.findtext("a:title", default="", namespaces=NS)),
            "deck": clean.text(e.findtext("a:summary", default="", namespaces=NS)) or None,
            "author": name.strip() or None,
            "author_affiliation": affiliation.strip() or None,
            "source_name": "The Conversation",
            "source_url": url,
            "published": e.findtext("a:published", namespaces=NS),
            "license": LICENSES["cc-by-nd-4.0"],
            "attribution": ATTRIBUTION,
            "changes": clean.changes_note(clean.omitted_media(markup)),
            "body": body,
        })
    return out
