import dataclasses
import hashlib

from courier.clean import word_count
from courier.config import load_config
from courier.select import select


NAMES = (["Lighthouses", "Orchards", "Glaciers", "Railways", "Beekeeping", "Telescopes", "Rivers", "Bridges",
              "Comets", "Harvests", "Lanterns", "Ferries", "Meadows", "Typewriters", "Canals", "Kites", "Quarries",
              "Weavers", "Almanacs", "Moths", "Clocktowers", "Sextants"])


def art(id, words, source="The Conversation", title=None, published="2026-10-01T10:00:00Z", text="study", **kw):
    if title is None:
        h = int(hashlib.sha1(id.encode()).hexdigest(), 16)
        title = f"{NAMES[h % len(NAMES)]}, {NAMES[(h // 97) % len(NAMES)]} and {id}"
    body = [{"kind": "p", "text": " ".join([text] * words)}]
    return {"id": id, "title": title, "deck": None, "source_name": source,
            "source_url": f"https://example.org/{id}", "published": published, "body": body, "section": None, **kw}


def pools():
    return {
        "conversation": [art("c1", 1000), art("c2", 900, text="research"), art("c3", 1100)],
        "globalvoices": [art("g1", 1200, "Global Voices", text="people"), art("g2", 2500, "Global Voices")],
        "nasa": [art("n1", 300, "NASA"), art("n2", 250, "NASA"), art("n3", 400, "NASA", images=[{"url": "x"}]),
                 art("n4", 600, "NASA", text="storm")],
        "chronicling_america": [art(f"a{i}", 120, "Old Paper") for i in range(5)],
    }


def test_edition_fits_reading_budget():
    config = load_config()
    sel = select(pools(), config, set())
    assert sel.lead and len(sel.secondaries) == 2
    assert sel.words <= config.max_words
    assert sel.sections["world"] and sel.sections["science"] and sel.sections["archives"]
    assert all(word_count(a) <= 1300 for a in sel.sections["world"])


def test_recently_used_and_avoided_stories_are_skipped():
    config = dataclasses.replace(load_config(), avoid=("massacre",))
    p = pools()
    p["conversation"].append(art("bad", 1000, title="A massacre explained"))
    sel = select(p, config, {"https://example.org/c1"})
    ids = {a["id"] for a in sel.articles()}
    assert "c1" not in ids and "bad" not in ids


def test_near_duplicate_titles_are_dropped():
    p = pools()
    p["conversation"] = [art("x1", 1000, title="NASA picks new Moon science"),
                         art("x2", 1000, title="NASA picks new moon science!")]
    sel = select(p, load_config(), set())
    ids = {a["id"] for a in sel.articles()}
    assert not {"x1", "x2"} <= ids


def test_lead_falls_back_when_a_source_is_missing():
    p = pools()
    del p["conversation"]
    sel = select(p, load_config(), set())
    assert sel.lead["source_name"] == "Global Voices"
    p = {"nasa": pools()["nasa"]}
    sel = select(p, load_config(), set())
    assert sel.lead["source_name"] == "NASA"


def test_nothing_to_print():
    assert select({}, load_config(), set()).lead is None
