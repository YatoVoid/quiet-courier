import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest

from courier.mail import Mailer, MailError, Message


class FakeResend:
    def __init__(self, responses):
        self.responses = list(responses)
        self.requests = []
        outer = self

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                outer.requests.append({"headers": dict(self.headers), "body": body})
                code, payload = outer.responses.pop(0)
                data = json.dumps(payload).encode()
                self.send_response(code)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def log_message(self, *a):
                pass

        self.server = HTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.url = f"http://127.0.0.1:{self.server.server_port}/emails"

    def mailer(self):
        return Mailer("re_test", "Courier <edition@example.com>", url=self.url, backoff=0, min_interval=0)


@pytest.fixture
def pdf(tmp_path):
    p = tmp_path / "e.pdf"
    p.write_bytes(b"%PDF-1.7 test")
    return p


def test_sends_attachment_and_idempotency_key(pdf):
    fake = FakeResend([(200, {"id": "abc"})])
    msg = Message(["a@kindle.com"], "Paper", "hi", [pdf], ["The Quiet Courier 2026-10-01.pdf"], "edition/u/2026-10-01")
    assert fake.mailer().send(msg) == "abc"
    req = fake.requests[0]
    assert req["headers"]["Idempotency-Key"] == "edition/u/2026-10-01"
    assert req["headers"]["Authorization"] == "Bearer re_test"
    assert req["body"]["attachments"][0]["filename"] == "The Quiet Courier 2026-10-01.pdf"


def test_retries_server_errors_with_the_same_key(pdf):
    fake = FakeResend([(503, {}), (500, {}), (200, {"id": "ok"})])
    assert fake.mailer().send(Message(["a@x.com"], "s", "t", [pdf], idempotency_key="k")) == "ok"
    assert {r["headers"]["Idempotency-Key"] for r in fake.requests} == {"k"} and len(fake.requests) == 3


def test_a_reused_key_counts_as_already_sent():
    fake = FakeResend([(409, {"name": "invalid_idempotent_request"})])
    assert fake.mailer().send(Message(["a@x.com"], "s", "t", idempotency_key="k")) == "duplicate-key"


def test_rejected_request_fails_without_retrying():
    fake = FakeResend([(422, {"message": "invalid to"})])
    with pytest.raises(MailError, match="422"):
        fake.mailer().send(Message(["bad"], "s", "t"))
    assert len(fake.requests) == 1


def test_without_a_key_mail_goes_to_the_outbox_folder(tmp_path, pdf):
    m = Mailer(None, "c <e@x.com>", outbox_dir=tmp_path / "outbox")
    m.send(Message(["a@x.com"], "s", "t", [pdf]))
    [saved] = list((tmp_path / "outbox").iterdir())
    assert json.loads(saved.read_text())["to"] == ["a@x.com"]
    with pytest.raises(MailError):
        Mailer(None, "c <e@x.com>").send(Message(["a@x.com"], "s", "t"))
