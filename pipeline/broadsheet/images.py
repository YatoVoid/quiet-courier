# A coarse 1-bit dither survives e-ink's 16 gray levels better than smooth grayscale.

from pathlib import Path

from PIL import Image, ImageOps


def to_newsprint(src: Path, dest: Path, width_px: int, grain: int = 2) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(src) as im:
        im = ImageOps.exif_transpose(im).convert("L")
        im = ImageOps.autocontrast(im, cutoff=1)
        small_w = max(1, width_px // grain)
        small_h = max(1, round(im.height * small_w / im.width))
        im = im.resize((small_w, small_h), Image.Resampling.LANCZOS)
        im = im.convert("1", dither=Image.Dither.FLOYDSTEINBERG)
        im = im.resize((small_w * grain, small_h * grain), Image.Resampling.NEAREST)
        im.save(dest, optimize=True)
    return dest
