from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from .layout import FONTS_DIR
from .models import Edition

# Amazon's recommended cover shape (1:1.6); Send to Kindle uses it as the library thumbnail.
W, H = 1600, 2560
PAPER, INK = 244, 20
NAMEPLATE = "UnifrakturMaguntia-Book.ttf"
FELL = "IMFePIrm28P.ttf"
FELL_ITALIC = "IMFePIit28P.ttf"
FELL_SC = "IMFeENsc28P.ttf"


def _font(name: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONTS_DIR / name), size)


def _fit(draw: ImageDraw.ImageDraw, text: str, name: str, width: int, size: int) -> ImageFont.FreeTypeFont:
    while size > 20 and draw.textlength(text, font=_font(name, size)) > width:
        size -= 4
    return _font(name, size)


def _wrap(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, width: int) -> list[str]:
    lines, line = [], ""
    for word in text.split():
        trial = f"{line} {word}".strip()
        if line and draw.textlength(trial, font=font) > width:
            lines.append(line)
            line = word
        else:
            line = trial
    return lines + [line] if line else lines


def _double_rule(draw: ImageDraw.ImageDraw, y: int, margin: int = 110) -> int:
    draw.rectangle((margin, y, W - margin, y + 10), fill=INK)
    draw.rectangle((margin, y + 22, W - margin, y + 26), fill=INK)
    return y + 26


def _headline(draw: ImageDraw.ImageDraw, y: int, text: str, max_lines: int = 4, size: int = 74) -> None:
    width = W - 300
    font = _font(FELL_ITALIC, size)
    lines = _wrap(draw, text, font, width)
    while len(lines) > max_lines and size > 44:
        size -= 6
        font = _font(FELL_ITALIC, size)
        lines = _wrap(draw, text, font, width)
    if len(lines) > max_lines:
        lines = lines[:max_lines]
        while lines[-1] and draw.textlength(lines[-1] + "…", font=font) > width:
            lines[-1] = lines[-1].rsplit(" ", 1)[0] if " " in lines[-1] else lines[-1][:-1]
        lines[-1] += "…"
    for line in lines:
        draw.text((W / 2, y), line, font=font, fill=INK, anchor="ma")
        y += int(size * 1.18)


def draw_cover(edition: Edition) -> Image.Image:
    """The date fills the cover, so a library of issues reads as a stack of different days."""
    img = Image.new("L", (W, H), PAPER)
    d = ImageDraw.Draw(img)
    mid = W / 2
    d.text((mid, 170), edition.paper_name, font=_fit(d, edition.paper_name, NAMEPLATE, W - 220, 200),
           fill=INK, anchor="ma")
    y = _double_rule(d, 420)
    date = edition.date
    weekday = f"{date:%A}".upper()
    d.text((mid, y + 230), weekday, font=_fit(d, weekday, FELL_SC, W - 400, 120), fill=INK, anchor="ms")
    d.text((mid, y + 500), f"{date:%B}", font=_fit(d, f"{date:%B}", FELL, W - 300, 260), fill=INK, anchor="ms")
    d.text((mid, y + 910), str(date.day), font=_fit(d, str(date.day), FELL, W - 300, 700), fill=INK, anchor="mm")
    d.text((mid, y + 1360), str(date.year), font=_font(FELL_SC, 110), fill=INK, anchor="ms")
    y = _double_rule(d, y + 1440) + 80
    _headline(d, y, edition.lead.title)
    return img


def write_cover(edition: Edition, out_path: Path) -> Path:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    draw_cover(edition).save(out_path, "JPEG", quality=88)
    return out_path
