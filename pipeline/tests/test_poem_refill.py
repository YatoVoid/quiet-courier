import datetime as dt
import json
import urllib.parse

from courier import poem_refill as pr
from courier.sources import poems
from courier.store import Store

STANZA = ("The woods are lovely, dark and deep, and every quiet morning brings the river light",
          "Across the meadow where the willows keep their silver branches bending through the night")
LINES = [f"{a} {n}" for n in range(3) for a in STANZA]

POEM_DIV = ('<div id="ws-data"><span id="ws-author">Robert Frost</span><span id="ws-year">1913</span></div>'
            '<div class="poem"><p>' + "<br />\n".join(LINES[:3]) + "</p><p>" + "<br />\n".join(LINES[3:]) + "</p></div>")
WS_POEM = ('<div class="ws-poem"><div class="ws-poem-stanza">'
           + "".join(f'<span class="ws-poem-line"><span class="ws-poem-indent">&#8195;</span>{ln}'
                     f'<span class="ws-poem-break"><br /></span></span>' for ln in LINES[:3])
           + '</div><div class="ws-poem-stanza">'
           + "".join(f'<span class="ws-poem-line">{ln}<br /></span>' for ln in LINES[3:]) + "</div></div>")
CENTERED = ('<span class="pagenum ws-pagenum">12</span><div class="wst-block-center"><p>'
            + "<br />\n".join(LINES[:3]) + "<br />\n<br />\n" + "<br />\n".join(LINES[3:]) + "</p></div>")


def test_extract_reads_all_three_wikisource_layouts():
    for html in (POEM_DIV, WS_POEM, CENTERED):
        found = pr.extract(html)
        assert found["stanzas"] == [LINES[:3], LINES[3:]], html[:30]
    assert pr.extract(POEM_DIV)["author"] == "Robert Frost" and pr.extract(POEM_DIV)["year"] == "1913"
    assert pr.extract("<p>Just a preface in prose.</p>") is None


def test_tidy_strips_title_quotes_and_the_capitalised_opening_word():
    title, stanzas = pr.tidy('"A Little While"', [["HE ate and drank the precious words,"]])
    assert title == "A Little While" and stanzas[0][0] == "He ate and drank the precious words,"
    assert pr.tidy("X", [["I wandered lonely"]])[1][0][0] == "I wandered lonely"


def _poem(**over):
    p = {"id": "ws-x", "title": "Woods", "author": "Robert Frost", "year": 1913,
         "stanzas": [LINES[:3], LINES[3:]], "book": "A Boy's Will"}
    return p | over


def test_check_turns_down_what_the_paper_cannot_print():
    assert pr.check(_poem(), avoid=()) is None
    assert pr.check(_poem(year=1931), avoid=()) == "published 1931, not yet public domain"
    assert pr.check(_poem(stanzas=[LINES] * 8), avoid=()) == "too long"
    assert pr.check(_poem(stanzas=[["Short.", "Poem."]]), avoid=()) == "too short"
    assert pr.check(_poem(), avoid=("willows",)) == "mentions an avoided word"
    spanish = [["La luna sale sobre el mar y las olas que se van para siempre con el viento"] * 4]
    assert pr.check(_poem(stanzas=spanish), avoid=()) == "not English"
    assert pr.check(_poem(stanzas=[["a b c d"] * 4]), avoid=()) == "too few words for the word search"


class FakeWikisource:
    def __init__(self, pages: dict[str, str]):
        self.pages = pages
        self.parsed: list[str] = []

    def get(self, url, accept="*/*"):
        q = dict(urllib.parse.parse_qsl(urllib.parse.urlsplit(url).query))
        if q["action"] == "query":
            prefix = q["apprefix"]
            return json.dumps({"query": {"allpages": [{"title": t} for t in self.pages if t.startswith(prefix)]}}).encode()
        self.parsed.append(q["page"])
        return json.dumps({"parse": {"text": self.pages[q["page"]]}}).encode()


def test_refill_adds_new_poems_once_and_remembers_what_it_turned_down(tmp_path):
    http = FakeWikisource({"Book A/Woods": POEM_DIV, "Book A/Preface": "<p>prose</p>", "Book A/Prose": "<p>prose</p>",
                           "Book B (Smith)/Hills": CENTERED})
    cols = [pr.Collection("Book A", "Robert Frost", 1913), pr.Collection("Book B (Smith)", "Ann Smith", 1901)]
    store = Store(tmp_path / "c.db")
    r = pr.refill(http, store, avoid=(), limit=10, pause=0, collections=cols)
    assert sorted(r.added) == ["Hills", "Woods"] and r.rejected == 2
    assert "Book A/Preface" not in http.parsed, "skipped by title without fetching"
    added = {p["title"]: p for p in store.added_poems()}
    assert added["Hills"]["author"] == "Ann Smith" and added["Hills"]["year"] == 1901
    assert added["Hills"]["book"] == "Book B"

    http.parsed.clear()
    again = pr.refill(http, store, avoid=(), limit=10, pause=0, collections=cols)
    assert again.added == [] and http.parsed == [], "pages already read are not fetched again"


def test_added_poems_join_the_rotation_with_their_book_credited():
    p = poems.choose(dt.date(2026, 10, 3), recently_used={x["id"] for x in poems.library()},
                     added=[_poem(id="ws-new", seasons=["any"], source_name="Wikisource", source_url="u")])
    assert p["id"] == "ws-new" and p["attribution"] == "From A Boy's Will, 1913. Public domain."
