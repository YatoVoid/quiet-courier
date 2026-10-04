import pytest

from courier import puzzle

TEXT = """Season of mists and mellow fruitfulness, close bosom-friend of the maturing sun;
conspiring with him how to load and bless with fruit the vines that round the thatch-eaves run"""


def test_words_are_in_grid():
    ws = puzzle.build(TEXT, size=10, count=8, seed="2026-10-01")
    for p in ws.placements:
        assert "".join(ws.grid[r][c] for r, c in p.cells()) == p.word
    assert all(len(row) == 10 for row in ws.grid)


def test_same_seed_same_puzzle():
    assert puzzle.build(TEXT, seed="x", count=8) == puzzle.build(TEXT, seed="x", count=8)
    assert puzzle.build(TEXT, seed="x", count=8) != puzzle.build(TEXT, seed="y", count=8)


def test_too_few_words_fails_loudly():
    with pytest.raises(ValueError):
        puzzle.build("tiny text here", count=10)


def test_sudoku_has_one_solution_and_gets_harder_through_the_week():
    from courier.puzzle import _count_solutions, sudoku
    monday, saturday = sudoku("2026-10-05", 0), sudoku("2026-10-10", 5)
    for s in (monday, saturday):
        assert _count_solutions([v for row in s.grid for v in row]) == 1
        assert all(v in (0, s.solution[r][c]) for r, row in enumerate(s.grid) for c, v in enumerate(row))
        assert all(sorted(row) == list(range(1, 10)) for row in s.solution)
    assert monday.givens > saturday.givens and (monday.level, saturday.level) == ("Gentle", "Tough")
    assert sudoku("2026-10-05", 0) == monday


def test_cryptogram_never_maps_a_letter_to_itself_and_decodes():
    from courier.puzzle import cryptogram
    c = cryptogram("Hope is the thing with feathers.", "2026-10-05")
    assert all(k != v for k, v in c.key.items())
    assert c.decode() == "HOPE IS THE THING WITH FEATHERS."
    cipher, plain = c.hint
    assert c.key[plain] == cipher and "HOPE IS THE THING WITH FEATHERS.".count(plain) >= 2


def test_cryptogram_quote_is_a_whole_sentence_from_another_poem():
    import datetime as dt
    from courier.sources import poems
    day = dt.date(2026, 10, 5)
    today = poems.choose(day)
    q = poems.quote(day, {today["id"]})
    assert q and q["title"] != today["title"]
    letters = sum(ch.isalpha() for ch in q["text"])
    assert 40 <= letters <= 90 and q["text"][-1] in ".!?" and q["text"].isascii()
