"""Forecasts for anywhere in the world from MET Norway (api.met.no), CC BY 4.0.

MET gives hourly numbers, not prose. They are grouped into day (06-18) and night
(18-06) periods in local time, and each period is described from MET's own weather
symbol, temperature, wind and precipitation, so nothing is invented.
"""

import datetime as dt
import math
from zoneinfo import ZoneInfo

from . import LICENSES, Context

URL = "https://api.met.no/weatherapi/locationforecast/2.0/compact?lat={lat:.4f}&lon={lon:.4f}"
IMPERIAL_COUNTRIES = {"US", "LR", "MM"}
PERIODS = 8

_PLAIN = {
    "clearsky": ("Sunny", "Clear"),
    "fair": ("Mostly sunny", "Mostly clear"),
    "partlycloudy": ("Partly cloudy", "Partly cloudy"),
    "cloudy": ("Cloudy", "Cloudy"),
    "fog": ("Fog", "Fog"),
}
_COMPASS = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"]


def describe(symbol: str) -> str:
    base, _, variant = symbol.partition("_")
    if base in _PLAIN:
        day, night = _PLAIN[base]
        return night if variant == "night" else day
    # MET's own list spells two codes "lightssleet..." and "lightssnow...".
    base = base.replace("lightss", "lights")
    intensity = ""
    for prefix in ("light", "heavy"):
        if base.startswith(prefix):
            intensity, base = prefix, base[len(prefix):]
    thunder = base.endswith("andthunder")
    base = base.removesuffix("andthunder")
    showers = base.endswith("showers")
    kind = base.removesuffix("showers")
    if kind not in ("rain", "sleet", "snow"):
        return "Unsettled"
    words = [w for w in (intensity, kind, "showers" if showers else "") if w]
    text = " ".join(words)
    if thunder:
        text += " and thunderstorms"
    return text[0].upper() + text[1:]


def _compass(degrees: float) -> str:
    return _COMPASS[int((degrees % 360) / 45 + 0.5) % 8]


def _periods(timeseries: list[dict], tz: ZoneInfo, start: dt.date) -> list[dict]:
    points = []
    for entry in timeseries:
        t = dt.datetime.fromisoformat(entry["time"].replace("Z", "+00:00")).astimezone(tz)
        points.append((t, entry["data"]))
    out = []
    day = start
    while len(out) < PERIODS and day <= start + dt.timedelta(days=PERIODS):
        for is_day in (True, False):
            begin = dt.datetime.combine(day, dt.time(6 if is_day else 18), tz)
            end = begin + dt.timedelta(hours=12)
            inside = [(t, d) for t, d in points if begin <= t < end]
            if not inside:
                continue
            temps = [d["instant"]["details"]["air_temperature"] for _, d in inside]
            symbol = next((d[k]["summary"]["symbol_code"] for _, d in inside for k in ("next_12_hours", "next_6_hours")
                           if k in d), None)
            if symbol is None:
                continue
            windiest = max(inside, key=lambda p: p[1]["instant"]["details"].get("wind_speed", 0))[1]["instant"]["details"]
            precip, covered = 0.0, begin
            for t, d in inside:
                if t < covered:
                    continue
                if "next_1_hours" in d:
                    precip += d["next_1_hours"]["details"].get("precipitation_amount", 0.0)
                    covered = t + dt.timedelta(hours=1)
                elif "next_6_hours" in d:
                    precip += d["next_6_hours"]["details"].get("precipitation_amount", 0.0)
                    covered = t + dt.timedelta(hours=6)
            if day == start:
                name = "Today" if is_day else "Tonight"
            else:
                name = day.strftime("%A") + ("" if is_day else " Night")
            out.append({
                "name": name, "is_daytime": is_day,
                "celsius": max(temps) if is_day else min(temps),
                "symbol": symbol, "wind_ms": windiest.get("wind_speed", 0.0),
                "wind_from": windiest.get("wind_from_direction", 0.0), "precip_mm": precip,
            })
        day += dt.timedelta(days=1)
    return out[:PERIODS]


def _render(p: dict, imperial: bool) -> dict:
    short = describe(p["symbol"])
    if imperial:
        temp, unit = round(p["celsius"] * 9 / 5 + 32), "F"
        wind = f"{round(p['wind_ms'] * 2.237)} mph"
        precip = f"{p['precip_mm'] / 25.4:.1f} inches" if p["precip_mm"] >= 2.5 else ""
    else:
        temp, unit = round(p["celsius"]), "C"
        wind = f"{round(p['wind_ms'] * 3.6)} km/h"
        precip = f"{math.ceil(p['precip_mm'])} mm" if p["precip_mm"] >= 1 else ""
    sentences = [f"{short}.", f"{'High' if p['is_daytime'] else 'Low'} near {temp}°{unit}."]
    if p["wind_ms"] >= 3:
        sentences.append(f"Wind from the {_compass(p['wind_from'])}, up to {wind}.")
    if precip:
        sentences.append(f"Precipitation around {precip}.")
    return {"name": p["name"], "temperature": temp, "unit": unit, "is_daytime": p["is_daytime"],
            "short": short, "detail": " ".join(sentences)}


def fetch(ctx: Context) -> dict:
    loc = ctx.city.location
    url = URL.format(lat=math.trunc(loc.lat * 10000) / 10000, lon=math.trunc(loc.lon * 10000) / 10000)
    data = ctx.http.json(url)
    periods = _periods(data["properties"]["timeseries"], ZoneInfo(loc.tz), ctx.date)
    if len(periods) < 2:
        raise ValueError(f"forecast for {loc.name} covers fewer than two periods")
    imperial = loc.country in IMPERIAL_COUNTRIES
    return {
        "city": f"{loc.name}, {loc.region}",
        "office": "Norwegian Meteorological Institute",
        "generated": data["properties"]["meta"].get("updated_at"),
        "source_url": url,
        "license": LICENSES["cc-by-4.0"],
        "attribution": "Forecast data from MET Norway, CC BY 4.0. Hourly figures grouped into day and night periods.",
        "periods": [_render(p, imperial) for p in periods],
    }
