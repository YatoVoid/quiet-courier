"""A short economy brief from U.S. Bureau of Labor Statistics figures: jobs, unemployment, prices
and pay. Works of the U.S. government are public domain. The figures are read straight from the
official series and laid out by fixed rules, the same way the forecast is built from weather data;
nothing is written or guessed by a model.

The figures are US only, so this is a small brief, never the lead. BLS updates monthly, so the box
shows the latest release and changes once a month.
"""

import datetime as dt
import json

from ..http import FetchError
from . import LICENSES, Context, article_id

API = "https://api.bls.gov/publicAPI/v1/timeseries/data/"
UNEMPLOYMENT = "LNS14000000"        # Unemployment rate, seasonally adjusted
PARTICIPATION = "LNS11300000"       # Labor force participation rate, seasonally adjusted
PAYROLLS = "CES0000000001"          # Total nonfarm employment, thousands, seasonally adjusted
EARNINGS = "CES0500000003"          # Average hourly earnings, private, dollars, seasonally adjusted
CPI = "CUUR0000SA0"                 # Consumer Price Index, all items, not seasonally adjusted
CORE_CPI = "CUUR0000SA0L1E"         # CPI less food and energy, not seasonally adjusted
SERIES = [UNEMPLOYMENT, PARTICIPATION, PAYROLLS, EARNINGS, CPI, CORE_CPI]
ATTRIBUTION = "Figures from the U.S. Bureau of Labor Statistics. Public domain."
MONTHS = ["", "January", "February", "March", "April", "May", "June",
          "July", "August", "September", "October", "November", "December"]


def _series(payload: dict) -> dict[str, list[dict]]:
    out = {}
    for s in payload.get("Results", {}).get("series", []):
        out[s["seriesID"]] = [p for p in s["data"] if p.get("period", "").startswith("M")]
    return out


def _month(point: dict) -> str:
    return f"{MONTHS[int(point['period'][1:])]} {point['year']}"


def _pt(value: float, prev: float) -> str:
    diff = value - prev
    if abs(diff) < 0.05:
        return "unchanged"
    return f"{'up' if diff > 0 else 'down'} {abs(diff):.1f} point from {prev:.1f}% the month before"


def _yoy(series: list[dict]) -> tuple[float, dict] | None:
    now = series[0]
    year_ago = next((p for p in series if p["year"] == str(int(now["year"]) - 1)
                     and p["period"] == now["period"]), None)
    if not year_ago:
        return None
    return (float(now["value"]) / float(year_ago["value"]) - 1) * 100, now


def fetch(ctx: Context) -> list[dict]:
    year = ctx.date.year
    body = json.dumps({"seriesid": SERIES, "startyear": str(year - 1), "endyear": str(year)}).encode()
    try:
        raw = ctx.http.post(API, body)
    except (OSError, FetchError):
        return []
    data = json.loads(raw.decode("utf-8") if isinstance(raw, bytes) else raw)
    if data.get("status") != "REQUEST_SUCCEEDED":
        return []
    s = _series(data)
    unemp, part, jobs, earn, cpi, core = (s.get(k, []) for k in SERIES)
    if len(unemp) < 2 or len(jobs) < 2 or len(cpi) < 13:
        return []

    stats = []
    u_now, u_prev = float(unemp[0]["value"]), float(unemp[1]["value"])
    stats.append({"label": "Unemployment", "value": f"{u_now:.1f}%", "note": _pt(u_now, u_prev)})

    change = int(round(float(jobs[0]["value"]) - float(jobs[1]["value"]))) * 1000
    verb = "added" if change >= 0 else "cut"
    stats.append({"label": "Jobs", "value": f"{change:+,}".replace("+", "+").replace("-", "−"),
                  "note": f"nonfarm payrolls {verb} over the month"})

    if len(part) >= 2:
        p_now, p_prev = float(part[0]["value"]), float(part[1]["value"])
        stats.append({"label": "Workforce", "value": f"{p_now:.1f}%", "note": "of adults working or looking for work"})

    infl = _yoy(cpi)
    if infl:
        stats.append({"label": "Inflation", "value": f"{infl[0]:.1f}%", "note": f"consumer prices over the year to {_month(infl[1])}"})
    corei = _yoy(core) if len(core) >= 13 else None
    if corei:
        stats.append({"label": "Core inflation", "value": f"{corei[0]:.1f}%", "note": "leaving out food and fuel"})
    wages = _yoy(earn) if len(earn) >= 13 else None
    if wages:
        stats.append({"label": "Pay", "value": f"{wages[0]:.1f}%", "note": "average hourly earnings over the year"})

    lead = (f"The latest official figures. The unemployment rate stood at {u_now:.1f}% in "
            f"{_month(unemp[0])}, and consumer prices were {infl[0]:.1f}% higher than a year earlier."
            if infl else "The latest official figures on jobs and prices.")

    published = dt.date(int(unemp[0]["year"]), int(unemp[0]["period"][1:]), 1).isoformat()
    return [{
        "id": article_id("economy", published),
        "section": "economy",
        "title": "The Economy in Brief",
        "deck": None,
        "author": None,
        "author_affiliation": None,
        "source_name": "U.S. Bureau of Labor Statistics",
        "source_url": "https://www.bls.gov/",
        "published": published,
        "license": LICENSES["us-gov-pd"],
        "attribution": ATTRIBUTION,
        "changes": "Year-over-year figures computed from the published monthly series.",
        "body": [{"kind": "p", "text": lead}],
        "stats": stats,
        "images": [],
    }]
