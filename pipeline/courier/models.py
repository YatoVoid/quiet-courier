from __future__ import annotations

import datetime as dt
import json
from dataclasses import dataclass
from pathlib import Path


class ContentError(ValueError):
    pass


@dataclass(frozen=True)
class License:
    id: str
    name: str
    url: str
    commercial: bool
    derivatives: bool

    @classmethod
    def from_dict(cls, d: dict) -> License:
        return cls(d["id"], d["name"], d["url"], bool(d["commercial"]), bool(d["derivatives"]))


@dataclass(frozen=True)
class Block:
    kind: str  # p, h, label, note, pcont
    text: str


@dataclass(frozen=True)
class Image:
    path: Path
    caption: str
    credit: str
    license: License


@dataclass(frozen=True)
class Article:
    id: str
    section: str
    title: str
    body: tuple[Block, ...]
    source_name: str
    source_url: str
    license: License
    attribution: str
    published: str | None = None
    deck: str | None = None
    author: str | None = None
    author_affiliation: str | None = None
    changes: str | None = None
    kind: str = "article"
    images: tuple[Image, ...] = ()

    @property
    def word_count(self) -> int:
        return sum(len(b.text.split()) for b in self.body)

    @property
    def no_derivatives(self) -> bool:
        return not self.license.derivatives

    @classmethod
    def from_dict(cls, d: dict, base: Path) -> Article:
        lic = License.from_dict(d["license"])
        if not lic.commercial:
            raise ContentError(f"{d['id']}: license {lic.id} does not allow commercial use")
        if not d.get("attribution"):
            raise ContentError(f"{d['id']}: attribution is required")
        body = tuple(Block(b["kind"], b["text"]) for b in d["body"])
        if not any(b.kind == "p" for b in body):
            raise ContentError(f"{d['id']}: article has no paragraphs")
        images = tuple(
            Image(base / i["path"], i["caption"], i["credit"], License.from_dict(i["license"]))
            for i in d.get("images", [])
        )
        return cls(
            id=d["id"], section=d["section"], title=d["title"], body=body,
            source_name=d["source_name"], source_url=d["source_url"], license=lic,
            attribution=d["attribution"], published=d.get("published"), deck=d.get("deck"),
            author=d.get("author"), author_affiliation=d.get("author_affiliation"),
            changes=d.get("changes"), kind=d.get("kind", "article"), images=images,
        )


@dataclass(frozen=True)
class ForecastPeriod:
    name: str
    temperature: int
    unit: str
    is_daytime: bool
    short: str
    detail: str


@dataclass(frozen=True)
class Weather:
    city: str
    office: str
    source_url: str
    attribution: str
    periods: tuple[ForecastPeriod, ...]
    license_name: str = "Public domain"


@dataclass(frozen=True)
class Poem:
    title: str
    author: str
    year: int
    stanzas: tuple[tuple[str, ...], ...]
    source_name: str
    source_url: str
    license: License
    attribution: str


@dataclass(frozen=True)
class Location:
    name: str
    region: str
    lat: float
    lon: float
    tz: str
    country: str = "US"


@dataclass(frozen=True)
class Section:
    id: str
    name: str
    subtitle: str | None = None


@dataclass
class Edition:
    paper_name: str
    motto: str
    volume: int
    number: int
    date: dt.date
    location: Location | None
    sections: list[Section]
    articles: dict[str, Article]
    lead_id: str
    secondary_ids: list[str]
    weather: Weather | None
    poem: Poem

    @property
    def lead(self) -> Article:
        return self.articles[self.lead_id]

    def secondaries(self, limit: int) -> list[Article]:
        return [self.articles[i] for i in self.secondary_ids[:limit]]

    def section_articles(self, section_id: str, front_secondaries: int) -> list[Article]:
        front = {self.lead_id, *self.secondary_ids[:front_secondaries]}
        return [a for a in self.articles.values() if a.section == section_id and a.id not in front]

    def all_sources(self) -> list[Article]:
        return list(self.articles.values())


def load_edition(path: Path) -> Edition:
    path = Path(path)
    base = path.parent.resolve()
    d = json.loads(path.read_text(encoding="utf-8"))
    articles = {}
    for a in d["articles"]:
        art = Article.from_dict(a, base)
        if art.id in articles:
            raise ContentError(f"duplicate article id {art.id}")
        articles[art.id] = art
    front = d["front"]
    for aid in [front["lead"], *front["secondary"]]:
        if aid not in articles:
            raise ContentError(f"front page references unknown article {aid}")
    w = d.get("weather")
    p = d["poem"]
    loc = d.get("location")
    return Edition(
        paper_name=d["paper_name"], motto=d["motto"], volume=d["volume"], number=d["edition_number"],
        date=dt.date.fromisoformat(d["date"]),
        location=Location(loc["name"], loc["region"], loc["lat"], loc["lon"], loc["tz"], loc.get("country", "US"))
        if loc else None,
        sections=[Section(s["id"], s["name"], s.get("subtitle")) for s in d["sections"]],
        articles=articles, lead_id=front["lead"], secondary_ids=list(front["secondary"]),
        weather=Weather(
            w["city"], w["office"], w["source_url"], w["attribution"],
            tuple(ForecastPeriod(**x) for x in w["periods"]),
            w.get("license", {}).get("name", "Public domain"),
        ) if w and len(w["periods"]) >= 2 else None,
        poem=Poem(
            p["title"], p["author"], p["year"], tuple(tuple(s) for s in p["stanzas"]),
            p["source_name"], p["source_url"], License.from_dict(p["license"]), p["attribution"],
        ),
    )
