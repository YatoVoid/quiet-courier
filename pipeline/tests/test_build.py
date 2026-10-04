import dataclasses
import datetime as dt
import json
import sqlite3

import pytest

from courier.build import BuildError, build
from courier.config import GENERAL, City, load_config
from courier.models import Location, load_edition
from courier.store import Store
from fakes import FakeHttp

DATE = dt.date(2026, 10, 1)


def at(city_id):
    config = load_config()
    return config, config.cities[city_id]


@pytest.fixture
def store(tmp_path):
    s = Store(tmp_path / "courier.db")
    yield s
    s.close()


def test_builds_and_stores_an_edition(tmp_path, store):
    config = load_config()
    r = build(config, config.cities["kansas-city"], DATE, tmp_path, store, http=FakeHttp(), render=False)
    edition = load_edition(r.json_path)
    assert edition.paper_name == "The Quiet Courier"
    assert edition.weather and edition.lead
    assert edition.brief and len(edition.brief.items) == 10 and edition.brief.source_url.endswith("oldid=1378213351")
    assert r.words <= config.max_words
    assert all(run.ok for run in r.runs)

    db = sqlite3.connect(tmp_path / "courier.db")
    (count,) = db.execute("SELECT count(*) FROM edition_items WHERE edition_id = ?", (r.edition_id,)).fetchone()
    assert count == len(edition.articles) + 3
    assert edition.serial and edition.serial.number == 1 and edition.serial.title == "The Hound of the Baskervilles"
    (serial_row,) = db.execute("SELECT title, word_count FROM edition_items WHERE kind = 'serial'").fetchall()
    assert serial_row[0] == "The Hound of the Baskervilles, instalment 1" and serial_row[1] == 900
    licenses = {row[0] for row in db.execute("SELECT DISTINCT license_id FROM edition_items")}
    assert licenses <= {"cc-by-nd-4.0", "cc-by-3.0", "us-gov-pd", "pd-expired"}


def test_downloaded_images_are_local_files(tmp_path, store):
    r = build(*at("kansas-city"), DATE, tmp_path, store, http=FakeHttp(), render=False)
    data = json.loads(r.json_path.read_text())
    for a in data["articles"]:
        for img in a.get("images", []):
            assert "url" not in img
            assert (r.json_path.parent / img["path"]).exists()


def test_survives_source_outages(tmp_path, store):
    http = FakeHttp(fail={"conversation", "nws", "metno", "chronicling_america", "current_events"})
    r = build(*at("kansas-city"), DATE, tmp_path, store, http=http, render=False)
    edition = load_edition(r.json_path)
    assert edition.lead.source_name == "Global Voices"
    assert edition.weather is None and edition.brief is None
    failed = {run.source for run in r.runs if not run.ok}
    assert failed == {"conversation", "weather", "chronicling_america", "current_events"}


def test_us_weather_falls_back_to_met_norway(tmp_path, store):
    r = build(*at("kansas-city"), DATE, tmp_path, store, http=FakeHttp(fail={"nws"}), render=False)
    edition = load_edition(r.json_path)
    assert edition.weather.office == "Norwegian Meteorological Institute"
    assert edition.weather.periods[0].unit == "F"


def test_place_outside_the_us_uses_met_norway(tmp_path, store):
    lyon = City("gn-2996944", Location("Lyon", "France", 45.7485, 4.8467, "Europe/Paris", "FR"))
    http = FakeHttp()
    r = build(load_config(), lyon, dt.date(2026, 10, 2), tmp_path, store, http=http, render=False)
    edition = load_edition(r.json_path)
    assert not any("weather.gov" in u for u in http.requests)
    assert edition.weather.city == "Lyon, France"
    assert edition.weather.license_name == "CC BY 4.0"
    assert edition.weather.periods[0].name == "Today" and edition.weather.periods[0].unit == "C"
    assert r.edition_id == "2026-10-02/gn-2996944"


def test_general_edition_has_no_local_weather(tmp_path, store):
    http = FakeHttp()
    r = build(load_config(), GENERAL, DATE, tmp_path, store, http=http, render=True)
    edition = load_edition(r.json_path)
    assert edition.location is None and edition.weather is None
    assert not any("weather.gov" in u or "api.met.no" in u for u in http.requests)
    assert {p.name for p in r.files} == {"general_small.pdf", "general_large.pdf", "general.epub"}


def test_fails_loudly_with_nothing_to_print(tmp_path, store):
    http = FakeHttp(fail={"conversation", "globalvoices", "nasa", "chronicling_america", "nws"})
    with pytest.raises(BuildError, match="no usable articles"):
        build(*at("kansas-city"), DATE, tmp_path, store, http=http, render=False)


def test_disabled_source_is_not_fetched(tmp_path, store):
    config = load_config()
    config = dataclasses.replace(config, sources={**config.sources, "conversation": False})
    http = FakeHttp()
    build(config, config.cities["kansas-city"], DATE, tmp_path, store, http=http, render=False)
    assert not any("theconversation.com" in u for u in http.requests)


def test_next_day_does_not_repeat_articles(tmp_path, store):
    config = load_config()
    first = build(config, config.cities["kansas-city"], DATE, tmp_path, store, http=FakeHttp(), render=False)
    second = build(config, config.cities["kansas-city"], DATE + dt.timedelta(days=1), tmp_path, store, http=FakeHttp(), render=False)
    urls = lambda r: {a["source_url"] for a in json.loads(r.json_path.read_text())["articles"]}
    assert not (urls(first) & urls(second))


def test_rendered_edition(tmp_path, store):
    r = build(*at("denver"), DATE, tmp_path, store, http=FakeHttp(), render=True)
    assert {p.suffix for p in r.files} == {".pdf", ".epub"}
    assert all(p.stat().st_size > 10_000 for p in r.files)


def test_every_place_on_a_date_gets_the_same_stories(tmp_path, store):
    config = load_config()
    http = FakeHttp()
    chicago = build(config, config.cities["chicago"], DATE, tmp_path, store, http=http, render=False)
    general = build(config, GENERAL, DATE, tmp_path, store, http=http, render=False)
    ids = lambda r: [a["id"] for a in json.loads(r.json_path.read_text())["articles"]]
    assert ids(chicago) == ids(general)
    assert sum("theconversation.com" in u and u.endswith(".atom") for u in http.requests) == 1
    conversation = [a for a in json.loads(chicago.json_path.read_text())["articles"] if a["source_name"] == "The Conversation"]
    assert len(conversation) <= 3


def test_renders_only_the_formats_asked_for(tmp_path, store):
    r = build(*at("denver"), DATE, tmp_path, store, http=FakeHttp(), devices=["small"], epub=False)
    assert [p.name for p in r.files] == ["denver_small.pdf"]
