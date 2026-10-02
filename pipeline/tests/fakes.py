import io
import json
from pathlib import Path

from PIL import Image

from courier.http import FetchError
from courier.sources import conversation, globalvoices, nasa

FIXTURES = Path(__file__).resolve().parent / "fixtures"


def tiny_jpeg() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (40, 30), "gray").save(buf, "JPEG")
    return buf.getvalue()


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
        if "api.weather.gov/points" in url:
            return "nws", (FIXTURES / "nws-points.json").read_bytes()
        if "api.met.no/weatherapi/locationforecast" in url:
            return "metno", (FIXTURES / "metno-lyon.json").read_bytes()
        if "api.weather.gov/gridpoints" in url:
            return "nws", (FIXTURES / "nws-forecast.json").read_bytes()
        if "collections/chronicling-america" in url:
            return "chronicling_america", (FIXTURES / "loc-search.json").read_bytes()
        if "loc.gov/item/" in url:
            return "chronicling_america", (FIXTURES / "loc-item.json").read_bytes()
        if url.endswith(".xml") and "tile.loc.gov" in url:
            return "chronicling_america", (FIXTURES / "alto-indianapolis-times-1926-10-01.xml").read_bytes()
        if "nasa.gov" in url:
            return "images", tiny_jpeg()
        raise FetchError(f"no fixture for {url}")

    def get(self, url: str, accept: str = "*/*") -> bytes:
        self.requests.append(url)
        source, body = self._route(url)
        if source in self.fail:
            raise FetchError(f"{url}: simulated outage")
        return body

    def json(self, url: str):
        return json.loads(self.get(url, accept="application/json"))
