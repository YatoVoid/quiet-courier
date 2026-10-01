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
- **Open questions, need a decision before launch:**
  - "You can't systematically republish all of our articles." We pick two or three a day, which seems fine, but an automated daily feed should be confirmed with them in writing.
  - "Commercial, non-journalism usage: license fees may apply." A paid newspaper is journalism, but ask them to confirm.

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

### Library of Congress, Chronicling America
- Newspapers published in the U.S. more than 95 years ago are public domain. As of 2026, that is anything published in 1930 or earlier.
- "100 Years Ago Today" stays well inside that window. Do not use pages from 1931 or later.
- The text comes from OCR and is often garbled. The three sample editions were transcribed by hand from the OCR. Live editions use the OCR directly: each story is scored against an English word list (SCOWL, permissive license, in `pipeline/courier/data/`), only stories that score well are used, a few common scanning errors are fixed (dates like "Oct. I.", the AP's logo read as "(/P)"), and unreadable words print as [illegible]. The printed note says the text is OCR.
- Stories about deaths, crimes and similar are skipped to keep the section calm.

### Wikisource (poems, essays)
- The underlying works are public domain if published before 1931. Use the original text, not a later edition's notes or translation, which may still be under copyright.

## Not usable

### Wikinews
- The Wikimedia Foundation has closed Wikinews and made it read-only. No new articles. Old articles are CC BY 4.0 but are no use for daily news.

## Images
- Only public-domain images (NASA, NOAA, LoC items marked "no known restrictions") or CC BY images where attribution is printed.
- All images are converted to black-and-white for e-ink. For CC BY images this counts as a change and is noted in the credit.
