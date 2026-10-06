import datetime as dt
import json
import uuid

import pytest

from courier.config import load_config
from courier.delivery import Db, Job, Settings, edition_file, run_once
from courier.links import check_in_token, read_link
from courier.mail import MailError
from courier.store import Store
from fakes import FakeHttp
from pg import start_postgres

UTC = dt.UTC
# 5:05 a.m. in Chicago, 12:05 p.m. in Lyon, 7:05 p.m. in Tokyo.
MORNING_CHICAGO = dt.datetime(2026, 10, 1, 10, 5, tzinfo=UTC)
DATE = dt.date(2026, 10, 1)
SECRET = "development-only-read-link-secret-not-for-production"


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
               status="active", verified=True, method="email"):
    uid = str(uuid.uuid4())
    conn.execute(
        """INSERT INTO users (id, email, name, local_weather, place_id, time_zone, format, delivery_email,
                              delivery_email_verified_at, delivery_status, delivery_method, terms_version, terms_accepted_at)
           VALUES (%s, %s, 'Reader', %s, %s, %s, %s, %s, %s, %s, %s, '2026-10-01', now())""",
        (uid, f"{uid}@example.com", local, place if local else None, tz, fmt, email,
         dt.datetime.now(UTC) if verified else None, status, method))
    return uid


@pytest.fixture
def job_factory(conn, tmp_path):
    store = Store(tmp_path / "courier.db")
    mailer = FakeMailer()

    def make(fail=frozenset(), **overrides):
        overrides.setdefault("link_secret", SECRET)
        settings = Settings(database_url="", out_root=tmp_path / "out", store_path=tmp_path / "courier.db",
                            enabled=True, **overrides)
        return Job(load_config(), settings, Db(conn), mailer, store, http=FakeHttp(fail=fail))

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


def test_download_reader_gets_the_edition_ready_without_any_email(conn, job_factory):
    uid = add_reader(conn, email=None, verified=False, fmt="epub", method="download")
    assert job_factory().run(MORNING_CHICAGO - dt.timedelta(hours=1)).ready == 0
    assert delivery(conn, uid) is None
    report = job_factory(billing=True).run(MORNING_CHICAGO)
    assert report.ready == 1 and report.sent == 0 and job_factory.mailer.sent == []
    row = delivery(conn, uid)
    assert row["status"] == "sent" and row["provider_id"] is None and row["format"] == "epub"
    assert edition_file(job_factory.out, DATE, "gn-4887398", "epub").exists()
    trial = conn.execute("SELECT trial_ends_at FROM users WHERE id = %s", (uid,)).fetchone()["trial_ends_at"]
    assert trial == MORNING_CHICAGO + dt.timedelta(days=14)
    assert job_factory().run(MORNING_CHICAGO + dt.timedelta(hours=1)).ready == 0


def test_download_reader_who_changes_format_after_five_gets_it_the_same_morning(conn, job_factory):
    uid = add_reader(conn, email=None, verified=False, fmt="epub", method="download")
    job_factory().run(MORNING_CHICAGO)
    assert delivery(conn, uid)["format"] == "epub"
    conn.execute("UPDATE users SET format = 'small' WHERE id = %s", (uid,))
    report = job_factory().run(MORNING_CHICAGO + dt.timedelta(hours=7))
    row = delivery(conn, uid)
    assert row["format"] == "small" and row["edition_key"] == "gn-4887398" and row["error"] is None
    assert edition_file(job_factory.out, DATE, "gn-4887398", "small").exists()
    assert report.ready == 0 and job_factory.mailer.sent == []


def test_email_reader_who_changes_format_after_five_waits_for_tomorrow(conn, job_factory):
    uid = add_reader(conn)
    job_factory().run(MORNING_CHICAGO)
    conn.execute("UPDATE users SET format = 'epub' WHERE id = %s", (uid,))
    job_factory().run(MORNING_CHICAGO + dt.timedelta(hours=1))
    assert delivery(conn, uid)["format"] == "small"
    assert len(job_factory.mailer.to("ada@kindle.com")) == 1


def test_a_reader_who_signs_up_in_the_afternoon_gets_todays_paper(conn, job_factory):
    afternoon = MORNING_CHICAGO + dt.timedelta(hours=9)
    mail = add_reader(conn)
    link = add_reader(conn, email=None, verified=False, method="download")
    report = job_factory().run(afternoon)
    assert report.sent == 1 and report.ready == 1
    assert delivery(conn, mail)["edition_date"] == DATE and delivery(conn, link)["status"] == "sent"


def test_after_ten_a_reader_with_earlier_papers_waits_for_tomorrow(conn, job_factory):
    uid = add_reader(conn)
    conn.execute(
        """INSERT INTO deliveries (user_id, edition_date, edition_key, format, status, attempts, sent_at, created_at, updated_at)
           VALUES (%s, %s, 'gn-4887398', 'small', 'sent', 1, now(), now(), now())""", (uid, DATE - dt.timedelta(days=1)))
    assert job_factory().run(MORNING_CHICAGO + dt.timedelta(hours=9)).sent == 0
    assert job_factory.mailer.to("ada@kindle.com") == []


def test_download_readers_do_not_use_the_email_quota(conn, job_factory):
    add_reader(conn)
    uid = add_reader(conn, email=None, verified=False, method="download")
    report = job_factory(daily_limit=5).run(MORNING_CHICAGO)
    assert report.quota_hit and report.sent == 0 and report.ready == 1
    assert delivery(conn, uid)["status"] == "sent"


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
    morning_tokyo = dt.datetime(2026, 10, 1, 20, 30, tzinfo=UTC)
    job_factory().run(morning_tokyo)
    [tokyo] = job_factory.mailer.to("tokyo@kindle.com")
    assert tokyo.attachments[0].name == "general_large.pdf" and "2026-10-02" in str(tokyo.attachments[0])
    [first] = job_factory.mailer.to("lyon@kindle.com")
    assert "2026-10-01" in str(first.attachments[0])

    morning_lyon = dt.datetime(2026, 10, 2, 3, 30, tzinfo=UTC)
    job_factory().run(morning_lyon)
    [_, lyon] = job_factory.mailer.to("lyon@kindle.com")
    assert lyon.attachments[0].name == "gn-2996944.epub" and "2026-10-02" in str(lyon.attachments[0])
    assert len(job_factory.mailer.to("tokyo@kindle.com")) == 1


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


def set_billing(conn, uid, trial_ends=None, status=None):
    conn.execute("UPDATE users SET trial_ends_at = %s, subscription_status = %s WHERE id = %s", (trial_ends, status, uid))


def trial_end(conn, uid):
    return conn.execute("SELECT trial_ends_at FROM users WHERE id = %s", (uid,)).fetchone()["trial_ends_at"]


def test_without_billing_an_ended_trial_changes_nothing(conn, job_factory):
    uid = add_reader(conn)
    set_billing(conn, uid, trial_ends=MORNING_CHICAGO - dt.timedelta(days=1))
    assert job_factory().run(MORNING_CHICAGO).sent == 1
    assert trial_end(conn, uid) == MORNING_CHICAGO - dt.timedelta(days=1)


def test_the_first_paper_starts_the_trial_and_later_ones_keep_it(conn, job_factory):
    uid = add_reader(conn)
    assert job_factory(billing=True).run(MORNING_CHICAGO).sent == 1
    assert trial_end(conn, uid) == MORNING_CHICAGO + dt.timedelta(days=14)
    assert job_factory(billing=True).run(MORNING_CHICAGO + dt.timedelta(days=1)).sent == 1
    assert trial_end(conn, uid) == MORNING_CHICAGO + dt.timedelta(days=14)


@pytest.mark.parametrize("status,gets_paper", [
    (None, False), ("canceled", False), ("unpaid", False), ("incomplete", False),
    ("active", True), ("trialing", True), ("past_due", True),
])
def test_after_the_trial_only_a_current_subscription_gets_the_paper(conn, job_factory, status, gets_paper):
    uid = add_reader(conn)
    set_billing(conn, uid, trial_ends=MORNING_CHICAGO - dt.timedelta(minutes=1), status=status)
    assert job_factory(billing=True).run(MORNING_CHICAGO).sent == (1 if gets_paper else 0)


def test_circulation_counts_only_entitled_readers_when_billing_is_on(conn):
    paid, lapsed = add_reader(conn), add_reader(conn, "b@kindle.com")
    set_billing(conn, paid, trial_ends=MORNING_CHICAGO - dt.timedelta(days=1), status="active")
    set_billing(conn, lapsed, trial_ends=MORNING_CHICAGO - dt.timedelta(days=1))
    db = Db(conn)
    assert db.month_circulation(DATE, DATE, MORNING_CHICAGO, billing=False)[1] == 2
    assert db.month_circulation(DATE, DATE, MORNING_CHICAGO, billing=True)[1] == 1


def test_reminds_once_before_the_trial_ends_and_never_a_subscriber(conn, job_factory):
    ending = add_reader(conn, "ending@kindle.com")
    subscribed = add_reader(conn, "subscribed@kindle.com")
    later = add_reader(conn, "later@kindle.com")
    set_billing(conn, ending, trial_ends=MORNING_CHICAGO + dt.timedelta(days=2))
    set_billing(conn, subscribed, trial_ends=MORNING_CHICAGO + dt.timedelta(days=2), status="trialing")
    set_billing(conn, later, trial_ends=MORNING_CHICAGO + dt.timedelta(days=10))
    emails = {r["id"]: r["email"] for r in conn.execute("SELECT id::text AS id, email FROM users").fetchall()}

    job_factory(billing=True).run(MORNING_CHICAGO)
    job_factory(billing=True).run(MORNING_CHICAGO + dt.timedelta(hours=1))
    reminders = [m for m in job_factory.mailer.sent if m.subject.startswith("Your free trial ends")]
    assert [m.to for m in reminders] == [[emails[ending]]]
    assert reminders[0].subject == "Your free trial ends Saturday, October 3"
    assert "https://quietcourier.com/subscribe" in reminders[0].text
    assert "won't be charged" in reminders[0].text


def test_no_reminders_without_billing(conn, job_factory):
    uid = add_reader(conn)
    set_billing(conn, uid, trial_ends=MORNING_CHICAGO + dt.timedelta(days=2))
    job_factory().run(MORNING_CHICAGO)
    assert not [m for m in job_factory.mailer.sent if m.subject.startswith("Your free trial ends")]


def test_a_missing_brief_is_left_out_and_reported_once(conn, job_factory):
    chicago = add_reader(conn, "chi@kindle.com")
    general = add_reader(conn, "general@kindle.com", local=False)
    report = job_factory(fail={"current_events"}, alert_to=["owner@example.com"]).run(MORNING_CHICAGO)
    assert delivery(conn, chicago)["status"] == "sent", "the paper still goes out"
    assert delivery(conn, general)["status"] == "sent"
    edition = json.loads((job_factory.out / DATE.isoformat() / "gn-4887398" / "edition.json").read_text())
    assert edition["brief"] is None
    assert len([m for m in report.missing if "The World in Brief" in m]) == 1, "two editions built, one report"
    assert "simulated outage" in report.missing[0]
    assert report.needs_alert and not report.failed_run

    job = job_factory(alert_to=["owner@example.com"])
    job.report = report
    job.alert()
    [alert] = job_factory.mailer.to("owner@example.com")
    assert alert.subject == "The Quiet Courier: part of today's paper was missing"
    assert "Left out of today's paper" in alert.text and "The World in Brief" in alert.text



def test_a_complete_paper_reports_nothing_missing(conn, job_factory):
    add_reader(conn, "full@kindle.com")
    report = job_factory(alert_to=["owner@example.com"]).run(MORNING_CHICAGO)
    assert report.sent == 1 and report.missing == [] and not report.needs_alert


def add_signup(conn, age, finished=False, delivery=None, verified=False, method="email", status="active"):
    uid = str(uuid.uuid4())
    created = MORNING_CHICAGO - age
    conn.execute(
        """INSERT INTO users (id, email, created_at, time_zone, format, delivery_email, delivery_email_verified_at,
                              delivery_method, delivery_status, terms_version, terms_accepted_at)
           VALUES (%s, %s, %s, %s, 'small', %s, %s, %s, %s, %s, %s)""",
        (uid, f"{uid}@example.com", created, "America/Chicago" if finished else None, delivery,
         created if verified else None, method, status, "1" if finished else None, created if finished else None))
    return uid


def test_one_setup_reminder_a_day_after_signing_up(conn, job_factory):
    stuck = add_signup(conn, dt.timedelta(days=2))
    unconfirmed = add_signup(conn, dt.timedelta(days=2), finished=True, delivery="me@gmail.com")
    add_signup(conn, dt.timedelta(hours=12))
    add_signup(conn, dt.timedelta(days=10))
    add_signup(conn, dt.timedelta(days=2), finished=True, delivery="ok@kindle.com", verified=True)
    add_signup(conn, dt.timedelta(days=2), finished=True, method="download")
    add_signup(conn, dt.timedelta(days=2), status="paused")

    job_factory().run(MORNING_CHICAGO)
    [first] = job_factory.mailer.to(f"{stuck}@example.com")
    assert "/welcome" in first.text and "only reminder" in first.text
    assert first.idempotency_key == f"setup-reminder/{stuck}"
    [second] = job_factory.mailer.to(f"{unconfirmed}@example.com")
    assert second.subject == "Confirm where to send your paper" and "me@gmail.com" in second.text
    assert len([m for m in job_factory.mailer.sent if m.idempotency_key.startswith("setup-reminder/")]) == 2

    job_factory().run(MORNING_CHICAGO + dt.timedelta(days=1))
    reminders = [m for m in job_factory.mailer.sent if m.idempotency_key.startswith("setup-reminder/")]
    assert len(reminders) == 3 and reminders[-1].subject == "Finish setting up your paper"


def test_download_deliveries_do_not_count_against_the_email_quota(conn, job_factory):
    for _ in range(3):
        add_reader(conn, email=None, verified=False, method="download")
    job = job_factory(daily_limit=12)
    job.run(MORNING_CHICAGO)
    assert job._quota_left(MORNING_CHICAGO) == 2


def test_general_edition_is_built_every_morning_for_the_public_sample(conn, job_factory):
    # 10:05 UTC is 6:05 a.m. in New York.
    job_factory().run(MORNING_CHICAGO)
    for fmt in ("small", "large", "epub"):
        assert edition_file(job_factory.out, DATE, "general", fmt).exists()
    assert job_factory.mailer.sent == []


def account(uid):
    return f"{uid}@example.com"


def today(conn, uid):
    return conn.execute("SELECT * FROM deliveries WHERE user_id = %s AND edition_date = %s", (uid, DATE)).fetchone()


def test_asks_once_on_the_third_day_whether_the_paper_arrives(conn, job_factory):
    uid = add_reader(conn)
    job_factory().run(MORNING_CHICAGO)
    assert job_factory.mailer.to(account(uid)) == []

    day_two_noon = MORNING_CHICAGO + dt.timedelta(days=1, hours=7)
    job_factory().run(day_two_noon)
    assert job_factory.mailer.to(account(uid)) == [], "waits two full days"

    day_three_ten = MORNING_CHICAGO + dt.timedelta(days=2, hours=5)
    report = job_factory().run(day_three_ten)
    [m] = job_factory.mailer.to(account(uid))
    assert report.check_ins == 1 and m.subject == "Is your paper arriving?"
    token = check_in_token(SECRET, uid)
    assert f"https://quietcourier.com/check-in?answer=yes#{token}" in m.text
    assert f"https://quietcourier.com/check-in?answer=no#{token}" in m.text
    assert "edition@quietcourier.com" in m.text and "ada@kindle.com" in m.text
    assert m.idempotency_key == f"check-in/{uid}"

    job_factory().run(day_three_ten + dt.timedelta(hours=1))
    job_factory().run(day_three_ten + dt.timedelta(days=1))
    assert len(job_factory.mailer.to(account(uid))) == 1


def test_check_in_waits_for_the_readers_daytime(conn, job_factory):
    uid = add_reader(conn)
    job_factory().run(MORNING_CHICAGO)
    day_three_six_am = MORNING_CHICAGO + dt.timedelta(days=2, hours=1)
    job_factory().run(day_three_six_am)
    assert [m for m in job_factory.mailer.to(account(uid)) if "arriving" in m.subject] == []
    job_factory().run(day_three_six_am + dt.timedelta(hours=3))
    assert len([m for m in job_factory.mailer.to(account(uid)) if "arriving" in m.subject]) == 1


def test_no_check_in_for_download_readers_old_readers_or_without_the_secret(conn, job_factory):
    link = add_reader(conn, email=None, verified=False, method="download")
    old = add_reader(conn, "old@kindle.com")
    conn.execute(
        """INSERT INTO deliveries (user_id, edition_date, edition_key, format, status, attempts, provider_id, sent_at, created_at, updated_at)
           VALUES (%s, %s, 'gn-4887398', 'small', 'sent', 1, 'id-old', %s, now(), now())""",
        (old, DATE - dt.timedelta(days=10), MORNING_CHICAGO - dt.timedelta(days=10)))
    fresh = add_reader(conn, "fresh@kindle.com")
    job_factory(link_secret=None).run(MORNING_CHICAGO)
    report = job_factory(link_secret=None).run(MORNING_CHICAGO + dt.timedelta(days=2, hours=5))
    assert report.check_ins == 0
    report = job_factory().run(MORNING_CHICAGO + dt.timedelta(days=2, hours=6))
    assert report.check_ins == 1
    assert job_factory.mailer.to(account(link)) == [] and job_factory.mailer.to(account(old)) == []
    assert len(job_factory.mailer.to(account(fresh))) == 1


def test_a_failed_paper_is_sent_as_a_download_link_once_retries_are_used_up(conn, job_factory):
    uid = add_reader(conn, "broken@kindle.com")
    job_factory.mailer.fail_for = {"broken@kindle.com"}
    for hour in range(4):
        job_factory().run(MORNING_CHICAGO + dt.timedelta(hours=hour))
    assert delivery(conn, uid)["attempts"] == 4
    assert job_factory.mailer.to(account(uid)) == [], "no backup while a retry is still coming"

    report = job_factory().run(MORNING_CHICAGO + dt.timedelta(hours=4))
    assert delivery(conn, uid)["attempts"] == 5 and report.backups == 1
    [m] = job_factory.mailer.to(account(uid))
    assert m.subject == "Your paper for Thursday, October 1 couldn't be delivered"
    assert read_link("https://quietcourier.com", SECRET, uid, 1) in m.text
    assert "broken@kindle.com" in m.text
    assert m.idempotency_key == f"backup/{uid}/2026-10-01"
    assert delivery(conn, uid)["backup_sent_at"] is not None

    job_factory().run(MORNING_CHICAGO + dt.timedelta(hours=7))
    assert len(job_factory.mailer.to(account(uid))) == 1


def test_backup_link_also_goes_out_when_the_retry_window_closes_early(conn, job_factory):
    uid = add_reader(conn, "broken@kindle.com")
    conn.execute(
        """INSERT INTO deliveries (user_id, edition_date, edition_key, format, status, attempts, provider_id, sent_at, created_at, updated_at)
           VALUES (%s, %s, 'gn-4887398', 'small', 'sent', 1, 'id-0', %s, now(), now())""",
        (uid, DATE - dt.timedelta(days=1), MORNING_CHICAGO - dt.timedelta(days=1)))
    job_factory.mailer.fail_for = {"broken@kindle.com"}
    job_factory().run(MORNING_CHICAGO + dt.timedelta(hours=3, minutes=55))
    job_factory().run(MORNING_CHICAGO + dt.timedelta(hours=4, minutes=50))
    assert today(conn, uid)["attempts"] == 2
    job_factory().run(MORNING_CHICAGO + dt.timedelta(hours=5, minutes=50))
    assert job_factory.mailer.to(account(uid)) == []
    report = job_factory().run(MORNING_CHICAGO + dt.timedelta(hours=6, minutes=50))
    assert today(conn, uid)["attempts"] == 2 and report.backups == 1
    assert len(job_factory.mailer.to(account(uid))) == 1


def test_no_backup_link_for_a_paper_that_got_through_on_a_retry(conn, job_factory):
    uid = add_reader(conn, "flaky@kindle.com")
    job_factory.mailer.fail_for = {"flaky@kindle.com"}
    job_factory().run(MORNING_CHICAGO)
    job_factory.mailer.fail_for = set()
    job_factory().run(MORNING_CHICAGO + dt.timedelta(hours=1))
    assert delivery(conn, uid)["status"] == "sent"
    job_factory().run(MORNING_CHICAGO + dt.timedelta(hours=5))
    assert job_factory.mailer.to(account(uid)) == []
