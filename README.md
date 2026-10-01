# The Quiet Courier

A daily newspaper for e-ink readers, laid out like an early-1900s broadsheet. Every article is written by people and is either public domain or openly licensed.

![Front pages of the Kansas City, Chicago and Denver editions for October 1, 2026](docs/showcase/front-pages.png)

The name and motto are set in the edition data (`paper_name`, `motto`), so custom editions can carry a different masthead.

## Sample editions

Three city editions for Thursday, October 1, 2026, built from real articles published that week. Each city gets its own National Weather Service forecast, almanac, and a front page from a different 1926 newspaper.

| Edition | Lead story | From the Archives (Oct. 1, 1926) | Poem |
|---|---|---|---|
| Kansas City | Schrödinger's equation at 100 (The Conversation) | The Cordele Dispatch, Georgia | Keats, "To Autumn" |
| Chicago | Antarctic ice loss (The Conversation) | The Indianapolis Times | Frost, "October" |
| Denver | Starship's heat shield (The Conversation) | The Bismarck Tribune, North Dakota | Jackson, "October's Bright Blue Weather" |

Each edition renders three ways:

| File | Page size | Columns | For |
|---|---|---|---|
| `out/<city>_small.pdf` | 4.0 × 5.33 in | 2 | Kindle Paperwhite, Kobo Clara, other 6–7" readers |
| `out/<city>_large.pdf` | 6.2 × 8.27 in | 3 | Kindle Scribe, Boox Note, reMarkable |
| `out/<city>.epub` | reflowable | 1 | Any reader; Send-to-Kindle converts it |

More pages are in [docs/showcase](docs/showcase):

| | Kansas City | Chicago | Denver |
|---|---|---|---|
| Large, inside | [Science](docs/showcase/kansas-city-large-science.png) | [World](docs/showcase/chicago-large-world.png) | [Weather](docs/showcase/denver-large-weather.png) |
| Large, archives | [1926](docs/showcase/kansas-city-large-archives.png) | [1926](docs/showcase/chicago-large-archives.png) | [1926](docs/showcase/denver-large-archives.png) |
| Large, last page | [Puzzle](docs/showcase/kansas-city-large-last.png) | [Puzzle](docs/showcase/chicago-large-last.png) | [Puzzle](docs/showcase/denver-large-last.png) |
| Small, page 1 | [Front](docs/showcase/kansas-city-small-front.png) | [Front](docs/showcase/chicago-small-front.png) | [Front](docs/showcase/denver-small-front.png) |
| Small, page 2 | [Jump](docs/showcase/kansas-city-small-page2.png) | [Jump](docs/showcase/chicago-small-page2.png) | [Jump](docs/showcase/denver-small-page2.png) |

## Status

Phase 1 (newspaper design) is done. The editions above are rendered from content saved in `pipeline/samples/`.

Not built yet: live fetching (Phase 2), website and signup (3), delivery (4), billing (5), launch tooling (6), monetization groundwork (7).

## Repository layout

```
assets/fonts/        Fonts and their licenses (all SIL OFL 1.1)
pipeline/            Python: fetch, clean, select, lay out, render
  courier/           The package
  templates/         Print HTML/CSS (Jinja) and EPUB templates
  samples/           Sample edition data and images
  tests/
docs/                Source licensing notes, showcase images
web/                 Next.js site (Phase 3, not started)
.github/workflows/   Daily build and send (Phase 4, not started)
```

## Setup

Needs Python 3.11+ and Pango (WeasyPrint uses it for text layout).

- Arch: `sudo pacman -S pango`
- Debian/Ubuntu: `sudo apt install libpango-1.0-0 libpangoft2-1.0-0`
- macOS: `brew install pango`

```sh
python -m venv .venv
.venv/bin/pip install -e "pipeline[dev]"
.venv/bin/python -m courier sample           # renders every edition in pipeline/samples/ into out/
.venv/bin/python -m pytest pipeline          # about 40 seconds
```

`--edition pipeline/samples/denver.json` renders one edition (repeatable). `--device small|large` renders one size. `--no-epub` skips the EPUB.

## How the layout works

- Page size equals the reader's physical screen, so 8.6 pt type on the small edition is 8.6 pt on the device. Kindle and Boox fit a PDF page to the screen, so a page of the same shape shows without zoom or letterboxing.
- The front page must fit on one page. The renderer searches for the largest amount of the lead story that fits, cutting at a sentence boundary, and prints "Continued on Page N" with the real page number. The rest runs inside under "Continued from Page One".
- On the small edition, the lead runs alone on page one. At a readable type size there is no room for a second headline. The other front-page stories run in their sections.
- Each section starts on a new page. The last page is always the puzzle, the almanac, and "That's all for today". The build fails if that page overflows instead of shipping a broken edition.
- Monochrome only. No gray text and no rules thinner than 0.8 pt. Images are converted to a coarse black-and-white dither that reads like a newsprint halftone.
- Splitting a story across a jump never changes its text. A test checks every possible split point against the original, because The Conversation's CC BY-ND license forbids edits.

## Fonts

| Font | Use | License |
|---|---|---|
| UnifrakturMaguntia | Nameplate, closing line | SIL OFL 1.1 |
| Old Standard TT | Body text and headlines | SIL OFL 1.1 |
| IM Fell DW Pica | Drop caps, decks | SIL OFL 1.1 |
| IM Fell English SC | Section heads, bylines | SIL OFL 1.1 |

All from the Google Fonts repository. OFL allows commercial use and embedding in PDFs and EPUBs. License texts are in `assets/fonts/`.

## Content sources

See [docs/SOURCES.md](docs/SOURCES.md) for what was checked about each source's license, and what is still open.
