import datetime as dt
import os
import tomllib
from dataclasses import dataclass
from pathlib import Path

from .models import Location

DEFAULT_PATH = Path(__file__).resolve().parent.parent / "courier.toml"


@dataclass(frozen=True)
class City:
    id: str
    location: Location | None


GENERAL = City("general", None)


@dataclass(frozen=True)
class Config:
    paper_name: str
    motto: str
    launch_date: dt.date
    words_per_minute: int
    target_words: int
    max_words: int
    history_days: int
    sources: dict[str, bool]
    avoid: tuple[str, ...]
    science_keywords: tuple[str, ...]
    weather_keywords: tuple[str, ...]
    cities: dict[str, City]
    contact: str

    def enabled(self, source: str) -> bool:
        return self.sources.get(source, False)

    @property
    def user_agent(self) -> str:
        return f"QuietCourier/0.2 (+https://github.com/YatoVoid/quiet-courier; {self.contact})"


def load_config(path: Path = DEFAULT_PATH) -> Config:
    d = tomllib.loads(Path(path).read_text(encoding="utf-8"))
    cities = {
        c["id"]: City(c["id"], Location(c["name"], c["region"], c["lat"], c["lon"], c["tz"], c.get("country", "US")))
        for c in d["cities"]
    }
    ed = d.get("editorial", {})
    return Config(
        paper_name=d["paper"]["name"],
        motto=d["paper"]["motto"],
        launch_date=dt.date.fromisoformat(d["paper"]["launch_date"]),
        words_per_minute=d["reading"]["words_per_minute"],
        target_words=d["reading"]["target_words"],
        max_words=d["reading"]["max_words"],
        history_days=d["reading"]["history_days"],
        sources=dict(d["sources"]),
        avoid=tuple(ed.get("avoid", ())),
        science_keywords=tuple(ed.get("science_keywords", ())),
        weather_keywords=tuple(ed.get("weather_keywords", ())),
        cities=cities,
        contact=os.environ.get("COURIER_CONTACT_EMAIL", "contact via GitHub issues"),
    )
