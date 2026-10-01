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
