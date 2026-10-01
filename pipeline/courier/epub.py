from __future__ import annotations

import uuid
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape

from . import almanac
from .images import to_newsprint
from .layout import FONTS_DIR, TEMPLATES_DIR, jinja_env, long_date, word_search
from .models import Edition
from .devices import SMALL

EPUB_FONTS = ["UnifrakturMaguntia-Book.ttf", "OldStandard-Regular.ttf", "OldStandard-Italic.ttf", "OldStandard-Bold.ttf"]
IMAGE_WIDTH_PX = 600


def _chapters(edition: Edition, images: dict) -> list[tuple[str, str, str]]:
    env = jinja_env()
    tpl = env.get_template("epub/chapter.xhtml.j2")
    all_front = len(edition.secondary_ids)
    base = dict(
        e=edition, images=images, date_long=long_date(edition.date),
        today=edition.weather.periods[0], next_period=edition.weather.periods[1],
        ws=word_search(edition, SMALL), alm=almanac.compute(edition.location, edition.date),
    )
    out = [("front.xhtml", "Front Page", tpl.render(**base, kind="front", title="Front Page",
                                                    secondaries=edition.secondaries(all_front)))]
    for sec in edition.sections:
        if sec.id == "puzzles":
            continue
        arts = edition.section_articles(sec.id, all_front)
        if not arts and sec.id != "weather":
            continue
        out.append((f"{sec.id}.xhtml", sec.name, tpl.render(**base, kind="section", title=sec.name,
                                                            section=sec, articles=arts)))
    out.append(("sources.xhtml", "Sources and Licenses", tpl.render(**base, kind="sources", title="Sources and Licenses")))
    out.append(("final.xhtml", "Puzzles and Almanac", tpl.render(**base, kind="final", title="Puzzles and Almanac")))
    return out


def build_epub(edition: Edition, out_path: Path, work_dir: Path) -> Path:
    img_files: dict[Path, Path] = {}
    for a in edition.articles.values():
        for img in a.images:
            img_files[img.path] = to_newsprint(img.path, work_dir / "img" / "epub" / (img.path.stem + ".png"), IMAGE_WIDTH_PX)
    images = {src: f"images/{dest.name}" for src, dest in img_files.items()}
    chapters = _chapters(edition, images)

    title = f"{edition.paper_name}, {long_date(edition.date)}"
    book_id = f"urn:uuid:{uuid.uuid5(uuid.NAMESPACE_URL, f'quiet-courier:{edition.paper_name}:{edition.date}')}"
    modified = f"{edition.date.isoformat()}T06:00:00Z"

    manifest = ['<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
                '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
                '<item id="css" href="style.css" media-type="text/css"/>']
    manifest += [f'<item id="ch{i}" href="{name}" media-type="application/xhtml+xml"/>' for i, (name, _, _) in enumerate(chapters)]
    manifest += [f'<item id="font{i}" href="fonts/{f}" media-type="font/ttf"/>' for i, f in enumerate(EPUB_FONTS)]
    manifest += [f'<item id="img{i}" href="{href}" media-type="image/png"/>' for i, href in enumerate(images.values())]
    spine = "".join(f'<itemref idref="ch{i}"/>' for i in range(len(chapters)))

    opf = f"""<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="en">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">{book_id}</dc:identifier>
    <dc:title>{escape(title)}</dc:title>
    <dc:language>en</dc:language>
    <dc:creator>{escape(edition.paper_name)}</dc:creator>
    <dc:date>{edition.date.isoformat()}</dc:date>
    <dc:rights>Articles are public domain or Creative Commons licensed. See Sources and Licenses.</dc:rights>
    <meta property="dcterms:modified">{modified}</meta>
  </metadata>
  <manifest>
    {chr(10).join("    " + m for m in manifest).strip()}
  </manifest>
  <spine toc="ncx">{spine}</spine>
</package>
"""
    nav_items = "".join(f'<li><a href="{n}">{escape(t)}</a></li>' for n, t, _ in chapters)
    nav = f"""<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en" xml:lang="en">
<head><meta charset="utf-8"/><title>Contents</title></head>
<body><nav epub:type="toc" id="toc"><h1>Contents</h1><ol>{nav_items}</ol></nav></body>
</html>
"""
    nav_points = "".join(
        f'<navPoint id="np{i}" playOrder="{i + 1}"><navLabel><text>{escape(t)}</text></navLabel><content src="{n}"/></navPoint>'
        for i, (n, t, _) in enumerate(chapters))
    ncx = f"""<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head><meta name="dtb:uid" content="{book_id}"/></head>
  <docTitle><text>{escape(title)}</text></docTitle>
  <navMap>{nav_points}</navMap>
</ncx>
"""
    container = """<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>
"""
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(out_path, "w") as z:
        # EPUB OCF requires mimetype as the first entry, uncompressed.
        z.writestr(zipfile.ZipInfo("mimetype"), "application/epub+zip", compress_type=zipfile.ZIP_STORED)
        z.writestr("META-INF/container.xml", container, compress_type=zipfile.ZIP_DEFLATED)
        z.writestr("OEBPS/content.opf", opf, compress_type=zipfile.ZIP_DEFLATED)
        z.writestr("OEBPS/nav.xhtml", nav, compress_type=zipfile.ZIP_DEFLATED)
        z.writestr("OEBPS/toc.ncx", ncx, compress_type=zipfile.ZIP_DEFLATED)
        z.write(TEMPLATES_DIR / "epub" / "style.css", "OEBPS/style.css", compress_type=zipfile.ZIP_DEFLATED)
        for name, _, xhtml in chapters:
            z.writestr(f"OEBPS/{name}", xhtml, compress_type=zipfile.ZIP_DEFLATED)
        for f in EPUB_FONTS:
            z.write(FONTS_DIR / f, f"OEBPS/fonts/{f}", compress_type=zipfile.ZIP_DEFLATED)
        for src, dest in img_files.items():
            z.write(dest, f"OEBPS/{images[src]}", compress_type=zipfile.ZIP_STORED)
    return out_path
