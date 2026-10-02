import re
import xml.dom.minidom
import zipfile
from pathlib import Path

import pytest
from weasyprint import HTML

from courier.devices import DEVICES
from courier.models import load_edition
from courier.epub import build_epub
from courier.layout import long_date
from courier.pdf import build_pdf


def _page_text(page) -> str:
    out = []

    def walk(box):
        if hasattr(box, "text"):
            out.append(box.text)
        for child in getattr(box, "children", []):
            walk(child)

    walk(page._page_box)
    return " ".join(" ".join(out).split())


SAMPLES = sorted((Path(__file__).resolve().parent.parent / "samples").glob("*.json"))


@pytest.mark.parametrize("sample", SAMPLES, ids=[p.stem for p in SAMPLES])
@pytest.mark.parametrize("device", DEVICES.values(), ids=list(DEVICES))
def test_pdf_layout(sample, device, tmp_path):
    edition = load_edition(sample)
    result = build_pdf(edition, device, tmp_path / "out.pdf", tmp_path)
    assert (tmp_path / "out.pdf").stat().st_size > 10_000

    html = (tmp_path / f"edition_{device.id}.html").read_text()
    doc = HTML(string=html).render()
    assert len(doc.pages) == result.pages

    first = doc.pages[0]
    assert first.width == pytest.approx(device.page_width_in * 96, abs=0.5)
    assert first.height == pytest.approx(device.page_height_in * 96, abs=0.5)

    jump_targets = set(re.findall(r'href="#(cont-[^"]+)"', html))
    assert jump_targets, "sample lead story should jump"
    anchors = {name: i for i, p in enumerate(doc.pages) for name in p.anchors}
    front_text = _page_text(doc.pages[0])
    for target in jump_targets:
        assert anchors[target] > 0
        assert f"Continued on Page {anchors[target] + 1}" in front_text

    front_ids = [edition.lead_id, *edition.secondary_ids[:device.front_secondaries]]
    assert jump_targets <= {f"cont-{i}" for i in front_ids}

    assert anchors["final-start"] == anchors["the-end"] == len(doc.pages) - 1

    header = f"{edition.paper_name} · {long_date(edition.date)} · Page 2"
    assert header in _page_text(doc.pages[1])


def test_every_source_is_credited(edition, tmp_path):
    build_pdf(edition, DEVICES["large"], tmp_path / "out.pdf", tmp_path)
    html = (tmp_path / "edition_large.html").read_text()
    for a in edition.articles.values():
        assert a.source_url in html


def test_epub_structure(edition, tmp_path):
    path = build_epub(edition, tmp_path / "e.epub", tmp_path)
    with zipfile.ZipFile(path) as z:
        first = z.infolist()[0]
        assert first.filename == "mimetype" and first.compress_type == zipfile.ZIP_STORED
        assert z.read("mimetype") == b"application/epub+zip"
        xhtml = [n for n in z.namelist() if n.endswith((".xhtml", ".opf", ".ncx"))]
        for name in xhtml:
            xml.dom.minidom.parseString(z.read(name))
        text = z.read("OEBPS/front.xhtml").decode()
        assert edition.lead.body[-1].text.split()[-1].rstrip(".") in text
        assert "That’s all for today." in z.read("OEBPS/final.xhtml").decode()
