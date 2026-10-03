import datetime as dt
import gzip
import json
from collections import namedtuple

from courier import watchdog
from courier.store import Store

TODAY = dt.date(2026, 10, 4)
Usage = namedtuple("Usage", "total used free")


class Mailbox:
    def __init__(self):
        self.sent = []

    def send(self, m):
        self.sent.append(m)
        return "id"


def _store(tmp_path, poems=40):
    store = Store(tmp_path / "c.db")
    for n in range(poems):
        store.wikisource_mark(f"Book/P{n}", {"id": f"ws-{n}", "title": f"P{n}"}, None)
    return store


def _healthy(monkeypatch):
    monkeypatch.setattr(watchdog, "archive_index_ends", lambda: dt.date(2027, 12, 31))
    monkeypatch.setattr(watchdog.shutil, "disk_usage", lambda p: Usage(100, 20, 74 * 1024**3))


def test_quiet_when_stocks_are_healthy(tmp_path, monkeypatch):
    _healthy(monkeypatch)
    mail = Mailbox()
    assert watchdog.check(_store(tmp_path), TODAY, tmp_path) == []
    assert watchdog.report([], mail, ["owner@example.com"]) is False and mail.sent == []


def test_warns_about_the_archive_index_poems_and_disk(tmp_path, monkeypatch):
    monkeypatch.setattr(watchdog, "archive_index_ends", lambda: TODAY + dt.timedelta(days=60))
    monkeypatch.setattr(watchdog.shutil, "disk_usage", lambda p: Usage(100, 99, 2 * 1024**3))
    warnings = watchdog.check(_store(tmp_path, poems=5), TODAY, tmp_path)
    assert len(warnings) == 3
    assert "60 days away" in warnings[0] and "courier archive-index" in warnings[0]
    assert warnings[1].startswith("Only 14 poems")
    assert "2.0 GB" in warnings[2]

    mail = Mailbox()
    assert watchdog.report(warnings, mail, ["owner@example.com"]) is True
    [m] = mail.sent
    assert m.subject == "The Quiet Courier: weekly check" and "60 days away" in m.text


def test_index_end_is_a_hundred_years_after_its_last_1920s_day(tmp_path):
    from courier.sources import chronicling
    assert watchdog.archive_index_ends() is None
    chronicling.INDEX.write_bytes(gzip.compress(json.dumps({"1927-12-30": [], "1927-12-31": []}).encode()))
    chronicling._index.cache_clear()
    assert watchdog.archive_index_ends() == dt.date(2027, 12, 31)
