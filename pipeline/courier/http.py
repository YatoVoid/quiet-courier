import hashlib
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

RETRYABLE = {429, 500, 502, 503, 504}


class FetchError(RuntimeError):
    pass


class Http:
    def __init__(self, user_agent: str, cache_dir: Path | None = None, timeout: float = 20,
                 retries: int = 3, backoff: float = 2.0):
        self.user_agent = user_agent
        self.cache_dir = cache_dir
        self.timeout = timeout
        self.retries = retries
        self.backoff = backoff

    def _cache_path(self, url: str) -> Path | None:
        if not self.cache_dir:
            return None
        return self.cache_dir / hashlib.sha1(url.encode()).hexdigest()

    def get(self, url: str, accept: str = "*/*") -> bytes:
        cached = self._cache_path(url)
        if cached and cached.exists():
            return cached.read_bytes()
        last: Exception | None = None
        for attempt in range(self.retries):
            if attempt:
                time.sleep(self.backoff * attempt)
            safe_url = urllib.parse.quote(url, safe=":/?&=%#+,;@~")
            req = urllib.request.Request(safe_url, headers={"User-Agent": self.user_agent, "Accept": accept})
            try:
                with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                    body = resp.read()
            except urllib.error.HTTPError as e:
                last = e
                if e.code in RETRYABLE:
                    continue
                raise FetchError(f"{url}: HTTP {e.code}") from e
            except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
                last = e
                continue
            # loc.gov sometimes answers a JSON request with a Cloudflare HTML challenge.
            if accept == "application/json" and not body.lstrip().startswith((b"{", b"[")):
                last = FetchError(f"{url}: expected JSON, got HTML")
                continue
            if cached:
                cached.parent.mkdir(parents=True, exist_ok=True)
                cached.write_bytes(body)
            return body
        raise FetchError(f"{url}: gave up after {self.retries} attempts ({last})")

    def json(self, url: str):
        return json.loads(self.get(url, accept="application/json"))
