import io
import json
from pathlib import Path

from PIL import Image

from courier.http import FetchError
from courier.sources import conversation, economy, eso, globalvoices, nasa

FIXTURES = Path(__file__).resolve().parent / "fixtures"


def tiny_jpeg() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (40, 30), "gray").save(buf, "JPEG")
    return buf.getvalue()


def gutenberg_text(title: str, author: str, chapter_words: list[int], extra: str = "") -> str:
    """A small book laid out the way Project Gutenberg's plain-text files are."""
    sentence = "The fog lay thick upon the moor and nobody spoke of the hound that night. "
    contents = "\n".join(f"Chapter {n}  The Part Numbered {n}" for n in range(1, len(chapter_words) + 1))
    chapters = []
    for n, words in enumerate(chapter_words, start=1):
        paras, left = [], words
        while left > 0:
            take = min(left, 60)
            paras.append((sentence * 5).split()[:take])
            left -= take
        body = "\n\n".join("\n".join(" ".join(p[i:i + 10]) for i in range(0, len(p), 10)) for p in paras)
        chapters.append(f"Chapter {n}.\nThe Part Numbered {n}\n\n\n{body}")
    return (f"The Project Gutenberg eBook of {title}\n\nTitle: {title}\n\nAuthor: {author}\n\n"
            f"*** START OF THE PROJECT GUTENBERG EBOOK {title.upper()} ***\n\n\n{title.upper()}\n\n"
            f"Contents\n\n{contents}\n\n\n" + "\n\n\n\n".join(chapters) + extra +
            f"\n\n\nTHE END\n\n*** END OF THE PROJECT GUTENBERG EBOOK {title.upper()} ***\n\nFull license text.\n")


BOOKS = {2852: gutenberg_text("The Hound of the Baskervilles", "Arthur Conan Doyle", [900, 2500, 300, 300, 1200, 800])}


class FakeHttp:
    def __init__(self, fail: set[str] = frozenset()):
        self.fail = set(fail)
        self.requests: list[str] = []

    def _route(self, url: str) -> bytes:
        if url == conversation.FEED:
            return "conversation", (FIXTURES / "conversation.atom").read_bytes()
        if url == globalvoices.FEED:
            return "globalvoices", (FIXTURES / "globalvoices.xml").read_bytes()
        if url == nasa.FEED:
            return "nasa", (FIXTURES / "nasa.xml").read_bytes()
        if url == eso.FEED:
            return "eso", (FIXTURES / "eso.xml").read_bytes()
        if url == economy.API:
            return "economy", (FIXTURES / "bls.json").read_bytes()
        if "eso.org/public/news/" in url:
            return "eso", (FIXTURES / "eso-article.html").read_bytes()
        if "api.weather.gov/points" in url:
            return "nws", (FIXTURES / "nws-points.json").read_bytes()
        if "api.met.no/weatherapi/locationforecast" in url:
            return "metno", (FIXTURES / "metno-lyon.json").read_bytes()
        if "api.weather.gov/gridpoints" in url:
            return "nws", (FIXTURES / "nws-forecast.json").read_bytes()
        if "collections/chronicling-america" in url:
            return "chronicling_america", (FIXTURES / "loc-search.json").read_bytes()
        if url.endswith(".xml") and "tile.loc.gov" in url:
            return "chronicling_america", (FIXTURES / "alto-indianapolis-times-1926-10-01.xml").read_bytes()
        if "en.wikipedia.org/w/api.php" in url:
            if "action=query" in url:
                return "current_events", json.dumps(
                    {"query": {"pages": [{"revisions": [{"revid": 1378213351, "timestamp": "2026-10-03T05:00:00Z"}]}]}}).encode()
            page = (FIXTURES / "wikipedia-current-events-2026-10-02.html").read_text(encoding="utf-8")
            return "current_events", json.dumps({"parse": {"text": page}}).encode()
        if "gutenberg.org/cache/epub/" in url:
            book = BOOKS.get(int(url.split("/cache/epub/")[1].split("/")[0]))
            if book is None:
                raise FetchError(f"no fixture for {url}")
            return "gutenberg", book.encode()
        if "nasa.gov" in url:
            return "images", tiny_jpeg()
        raise FetchError(f"no fixture for {url}")

    def get(self, url: str, accept: str = "*/*") -> bytes:
        self.requests.append(url)
        source, body = self._route(url)
        if source in self.fail:
            raise FetchError(f"{url}: simulated outage")
        return body

    def post(self, url: str, body: bytes, content_type: str = "application/json") -> bytes:
        self.requests.append(url)
        source, data = self._route(url)
        if source in self.fail:
            raise FetchError(f"{url}: simulated outage")
        return data

    def json(self, url: str):
        return json.loads(self.get(url, accept="application/json"))
