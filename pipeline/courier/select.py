import datetime as dt
import difflib
import email.utils
import re
from dataclasses import dataclass, field

from .clean import mentions, word_count
from .config import Config

LEAD_WORDS = (600, 1400)
SECONDARY_WORDS = (120, 500)
WORLD_MAX = 1000
WORLD_ITEMS = 2
IDEAS_MAX = 1400
SCIENCE_MAX = 1200
NASA_FEATURE_MAX = 700
WEATHER_MAX = 900
ARCHIVE_ITEMS = 4
# The Conversation's republishing terms ask us to run at most three of their articles per edition.
CONVERSATION_MAX = 3


@dataclass
class Selection:
    lead: dict | None = None
    secondaries: list[dict] = field(default_factory=list)
    sections: dict[str, list[dict]] = field(default_factory=dict)

    def articles(self) -> list[dict]:
        out = [self.lead] if self.lead else []
        out += self.secondaries
        for items in self.sections.values():
            out += items
        return out

    @property
    def words(self) -> int:
        return sum(word_count(a) for a in self.articles())


def _published(a: dict) -> dt.datetime:
    raw = a.get("published") or ""
    try:
        return dt.datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        pass
    try:
        return email.utils.parsedate_to_datetime(raw)
    except (TypeError, ValueError):
        return dt.datetime.min.replace(tzinfo=dt.UTC)


def _key(title: str) -> str:
    return re.sub(r"[^a-z0-9 ]", "", title.lower())


def fresh(items: list[dict], used_urls: set[str], avoid: tuple[str, ...], seen_titles: list[str]) -> list[dict]:
    out = []
    for a in sorted(items, key=_published, reverse=True):
        if a["source_url"] in used_urls or mentions(a, avoid):
            continue
        k = _key(a["title"])
        if any(difflib.SequenceMatcher(None, k, s).ratio() > 0.85 for s in seen_titles):
            continue
        seen_titles.append(k)
        out.append(a)
    return out


def select(pools: dict[str, list[dict]], config: Config, used_urls: set[str]) -> Selection:
    seen: list[str] = []
    conv = fresh(pools.get("conversation", []), used_urls, config.avoid, seen)
    gv = fresh(pools.get("globalvoices", []), used_urls, config.avoid, seen)
    nasa = fresh(pools.get("nasa", []), used_urls, config.avoid, seen)
    eso = fresh(pools.get("eso", []), used_urls, config.avoid, seen)
    archives = fresh(pools.get("chronicling_america", []), used_urls, (), seen)
    hist = fresh(pools.get("onthisday", []), used_urls, (), seen)
    taken: set[str] = set()
    sel = Selection(sections={"world": [], "ideas": [], "science": [], "economy": [], "history": [], "weather": [], "archives": []})

    def room() -> int:
        return config.max_words - sel.words

    def take(candidates, limit, test=lambda a: True, lo=0):
        cap = min(limit, room())
        for a in candidates:
            if a["id"] not in taken and lo <= word_count(a) <= cap and test(a):
                taken.add(a["id"])
                return a
        return None

    def put(section, a):
        if a:
            sel.sections[section].append(dict(a, section=section))
        return a

    calm_first = ([a for a in conv if mentions(a, config.science_keywords + config.weather_keywords)]
                  + [a for a in conv if not mentions(a, config.science_keywords + config.weather_keywords)])
    lead = (take(calm_first, LEAD_WORDS[1], lo=LEAD_WORDS[0])
            or take(gv, 1600, lo=LEAD_WORDS[0])
            or take(sorted(nasa, key=word_count, reverse=True), LEAD_WORDS[1]))
    sel.lead = dict(lead, section="front") if lead else None

    # One NASA teaser on the front, not two, so page one isn't three science stories under a
    # science-leaning lead. The broader topics go in the Ideas and World sections below.
    with_images = [a for a in nasa if a.get("images")]
    plain_nasa = [a for a in nasa if not a.get("images")] + with_images
    s = take(plain_nasa, SECONDARY_WORDS[1], lo=SECONDARY_WORDS[0])
    if s:
        sel.secondaries.append(dict(s, section="science"))

    def science(a):
        return mentions(a, config.science_keywords)

    def weather(a):
        return mentions(a, config.weather_keywords)

    # Anything from The Conversation that isn't science or weather: politics, economy, health,
    # culture, society. This is the breadth the paper otherwise misses.
    def broad(a):
        return not mentions(a, config.science_keywords + config.weather_keywords)

    def conv_used() -> int:
        return sum(1 for a in conv if a["id"] in taken)

    reserve_archives = 350
    budget_left = config.max_words - reserve_archives

    def take_reserved(candidates, limit, test=lambda a: True):
        return take(candidates, min(limit, budget_left - sel.words), test)

    def take_conv(limit, test):
        return take_reserved(conv, limit, test) if conv_used() < CONVERSATION_MAX else None

    # World and Ideas are the breadth the paper was missing, so they take the budget before a second
    # science piece or extra archive clips. Ideas comes before the second world item so a long lead
    # and serial can't starve it.
    put("world", take_reserved(gv, WORLD_MAX))
    put("ideas", take_conv(IDEAS_MAX, broad))
    if len(sel.sections["world"]) < WORLD_ITEMS:
        put("world", take_reserved(gv, WORLD_MAX))
    put("science", take_conv(SCIENCE_MAX, science))
    for a in archives:
        if len(sel.sections["archives"]) >= 2:
            break
        put("archives", take([a], 400))
    put("science", take(eso + with_images + nasa, NASA_FEATURE_MAX))
    for a in archives:
        if len(sel.sections["archives"]) >= ARCHIVE_ITEMS:
            break
        put("archives", take([a], 400))
    for a in pools.get("economy", []):
        if put("economy", take([a], 400)):
            break
    put("history", take(hist, 600))
    wx = take(nasa, WEATHER_MAX, weather) or take_conv(WEATHER_MAX, weather)
    put("weather", wx)

    return sel
