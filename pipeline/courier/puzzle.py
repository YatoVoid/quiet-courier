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


# Fewer givens make a harder grid. The week climbs to Saturday, as newspaper puzzles do.
SUDOKU_GIVENS = {0: 38, 1: 36, 2: 34, 3: 32, 4: 30, 5: 28, 6: 32}
SUDOKU_LEVEL = {0: "Gentle", 1: "Gentle", 2: "Moderate", 3: "Moderate", 4: "Tough", 5: "Tough", 6: "Moderate"}


@dataclass(frozen=True)
class Sudoku:
    grid: tuple[tuple[int, ...], ...]  # 0 is an empty square
    solution: tuple[tuple[int, ...], ...]
    level: str

    @property
    def givens(self) -> int:
        return sum(1 for row in self.grid for v in row if v)


def _candidates(g: list[int], i: int) -> list[int]:
    r, c = divmod(i, 9)
    used = set(g[r * 9:r * 9 + 9]) | {g[c + 9 * k] for k in range(9)}
    br, bc = 3 * (r // 3), 3 * (c // 3)
    used |= {g[(br + a) * 9 + bc + b] for a in range(3) for b in range(3)}
    return [v for v in range(1, 10) if v not in used]


def _count_solutions(g: list[int], limit: int = 2) -> int:
    empties = [i for i, v in enumerate(g) if not v]
    if not empties:
        return 1
    # Fill the square with the fewest options first; it keeps the search small.
    i = min(empties, key=lambda k: len(_candidates(g, k)))
    total = 0
    for v in _candidates(g, i):
        g[i] = v
        total += _count_solutions(g, limit - total)
        g[i] = 0
        if total >= limit:
            break
    return total


def _fill(g: list[int], rng: random.Random) -> bool:
    try:
        i = g.index(0)
    except ValueError:
        return True
    options = _candidates(g, i)
    rng.shuffle(options)
    for v in options:
        g[i] = v
        if _fill(g, rng):
            return True
    g[i] = 0
    return False


def sudoku(seed: str, weekday: int) -> Sudoku:
    rng = random.Random(f"sudoku:{seed}")
    full = [0] * 81
    _fill(full, rng)
    grid = full[:]
    target = SUDOKU_GIVENS[weekday]
    # Squares come out in mirrored pairs, so the pattern is symmetric like a printed puzzle.
    order = list(range(41))
    rng.shuffle(order)
    for i in order:
        if sum(1 for v in grid if v) <= target:
            break
        j = 80 - i
        saved = grid[i], grid[j]
        grid[i] = grid[j] = 0
        if _count_solutions(grid[:]) != 1:
            grid[i], grid[j] = saved
    rows = lambda g: tuple(tuple(g[r * 9:r * 9 + 9]) for r in range(9))  # noqa: E731
    return Sudoku(rows(grid), rows(full), SUDOKU_LEVEL[weekday])


@dataclass(frozen=True)
class Cryptogram:
    words: tuple[str, ...]  # enciphered, punctuation kept
    hint: tuple[str, str]  # (cipher letter, plain letter)
    key: dict

    def decode(self) -> str:
        back = {v: k for k, v in self.key.items()}
        return " ".join("".join(back.get(ch, ch) for ch in w) for w in self.words)


def cryptogram(text: str, seed: str) -> Cryptogram:
    rng = random.Random(f"cryptogram:{seed}")
    letters = list(string.ascii_uppercase)
    # No letter may stand for itself, or that square would give the answer away.
    while True:
        shuffled = letters[:]
        rng.shuffle(shuffled)
        if all(a != b for a, b in zip(letters, shuffled)):
            break
    key = dict(zip(letters, shuffled))
    plain = text.upper()
    words = tuple("".join(key.get(ch, ch) for ch in w) for w in plain.split())
    counts = {ch: plain.count(ch) for ch in set(plain) if ch in key}
    repeated = sorted((ch for ch, n in counts.items() if n >= 2 and ch not in "AEIOU"), key=lambda ch: (-counts[ch], ch))
    pick = repeated[0] if repeated else max(counts, key=counts.get)
    return Cryptogram(words, (key[pick], pick), key)
