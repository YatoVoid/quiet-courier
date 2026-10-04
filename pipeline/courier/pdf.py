from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path

from weasyprint import HTML

from .devices import Device
from .layout import FrontPlan, prepare_images, render_html, units, units_for_words
from .models import Edition


# Ubuntu 22.04 ships HarfBuzz 2.7, older than the 4.1 subsetting library WeasyPrint asks for, so it
# subsets fonts with fontTools and warns once per font on every build. The output is the same;
# pyproject.toml keeps WeasyPrint below the release that may drop the fallback.
class _NoHarfBuzzNotice(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        return "HarfBuzz-Subset" not in record.getMessage()


logging.getLogger("weasyprint").addFilter(_NoHarfBuzzNotice())

SECONDARY_WORDS = 90


class LayoutError(RuntimeError):
    pass


@dataclass(frozen=True)
class PdfResult:
    path: Path
    pages: int
    plan: FrontPlan


def _front_fits(edition: Edition, device: Device, plan: FrontPlan, images: dict) -> bool:
    html = render_html(edition, device, plan, images, front_only=True)
    return len(HTML(string=html).render().pages) == 1


def _largest_fitting(lo: int, hi: int, fits, scan: int = 10) -> int | None:
    # Binary search, then a short linear scan upward: keeping a paragraph together with
    # its jump line means more text sometimes fits where slightly less did not.
    best, a, b = None, lo, hi
    while a <= b:
        mid = (a + b) // 2
        if fits(mid):
            best, a = mid, mid + 1
        else:
            b = mid - 1
    start = best if best is not None else lo - 1
    for n in range(start + 1, min(hi, start + scan) + 1):
        if fits(n):
            best = n
    return best


def plan_front(edition: Edition, device: Device, images: dict) -> FrontPlan:
    lead = edition.lead
    secondaries = edition.secondaries(device.front_secondaries)
    sizes = {a.id: len(units(a)) for a in [lead, *secondaries]}

    def fits(counts: dict[str, int]) -> bool:
        return _front_fits(edition, device, FrontPlan(counts), images)

    for budget in (SECONDARY_WORDS, 0):
        counts = {a.id: units_for_words(a, budget) for a in secondaries}
        lead_n = _largest_fitting(1, sizes[lead.id], lambda n: fits({**counts, lead.id: n}))
        if lead_n is not None:
            break
    else:
        raise LayoutError(f"front page does not fit on {device.id} even with one sentence per story")

    counts[lead.id] = lead_n
    if lead_n == sizes[lead.id]:
        for a in secondaries:
            grown = _largest_fitting(counts[a.id] + 1, sizes[a.id], lambda n: fits({**counts, a.id: n}))
            if grown:
                counts[a.id] = grown
    return FrontPlan(counts)


def build_pdf(edition: Edition, device: Device, out_path: Path, work_dir: Path) -> PdfResult:
    images = prepare_images(edition, device, work_dir)
    plan = plan_front(edition, device, images)
    html = render_html(edition, device, plan, images)
    doc = HTML(string=html).render()

    final_page = next((i for i, p in enumerate(doc.pages) if "final-start" in p.anchors), None)
    end_page = next((i for i, p in enumerate(doc.pages) if "the-end" in p.anchors), None)
    work_dir.mkdir(parents=True, exist_ok=True)
    (work_dir / f"edition_{device.id}.html").write_text(html, encoding="utf-8")
    if final_page is None or end_page != final_page or end_page != len(doc.pages) - 1:
        doc.write_pdf(work_dir / f"failed_{device.id}.pdf")
        raise LayoutError(f"last page overflowed on {device.id}: puzzle starts p{final_page}, ends p{end_page}")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    doc.write_pdf(out_path)
    return PdfResult(out_path, len(doc.pages), plan)
