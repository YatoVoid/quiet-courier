import datetime as dt
import json
import logging
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path

from .config import City, Config
from .devices import DEVICES
from .epub import build_epub
from .http import Http
from .models import load_edition
from .pdf import build_pdf
from .select import select
from .sources import Context, chronicling, conversation, globalvoices, metno, nasa, nws, poems
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


def build(config: Config, city: City, date: dt.date, out_root: Path, store: Store,
          http: Http | None = None, render: bool = True) -> BuildResult:
    city_id = city.id
    http = http or Http(config.user_agent, cache_dir=out_root / "cache" / date.isoformat())
    ctx = Context(http, config, date, city)

    jobs = {name: fn for name, fn in ARTICLE_SOURCES.items() if config.enabled(name)}
    runs: list[SourceRun] = []
    pools: dict[str, list[dict]] = {}
    with ThreadPoolExecutor(max_workers=5) as pool:
        futures = {name: pool.submit(_timed, name, lambda f=fn: f(ctx), []) for name, fn in jobs.items()}
        wants_weather = city.location is not None and (config.enabled("nws") or config.enabled("metno"))
        weather_f = pool.submit(_timed, "weather", lambda: _weather(ctx), None) if wants_weather else None
        for name, fut in futures.items():
            pools[name], run = fut.result()
            runs.append(run)
        weather = None
        if weather_f:
            weather, run = weather_f.result()
            runs.append(run)

    poem = poems.fetch(ctx, store.recent_poems(date, 30))
    sel = select(pools, config, store.recent_urls(date, config.history_days))
    if not sel.lead:
        failed = ", ".join(f"{r.source} ({r.error})" for r in runs if not r.ok) or "none"
        raise BuildError(f"no usable articles for {date} {city_id}; failed sources: {failed}")

    out_dir = out_root / date.isoformat() / city_id
    articles = sel.articles()
    image_failures = _download_images(articles, http, out_dir / "images")
    for f in image_failures:
        log.warning("image skipped: %s", f)

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
        "front": {"lead": sel.lead["id"], "secondary": [a["id"] for a in sel.secondaries]},
        "articles": articles,
        "weather": weather,
        "poem": poem,
    }
    out_dir.mkdir(parents=True, exist_ok=True)
    json_path = out_dir / "edition.json"
    json_path.write_text(json.dumps(edition, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    files: list[Path] = []
    if render:
        loaded = load_edition(json_path)
        work = out_root / "work" / date.isoformat() / city_id
        for device in DEVICES.values():
            files.append(build_pdf(loaded, device, out_dir / f"{city_id}_{device.id}.pdf", work).path)
        files.append(build_epub(loaded, out_dir / f"{city_id}.epub", work))

    words = sel.words
    reading_min = round(words / config.words_per_minute)
    edition_id = store.save(edition, city_id, words, reading_min, runs)
    return BuildResult(edition_id, json_path, files, words, reading_min, runs)
