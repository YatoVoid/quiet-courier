"""Each source module exposes `fetch(ctx) -> list[dict]`.

Every dict uses the article schema of the edition JSON (see samples/*.json):
id, section, title, deck, author, author_affiliation, source_name, source_url,
published, license, attribution, changes, body, and optionally images, where
each image has `url` instead of `path` until the build downloads it.
"""

import datetime as dt
import hashlib
from dataclasses import dataclass

from ..config import City, Config
from ..http import Http

LICENSES = {
    "cc-by-nd-4.0": {"id": "cc-by-nd-4.0", "name": "CC BY-ND 4.0",
                     "url": "https://creativecommons.org/licenses/by-nd/4.0/", "commercial": True, "derivatives": False},
    "cc-by-3.0": {"id": "cc-by-3.0", "name": "CC BY 3.0",
                  "url": "https://creativecommons.org/licenses/by/3.0/", "commercial": True, "derivatives": True},
    "us-gov-pd": {"id": "us-gov-pd", "name": "Public domain (U.S. government work)",
                  "url": "https://www.usa.gov/government-copyright", "commercial": True, "derivatives": True},
    "pd-expired": {"id": "pd-expired", "name": "Public domain (published before 1931)",
                   "url": "https://www.copyright.gov/help/faq/faq-duration.html", "commercial": True, "derivatives": True},
}


@dataclass(frozen=True)
class Context:
    http: Http
    config: Config
    date: dt.date
    city: City | None = None


def article_id(prefix: str, url: str) -> str:
    return f"{prefix}-{hashlib.sha1(url.encode()).hexdigest()[:10]}"
