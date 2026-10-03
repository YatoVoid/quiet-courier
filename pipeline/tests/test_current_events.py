import datetime as dt
import json
import urllib.parse

from courier.sources import current_events as ce

PAGE = """
<div class="current-events-content description">
<p><b>Armed conflicts and attacks</b></p>
<ul><li><a href="/wiki/A">Sudanese civil war</a>
<ul><li>The army says it recaptured the town of al-Mazroub after two days of fighting. <a class="external text" href="https://x">(Al Jazeera)</a></li></ul></li></ul>
<p><b>Politics and elections</b></p>
<ul><li><a href="/wiki/B">2026 Swiss Federal Council election</a>
<ul><li>Swiss president Guy Parmelin announces his resignation from the Federal Council. <a class="external text" href="https://y">(AFP)</a> <a class="external text" href="https://z">(Swissinfo)</a></li>
<li>Parliament will elect a successor to the Federal Council on 9 December this year. <a class="external text" href="https://y">(AFP)</a></li></ul></li>
<li>Spain's parliament rejects two government housing decrees on evictions and rents. <a class="external text" href="https://w">(AP)</a></li>
<li>A man was killed when a minister's convoy crashed on a highway in the capital. <a class="external text" href="https://v">(BBC)</a></li></ul>
</div>
"""


def test_parse_reads_headings_topics_text_and_outlets():
    items = ce.parse(PAGE)
    assert items[0] == {"heading": "Armed conflicts and attacks", "topic": "Sudanese civil war",
                        "text": "The army says it recaptured the town of al-Mazroub after two days of fighting.",
                        "outlets": ["Al Jazeera"]}
    swiss = items[1]
    assert swiss["topic"] == "2026 Swiss Federal Council election" and swiss["outlets"] == ["AFP", "Swissinfo"]
    assert items[3]["topic"] is None and items[3]["text"].startswith("Spain's parliament")


def test_select_puts_calm_news_first_skips_avoided_words_and_repeats_a_topic_once():
    picked = ce.select(ce.parse(PAGE), avoid=("killed",), limit=10)
    assert [i["heading"] for i in picked] == ["Politics and elections"] * 2 + ["Armed conflicts and attacks"]
    assert not any("killed" in i["text"] for i in picked)
    assert sum(i["topic"] == "2026 Swiss Federal Council election" for i in picked) == 1


def test_brief_is_from_a_finished_day():
    assert ce.brief_day(dt.datetime(2026, 10, 3, 9, 0, tzinfo=dt.UTC)) == dt.date(2026, 10, 2)
    # Early in the UTC day the previous day might still be edited, so go back one more.
    assert ce.brief_day(dt.datetime(2026, 10, 3, 1, 0, tzinfo=dt.UTC)) == dt.date(2026, 10, 1)
    assert ce.page_title(dt.date(2026, 10, 2)) == "Portal:Current_events/2026_October_2"


class FakeWiki:
    def __init__(self):
        self.urls = []

    def get(self, url, accept="*/*"):
        self.urls.append(url)
        q = dict(urllib.parse.parse_qsl(urllib.parse.urlsplit(url).query))
        if q["action"] == "query":
            return json.dumps({"query": {"pages": [{"revisions": [{"revid": 42, "timestamp": "x"}]}]}}).encode()
        assert q["oldid"] == "42"
        return json.dumps({"parse": {"text": PAGE}}).encode()


def test_fetch_uses_a_revision_at_least_three_hours_old_and_credits_it():
    http = FakeWiki()
    brief = ce.fetch(http, dt.datetime(2026, 10, 3, 9, 30, tzinfo=dt.UTC), avoid=(), limit=3)
    first = dict(urllib.parse.parse_qsl(urllib.parse.urlsplit(http.urls[0]).query))
    assert first["rvstart"] == "2026-10-03T06:00:00Z" and first["rvdir"] == "older"
    assert brief["day"] == "2026-10-02" and len(brief["items"]) == 3
    assert brief["source_url"].endswith("oldid=42") and brief["license"]["name"] == "CC BY-SA 4.0"
    assert brief["changes"] == "Selected items; links removed."


def test_no_revision_means_no_brief():
    class Empty(FakeWiki):
        def get(self, url, accept="*/*"):
            return json.dumps({"query": {"pages": [{"missing": True}]}}).encode()

    assert ce.fetch(Empty(), dt.datetime(2026, 10, 3, 9, tzinfo=dt.UTC), avoid=()) is None
