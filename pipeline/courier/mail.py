import base64
import json
import os
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path

RESEND_URL = "https://api.resend.com/emails"
RETRYABLE = {429, 500, 502, 503, 504}


class MailError(RuntimeError):
    pass


@dataclass
class Message:
    to: list[str]
    subject: str
    text: str
    attachments: list[Path] = field(default_factory=list)
    attachment_names: list[str] = field(default_factory=list)
    idempotency_key: str | None = None


class Mailer:
    """Sends through Resend. Without an API key it writes each message to `outbox_dir` instead."""

    def __init__(self, api_key: str | None, sender: str, outbox_dir: Path | None = None,
                 timeout: float = 30, retries: int = 3, backoff: float = 2.0, min_interval: float = 0.25,
                 url: str = RESEND_URL):
        self.url = url
        self.api_key = api_key
        self.sender = sender
        self.outbox_dir = outbox_dir
        self.timeout = timeout
        self.retries = retries
        self.backoff = backoff
        self.min_interval = min_interval
        self._last = 0.0

    @classmethod
    def from_env(cls, outbox_dir: Path | None = None) -> "Mailer":
        return cls(os.environ.get("RESEND_API_KEY") or None,
                   os.environ.get("MAIL_FROM", "The Quiet Courier <edition@quietcourier.com>"), outbox_dir)

    def _payload(self, m: Message) -> dict:
        names = m.attachment_names or [p.name for p in m.attachments]
        return {
            "from": self.sender,
            "to": m.to,
            "subject": m.subject,
            "text": m.text,
            "attachments": [{"filename": n, "content": base64.b64encode(p.read_bytes()).decode()}
                            for p, n in zip(m.attachments, names)],
        }

    def send(self, m: Message) -> str:
        if not self.api_key:
            return self._to_outbox(m)
        wait = self.min_interval - (time.monotonic() - self._last)
        if wait > 0:
            time.sleep(wait)
        body = json.dumps(self._payload(m)).encode()
        headers = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}
        if m.idempotency_key:
            headers["Idempotency-Key"] = m.idempotency_key
        last: Exception | None = None
        for attempt in range(self.retries):
            if attempt:
                time.sleep(self.backoff * attempt)
            self._last = time.monotonic()
            req = urllib.request.Request(self.url, data=body, headers=headers, method="POST")
            try:
                with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                    return json.loads(resp.read()).get("id", "")
            except urllib.error.HTTPError as e:
                detail = e.read().decode(errors="replace")[:300]
                # Same key within 24 hours: Resend already accepted this message on an earlier try.
                if e.code == 409 and "idempotent" in detail:
                    return "duplicate-key"
                last = MailError(f"HTTP {e.code}: {detail}")
                if e.code not in RETRYABLE:
                    raise last from e
            except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
                last = e
        raise MailError(f"gave up after {self.retries} attempts: {last}")

    def _to_outbox(self, m: Message) -> str:
        if not self.outbox_dir:
            raise MailError("RESEND_API_KEY is not set and no outbox folder was given")
        self.outbox_dir.mkdir(parents=True, exist_ok=True)
        stamp = f"{time.time():.6f}"
        record = {"to": m.to, "subject": m.subject, "text": m.text, "key": m.idempotency_key,
                  "attachments": [str(p) for p in m.attachments]}
        (self.outbox_dir / f"{stamp}.json").write_text(json.dumps(record, indent=2), encoding="utf-8")
        return f"outbox-{stamp}"
