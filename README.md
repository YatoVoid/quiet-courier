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

| Phase | State |
|---|---|
| 1. Newspaper design | Done |
| 2. Content pipeline | Done: `courier build` makes today's edition from live sources |
| 3. Website and registration | Built, not deployed: landing page, email sign-in, setup, Kindle guide, account page, draft legal pages |
| 4–7. Delivery, billing, launch, monetization | Not started |

The sample editions above are rendered from content saved in `pipeline/samples/`. Editions built with `courier build` use whatever the sources published that day.

## Repository layout

```
assets/fonts/        Fonts and their licenses (all SIL OFL 1.1)
pipeline/            Python: fetch, clean, select, lay out, render
  courier/           The package
  templates/         Print HTML/CSS (Jinja) and EPUB templates
  courier/sources/   One module per source, all returning the same article shape
  courier/data/      Poem library and the English word list used to score OCR
  samples/           Sample edition data and images
  tests/             Offline: every source is tested against saved copies of its feed
  courier.toml       Paper name, reading length, cities, which sources are on
docs/                Source licensing notes, showcase images
web/                 Next.js site: sign-up, accounts, setup guide
  app/               Pages and server actions
  lib/server/        Sign-in, sessions, rate limits, mail, account changes
  db/                Drizzle schema and SQL migrations
deploy/              systemd unit, nginx site, deploy and backup scripts
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

### Building today's real edition

```sh
export COURIER_CONTACT_EMAIL=you@example.com   # sent to the Weather Service and Library of Congress, which ask for a contact
.venv/bin/python -m courier build              # every city in courier.toml
.venv/bin/python -m courier build --city denver --date 2026-10-01
```

Output goes to `out/<date>/<city>/`: `edition.json`, the two PDFs and the EPUB. Every edition, every article in it with its license and attribution, and whether each source succeeded are recorded in `data/courier.db` (SQLite; the schema in `pipeline/courier/schema.sql` is plain SQL so it can move to Supabase). Feeds are cached in `out/cache/<date>/`, so rebuilding the same day does not refetch.

## Website

Needs Node 20.9+ and PostgreSQL.

```sh
cd web
npm ci
cp .env.example .env        # set DATABASE_URL; leave RESEND_API_KEY empty in development
npm run db:migrate
npm run dev                 # http://localhost:3000
npm test                    # about 5 seconds, runs against an in-memory Postgres (PGlite)
```

Without `RESEND_API_KEY`, development prints every email (sign-in links included) to the server log instead of sending it. In production a missing key is an error.

The city list comes from `pipeline/courier.toml` (`COURIER_CONFIG`), so the site only offers cities the pipeline builds. Test editions are read from `EDITIONS_DIR`: the newest `<date>/<city>/` build, then the samples in `out/`.

### Accounts and security

| | |
|---|---|
| Sign-in | One email form for new and returning readers, with the same response either way, so it never reveals whether an address has an account. The link carries a 256-bit token in the URL fragment, so it stays out of server logs and mail scanners can't use it up by prefetching. It is stored as a SHA-256 hash, works once, and expires in 15 minutes. |
| Sessions | Random token in an `HttpOnly`, `SameSite=Lax` cookie (`__Host-` prefixed and `Secure` in production), stored hashed, 60-day lifetime. "Sign out on every device" deletes them all. |
| Rate limits | Sign-in emails: 5 an hour per address, 20 an hour per IP. Link redemption: 30 per 15 minutes per IP. Test editions: 3 a day. Delivery confirmations: 5 a day. Stored in Postgres, so they survive restarts. |
| Delivery address | `@kindle.com`, `@free.kindle.com` and `@pbsync.com` only accept mail from approved senders, so they are trusted as entered. Any other address must open a confirmation link before anything is sent there. |
| Terms | Accepted with an unticked checkbox during setup. The version and time are stored. |
| Audit log | Sign-ins, failures, throttling and account changes, with IP, kept 90 days. No email addresses or names. |
| Headers | CSP with a per-request script nonce, `frame-ancestors 'none'`, `nosniff`, a strict referrer policy. HSTS comes from nginx. Server action bodies are capped at 32 KB. |

Deleting an account removes the row and its sessions and tokens. Nightly backups are kept 30 days.

### Deploying

The site runs on the same server as the other self-hosted sites, behind nginx, as its own `courier` user on 127.0.0.1:3200. See [docs/DEPLOY.md](docs/DEPLOY.md).

## How an edition is put together

| Step | What happens |
|---|---|
| Fetch | The Conversation, Global Voices, NASA and NASA Earth Observatory, the National Weather Service, and the Library of Congress are fetched in parallel. Each has a timeout and three tries. |
| Check licenses | The Conversation entries must state CC BY-ND in the feed. Global Voices stories republished from partner outlets are skipped. NASA images are kept only when the credit is NASA's alone. Archive pages must be from 1930 or earlier. |
| Clean | HTML is reduced to paragraphs and subheads. Players, share bars, contact blocks and navigation are removed. Anything removed from a story is listed in its credit line ("Images and audio omitted. Text unedited."). |
| Score OCR | 1926 pages come as scanned text. Each story is scored against an English word list; only clean ones run, and unreadable words print as [illegible]. |
| Select | A lead, two short front-page stories, one World, two Science, an optional Weather feature and up to four archive items, fitted to 4,800 words (about 20 minutes at 240 words a minute). Stories used in the last 60 days, near-duplicate headlines, and stories mentioning words in the `avoid` list are skipped. |
| Fall back | A source that fails is logged and skipped. The lead falls back from The Conversation to Global Voices to NASA. With no forecast, the masthead shows sunrise and sunset. The build only fails if there is nothing at all to print. |

Turn a source off in `courier.toml` (`conversation = false`) and the paper is built without it.

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
