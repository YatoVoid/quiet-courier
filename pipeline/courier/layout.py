from __future__ import annotations

import datetime as dt
import functools
import re
from dataclasses import dataclass
from pathlib import Path

from fontTools.ttLib import TTFont
from jinja2 import Environment, FileSystemLoader, select_autoescape
from markupsafe import Markup, escape

from . import almanac, puzzle
from .devices import Device
from .images import to_newsprint
from .models import Article, Block, Edition

PIPELINE_DIR = Path(__file__).resolve().parent.parent
TEMPLATES_DIR = PIPELINE_DIR / "templates"
FONTS_DIR = PIPELINE_DIR.parent / "assets" / "fonts"
NAMEPLATE_FONT = FONTS_DIR / "UnifrakturMaguntia-Book.ttf"


@dataclass(frozen=True)
class Split:
    article: Article
    front: tuple[Block, ...]
    rest: tuple[Block, ...]

    @property
    def jumps(self) -> bool:
        return bool(self.rest)


_ABBREVIATIONS = ("Mr", "Mrs", "Ms", "Dr", "St", "Gov", "Sen", "Rep", "Gen", "Col", "Lt", "Jr", "Sr", "No", "Vol",
                  "Mt", "Ft", "U.S", "U.K", "Ga", "Pa", "Mo", "Co", "Inc", "vs", "e.g", "i.e",
                  "Jan", "Feb", "Mar", "Apr", "Aug", "Sep", "Sept", "Oct", "Nov", "Dec")
_SENTENCE_END = re.compile(r"(?<=[.!?])[”’\")]?\s+(?=[“‘\"(]?[A-Z0-9])")


def sentences(text: str) -> list[str]:
    out, start = [], 0
    for m in _SENTENCE_END.finditer(text):
        head = text[start:m.start()].rstrip(".!?")
        last_word = head.rsplit(None, 1)[-1] if head.strip() else ""
        if last_word in _ABBREVIATIONS or (len(last_word) == 1 and last_word.isupper()):
            continue
        end = m.start() + len(m.group(0).rstrip())
        out.append(text[start:end].strip())
        start = m.end()
    out.append(text[start:].strip())
    return [x for x in out if x]


def units(article: Article) -> list[tuple[int, int | None]]:
    out = []
    for i, b in enumerate(article.body):
        if b.kind == "p":
            out.extend((i, j) for j in range(1, len(sentences(b.text)) + 1))
        else:
            out.append((i, None))
    return out


def units_for_words(article: Article, words: int) -> int:
    us = units(article)
    total = 0
    for n, (i, j) in enumerate(us, start=1):
        b = article.body[i]
        total += len(sentences(b.text)[j - 1].split()) if j else len(b.text.split())
        if total >= words:
            return n
    return len(us)


@dataclass(frozen=True)
class FrontPlan:
    counts: dict[str, int]

    def split(self, article: Article) -> Split:
        us = units(article)
        n = max(1, min(self.counts.get(article.id, len(us)), len(us)))
        while n > 1 and article.body[us[n - 1][0]].kind in ("h", "label"):
            n -= 1
        if n == len(us):
            return Split(article, article.body, ())
        i, j = us[n - 1]
        body = article.body
        if j is not None and j < len(sentences(body[i].text)):
            parts = sentences(body[i].text)
            front = (*body[:i], Block("p", " ".join(parts[:j])))
            rest = (Block("pcont", " ".join(parts[j:])), *body[i + 1:])
        else:
            front, rest = body[: i + 1], body[i + 1:]
        return Split(article, tuple(front), tuple(rest))


@functools.cache
def _advance_per_pt(font_path: Path, text: str) -> float:
    font = TTFont(font_path)
    cmap = font.getBestCmap()
    hmtx = font["hmtx"]
    upm = font["head"].unitsPerEm
    space = hmtx[cmap[ord(" ")]][0]
    units = sum(hmtx[cmap[ord(ch)]][0] if ord(ch) in cmap else space for ch in text)
    return units / upm


def fit_font_size(text: str, available_pt: float, max_pt: float, font_path: Path = NAMEPLATE_FONT) -> float:
    per_pt = _advance_per_pt(font_path, text)
    return round(min(max_pt, available_pt / per_pt * 0.97), 2)


def jinja_env() -> Environment:
    env = Environment(
        loader=FileSystemLoader(TEMPLATES_DIR),
        autoescape=select_autoescape(["html", "j2"]),
        trim_blocks=True,
        lstrip_blocks=True,
    )
    env.filters["roman"] = roman
    env.filters["dropcap"] = dropcap
    env.filters["sentence"] = lambda t: t[:1].upper() + t[1:].lower()
    env.filters["clock"] = lambda t: t.strftime("%-I:%M %p").replace("AM", "a.m.").replace("PM", "p.m.") if t else "none"
    return env


def dropcap(text: str) -> Markup:
    # WeasyPrint crashes on a floated ::first-letter inside a multi-column box.
    i = 0
    while i < len(text) and not text[i].isalnum():
        i += 1
    if i >= len(text):
        return escape(text)
    return Markup('<span class="dropcap">{}</span>{}').format(text[: i + 1], text[i + 1:])


def roman(n: int) -> str:
    out = ""
    for value, sym in ((1000, "M"), (900, "CM"), (500, "D"), (400, "CD"), (100, "C"), (90, "XC"),
                       (50, "L"), (40, "XL"), (10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I")):
        while n >= value:
            out += sym
            n -= value
    return out


def long_date(d: dt.date) -> str:
    return d.strftime("%A, %B ") + str(d.day) + d.strftime(", %Y")


def prepare_images(edition: Edition, device: Device, work_dir: Path) -> dict[Path, Path]:
    column_in = (device.page_width_in - 2 * device.margin_in) / device.columns
    width_px = int(column_in * 300)
    out = {}
    for article in edition.articles.values():
        for img in article.images:
            dest = work_dir / "img" / device.id / (img.path.stem + ".png")
            out[img.path] = to_newsprint(img.path, dest, width_px).resolve()
    return out


def word_search(edition: Edition, device: Device) -> puzzle.WordSearch:
    text = "\n".join(line for stanza in edition.poem.stanzas for line in stanza)
    return puzzle.build(text, size=device.puzzle_size, count=device.puzzle_words, seed=edition.date.isoformat())


def render_html(edition: Edition, device: Device, plan: FrontPlan, images: dict[Path, Path],
                front_only: bool = False) -> str:
    content_width_pt = (device.page_width_in - 2 * device.margin_in) * 72
    ear_share = 0 if device.id == "small" else 0.42
    nameplate_pt = fit_font_size(edition.paper_name, content_width_pt * (1 - ear_share), device.nameplate_pt)
    splits = [plan.split(a) for a in [edition.lead, *edition.secondaries(device.front_secondaries)]]
    sections = [
        (s, edition.section_articles(s.id, device.front_secondaries))
        for s in edition.sections if s.id != "puzzles"
    ]
    ctx = dict(
        e=edition,
        d=device,
        front_only=front_only,
        fonts=FONTS_DIR.as_uri(),
        nameplate_pt=nameplate_pt,
        date_long=long_date(edition.date),
        lead=splits[0],
        secondaries=splits[1:],
        jumped=[s for s in splits if s.jumps],
        sections=sections,
        images={k: v.as_uri() for k, v in images.items()},
        alm=almanac.compute(edition.location, edition.date),
        ws=word_search(edition, device),
        today=edition.weather.periods[0],
        next_period=edition.weather.periods[1],
    )
    return jinja_env().get_template("edition.html.j2").render(**ctx)
