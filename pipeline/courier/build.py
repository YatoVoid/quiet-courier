import datetime as dt
import fcntl
import json
import logging
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path

from . import clean
from .config import GENERAL, City, Config
from .devices import DEVICES
from .epub import build_epub
from .http import Http
from .models import load_edition
from .pdf import build_pdf
from .select import select
from .sources import Context, chronicling, conversation, current_events, globalvoices, metno, nasa, nws, poems
from .store import SourceRun, Store

log = logging.getLogger("courier")

ARTICLE_SOURCES = {
    "conversation": conversation.fetch,
    "globalvoices": globalvoices.fetch,
    "nasa": nasa.fetch,
    "chronicling_america": chronicling.fetch,
}
SECTIONS = [
    {"id": "world", "name": "World"},
    {"id": "science", "name": "Science"},
    {"id": "weather", "name": "Weather"},
    {"id": "archives", "name": "From the Archives", "subtitle": "One Hundred Years Ago Today"},
    {"id": "puzzles", "name": "Puzzles"},
]


class BuildError(RuntimeError):
    pass


@dataclass
class BuildResult:
    edition_id: str
    json_path: Path
    files: list[Path]
    words: int
    reading_min: int
    runs: list[SourceRun]
    missing: list[str] = field(default_factory=list)


def _timed(name: str, fn, default):
    t0 = time.monotonic()
    try:
        value = fn()
    except Exception as e:  # one failing source must not stop the edition
        log.warning("source %s failed: %s", name, e)
        return default, SourceRun(name, False, 0, int((time.monotonic() - t0) * 1000), f"{type(e).__name__}: {e}"[:500])
    n = len(value) if isinstance(value, list) else int(value is not None)
    return value, SourceRun(name, True, n, int((time.monotonic() - t0) * 1000))


def _download_images(articles: list[dict], http: Http, dest: Path) -> list[str]:
    failures = []
    for a in articles:
        kept = []
        for i, img in enumerate(a.get("images", [])):
            if "url" not in img:
                kept.append(img)
                continue
            name = f"{a['id']}-{i}.jpg"
            try:
                data = http.get(img["url"])
                dest.mkdir(parents=True, exist_ok=True)
                (dest / name).write_bytes(data)
            except Exception as e:
                failures.append(f"{img['url']}: {e}")
                continue
            kept.append({k: v for k, v in img.items() if k != "url"} | {"path": f"images/{name}"})
        if a.get("images"):
            a["images"] = kept
            if kept and not a.get("changes"):
                a["changes"] = "Images converted to black and white."
    return failures


def _weather(ctx: Context) -> dict:
    loc = ctx.city.location
    if loc.country == "US" and ctx.config.enabled("nws"):
        try:
            return nws.fetch(ctx)
        except Exception as e:
            if not ctx.config.enabled("metno"):
                raise
            log.warning("nws failed for %s, using MET Norway: %s", loc.name, e)
    if not ctx.config.enabled("metno"):
        raise RuntimeError("no weather source enabled for this location")
    return metno.fetch(ctx)


def _core_path(out_root: Path, date: dt.date) -> Path:
    return out_root / date.isoformat() / "core" / "core.json"


# Every edition of a date shares one selection. The weather is the only local part, so a
# reader in Tokyo and one in Chicago get the same stories, and The Conversation's daily
# limit holds however many places are built.
def prepare_core(config: Config, date: dt.date, out_root: Path, store: Store, http: Http | None = None) -> dict:
    path = _core_path(out_root, date)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path.parent / "core.lock", "w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
        http = http or Http(config.user_agent, cache_dir=out_root / "cache" / date.isoformat())
        ctx = Context(http, config, date, GENERAL)
        jobs = {name: fn for name, fn in ARTICLE_SOURCES.items() if config.enabled(name)}
        runs: list[SourceRun] = []
        pools: dict[str, list[dict]] = {}
        with ThreadPoolExecutor(max_workers=4) as pool:
            futures = {name: pool.submit(_timed, name, lambda f=fn: f(ctx), []) for name, fn in jobs.items()}
            for name, fut in futures.items():
                items, run = fut.result()
                if name != "chronicling_america":
                    for a in [a for a in items if not clean.is_english(a)]:
                        log.info("skipped non-English item from %s: %s", name, a["source_url"])
                        items.remove(a)
                pools[name] = items
                runs.append(run)

        poem = poems.fetch(ctx, store.recent_poems(date, 30))
        sel = select(pools, config, store.recent_urls(date, config.history_days))
        if not sel.lead:
            failed = ", ".join(f"{r.source} ({r.error})" for r in runs if not r.ok) or "none"
            raise BuildError(f"no usable articles for {date}; failed sources: {failed}")

        articles = sel.articles()
        for f in _download_images(articles, http, path.parent / "images"):
            log.warning("image skipped: %s", f)
        for a in articles:
            for img in a.get("images", []):
                img["path"] = f"../core/{img['path']}"
        core = {
            "date": date.isoformat(),
            "front": {"lead": sel.lead["id"], "secondary": [a["id"] for a in sel.secondaries]},
            "articles": articles,
            "poem": poem,
            "words": sel.words,
            "runs": [r.__dict__ for r in runs],
        }
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(core, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        tmp.replace(path)
        return core


# Cities whose morning falls on the same Wikipedia day share one copy of the brief.
def _brief(config: Config, out_root: Path, date: dt.date, http: Http, now: dt.datetime) -> tuple[dict | None, SourceRun]:
    path = out_root / date.isoformat() / "core" / f"brief-{current_events.brief_day(now).isoformat()}.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8")), SourceRun("current_events", True, 1, 0)
    brief, run = _timed("current_events", lambda: current_events.fetch(http, now, config.avoid), None)
    if brief:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(brief, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return brief, run


# Parts a reader would expect but that the paper went out without. Each one is simply left out
# of the edition; the delivery job emails the owner so the cause can be looked at.
def _missing(config: Config, city: City, edition: dict, runs: list[SourceRun], now: dt.datetime) -> list[str]:
    errors = {r.source: r.error for r in runs if not r.ok}
    out = []
    if config.enabled("current_events") and not edition["brief"]:
        day = current_events.brief_day(now)
        out.append("The World in Brief: " + (errors.get("current_events")
                                              or f"no usable items on Wikipedia's page for {day:%B} {day.day}"))
    if city.location is not None and not edition["weather"]:
        out.append(f"Weather for {city.location.name}: " + (errors.get("weather") or "no forecast returned"))
    if config.enabled("chronicling_america") and not any(a["section"] == "archives" for a in edition["articles"]):
        out.append("From the Archives: " + (errors.get("chronicling_america") or "no readable 1926 stories found"))
    return out


def build(config: Config, city: City, date: dt.date, out_root: Path, store: Store,
          http: Http | None = None, render: bool = True, devices: list[str] | None = None,
          epub: bool = True, now: dt.datetime | None = None) -> BuildResult:
    city_id = city.id
    http = http or Http(config.user_agent, cache_dir=out_root / "cache" / date.isoformat())
    core = prepare_core(config, date, out_root, store, http)
    runs = [SourceRun(**r) for r in core["runs"]]

    weather = None
    if city.location is not None and (config.enabled("nws") or config.enabled("metno")):
        weather, run = _timed("weather", lambda: _weather(Context(http, config, date, city)), None)
        runs.append(run)

    now = now or dt.datetime.now(dt.UTC)
    brief = None
    if config.enabled("current_events"):
        brief, run = _brief(config, out_root, date, http, now)
        runs.append(run)

    days = (date - config.launch_date).days
    edition = {
        "paper_name": config.paper_name,
        "motto": config.motto,
        "edition_number": max(1, days + 1),
        "volume": max(1, days // 365 + 1),
        "date": date.isoformat(),
        "location": {"name": city.location.name, "region": city.location.region, "lat": city.location.lat,
                     "lon": city.location.lon, "tz": city.location.tz, "country": city.location.country}
        if city.location else None,
        "sections": SECTIONS,
        "front": core["front"],
        "articles": core["articles"],
        "weather": weather,
        "poem": core["poem"],
        "brief": brief,
    }
    out_dir = out_root / date.isoformat() / city_id
    out_dir.mkdir(parents=True, exist_ok=True)
    json_path = out_dir / "edition.json"
    json_path.write_text(json.dumps(edition, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    files: list[Path] = []
    if render:
        loaded = load_edition(json_path)
        work = out_root / "work" / date.isoformat() / city_id
        for device in DEVICES.values():
            if devices is None or device.id in devices:
                files.append(build_pdf(loaded, device, out_dir / f"{city_id}_{device.id}.pdf", work).path)
        if epub:
            files.append(build_epub(loaded, out_dir / f"{city_id}.epub", work))

    missing = _missing(config, city, edition, runs, now)
    words = core["words"]
    reading_min = round(words / config.words_per_minute)
    edition_id = store.save(edition, city_id, words, reading_min, runs)
    return BuildResult(edition_id, json_path, files, words, reading_min, runs, missing)
