import argparse
import datetime as dt
import logging
import os
import sys
import time
from pathlib import Path
from zoneinfo import ZoneInfo

from .devices import DEVICES
from .epub import build_epub
from .layout import PIPELINE_DIR
from .models import load_edition
from .pdf import build_pdf
from .build import BuildError, build
from .config import DEFAULT_PATH, GENERAL, City, load_config
from .models import Location
from .store import Store

SAMPLES = sorted((PIPELINE_DIR / "samples").glob("*.json"))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="courier")
    sub = parser.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("sample", help="render sample editions to PDF and EPUB")
    s.add_argument("--edition", type=Path, action="append",
                   help="edition JSON to render; repeatable. Default: every file in pipeline/samples/")
    s.add_argument("--out", type=Path, default=PIPELINE_DIR.parent / "out")
    s.add_argument("--device", choices=[*DEVICES, "all"], default="all")
    s.add_argument("--no-epub", action="store_true")

    b = sub.add_parser("build", help="fetch today's sources and build a real edition")
    b.add_argument("--city", default="all", help="city id from courier.toml, or 'all'")
    b.add_argument("--date", type=dt.date.fromisoformat, help="edition date, default today in the city's timezone")
    b.add_argument("--out", type=Path, default=PIPELINE_DIR.parent / "out")
    b.add_argument("--db", type=Path, default=PIPELINE_DIR.parent / "data" / "courier.db")
    b.add_argument("--config", type=Path, default=DEFAULT_PATH)
    b.add_argument("--no-render", action="store_true", help="select and store only, skip PDF/EPUB")
    b.add_argument("--general", action="store_true", help="build the edition without local weather or almanac")
    b.add_argument("--place", metavar="KEY", help="build for any place, e.g. gn-2996944; needs the options below")
    for flag in ("--name", "--region", "--country", "--tz"):
        b.add_argument(flag)
    b.add_argument("--lat", type=float)
    b.add_argument("--lon", type=float)
    d = sub.add_parser("deliver", help="build and email due editions; run every 15 minutes")
    d.add_argument("--config", type=Path, default=DEFAULT_PATH)
    a = sub.add_parser("archive-index", help="list the 1926 issues for future edition dates, from loc.gov")
    a.add_argument("--from", dest="start", type=dt.date.fromisoformat, help="first edition date")
    a.add_argument("--to", dest="end", type=dt.date.fromisoformat, help="last edition date")
    a.add_argument("--auto", action="store_true",
                   help="extend from where the index ends, about six weeks at a time, to 13 months ahead")
    a.add_argument("--config", type=Path, default=DEFAULT_PATH)
    m = sub.add_parser("maintain", help="weekly upkeep: add new poems, fetch the latest archive index, email the owner if anything is low")
    m.add_argument("--poems", type=int, default=30, help="most poems to add this run")
    m.add_argument("--config", type=Path, default=DEFAULT_PATH)
    args = parser.parse_args(argv)

    if args.cmd == "maintain":
        return run_maintain(args)

    if args.cmd == "deliver":
        return run_deliver(args)

    if args.cmd == "archive-index":
        return run_archive_index(args)

    if args.cmd == "build":
        return run_build(args)

    devices = DEVICES.values() if args.device == "all" else [DEVICES[args.device]]
    for path in args.edition or SAMPLES:
        edition = load_edition(path)
        work = args.out / "work" / path.stem
        for device in devices:
            t = time.monotonic()
            r = build_pdf(edition, device, args.out / f"{path.stem}_{device.id}.pdf", work)
            print(f"{r.path}  {r.pages} pages  ({time.monotonic() - t:.1f}s)")
        if not args.no_epub:
            print(build_epub(edition, args.out / f"{path.stem}.epub", work))
    return 0


def run_deliver(args) -> int:
    from .delivery import Settings, run_once

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")
    for noisy in ("weasyprint", "fontTools"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
    report = run_once(load_config(args.config), Settings.from_env())
    if report is None:
        return 0
    print(f"sent {report.sent}, failed {len(report.failed)}, gave up {len(report.gave_up)}, "
          f"build errors {len(report.build_errors)}, copies to The Conversation {report.partner_copies}, "
          f"monthly reports {report.partner_reports}, missing parts {len(report.missing)}")
    return 1 if report.failed_run else 0


def run_maintain(args) -> int:
    from . import poem_refill, watchdog
    from .delivery import _addresses
    from .sources import chronicling
    from .http import Http
    from .mail import Mailer
    from .store import Store

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")
    config = load_config(args.config)
    db_path = Path(os.environ.get("COURIER_DB", PIPELINE_DIR.parent / "data" / "courier.db"))
    store = Store(db_path)
    try:
        http = Http(config.user_agent)
        r = poem_refill.refill(http, store, config.avoid, limit=args.poems)
        warnings = [f"The poem refill couldn't read {e}" for e in r.errors]
        try:
            newer = chronicling.refresh_index(http)
            print(f"archive index updated, now through {newer.replace(year=newer.year + 100)}" if newer
                  else "archive index already current")
        except Exception as e:
            warnings.append(f"Couldn't download the archive index from GitHub: {e}")
        warnings += watchdog.check(store, dt.date.today(), db_path.parent)
        total = len(store.added_poems())
    finally:
        store.close()
    print(f"poems added {len(r.added)}, turned down {r.rejected}, pool now {total} plus the bundled ones")
    for w in warnings:
        print(f"warning: {w}")
    emailed = watchdog.report(warnings, Mailer.from_env(), _addresses(os.environ.get("ALERT_EMAIL")))
    if warnings and not emailed:
        print("warning email not sent (no ALERT_EMAIL, or the mail provider refused it)")
    return 1 if r.errors and not r.added else 0


def run_archive_index(args) -> int:
    from .http import Http
    from .sources import chronicling

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
    if args.auto:
        span = chronicling.next_index_range(dt.date.today())
        if span is None:
            print("the index already reaches 13 months ahead; nothing to add")
            return 0
        args.start, args.end = span
    if not (args.start and args.end):
        print("give --from and --to, or --auto", file=sys.stderr)
        return 2
    print(f"indexing edition dates {args.start} to {args.end}")
    days = [chronicling.hundred_years_before(args.start + dt.timedelta(n))
            for n in range((args.end - args.start).days + 1)]
    added = chronicling.update_index(Http(load_config(args.config).user_agent), days)
    print(f"added {added} days to {chronicling.INDEX}")
    return 0


def run_build(args) -> int:
    logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(message)s")
    config = load_config(args.config)
    if args.general:
        targets = [GENERAL]
    elif args.place:
        missing = [f for f in ("name", "region", "country", "tz", "lat", "lon") if getattr(args, f) is None]
        if missing:
            print(f"--place needs --{', --'.join(missing)}", file=sys.stderr)
            return 2
        targets = [City(args.place, Location(args.name, args.region, args.lat, args.lon, args.tz, args.country.upper()))]
    else:
        ids = list(config.cities) if args.city == "all" else [args.city]
        unknown = [c for c in ids if c not in config.cities]
        if unknown:
            print(f"unknown city: {', '.join(unknown)}. Known: {', '.join(config.cities)}", file=sys.stderr)
            return 2
        targets = [config.cities[c] for c in ids]
    store = Store(args.db)
    failed = 0
    try:
        for city in targets:
            tz = ZoneInfo(city.location.tz if city.location else args.tz or "UTC")
            date = args.date or dt.datetime.now(tz).date()
            t = time.monotonic()
            try:
                r = build(config, city, date, args.out, store, render=not args.no_render)
            except BuildError as e:
                print(f"FAILED {city.id}: {e}", file=sys.stderr)
                failed += 1
                continue
            print(f"{r.edition_id}: {r.words} words, about {r.reading_min} min ({time.monotonic() - t:.0f}s)")
            for run in r.runs:
                status = f"{run.items} items" if run.ok else f"FAILED {run.error}"
                print(f"  {run.source:20} {status} ({run.duration_ms} ms)")
            for f in [r.json_path, *r.files]:
                print(f"  {f}")
    finally:
        store.close()
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
