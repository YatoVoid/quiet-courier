import datetime as dt

import pytest

from courier.config import City, load_config
from courier.models import Location
from courier.sources import Context, chronicling, conversation, globalvoices, metno, nasa, nws, poems

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


def test_archives_use_the_index_without_searching(ctx, archive_index):
    chronicling.update_index(ctx.http, [dt.date(1926, 10, 1)], pause=0)
    ctx.http.requests.clear()
    arts = chronicling.fetch(ctx)
    assert arts and arts[0]["source_name"].startswith("The Indianapolis Times")
    assert not any("www.loc.gov" in u for u in ctx.http.requests)
    assert ("https://tile.loc.gov/storage-services/service/ndnp/in/batch_in_ellis_ver01/data/sn82015313/"
            "00383348948/1926100101/0247.xml") in ctx.http.requests


def test_index_update_skips_known_days_and_keeps_empty_ones_open(ctx, archive_index):
    days = [dt.date(1926, 10, 1), dt.date(1926, 10, 2)]
    assert chronicling.update_index(ctx.http, days, pause=0) == 1
    assert chronicling.update_index(ctx.http, days, pause=0) == 0
    assert set(chronicling._index()) == {"1926-10-01"}


def test_index_update_carries_on_past_a_failed_day(archive_index):
    http = FakeHttp(fail={"chronicling_america"})
    assert chronicling.update_index(http, [dt.date(1926, 10, 1)], pause=0) == 0
    assert chronicling.update_index(FakeHttp(), [dt.date(1926, 10, 1)], pause=0) == 1


def test_index_update_stops_when_loc_keeps_failing(archive_index):
    http = FakeHttp(fail={"chronicling_america"})
    days = [dt.date(1926, 10, 1) + dt.timedelta(n) for n in range(20)]
    chronicling.update_index(http, days, pause=0)
    assert len(http.requests) == 5


def test_archives_search_when_the_index_lacks_the_day(ctx):
    assert chronicling.fetch(ctx)
    assert any("collections/chronicling-america" in u for u in ctx.http.requests)


def test_capitals_byline_is_not_a_headline():
    alto = b"""<alto xmlns="http://www.loc.gov/standards/alto/ns-v3#"><Layout><Page><PrintSpace>
<TextBlock HPOS="0" WIDTH="1000">
<TextLine HPOS="0" WIDTH="1000"><String CONTENT="By"/><String CONTENT="BRIAN"/><String CONTENT="BELL."/></TextLine>
<TextLine HPOS="0" WIDTH="1000"><String CONTENT="The"/><String CONTENT="president"/><String CONTENT="spoke."/></TextLine>
</TextBlock></PrintSpace></Page></Layout></alto>"""
    (story,) = chronicling.stories(alto)
    assert story.headline == []


def test_archive_quality_rejects_garbage():
    s = chronicling.Story(["HEADLINE HERE"], ["Tbe qqz xvw ot lhe [illegible] ;' rn ui " * 6], 0.5)
    assert not chronicling.acceptable(s, ())


def _story(head, text):
    return chronicling.Story([head], [text], 1.0)


def test_archive_skips_legal_notices():
    notice = ("Order to show cause why mortgage should not be foreclosed. Upon reading and filing the "
              "petition of the plaintiff it is ordered that the defendant appear before this court on the "
              "first day of November and show cause why the prayer of the petition should not be granted.")
    assert not chronicling.acceptable(_story("ORDER TO SHOW CAUSE", notice), ())
    weak = ("The plaintiff asked the court to set aside the mortgage on the farm land near the river, "
            "and the judge agreed to hear the matter next week after the harvest was in and the roads "
            "were open again for travel from the county seat to the town.")
    assert not chronicling.acceptable(_story("FARM CASE HEARD", weak), ())


def test_archive_keeps_news_that_mentions_a_court():
    news = ("The new bridge over the river was opened to traffic yesterday afternoon with a parade of "
            "automobiles and a band concert. The mayor said the defendant in the old contract suit had "
            "finished the work a month ahead of time, and the city council will meet tonight to thank "
            "the builders and plan a dinner for the workmen.")
    assert chronicling.acceptable(_story("NEW BRIDGE OPENED", news), ())


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


def test_metno_symbols_read_as_plain_english():
    assert metno.describe("clearsky_day") == "Sunny"
    assert metno.describe("clearsky_night") == "Clear"
    assert metno.describe("lightrainshowers_day") == "Light rain showers"
    assert metno.describe("heavysnowandthunder") == "Heavy snow and thunderstorms"
    assert metno.describe("lightssleetshowersandthunder_night") == "Light sleet showers and thunderstorms"
    assert metno.describe("rain") == "Rain"


def test_metno_forecast_for_lyon():
    config = load_config()
    lyon = City("gn-2996944", Location("Lyon", "France", 45.74846, 4.84671, "Europe/Paris", "FR"))
    http = FakeHttp()
    w = metno.fetch(Context(http, config, dt.date(2026, 10, 2), lyon))
    assert "lat=45.7484&lon=4.8467" in http.requests[0]
    assert w["license"]["id"] == "cc-by-4.0"
    names = [p["name"] for p in w["periods"]]
    assert names[:4] == ["Today", "Tonight", "Saturday", "Saturday Night"] and len(names) == 8
    today = w["periods"][0]
    assert today["unit"] == "C" and today["is_daytime"]
    assert today["detail"].startswith(today["short"] + ".")
    assert f"High near {today['temperature']}°C." in today["detail"]


def test_metno_uses_fahrenheit_in_the_us():
    config = load_config()
    w = metno.fetch(Context(FakeHttp(), config, dt.date(2026, 10, 2), config.cities["denver"]))
    assert all(p["unit"] == "F" for p in w["periods"])
