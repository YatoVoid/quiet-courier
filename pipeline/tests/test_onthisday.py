import datetime as dt

from courier.config import load_config
from courier.sources import onthisday, Context
from fakes import FakeHttp


def test_this_day_in_history_from_fixture():
    items = onthisday.fetch(Context(FakeHttp(), load_config(), dt.date(2026, 10, 7), None))
    assert len(items) == 1
    box = items[0]
    assert box["section"] == "history"
    assert box["license"]["id"] == "cc-by-sa-4.0"
    assert box["source_name"] == "Wikipedia"
    assert 3 <= len(box["stats"]) <= 5
    text = " ".join(s["note"].lower() for s in box["stats"])
    for banned in ("massacre", "assassinat", "battle", " war", "killed", "flood"):
        assert banned not in text, banned
    years = [s["label"] for s in box["stats"]]
    assert years == sorted(years, key=int)  # chronological


def test_history_empty_on_outage():
    assert onthisday.fetch(Context(FakeHttp(fail={"onthisday"}), load_config(), dt.date(2026, 10, 7), None)) == []
