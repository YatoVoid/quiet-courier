import datetime as dt
import uuid

import pytest

from courier.config import load_config
from courier.delivery import Db, Job, Settings, edition_file, run_once
from courier.mail import MailError
from courier.store import Store
from fakes import FakeHttp
from pg import start_postgres

UTC = dt.UTC
# 5:05 a.m. in Chicago, 12:05 p.m. in Lyon, 7:05 p.m. in Tokyo.
MORNING_CHICAGO = dt.datetime(2026, 10, 1, 10, 5, tzinfo=UTC)
DATE = dt.date(2026, 10, 1)


class FakeMailer:
    def __init__(self):
        self.sent = []
        self.fail_for: set[str] = set()

    def send(self, m):
        if set(m.to) & self.fail_for:
            raise MailError("HTTP 500: provider down")
        self.sent.append(m)
        return f"id-{len(self.sent)}"

    def to(self, addr):
        return [m for m in self.sent if addr in m.to]


@pytest.fixture(scope="module")
def pg():
    proc, conn, url = start_postgres()
    conn.execute(
        """INSERT INTO places (id, name, ascii_name, admin1, admin1_code, country_code, country, latitude, longitude,
                               time_zone, population) VALUES
           (4887398, 'Chicago', 'Chicago', 'Illinois', 'IL', 'US', 'United States', 41.85003, -87.65005, 'America/Chicago', 2720546),
           (2996944, 'Lyon', 'Lyon', 'Auvergne-Rhône-Alpes', '84', 'FR', 'France', 45.74846, 4.84671, 'Europe/Paris', 522969)""")
    yield conn, url
    conn.close()
    proc.terminate()
    proc.wait(timeout=10)


@pytest.fixture
def conn(pg):
    conn, _ = pg
    conn.execute("TRUNCATE users, deliveries, partner_copies, partner_reports, audit_events RESTART IDENTITY CASCADE")
    return conn


def add_reader(conn, email="ada@kindle.com", fmt="small", place=4887398, tz="America/Chicago", local=True,
               status="active", verified=True):
    uid = str(uuid.uuid4())
    conn.execute(
        """INSERT INTO users (id, email, name, local_weather, place_id, time_zone, format, delivery_email,
                              delivery_email_verified_at, delivery_status, terms_version, terms_accepted_at)
           VALUES (%s, %s, 'Reader', %s, %s, %s, %s, %s, %s, %s, '2026-10-01', now())""",
        (uid, f"{uid}@example.com", local, place if local else None, tz, fmt, email,
         dt.datetime.now(UTC) if verified else None, status))
    return uid


@pytest.fixture
def job_factory(conn, tmp_path):
    store = Store(tmp_path / "courier.db")
    mailer = FakeMailer()

    def make(**overrides):
        settings = Settings(database_url="", out_root=tmp_path / "out", store_path=tmp_path / "courier.db",
                            enabled=True, **overrides)
        return Job(load_config(), settings, Db(conn), mailer, store, http=FakeHttp())

    make.mailer = mailer
    make.store = store
    make.out = tmp_path / "out"
    yield make
    store.close()


def delivery(conn, uid):
    return conn.execute("SELECT * FROM deliveries WHERE user_id = %s", (uid,)).fetchone()


def test_sends_the_readers_own_edition_at_five_and_only_once(conn, job_factory):
    uid = add_reader(conn)
    report = job_factory().run(MORNING_CHICAGO)
    assert report.sent == 1
    [m] = job_factory.mailer.to("ada@kindle.com")
    assert m.attachments == [edition_file(job_factory.out, DATE, "gn-4887398", "small")]
    assert m.attachment_names == ["The Quiet Courier 2026-10-01.pdf"]
    assert m.idempotency_key == f"edition/{uid}/2026-10-01"
    row = delivery(conn, uid)
    assert row["status"] == "sent" and row["attempts"] == 1 and row["edition_key"] == "gn-4887398"

    assert job_factory().run(MORNING_CHICAGO + dt.timedelta(hours=2)).sent == 0
    assert len(job_factory.mailer.to("ada@kindle.com")) == 1


def test_builds_ahead_at_four_and_waits_until_five(conn, job_factory):
    add_reader(conn)
    early = MORNING_CHICAGO - dt.timedelta(hours=1)
    assert job_factory().run(early - dt.timedelta(hours=1)).sent == 0
    assert not edition_file(job_factory.out, DATE, "gn-4887398", "small").exists()
    assert job_factory().run(early).sent == 0
    assert edition_file(job_factory.out, DATE, "gn-4887398", "small").exists()
    assert not edition_file(job_factory.out, DATE, "gn-4887398", "large").exists()


def test_each_reader_gets_their_own_local_date_and_format(conn, job_factory):
    add_reader(conn, "lyon@kindle.com", fmt="epub", place=2996944, tz="Europe/Paris")
    add_reader(conn, "tokyo@kindle.com", fmt="large", local=False, tz="Asia/Tokyo")
    morning_lyon = dt.datetime(2026, 10, 2, 3, 30, tzinfo=UTC)
    job_factory().run(morning_lyon)
    [lyon] = job_factory.mailer.to("lyon@kindle.com")
    assert lyon.attachments[0].name == "gn-2996944.epub" and "2026-10-02" in str(lyon.attachments[0])
    assert job_factory.mailer.to("tokyo@kindle.com") == []

    morning_tokyo = dt.datetime(2026, 10, 1, 20, 30, tzinfo=UTC)
    job_factory().run(morning_tokyo)
    [tokyo] = job_factory.mailer.to("tokyo@kindle.com")
    assert tokyo.attachments[0].name == "general_large.pdf" and "2026-10-02" in str(tokyo.attachments[0])


def test_skips_paused_and_unconfirmed_readers(conn, job_factory):
    add_reader(conn, "paused@kindle.com", status="paused")
    add_reader(conn, "new@gmail.com", verified=False)
    assert job_factory().run(MORNING_CHICAGO).sent == 0
    assert job_factory.mailer.sent == []


def test_retries_hourly_then_gives_up_and_alerts(conn, job_factory):
    uid = add_reader(conn, "broken@kindle.com")
    job_factory.mailer.fail_for = {"broken@kindle.com"}
    now = MORNING_CHICAGO
    job_factory().run(now)
    assert delivery(conn, uid)["status"] == "failed"
    job_factory().run(now + dt.timedelta(minutes=15))
    assert delivery(conn, uid)["attempts"] == 1, "waits an hour between tries"

    report = None
    for hour in range(1, 5):
        report = job_factory(alert_to=["owner@example.com"]).run(now + dt.timedelta(hours=hour))
    assert delivery(conn, uid)["attempts"] == 5
    assert report.gave_up and report.needs_alert

    job = job_factory(alert_to=["owner@example.com"])
    job.report = report
    job.alert()
    [alert] = job_factory.mailer.to("owner@example.com")
    assert "Gave up" in alert.text


def test_stops_before_the_email_quota_runs_out(conn, job_factory):
    for i in range(3):
        add_reader(conn, f"r{i}@kindle.com")
    report = job_factory(daily_limit=12).run(MORNING_CHICAGO)
    assert report.sent == 2 and report.quota_hit


def test_sends_the_conversation_one_copy_per_date_after_the_first_delivery(conn, job_factory):
    job = job_factory(partner_copy_to=["republish@example.org"])
    job.run(MORNING_CHICAGO)
    assert job_factory.mailer.to("republish@example.org") == [], "no reader got a paper yet"

    add_reader(conn)
    job_factory(partner_copy_to=["republish@example.org"]).run(MORNING_CHICAGO)
    job_factory(partner_copy_to=["republish@example.org"]).run(MORNING_CHICAGO + dt.timedelta(hours=1))
    [copy] = job_factory.mailer.to("republish@example.org")
    assert copy.attachments[0].name == "general_large.pdf"
    assert "from The Conversation" in copy.text and "theconversation.com" in copy.text
    assert copy.idempotency_key == "partner-copy/2026-10-01"


def test_monthly_usage_report_goes_out_once(conn, job_factory):
    uid = add_reader(conn)
    job_factory().run(MORNING_CHICAGO)
    first_of_november = dt.datetime(2026, 11, 1, 3, 0, tzinfo=UTC)
    job_factory(partner_report_to=["usage@example.org"]).run(first_of_november)
    job_factory(partner_report_to=["usage@example.org"]).run(first_of_november + dt.timedelta(hours=1))
    [report] = job_factory.mailer.to("usage@example.org")
    assert "October 2026" in report.subject
    assert "Readers who received at least one edition this month: 1" in report.text
    assert "Ran on: 2026-10-01" in report.text
    assert delivery(conn, uid)["status"] == "sent"


def test_does_nothing_until_delivery_is_switched_on(pg, tmp_path):
    _, url = pg
    settings = Settings(database_url=url, out_root=tmp_path, store_path=tmp_path / "c.db", enabled=False)
    assert run_once(load_config(), settings) is None
