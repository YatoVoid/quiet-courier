import datetime as dt

import pytest

from courier import serial
from courier.store import Store
from fakes import BOOKS, FakeHttp, gutenberg_text

HOUND = {"id": 2852, "title": "The Hound of the Baskervilles", "match": "The Hound of the Baskervilles",
         "author": "Arthur Conan Doyle", "year": 1902, "died": 1930}
MACHINE = {"id": 35, "title": "The Time Machine", "match": "The Time Machine", "author": "H. G. Wells",
           "year": 1895, "died": 1946}
ZENDA = {"id": 95, "title": "The Prisoner of Zenda", "match": "The prisoner of Zenda", "author": "Anthony Hope",
         "year": 1894, "died": 1933}
CATALOG = [HOUND, MACHINE, ZENDA]
DAY = dt.date(2026, 10, 5)


@pytest.fixture
def books(monkeypatch):
    monkeypatch.setitem(BOOKS, 35, gutenberg_text("The Time Machine", "H. G. Wells", [700, 700, 700, 700, 700]))
    monkeypatch.setitem(BOOKS, 95, gutenberg_text("The prisoner of Zenda", "Anthony Hope", [800] * 5))


@pytest.fixture
def store(tmp_path):
    s = Store(tmp_path / "courier.db")
    yield s
    s.close()


def blocks(chapter):
    return [b["kind"] for b in chapter["blocks"]]


def test_chapters_skip_the_front_matter_and_end_matter():
    chs = serial.chapters(BOOKS[2852])
    assert [c["label"] for c in chs] == [f"Chapter {n}" for n in range(1, 7)]
    assert chs[0]["title"] == "The Part Numbered 1"
    text = " ".join(b["text"] for c in chs for b in c["blocks"])
    assert "Gutenberg" not in text and "Contents" not in text and "THE END" not in text


def test_footnotes_scene_breaks_and_separate_titles():
    raw = gutenberg_text("Kidnapped", "Robert Louis Stevenson", [300] * 5).replace(
        "Chapter 2.\nThe Part Numbered 2", "CHAPTER II\n\nI SET OFF UPON MY JOURNEY").replace(
        "Chapter 1.\nThe Part Numbered 1", "CHAPTER I\n\nI COME TO MY JOURNEY’S END", 1)
    raw = raw.replace("Chapter 3.\nThe Part Numbered 3", "CHAPTER III.\nTHE SEA")
    raw = raw.replace("Chapter 4.\nThe Part Numbered 4", "CHAPTER IV.\nTHE SHORE").replace(
        "Chapter 5.\nThe Part Numbered 5", "CHAPTER V.\nTHE END OF IT")
    raw = raw.replace("THE END\n\n***", "[1] moistens\n\n* * * * *\n\nA last line of the story told plainly.\n\nTHE END\n\n***")
    chs = serial.chapters(raw)
    assert [(c["label"], c["title"]) for c in chs[:2]] == [
        ("Chapter I", "I Come to My Journey’s End"), ("Chapter II", "I Set Off Upon My Journey")]
    assert blocks(chs[-1])[-3:] == ["note", "break", "p"]


def test_a_one_line_sentence_is_not_a_chapter_heading():
    raw = BOOKS[2852].replace("\n\n\nChapter 3.", "\n\nI said nothing.\n\n\nChapter 3.", 1)
    chs = serial.chapters(raw)
    assert len(chs) == 6
    assert chs[1]["blocks"][-1] == {"kind": "p", "text": "I said nothing."}


def test_instalments_split_long_chapters_and_join_short_ones():
    days = serial.instalments(serial.chapters(BOOKS[2852]))
    words = [serial._block_words(d) for d in days]
    assert all(w <= serial.MAX_WORDS for w in words)
    kinds = [[b["kind"] for b in d if b["kind"] != "p"] for d in days]
    assert kinds[1:4] == [["chapter"], ["continued"], ["continued"]]
    assert ["chapter", "chapter"] in kinds


def test_misprinted_chapter_number_is_corrected():
    raw = BOOKS[2852].replace("Chapter 4.\n", "Chapter 14.\n")
    chs = serial.chapters(raw)
    assert not serial.in_sequence(chs)
    serial.fix_misprints(chs)
    assert serial.in_sequence(chs) and chs[3]["label"] == "Chapter 4"


def test_a_book_whose_title_doesnt_match_is_turned_down():
    with pytest.raises(serial.SerialError):
        serial.prepare(MACHINE, BOOKS[2852])


def test_only_books_public_domain_everywhere():
    assert serial.public_domain_everywhere(HOUND, DAY)
    christie = dict(HOUND, year=1920, died=1976)
    assert not serial.public_domain_everywhere(christie, DAY)
    assert not serial.public_domain_everywhere(dict(HOUND, year=1931), DAY)


def test_catalog_is_public_domain_and_has_no_repeats():
    entries = serial.catalog()
    assert len({e["id"] for e in entries}) == len(entries)
    assert all(serial.public_domain_everywhere(e, DAY) for e in entries)


def test_instalments_follow_the_calendar_and_the_next_book_starts_the_day_after(store, books):
    http = FakeHttp()
    first = serial.for_date(store, DAY, http, CATALOG)
    assert (first["title"], first["number"], first["started"]) == ("The Hound of the Baskervilles", 1, DAY.isoformat())
    total = first["total"]
    assert serial.for_date(store, DAY + dt.timedelta(days=3), http, CATALOG)["number"] == 4
    last = serial.for_date(store, DAY + dt.timedelta(days=total - 1), http, CATALOG)
    assert last["last"] and last["next_title"] == "The Time Machine"
    nxt = serial.for_date(store, DAY + dt.timedelta(days=total), http, CATALOG)
    assert (nxt["title"], nxt["number"]) == ("The Time Machine", 1)
    assert serial.for_date(store, DAY + dt.timedelta(days=2), None, CATALOG)["number"] == 3
    assert serial.for_date(store, DAY - dt.timedelta(days=1), http, CATALOG) is None


def test_queue_keeps_two_books_ready_and_skips_bad_ones(store, books, monkeypatch):
    monkeypatch.setitem(BOOKS, 35, BOOKS[2852])
    added = serial.queue_ahead(store, FakeHttp(), DAY, entries=CATALOG)
    assert added == ["The Hound of the Baskervilles", "The Prisoner of Zenda"]
    rows = store.serial_books()
    assert rows[35]["book"] is None and "does not match" in rows[35]["reason"]
    assert serial.queue_ahead(store, FakeHttp(), DAY, entries=CATALOG) == []


def test_a_network_failure_is_retried_next_time(store, books):
    with pytest.raises(Exception):
        serial.queue_ahead(store, FakeHttp(fail={"gutenberg"}), DAY, entries=CATALOG)
    assert store.serial_books() == {}
    assert serial.queue_ahead(store, FakeHttp(), DAY, entries=CATALOG)


def test_books_left_counts_unstarted_catalog_books(store, books):
    assert serial.books_left(store, CATALOG) == 3
    serial.for_date(store, DAY, FakeHttp(), CATALOG)
    assert serial.books_left(store, CATALOG) == 2
