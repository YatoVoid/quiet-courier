import random
import re
import string
from dataclasses import dataclass

DIRECTIONS = [(0, 1), (1, 0), (1, 1), (-1, 1), (0, -1), (-1, 0), (-1, -1), (1, -1)]
STOPWORDS = {
    "with", "that", "this", "they", "them", "their", "thee", "thou", "thy", "from", "have", "hath",
    "where", "while", "until", "never", "more", "still", "what", "when", "then", "those", "these",
    "whoever", "sometimes", "across", "among", "think", "find", "seen",
}


@dataclass(frozen=True)
class Placement:
    word: str
    row: int
    col: int
    dr: int
    dc: int

    def cells(self) -> list[tuple[int, int]]:
        return [(self.row + i * self.dr, self.col + i * self.dc) for i in range(len(self.word))]


@dataclass(frozen=True)
class WordSearch:
    grid: tuple[tuple[str, ...], ...]
    placements: tuple[Placement, ...]

    @property
    def words(self) -> list[str]:
        return sorted(p.word for p in self.placements)

    def solution_cells(self) -> set[tuple[int, int]]:
        return {c for p in self.placements for c in p.cells()}


def candidate_words(text: str, min_len: int = 4, max_len: int = 9) -> list[str]:
    seen, out = set(), []
    for w in re.findall(r"[A-Za-z]+", text):
        u = w.upper()
        if min_len <= len(u) <= max_len and w.lower() not in STOPWORDS and u not in seen:
            seen.add(u)
            out.append(u)
    return out


def build(text: str, size: int = 12, count: int = 12, seed: int | str = 0, attempts: int = 400) -> WordSearch:
    rng = random.Random(str(seed))
    pool = [w for w in candidate_words(text, max_len=size)]
    rng.shuffle(pool)
    grid: list[list[str | None]] = [[None] * size for _ in range(size)]
    placed: list[Placement] = []

    for word in sorted(pool, key=len, reverse=True):
        if len(placed) == count:
            break
        for _ in range(attempts):
            dr, dc = rng.choice(DIRECTIONS)
            r, c = rng.randrange(size), rng.randrange(size)
            p = Placement(word, r, c, dr, dc)
            cells = p.cells()
            if all(0 <= rr < size and 0 <= cc < size and grid[rr][cc] in (None, word[i])
                   for i, (rr, cc) in enumerate(cells)):
                for i, (rr, cc) in enumerate(cells):
                    grid[rr][cc] = word[i]
                placed.append(p)
                break

    if len(placed) < count:
        raise ValueError(f"placed only {len(placed)} of {count} words; text too short or grid too small")
    filled = tuple(tuple(ch or rng.choice(string.ascii_uppercase) for ch in row) for row in grid)
    return WordSearch(filled, tuple(placed))
