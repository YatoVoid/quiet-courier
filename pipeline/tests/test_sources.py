import datetime as dt

import pytest

from courier.config import load_config
from courier.sources import Context, chronicling, conversation, globalvoices, nasa, nws, poems

from fakes import FakeHttp


@pytest.fixture
def ctx():
    config = load_config()
    return Context(FakeHttp(), config, dt.date(2026, 10, 1), config.cities["kansas-city"])


def _text(a):
    return " ".join(b["text"] for b in a["body"])


def test_conversation_keeps_text_and_credits(ctx):
    arts = conversation.fetch(ctx)
    assert len(arts) == 4
    frogs = next(a for a in arts if "frogs" in a["title"])
    assert frogs["license"]["id"] == "cc-by-nd-4.0" and not frogs["license"]["derivatives"]
    assert frogs["author"] == "Claire Therese Hemingway"
    assert "Assistant Professor" in frogs["author_affiliation"]
    assert frogs["changes"] == "Images and audio omitted. Text unedited."
    assert "MB (download)" not in _text(frogs)


def test_globalvoices_skips_partner_and_announcement_posts(ctx):
    titles = [a["title"] for a in globalvoices.fetch(ctx)]
    assert any("Ukrainian" in t for t in titles)
    assert not any("Brazil" in t for t in titles), "Dialogue Earth partner story"
    assert not any("Myanmar" in t for t in titles), "Exile Hub partner story"
    assert not any(t.startswith("Support Global Voices") for t in titles)


def test_globalvoices_drops_untypesettable_scripts_and_says_so(ctx):
    japan = next(a for a in globalvoices.fetch(ctx) if "Japanese" in a["title"])
    assert not any(ord(c) > 0x2E80 for c in _text(japan))
    assert "original-language quotations" in japan["changes"]


def test_nasa_trims_site_chrome_and_skips_apod(ctx):
    arts = nasa.fetch(ctx)
    assert not any(a["title"].startswith("APOD") for a in arts)
    curiosity = next(a for a in arts if "Curiosity" in a["title"])
    assert curiosity["author"] == "Lucy Lim"
    assert "Visit Mission Updates" not in _text(curiosity)
    crops = next(a for a in arts if "Crops" in a["title"])
    assert "PDF (" not in _text(crops)


def test_nasa_images_need_a_nasa_credit(ctx):
    for a in nasa.fetch(ctx):
        for img in a["images"]:
            assert "NASA" in img["credit"]
            assert img["url"].startswith("https://")


def test_nws_forecast(ctx):
    w = nws.fetch(ctx)
    assert len(w["periods"]) == 8
    assert w["license"]["id"] == "us-gov-pd"


def test_archives_from_ocr(ctx):
    arts = chronicling.fetch(ctx)
    assert arts, "fixture page has readable stories"
    for a in arts:
        assert a["source_name"].startswith("The Indianapolis Times")
        assert a["license"]["id"] == "pd-expired"
        assert "Oct. I." not in _text(a)
        assert all(len(b["text"].split()) >= 4 for b in a["body"])


def test_archive_quality_rejects_garbage():
    s = chronicling.Story(["HEADLINE HERE"], ["Tbe qqz xvw ot lhe [illegible] ;' rn ui " * 6], 0.5)
    assert not chronicling.acceptable(s, ())


def test_ocr_fixes():
    assert chronicling.fix_ocr("BERLIN, Oct. I.—Europe") == "BERLIN, Oct. 1.—Europe"
    assert chronicling.fix_ocr("London, Oct. 1 —(/P)— Alan") == "London, Oct. 1—(AP)—Alan"


def test_hundred_years_handles_leap_day():
    assert chronicling.hundred_years_before(dt.date(2000, 2, 29)) == dt.date(1900, 2, 28)


def test_poem_follows_season_and_avoids_repeats():
    autumn = poems.choose(dt.date(2026, 10, 1))
    assert autumn["year"] < 1931
    lib = {p["id"]: p for p in poems.library()}
    assert "autumn" in lib[autumn["id"]]["seasons"]
    again = poems.choose(dt.date(2026, 10, 1), recently_used={autumn["id"]})
    assert again["id"] != autumn["id"]
    winter = poems.choose(dt.date(2026, 12, 20))
    assert "winter" in lib[winter["id"]]["seasons"]
