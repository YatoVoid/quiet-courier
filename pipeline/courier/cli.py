import argparse
import datetime as dt
import logging
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
from .config import DEFAULT_PATH, load_config
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
    args = parser.parse_args(argv)

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


def run_build(args) -> int:
    logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(message)s")
    config = load_config(args.config)
    cities = list(config.cities) if args.city == "all" else [args.city]
    unknown = [c for c in cities if c not in config.cities]
    if unknown:
        print(f"unknown city: {', '.join(unknown)}. Known: {', '.join(config.cities)}", file=sys.stderr)
        return 2
    store = Store(args.db)
    failed = 0
    try:
        for city_id in cities:
            tz = ZoneInfo(config.cities[city_id].location.tz)
            date = args.date or dt.datetime.now(tz).date()
            t = time.monotonic()
            try:
                r = build(config, city_id, date, args.out, store, render=not args.no_render)
            except BuildError as e:
                print(f"FAILED {city_id}: {e}", file=sys.stderr)
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
