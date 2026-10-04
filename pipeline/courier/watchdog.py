"""Weekly check of everything the paper keeps in stock. Silent unless something is running low."""

from __future__ import annotations

import datetime as dt
import shutil
from pathlib import Path

from .build import POEM_REPEAT_DAYS
from .mail import Mailer, MailError, Message
from . import serial
from .sources import chronicling, poems
from .store import Store

ARCHIVE_WARN_DAYS = 90
POEMS_WARN = 30
SERIAL_BOOKS_WARN = 3
DISK_WARN_BYTES = 5 * 1024**3


def archive_index_ends() -> dt.date | None:
    days = chronicling._index()
    if not days:
        return None
    last = dt.date.fromisoformat(max(days))
    return last.replace(year=last.year + 100)


def unused_poems(store: Store, today: dt.date) -> int:
    ids = {p["id"] for p in poems.library()} | {p["id"] for p in store.added_poems()}
    return len(ids - store.recent_poems(today + dt.timedelta(days=1), POEM_REPEAT_DAYS))


def check(store: Store, today: dt.date, data_dir: Path) -> list[str]:
    warnings = []
    ends = archive_index_ends()
    if ends is None:
        warnings.append("The 1926 archive index is missing, so From the Archives can't be printed.")
    elif (ends - today).days < ARCHIVE_WARN_DAYS:
        warnings.append(f"The 1926 archive index ends on {ends:%B} {ends.day}, {ends.year} "
                        f"({(ends - today).days} days away). After that, From the Archives stops. "
                        "The monthly \"Archive index\" GitHub workflow should have extended it; check its runs at "
                        "https://github.com/YatoVoid/quiet-courier/actions/workflows/archive-index.yml")
    left = unused_poems(store, today)
    if left < POEMS_WARN:
        warnings.append(f"Only {left} poems haven't run in the last year. The weekly refill adds more from "
                        "Wikisource; if it keeps finding none, its collection list in poem_refill.py is used up.")
    books = serial.books_left(store)
    if books < SERIAL_BOOKS_WARN:
        warnings.append(f"Only {books} serial novels are left that haven't run. Add more to "
                        "pipeline/courier/data/serials.json (public domain everywhere: published before 1931, "
                        "author dead more than 70 years).")
    week_ago = dt.datetime.combine(today - dt.timedelta(days=7), dt.time(), dt.UTC)
    for book_id, r in store.serial_books().items():
        if r["reason"] and r["checked_at"] >= week_ago:
            warnings.append(f"Serial book {book_id} in serials.json was turned down: {r['reason']}.")
    free = shutil.disk_usage(data_dir).free
    if free < DISK_WARN_BYTES:
        warnings.append(f"The server has {free / 1024**3:.1f} GB of disk left.")
    return warnings


def report(warnings: list[str], mailer: Mailer, to: list[str]) -> bool:
    if not (warnings and to):
        return False
    text = "\n".join(["The weekly check found something to look at:", "", *[f"- {w}" for w in warnings], "",
                      "Readers' papers are unaffected for now. Check with: journalctl -u quiet-courier-maintain"])
    try:
        mailer.send(Message(to=to, subject="The Quiet Courier: weekly check", text=text + "\n"))
    except MailError:
        return False
    return True
