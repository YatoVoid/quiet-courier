# Page sizes match the physical screen. Kindle and Boox scale a PDF to fit, so a page
# the same shape as the screen shows at true size with no zoom or letterboxing.

from dataclasses import dataclass


@dataclass(frozen=True)
class Device:
    id: str
    label: str
    page_width_in: float
    page_height_in: float
    margin_in: float
    columns: int
    body_pt: float
    leading: float
    nameplate_pt: float
    lead_headline_pt: float
    puzzle_cell_pt: float
    front_secondaries: int
    puzzle_size: int
    puzzle_words: int


# At a readable type size the small front page has no room for a second headline.
# Kindle Paperwhite 6.8" (1236x1648 at 300 ppi) is 4.12 x 5.49 in. The 6" models are
# 3.6 x 4.8 in, so a 4 x 5.33 in page shows at about 90% there and still reads.
SMALL = Device(
    id="small", label="6-7 inch readers (Kindle, Kobo Clara, Boox Poke)",
    page_width_in=4.0, page_height_in=5.333, margin_in=0.16, columns=2,
    body_pt=8.6, leading=1.22, nameplate_pt=27, lead_headline_pt=11.5, puzzle_cell_pt=8.6,
    front_secondaries=0, puzzle_size=10, puzzle_words=10,
)

# Kindle Scribe (1860x2480 at 300 ppi) is 6.2 x 8.27 in; Boox Note Air is the same shape.
LARGE = Device(
    id="large", label="10 inch and larger (Kindle Scribe, Boox Note, reMarkable)",
    page_width_in=6.2, page_height_in=8.267, margin_in=0.28, columns=3,
    body_pt=9.2, leading=1.24, nameplate_pt=46, lead_headline_pt=19, puzzle_cell_pt=12,
    front_secondaries=2, puzzle_size=13, puzzle_words=14,
)

DEVICES = {d.id: d for d in (SMALL, LARGE)}
