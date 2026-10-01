from . import LICENSES, Context


def fetch(ctx: Context) -> dict:
    loc = ctx.city.location
    point = ctx.http.json(f"https://api.weather.gov/points/{loc.lat:.4f},{loc.lon:.4f}")["properties"]
    forecast = ctx.http.json(point["forecast"])["properties"]
    office = point.get("cwa", "")
    rel = point.get("relativeLocation", {}).get("properties", {})
    return {
        "city": f"{loc.name}, {rel.get('state', loc.region)}",
        "office": f"National Weather Service office {office}".strip(),
        "generated": forecast.get("generatedAt"),
        "source_url": f"https://forecast.weather.gov/MapClick.php?lat={loc.lat}&lon={loc.lon}",
        "license": LICENSES["us-gov-pd"],
        "attribution": "Forecast from the National Weather Service. Public domain.",
        "periods": [
            {"name": p["name"], "temperature": p["temperature"], "unit": p["temperatureUnit"],
             "is_daytime": p["isDaytime"], "short": p["shortForecast"], "detail": p["detailedForecast"]}
            for p in forecast["periods"][:8]
        ],
    }
