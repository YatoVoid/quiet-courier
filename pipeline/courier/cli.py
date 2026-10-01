import argparse
import sys
import time
from pathlib import Path

from .devices import DEVICES
from .epub import build_epub
from .layout import PIPELINE_DIR
from .models import load_edition
from .pdf import build_pdf

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
    args = parser.parse_args(argv)

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


if __name__ == "__main__":
    sys.exit(main())
