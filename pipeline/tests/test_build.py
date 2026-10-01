import dataclasses
import datetime as dt
import json
import sqlite3

import pytest

from courier.build import BuildError, build
from courier.config import load_config
from courier.models import load_edition
from courier.store import Store
from fakes import FakeHttp

DATE = dt.date(2026, 10, 1)


@pytest.fixture
def store(tmp_path):
    s = Store(tmp_path / "courier.db")
    yield s
    s.close()


def test_builds_and_stores_an_edition(tmp_path, store):
    config = load_config()
    r = build(config, "kansas-city", DATE, tmp_path, store, http=FakeHttp(), render=False)
    edition = load_edition(r.json_path)
    assert edition.paper_name == "The Quiet Courier"
    assert edition.weather and edition.lead
    assert r.words <= config.max_words
    assert all(run.ok for run in r.runs)

    db = sqlite3.connect(tmp_path / "courier.db")
    (count,) = db.execute("SELECT count(*) FROM edition_items WHERE edition_id = ?", (r.edition_id,)).fetchone()
    assert count == len(edition.articles) + 2
    licenses = {row[0] for row in db.execute("SELECT DISTINCT license_id FROM edition_items")}
    assert licenses <= {"cc-by-nd-4.0", "cc-by-3.0", "us-gov-pd", "pd-expired"}


def test_downloaded_images_are_local_files(tmp_path, store):
    r = build(load_config(), "kansas-city", DATE, tmp_path, store, http=FakeHttp(), render=False)
    data = json.loads(r.json_path.read_text())
    for a in data["articles"]:
        for img in a.get("images", []):
            assert "url" not in img
            assert (r.json_path.parent / img["path"]).exists()


def test_survives_source_outages(tmp_path, store):
    http = FakeHttp(fail={"conversation", "nws", "chronicling_america"})
    r = build(load_config(), "kansas-city", DATE, tmp_path, store, http=http, render=False)
    edition = load_edition(r.json_path)
    assert edition.lead.source_name == "Global Voices"
    assert edition.weather is None
    failed = {run.source for run in r.runs if not run.ok}
    assert failed == {"conversation", "nws", "chronicling_america"}


def test_fails_loudly_with_nothing_to_print(tmp_path, store):
    http = FakeHttp(fail={"conversation", "globalvoices", "nasa", "chronicling_america", "nws"})
    with pytest.raises(BuildError, match="no usable articles"):
        build(load_config(), "kansas-city", DATE, tmp_path, store, http=http, render=False)


def test_disabled_source_is_not_fetched(tmp_path, store):
    config = load_config()
    config = dataclasses.replace(config, sources={**config.sources, "conversation": False})
    http = FakeHttp()
    build(config, "kansas-city", DATE, tmp_path, store, http=http, render=False)
    assert not any("theconversation.com" in u for u in http.requests)


def test_next_day_does_not_repeat_articles(tmp_path, store):
    config = load_config()
    first = build(config, "kansas-city", DATE, tmp_path, store, http=FakeHttp(), render=False)
    second = build(config, "kansas-city", DATE + dt.timedelta(days=1), tmp_path, store, http=FakeHttp(), render=False)
    urls = lambda r: {a["source_url"] for a in json.loads(r.json_path.read_text())["articles"]}
    assert not (urls(first) & urls(second))


def test_rendered_edition(tmp_path, store):
    r = build(load_config(), "denver", DATE, tmp_path, store, http=FakeHttp(), render=True)
    assert {p.suffix for p in r.files} == {".pdf", ".epub"}
    assert all(p.stat().st_size > 10_000 for p in r.files)
