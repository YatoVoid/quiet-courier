import datetime as dt

from courier.config import load_config
from courier.sources import economy, Context
from fakes import FakeHttp


def test_economy_brief_from_bls_fixture():
    items = economy.fetch(Context(FakeHttp(), load_config(), dt.date(2026, 10, 7), None))
    assert len(items) == 1
    brief = items[0]
    assert brief["section"] == "economy"
    assert brief["license"]["id"] == "us-gov-pd"
    assert brief["source_name"] == "U.S. Bureau of Labor Statistics"
    labels = [s["label"] for s in brief["stats"]]
    assert "Unemployment" in labels and "Inflation" in labels
    assert len(brief["stats"]) >= 4
    for s in brief["stats"]:
        assert s["value"] and s["note"]
    assert any(b["kind"] == "p" for b in brief["body"])


def test_economy_empty_on_outage():
    assert economy.fetch(Context(FakeHttp(fail={"economy"}), load_config(), dt.date(2026, 10, 7), None)) == []
