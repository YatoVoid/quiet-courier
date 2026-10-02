import datetime as dt

from courier import almanac
from courier.models import Location


def test_kansas_city_october(edition):
    alm = almanac.compute(edition.location, dt.date(2026, 10, 1))
    assert alm.sunrise.hour == 7 and alm.sunset.hour == 19
    assert alm.sunrise.utcoffset() == dt.timedelta(hours=-5)
    assert alm.day_of_year == 274 and alm.days_remaining == 91


def test_phase_names():
    assert almanac.moon_phase_name(0.2) == "New Moon"
    assert almanac.moon_phase_name(14) == "Full Moon"
    assert almanac.moon_phase_name(27.5) == "New Moon"


def test_general_edition_has_moon_and_calendar_only():
    alm = almanac.compute(None, dt.date(2026, 10, 1))
    assert alm.sunrise is None and alm.daylight is None
    assert alm.moon_phase and alm.day_of_year == 274


def test_polar_night_has_no_sunrise():
    tromso = Location("Tromsø", "Norway", 69.6496, 18.9560, "Europe/Oslo", "NO")
    alm = almanac.compute(tromso, dt.date(2026, 12, 21))
    assert alm.sunrise is None and alm.sunset is None
