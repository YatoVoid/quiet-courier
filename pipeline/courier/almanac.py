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
    sunrise: dt.datetime
    sunset: dt.datetime
    daylight: dt.timedelta
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


def compute(location: Location, date: dt.date) -> Almanac:
    tz = ZoneInfo(location.tz)
    info = LocationInfo(location.name, location.region, location.tz, location.lat, location.lon)
    s = sun(info.observer, date=date, tzinfo=tz)
    age = moon.phase(date)

    def safe(fn):
        try:
            return fn(info.observer, date, tzinfo=tz)
        except ValueError:  # astral raises when the moon does not rise or set that day
            return None

    year_days = 366 if (date.year % 4 == 0 and date.year % 100 != 0) or date.year % 400 == 0 else 365
    doy = date.timetuple().tm_yday
    return Almanac(
        sunrise=s["sunrise"], sunset=s["sunset"], daylight=s["sunset"] - s["sunrise"],
        moon_age_days=age, moon_phase=moon_phase_name(age),
        moonrise=safe(moon.moonrise), moonset=safe(moon.moonset),
        day_of_year=doy, days_remaining=year_days - doy,
    )
