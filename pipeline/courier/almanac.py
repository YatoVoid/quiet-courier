import datetime as dt
from dataclasses import dataclass
from zoneinfo import ZoneInfo

from astral import LocationInfo, moon
from astral.sun import sun

from .models import Location

_PHASES = [
    (1.0, "New Moon"), (6.4, "Waxing Crescent"), (8.4, "First Quarter"), (13.0, "Waxing Gibbous"),
    (15.0, "Full Moon"), (20.4, "Waning Gibbous"), (22.4, "Last Quarter"), (27.0, "Waning Crescent"),
    (28.0, "New Moon"),
]


@dataclass(frozen=True)
class Almanac:
    sunrise: dt.datetime | None
    sunset: dt.datetime | None
    daylight: dt.timedelta | None
    moon_age_days: float
    moon_phase: str
    moonrise: dt.datetime | None
    moonset: dt.datetime | None
    day_of_year: int
    days_remaining: int


def moon_phase_name(age_days: float) -> str:
    for limit, name in _PHASES:
        if age_days < limit:
            return name
    return "New Moon"


def compute(location: Location | None, date: dt.date) -> Almanac:
    year_days = 366 if (date.year % 4 == 0 and date.year % 100 != 0) or date.year % 400 == 0 else 365
    doy = date.timetuple().tm_yday
    age = moon.phase(date)
    if location is None:
        return Almanac(None, None, None, age, moon_phase_name(age), None, None, doy, year_days - doy)

    tz = ZoneInfo(location.tz)
    info = LocationInfo(location.name, location.region, location.tz, location.lat, location.lon)
    try:
        s = sun(info.observer, date=date, tzinfo=tz)
    except ValueError:  # polar day or night: the sun doesn't rise or set
        s = None

    def safe(fn):
        try:
            return fn(info.observer, date, tzinfo=tz)
        except ValueError:  # astral raises when the moon does not rise or set that day
            return None

    return Almanac(
        sunrise=s and s["sunrise"], sunset=s and s["sunset"], daylight=s and s["sunset"] - s["sunrise"],
        moon_age_days=age, moon_phase=moon_phase_name(age),
        moonrise=safe(moon.moonrise), moonset=safe(moon.moonset),
        day_of_year=doy, days_remaining=year_days - doy,
    )
