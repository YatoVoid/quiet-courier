# Content sources and licenses

Checked 2026-10-01 against each source's published terms. Re-check before launch and at least yearly. Every article stores its license, attribution text, source URL and any changes made, and the printed edition shows all of it.

## Approved for use

### The Conversation (US edition)
- License: CC BY-ND 4.0. Commercial use allowed. No edits.
- Terms page: https://theconversation.com/us/republishing-guidelines
- Rules that affect us:
  - Text must run unedited. We only reflow it into columns and jump it across pages, which the license treats as a format change. A test verifies no words are dropped or altered.
  - Credit the author and institution (in the byline) and The Conversation, with a link to the original.
  - Images: we omit them. Many are Getty/AP and not covered by the license.
  - The 1×1 page counter is required online only. Their print rules say the counter and links are not needed, and they ask for a copy of the printed result at us-republish@theconversation.com.
  - Republishing behind a paywall is allowed. Selling an article on its own is not.
- Confirmed by email with The Conversation US republishing team, 2026-10-01:
  - Two or three articles a day is fine. Eight to ten would be too much. The selector uses at most three per edition, and every city draws from the same pool, so the daily total stays at three.
  - The paper counts as journalism, free and paid tiers alike. No license fee.
  - The page counter can be skipped for PDF and EPUB editions. In its place they ask for:
    - a copy of each edition that uses their content, sent to us-republish@theconversation.com
    - usage reporting so they can log each republication, plus a general circulation number

### Global Voices
- License: CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/). Commercial use and edits allowed.
- Terms page: https://globalvoices.org/about/global-voices-attribution-policy/
- Partner content is excluded: the pipeline skips posts that say they were "originally published" elsewhere or that come from Global Voices' partner programs. Their feed includes stories "originally published" by other outlets (Dialogue Earth, for one) that carry those outlets' terms. Phase 2 must detect and skip these.
- Photos are often "used with permission" from the photographer, which does not pass to us. We omit images.
- Some posts quote sources in the original language followed by an English translation. The paper's fonts are Latin-only, so we drop the original-language lines, keep the translation, and say so in the credit.

### NASA
- U.S. government work, public domain in the U.S.
- Must not imply NASA endorses the paper. Never use the NASA insignia or "meatball" logo.
- Skip third-party material on NASA sites. Astronomy Picture of the Day images are usually copyrighted by the photographer, despite appearing in NASA's feed.

### National Weather Service (api.weather.gov)
- Public domain. The API asks for a User-Agent with contact details.
- Used for places in the United States. If it fails, the build falls back to MET Norway.

### MET Norway (api.met.no), forecasts outside the US
- License: CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Commercial use allowed with credit.
- Terms page: https://api.met.no/doc/TermsOfService
- Rules that affect us:
  - Every request carries a User-Agent naming the paper and a contact address.
  - Coordinates are truncated to four decimals. Five or more get a 403.
  - At most 20 requests a second, and responses must be cached. The build fetches each place once a day and caches it for the day.
  - Credit and changes: the forecast page prints "Forecast data from MET Norway, CC BY 4.0" and says the hourly figures were grouped into day and night periods. Sources and Licenses lists the request URL.
- The descriptions ("Light rain showers", "High near 18°C") are built from MET's own weather symbol, temperature, wind and precipitation by fixed rules. Nothing is generated or guessed.
- Open-Meteo was considered and rejected: its free API forbids commercial use, which includes subscription products.

### GeoNames, place names for the website
- License: CC BY 4.0. Credited in the site footer.
- `cities1000`: every place with 1,000 or more people (about 171,000), plus region and country names. Loaded into Postgres by `web/db/import-places.mjs`, so city searches never leave our server.

### Library of Congress, Chronicling America
- Newspapers published in the U.S. more than 95 years ago are public domain. As of 2026, that is anything published in 1930 or earlier.
- "100 Years Ago Today" stays well inside that window. Do not use pages from 1931 or later.
- The text comes from OCR and is often garbled. The three sample editions were transcribed by hand from the OCR. Live editions use the OCR directly: each story is scored against an English word list (SCOWL, permissive license, in `pipeline/courier/data/`), only stories that score well are used, a few common scanning errors are fixed (dates like "Oct. I.", the AP's logo read as "(/P)"), and unreadable words print as [illegible]. The printed note says the text is OCR.
- Stories about deaths, crimes and similar are skipped to keep the section calm.
- www.loc.gov answers the production server with a Cloudflare challenge, so the list of issues for each date ships in `pipeline/courier/data/archive-index.json.gz`, built with `courier archive-index` by the repo's monthly "Archive index" GitHub workflow (loc.gov accepts GitHub's runners), and the server downloads the newest copy weekly. The page OCR comes from tile.loc.gov, which the server can reach. The workflow keeps the index about 13 months ahead. If it stops, the weekly check emails the owner 90 days before the index runs out, and past the end the paper prints without archives.

### Wikisource (poems, essays)
- The underlying works are public domain if published before 1931. Use the original text, not a later edition's notes or translation, which may still be under copyright.

### Project Gutenberg, novels for the daily serial (checked 2026-10-04)
- The novels are public domain. Gutenberg's license and trademark only cover copies that keep the Project Gutenberg name, so `courier/serial.py` cuts the header and footer and drops any paragraph that mentions the project. Nothing printed names Gutenberg; the credit reads "first published <year>. Public domain."
- Readers live outside the US too, so a book goes in `pipeline/courier/data/serials.json` only if it was published before 1931 and its author died more than 70 years ago. The code checks both before downloading. That rules out, for example, Agatha Christie (died 1976) and E. M. Forster (died 1970).
- For a translation, the translation's own date and translator count. Around the World in Eighty Days is George Makepeace Towle's 1873 translation (Towle died 1893).
- End matter written by later editors (Gutenberg file 541 ends with a Library of America note) may still be under copyright, so a book stops at "THE END", "A Note on the Text", "Footnotes" and similar headings.

### Wikipedia, Current events portal (checked 2026-10-03)
- License: CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/). Commercial use allowed. Older text may also be under the GFDL; the CC license is the one we rely on.
- Terms page: https://en.wikipedia.org/wiki/Wikipedia:Reusing_Wikipedia_content
- What it is: one page per day, `Portal:Current_events/<YYYY>_<Month>_<D>`, with short human-written summaries grouped under headings (armed conflicts, politics, business, science, sports and so on). Each item ends with the outlet it is based on, such as Reuters or The Guardian.
- Used for "The World in Brief", the page after page one (its own chapter in the EPUB): up to ten items from the last finished day, 7 on the 6-7 inch layout. Nothing is rewritten by us or by AI. If the page can't be fetched or has no usable items, the edition goes out without it and the owner is emailed.
- Rules that affect us:
  - Attribution in print: the page's URL (ideally a permanent link to the exact revision used) and a note that the text is CC BY-SA 4.0. Printed under the box and in Sources and Licenses.
  - Choosing some items and leaving others out, or trimming the outlet names, is an adaptation. The box must say what changed ("selected items") and the box itself is then CC BY-SA 4.0. ShareAlike covers that box only. Putting it in an edition beside other articles doesn't change their licenses.
  - The cited outlets' own articles are not copied. Only Wikipedia's sentences are.
  - Wikimedia APIs require a User-Agent with contact details and modest request rates. One request per day is enough.
- Risks: anyone can edit, so a bad edit could be live when we fetch. Use a revision at least a few hours old and the day that has already ended. Coverage is world-first and thin on some days.

## Waiting on permission (checked 2026-10-04)

### KFF Health News (health policy reporting)
- License: CC BY-NC-ND 4.0, but their own terms say it "allows all news outlets — including for-profit news organizations that charge for subscriptions and accept advertising — to republish our content free of charge." So a paid paper is covered on paper.
- Conditions: byline with the reporter and KFF Health News; their tagline at the end ("KFF Health News is a national newsroom that produces in-depth journalism about health issues and is one of the core operating programs at KFF"); keep every hyperlink and link the original; no edits without asking; photos only for non-commercial use (print text only); items marked "All Rights Reserved" can't be used, so each article page has to be checked.
- Their RSS feed (https://kffhealthnews.org/feed/) carries the full text.
- Why we still ask first: the PDF can't keep inline links clickable, and stories are picked automatically. Contact: NewsHelp@kff.org.
- Terms: https://kffhealthnews.org/syndication/

### The 19th (gender, politics and policy)
- License: CC BY-NC-ND 4.0, plus their own terms: "Do not sell or syndicate our content," stories must keep a tracking pixel (impossible in a PDF or EPUB), and every link must be kept.
- Not usable without written permission. Contact: partnerships@19thnews.org.
- Terms: https://19thnews.org/republishing-guidelines/

### Mongabay (environment)
- License: CC BY-ND 4.0, which allows commercial use, but their guidelines add: "Please do not republish Mongabay stories behind paywalls that require readers to pay or register for an account in order to view." A subscription paper is a paywall, so only with permission.
- Terms: https://news.mongabay.com/copyright/creative-commons/

## Usable without asking (checked 2026-10-04)

### U.S. agency news releases (NOAA, NIH, FDA, Census)
- Works of the U.S. government are public domain (17 U.S.C. 105). Images and quoted material from outside the government can still be copyrighted, so print text only.
- Feeds: https://www.noaa.gov/rss.xml (often full text), https://www.nih.gov/news-releases/feed.xml and the FDA press-release feed (summaries only; the release page has the text), https://www.census.gov/newsroom/press-releases.xml.
- These are press releases, not journalism. Good for a short notices column, not for the lead.

## Not usable

### Knowable Magazine (checked 2026-10-04)
- Text is CC BY-ND 4.0, but their republishing page limits it to editorial use with no commercial or promotional use, and asks publishers to pick stories individually rather than automatically or wholesale. The paper does both. Their site refuses automated fetching, so this comes from their page as quoted in search results; reread https://knowablemagazine.org/republish before reconsidering.

### States Newsroom (checked 2026-10-03)
- Not a Creative Commons license. Its own guidelines say "Don't sell the story" and "Content should not be published behind a paywall; please reach out to the editor-in-chief of the newsroom if you have questions about your particular paywall system."
- A subscription paper is behind a paywall, so we can't use it without written permission. Permission would have to come from each state newsroom's editor-in-chief, or from States Newsroom centrally.
- Terms page: https://statesnewsroom.com/republishing-guidelines/


### Wikinews
- The Wikimedia Foundation has closed Wikinews and made it read-only. No new articles. Old articles are CC BY 4.0 but are no use for daily news.

## Images
- Only public-domain images (NASA, NOAA, LoC items marked "no known restrictions") or CC BY images where attribution is printed.
- All images are converted to black-and-white for e-ink. For CC BY images this counts as a change and is noted in the credit.
