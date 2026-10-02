"""The delivery job. Runs every 15 minutes on the server.

Each reader gets the edition for their own local date. Editions are built from 4 a.m.
local time and sent from 5 a.m. A failed send is retried once an hour until 10 a.m.,
then left failed and reported to the owner.
"""

import datetime as dt
import fcntl
import json
import logging
import os
import shutil
from dataclasses import dataclass, field
from pathlib import Path
from zoneinfo import ZoneInfo

import psycopg
from psycopg.rows import dict_row

from .build import BuildError, build
from .config import GENERAL, City, Config
from .mail import Mailer, MailError, Message
from .models import Location
from .store import Store

log = logging.getLogger("courier.delivery")

FORMATS = ("small", "large", "epub")


def _addresses(raw: str | None) -> list[str]:
    return [a.strip() for a in (raw or "").split(",") if a.strip()]


@dataclass(frozen=True)
class Settings:
    database_url: str
    out_root: Path
    store_path: Path
    enabled: bool = False
    prepare_hour: int = 4
    send_hour: int = 5
    give_up_hour: int = 10
    max_attempts: int = 5
    retry_gap: dt.timedelta = dt.timedelta(minutes=55)
    daily_limit: int = 100
    monthly_limit: int = 3000
    keep_days: int = 14
    partner_copy_to: list[str] = field(default_factory=list)
    partner_report_to: list[str] = field(default_factory=list)
    alert_to: list[str] = field(default_factory=list)

    @classmethod
    def from_env(cls) -> "Settings":
        e = os.environ
        return cls(
            database_url=e["DATABASE_URL"],
            out_root=Path(e.get("EDITIONS_DIR", "out")),
            store_path=Path(e.get("COURIER_DB", "data/courier.db")),
            enabled=e.get("DELIVERY_ENABLED") == "1",
            daily_limit=int(e.get("MAIL_DAILY_LIMIT", "100")),
            monthly_limit=int(e.get("MAIL_MONTHLY_LIMIT", "3000")),
            partner_copy_to=_addresses(e.get("PARTNER_COPY_TO")),
            partner_report_to=_addresses(e.get("PARTNER_REPORT_TO")),
            alert_to=_addresses(e.get("ALERT_EMAIL")),
        )


@dataclass(frozen=True)
class Subscriber:
    id: str
    email: str
    format: str
    time_zone: str
    city: City


@dataclass
class Report:
    sent: int = 0
    failed: list[str] = field(default_factory=list)
    gave_up: list[str] = field(default_factory=list)
    build_errors: list[str] = field(default_factory=list)
    quota_hit: bool = False
    partner_copies: list[str] = field(default_factory=list)
    partner_reports: list[str] = field(default_factory=list)

    @property
    def needs_alert(self) -> bool:
        return bool(self.gave_up or self.build_errors or self.quota_hit)


SUBSCRIBERS = """
SELECT u.id::text AS id, u.delivery_email, u.format, u.time_zone, u.local_weather,
       p.id AS place_id, p.name AS place_name, p.admin1, p.country, p.country_code,
       p.latitude, p.longitude, p.time_zone AS place_tz
FROM users u LEFT JOIN places p ON p.id = u.place_id
WHERE u.delivery_status = 'active'
  AND u.delivery_email IS NOT NULL AND u.delivery_email_verified_at IS NOT NULL
  AND u.terms_accepted_at IS NOT NULL AND u.time_zone IS NOT NULL AND u.format IS NOT NULL
  AND (NOT u.local_weather OR p.id IS NOT NULL)
"""


class Db:
    def __init__(self, conn: psycopg.Connection):
        self.conn = conn

    @classmethod
    def connect(cls, url: str) -> "Db":
        return cls(psycopg.connect(url, autocommit=True, connect_timeout=10, row_factory=dict_row))

    def close(self) -> None:
        self.conn.close()

    def subscribers(self) -> list[Subscriber]:
        out = []
        for r in self.conn.execute(SUBSCRIBERS):
            if r["local_weather"]:
                region = r["country"] if r["country_code"] != "US" else (r["admin1"] or "United States")
                city = City(f"gn-{r['place_id']}", Location(r["place_name"], region, r["latitude"], r["longitude"],
                                                             r["place_tz"], r["country_code"]))
            else:
                city = GENERAL
            out.append(Subscriber(r["id"], r["delivery_email"], r["format"], r["time_zone"], city))
        return out

    def delivery(self, user_id: str, date: dt.date) -> dict | None:
        return self.conn.execute(
            "SELECT status, attempts, updated_at FROM deliveries WHERE user_id = %s AND edition_date = %s",
            (user_id, date)).fetchone()

    # The WHERE on the conflict branch is what stops a second send: a row already marked
    # sent is left alone and nothing is returned.
    def begin(self, user_id: str, date: dt.date, key: str, fmt: str, now: dt.datetime) -> int | None:
        row = self.conn.execute(
            """INSERT INTO deliveries (user_id, edition_date, edition_key, format, status, attempts, created_at, updated_at)
               VALUES (%(u)s, %(d)s, %(k)s, %(f)s, 'pending', 1, %(now)s, %(now)s)
               ON CONFLICT (user_id, edition_date) DO UPDATE
                 SET attempts = deliveries.attempts + 1, status = 'pending', edition_key = EXCLUDED.edition_key,
                     format = EXCLUDED.format, updated_at = %(now)s
                 WHERE deliveries.status <> 'sent'
               RETURNING attempts""", {"u": user_id, "d": date, "k": key, "f": fmt, "now": now}).fetchone()
        return row["attempts"] if row else None

    def finish(self, user_id: str, date: dt.date, ok: bool, provider_id: str | None, error: str | None,
               now: dt.datetime) -> None:
        self.conn.execute(
            """UPDATE deliveries SET status = %s, provider_id = %s, error = %s,
                 sent_at = CASE WHEN %s THEN %s ELSE sent_at END, updated_at = %s
               WHERE user_id = %s AND edition_date = %s""",
            ("sent" if ok else "failed", provider_id, error, ok, now, now, user_id, date))

    def emails_since(self, since: dt.datetime) -> int:
        row = self.conn.execute(
            """SELECT (SELECT count(*) FROM deliveries WHERE sent_at >= %(s)s)
                    + (SELECT count(*) FROM audit_events WHERE created_at >= %(s)s AND event IN
                       ('sign_in_requested', 'test_edition_sent', 'delivery_verify_sent'))
                    + (SELECT count(*) FROM partner_copies WHERE sent_at >= %(s)s)
                    + (SELECT count(*) FROM partner_reports WHERE sent_at >= %(s)s) AS n""", {"s": since}).fetchone()
        return int(row["n"])

    def delivered_on(self, date: dt.date) -> bool:
        return self.conn.execute(
            "SELECT 1 FROM deliveries WHERE edition_date = %s AND status = 'sent' LIMIT 1", (date,)).fetchone() is not None

    def partner_copy_sent(self, date: dt.date) -> bool:
        return self.conn.execute("SELECT 1 FROM partner_copies WHERE edition_date = %s", (date,)).fetchone() is not None

    def record_partner_copy(self, date: dt.date, articles: int) -> None:
        self.conn.execute("INSERT INTO partner_copies (edition_date, articles) VALUES (%s, %s) ON CONFLICT DO NOTHING",
                          (date, articles))

    def partner_report_sent(self, month: str) -> bool:
        return self.conn.execute("SELECT 1 FROM partner_reports WHERE month = %s", (month,)).fetchone() is not None

    def record_partner_report(self, month: str, articles: int, subscribers: int) -> None:
        self.conn.execute(
            "INSERT INTO partner_reports (month, articles, subscribers) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING",
            (month, articles, subscribers))

    def month_circulation(self, first: dt.date, last: dt.date) -> tuple[int, int]:
        row = self.conn.execute(
            """SELECT (SELECT count(DISTINCT user_id) FROM deliveries
                       WHERE status = 'sent' AND edition_date BETWEEN %s AND %s) AS delivered,
                      (SELECT count(*) FROM users WHERE delivery_status = 'active'
                       AND delivery_email_verified_at IS NOT NULL AND terms_accepted_at IS NOT NULL) AS active""",
            (first, last)).fetchone()
        return int(row["delivered"]), int(row["active"])


def edition_file(out_root: Path, date: dt.date, key: str, fmt: str) -> Path:
    name = f"{key}.epub" if fmt == "epub" else f"{key}_{fmt}.pdf"
    return out_root / date.isoformat() / key / name


def ensure_edition(config: Config, settings: Settings, store: Store, city: City, date: dt.date,
                   formats: set[str], http=None) -> None:
    missing = {f for f in formats if not edition_file(settings.out_root, date, city.id, f).exists()}
    if not missing:
        return
    build(config, city, date, settings.out_root, store, http=http,
          devices=[f for f in ("small", "large") if f in missing], epub="epub" in missing)


def _conversation_articles(settings: Settings, date: dt.date) -> list[dict]:
    core = settings.out_root / date.isoformat() / "core" / "core.json"
    if not core.exists():
        return []
    return [a for a in json.loads(core.read_text(encoding="utf-8"))["articles"]
            if a.get("source_name") == "The Conversation"]


class Job:
    def __init__(self, config: Config, settings: Settings, db: Db, mailer: Mailer, store: Store, http=None):
        self.http = http
        self.config = config
        self.settings = settings
        self.db = db
        self.mailer = mailer
        self.store = store
        self.report = Report()

    def _local(self, sub: Subscriber, now: dt.datetime) -> dt.datetime:
        return now.astimezone(ZoneInfo(sub.time_zone))

    def _quota_left(self, now: dt.datetime) -> int:
        day = self.settings.daily_limit - self.db.emails_since(now - dt.timedelta(days=1))
        month = self.settings.monthly_limit - self.db.emails_since(now - dt.timedelta(days=30))
        # Keep room for sign-in links, which readers need right away.
        return min(day, month) - 10

    def run(self, now: dt.datetime) -> Report:
        subs = self.db.subscribers()
        to_build: dict[tuple[str, dt.date], tuple[City, set[str]]] = {}
        to_send: list[tuple[Subscriber, dt.date]] = []
        for sub in subs:
            local = self._local(sub, now)
            if not (self.settings.prepare_hour <= local.hour < self.settings.give_up_hour):
                continue
            date = local.date()
            state = self.db.delivery(sub.id, date)
            if state and state["status"] == "sent":
                continue
            if state and state["attempts"] >= self.settings.max_attempts:
                continue
            if state and now - state["updated_at"] < self.settings.retry_gap:
                continue
            to_build.setdefault((sub.city.id, date), (sub.city, set()))[1].add(sub.format)
            if local.hour >= self.settings.send_hour:
                to_send.append((sub, date))

        built_ok: set[tuple[str, dt.date]] = set()
        for (key, date), (city, fmts) in to_build.items():
            try:
                ensure_edition(self.config, self.settings, self.store, city, date, fmts, self.http)
                built_ok.add((key, date))
            except (BuildError, OSError, ValueError) as e:
                log.error("build failed for %s %s: %s", key, date, e)
                self.report.build_errors.append(f"{date} {key}: {e}")

        for sub, date in to_send:
            if (sub.city.id, date) not in built_ok:
                continue
            if self._quota_left(now) <= 0:
                self.report.quota_hit = True
                break
            self._send(sub, date, now)

        self._partner_copies(now)
        self._monthly_report(now)
        self._prune(now)
        return self.report

    def _send(self, sub: Subscriber, date: dt.date, now: dt.datetime) -> None:
        attempts = self.db.begin(sub.id, date, sub.city.id, sub.format, now)
        if attempts is None:
            return
        path = edition_file(self.settings.out_root, date, sub.city.id, sub.format)
        ext = "epub" if sub.format == "epub" else "pdf"
        msg = Message(
            to=[sub.email],
            subject=f"{self.config.paper_name}, {date:%B} {date.day}, {date.year}",
            text=f"{self.config.paper_name} for {date:%A}, {date:%B} {date.day}. The edition is attached.\n",
            attachments=[path], attachment_names=[f"The Quiet Courier {date.isoformat()}.{ext}"],
            idempotency_key=f"edition/{sub.id}/{date.isoformat()}",
        )
        try:
            provider_id = self.mailer.send(msg)
        except (MailError, OSError) as e:
            self.db.finish(sub.id, date, False, None, str(e)[:500], now)
            self.report.failed.append(f"{date} {sub.id}: {e}")
            if attempts >= self.settings.max_attempts:
                self.report.gave_up.append(f"{date} reader {sub.id}: {e}")
            return
        self.db.finish(sub.id, date, True, provider_id, None, now)
        self.report.sent += 1

    # Promised to The Conversation: a copy of each edition that runs their articles. Every
    # edition of a date has the same stories, so one copy per date covers them all.
    def _partner_copies(self, now: dt.datetime) -> None:
        if not self.settings.partner_copy_to:
            return
        for offset in (-1, 0, 1):
            date = now.date() + dt.timedelta(days=offset)
            if self.db.partner_copy_sent(date) or not self.db.delivered_on(date):
                continue
            articles = _conversation_articles(self.settings, date)
            if not articles:
                continue
            try:
                ensure_edition(self.config, self.settings, self.store, GENERAL, date, {"large"}, self.http)
                lines = [f"Attached is The Quiet Courier for {date:%B} {date.day}, {date.year}. "
                         f"It ran {len(articles)} article{'s' if len(articles) != 1 else ''} from The Conversation:", ""]
                for a in articles:
                    lines += [f"- {a['title']}", f"  {a.get('author') or ''}, {a['source_url']}"]
                lines += ["", "Every edition that day carried the same articles. Text unedited, images omitted."]
                self.mailer.send(Message(
                    to=self.settings.partner_copy_to,
                    subject=f"The Quiet Courier, {date.isoformat()}: edition with The Conversation's articles",
                    text="\n".join(lines) + "\n",
                    attachments=[edition_file(self.settings.out_root, date, GENERAL.id, "large")],
                    attachment_names=[f"The Quiet Courier {date.isoformat()}.pdf"],
                    idempotency_key=f"partner-copy/{date.isoformat()}",
                ))
            except (BuildError, MailError, OSError) as e:
                self.report.build_errors.append(f"copy for The Conversation, {date}: {e}")
                continue
            self.db.record_partner_copy(date, len(articles))
            self.report.partner_copies.append(date.isoformat())

    def _monthly_report(self, now: dt.datetime) -> None:
        if not self.settings.partner_report_to:
            return
        first_this = now.date().replace(day=1)
        last = first_this - dt.timedelta(days=1)
        first = last.replace(day=1)
        month = first.strftime("%Y-%m")
        if self.db.partner_report_sent(month):
            return
        delivered, active = self.db.month_circulation(first, last)
        if delivered == 0:
            return
        rows = self.store.conversation_usage(first, last)
        lines = [f"The Quiet Courier, usage of The Conversation's articles in {first:%B %Y}.", "",
                 f"Readers who received at least one edition this month: {delivered}",
                 f"Active subscribers on {now.date().isoformat()}: {active}", "",
                 f"Articles republished: {len(rows)}", ""]
        for r in rows:
            lines += [f"- {r['title']}", f"  {r['source_url']}", f"  Ran on: {', '.join(r['dates'])}"]
        try:
            self.mailer.send(Message(
                to=self.settings.partner_report_to,
                subject=f"The Quiet Courier: The Conversation usage report for {first:%B %Y}",
                text="\n".join(lines) + "\n",
                idempotency_key=f"partner-report/{month}",
            ))
        except MailError as e:
            self.report.build_errors.append(f"monthly report for {month}: {e}")
            return
        self.db.record_partner_report(month, len(rows), active)
        self.report.partner_reports.append(month)

    def _prune(self, now: dt.datetime) -> None:
        cutoff = now.date() - dt.timedelta(days=self.settings.keep_days)
        root = self.settings.out_root
        if not root.exists():
            return
        for d in root.iterdir():
            try:
                day = dt.date.fromisoformat(d.name)
            except ValueError:
                continue
            if day < cutoff and d.is_dir():
                shutil.rmtree(d, ignore_errors=True)
                shutil.rmtree(root / "work" / d.name, ignore_errors=True)
                shutil.rmtree(root / "cache" / d.name, ignore_errors=True)

    def alert(self) -> None:
        r = self.report
        if not (r.needs_alert and self.settings.alert_to):
            return
        lines = ["The delivery job needs a look.", ""]
        if r.quota_hit:
            lines += ["The email quota is nearly used up, so sending stopped for this run.", ""]
        if r.gave_up:
            lines += ["Gave up after every retry:", *[f"- {x}" for x in r.gave_up], ""]
        if r.build_errors:
            lines += ["Build or partner mail errors:", *[f"- {x}" for x in r.build_errors], ""]
        lines.append(f"Sent this run: {r.sent}. Check with: journalctl -u quiet-courier-deliver")
        try:
            self.mailer.send(Message(to=self.settings.alert_to, subject="The Quiet Courier: delivery problem",
                                     text="\n".join(lines) + "\n"))
        except MailError as e:
            log.error("alert email failed: %s", e)


def run_once(config: Config, settings: Settings, now: dt.datetime | None = None,
             mailer: Mailer | None = None) -> Report | None:
    if not settings.enabled:
        log.warning("DELIVERY_ENABLED is not 1, nothing sent")
        return None
    settings.out_root.mkdir(parents=True, exist_ok=True)
    with open(settings.out_root / "deliver.lock", "w") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            log.warning("another delivery run is still going, skipping")
            return None
        db = Db.connect(settings.database_url)
        store = Store(settings.store_path)
        try:
            job = Job(config, settings, db, mailer or Mailer.from_env(settings.out_root / "outbox"), store)
            report = job.run(now or dt.datetime.now(dt.UTC))
            job.alert()
            return report
        finally:
            store.close()
            db.close()
