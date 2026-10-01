import argparse
import sys
import time
from pathlib import Path

from .devices import DEVICES
from .epub import build_epub
from .layout import PIPELINE_DIR
from .models import load_edition
from .pdf import build_pdf

SAMPLE = PIPELINE_DIR / "samples" / "sample_edition.json"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="broadsheet")
    sub = parser.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("sample", help="render the sample edition to PDF and EPUB")
    s.add_argument("--edition", type=Path, default=SAMPLE)
    s.add_argument("--out", type=Path, default=PIPELINE_DIR.parent / "out")
    s.add_argument("--device", choices=[*DEVICES, "all"], default="all")
    s.add_argument("--no-epub", action="store_true")
    args = parser.parse_args(argv)

    edition = load_edition(args.edition)
    work = args.out / "work"
    devices = DEVICES.values() if args.device == "all" else [DEVICES[args.device]]
    for device in devices:
        t = time.monotonic()
        r = build_pdf(edition, device, args.out / f"sample_{device.id}.pdf", work)
        print(f"{r.path}  {r.pages} pages  ({time.monotonic() - t:.1f}s)")
    if not args.no_epub:
        path = build_epub(edition, args.out / "sample.epub", work)
        print(path)
    return 0


if __name__ == "__main__":
    sys.exit(main())
