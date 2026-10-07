import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import { PAPER_NAME, PRICE_PER_MONTH, TRIAL_DAYS } from "@/lib/site";

const TITLE = "How to Get the Daily News on a Kobo or reMarkable";
const DESCRIPTION =
  "Neither a Kobo nor a reMarkable accepts files by email. Here are five ways to have the news on one every morning anyway, with what each costs and how much setup it takes.";
const UPDATED = "2026-10-05";
const PATH = "/guides/daily-news-on-kobo-and-remarkable";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PATH },
  openGraph: { type: "article", title: TITLE, description: DESCRIPTION, url: PATH },
};

const METHODS = [
  {
    name: "Instapaper, built into Kobo",
    readers: "Kobo",
    cost: "Free, with a paid tier",
    computer: "No",
    gets: "Articles you saved yourself",
  },
  {
    name: "KOReader's news downloader",
    readers: "Kobo, PocketBook",
    cost: "Free",
    computer: "Only to install KOReader",
    gets: "The RSS feeds you choose, as ebooks",
  },
  {
    name: "Calibre's Fetch News and a cloud folder",
    readers: "Some Kobo models, reMarkable",
    cost: "Free",
    computer: "Yes, it must be on",
    gets: "Any site Calibre has a recipe for",
  },
  {
    name: "Read on reMarkable",
    readers: "reMarkable",
    cost: "Free",
    computer: "Yes, Chrome",
    gets: "Only what you send that day",
  },
  {
    name: PAPER_NAME,
    readers: "Kobo, reMarkable, Boox, Kindle",
    cost: `${TRIAL_DAYS} days free, then ${PRICE_PER_MONTH} a month`,
    computer: "No",
    gets: "A finished paper at 5 a.m. behind a private link",
  },
];

function structuredData() {
  const site = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: TITLE,
    description: DESCRIPTION,
    dateModified: UPDATED,
    datePublished: UPDATED,
    mainEntityOfPage: `${site}${PATH}`,
    author: { "@id": `${site}/#organization` },
    publisher: { "@id": `${site}/#organization` },
  };
}

function TryIt() {
  return (
    <aside className="price-box guide-cta" aria-label={`Try ${PAPER_NAME}`}>
      <p className="guide-cta-head">Want the paper without the setup?</p>
      <p>
        {PAPER_NAME} is ready at 5 a.m. behind your own private link, as a PDF sized to your screen or an EPUB, with a KOReader
        catalog if you use one. {TRIAL_DAYS} days free, no card needed.
      </p>
      <p>
        <Link className="button" href="/sample">
          Read today&rsquo;s paper
        </Link>
      </p>
    </aside>
  );
}

export default function DailyNewsOnKoboAndRemarkable() {
  return (
    <PageShell wide>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData()).replace(/</g, "\\u003c") }}
      />
      <article className="guide">
        <p className="guide-kicker">Guides</p>
        <h1>{TITLE}</h1>
        <p className="deck">
          Neither reader takes files by email, so the Kindle tricks don&rsquo;t carry over. These do, from the one built into
          every Kobo to the ones that need a little setup.
        </p>
        <p className="guide-byline">
          By the editors of {PAPER_NAME} &middot; Updated <time dateTime={UPDATED}>October 5, 2026</time>
        </p>

        <div className="prose">
          <p className="dropcap">
            A Kindle has its own email address, so anything that can send an email can put the news on it. A Kobo and a
            reMarkable don&rsquo;t. Files reach them through an app, a cloud folder, a browser or a cable, which rules out most
            &ldquo;news to your e-reader&rdquo; services. What follows is what still works as of October 2026.
          </p>
          <p>
            We make one of these, {PAPER_NAME}, so read the last section with that in mind. The others are described as fairly
            as we can manage.
          </p>
        </div>

        <h2>The short version</h2>
        <table className="compare">
          <thead>
            <tr>
              <th scope="col">Method</th>
              <th scope="col">Readers</th>
              <th scope="col">Cost</th>
              <th scope="col">Needs a computer</th>
              <th scope="col">What you get</th>
            </tr>
          </thead>
          <tbody>
            {METHODS.map((m) => (
              <tr key={m.name}>
                <th scope="row">{m.name}</th>
                <td data-label="Readers">{m.readers}</td>
                <td data-label="Cost">{m.cost}</td>
                <td data-label="Needs a computer">{m.computer}</td>
                <td data-label="What you get">{m.gets}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="prose">
          <h2>1. Instapaper, built into Kobo</h2>
          <p>
            For years Kobo readers had Pocket built in. Mozilla shut Pocket down in July 2025, and Kobo replaced it with
            Instapaper in a software update a month later. Save an article with Instapaper&rsquo;s browser extension or phone app,
            and it shows up on the Kobo, stripped of ads and readable offline.
          </p>
          <p>
            <strong>Good for:</strong> long reads you come across during the day. <strong>The catch:</strong> it&rsquo;s a reading
            list you fill yourself, not a paper. Nothing arrives unless you saved it.
          </p>

          <h2>2. KOReader&rsquo;s news downloader</h2>
          <p>
            KOReader is a free, open-source reading app that runs on Kobo and PocketBook readers alongside their own software.
            It has a built-in news downloader: give it the RSS feeds of the sites you read, and over Wi-Fi it fetches the latest
            articles and saves them as ebooks on the reader itself. No computer is involved once it&rsquo;s set up.
          </p>
          <p>
            <strong>Good for:</strong> readers comfortable installing software by hand. <strong>The catch:</strong> KOReader
            isn&rsquo;t made or supported by Kobo, the install takes some care, and like any RSS setup you are the editor. Many
            feeds carry only a summary, so the downloader has to fetch each page and clean it up, which works better on some
            sites than others.
          </p>

          <h2>3. Calibre&rsquo;s Fetch News and a cloud folder</h2>
          <p>
            Calibre, the free ebook manager for Windows, Mac and Linux, has a <em>Fetch news</em> button with recipes for
            hundreds of news sites, and it can run on a schedule. The trick is getting its file onto the reader without a cable.
          </p>
          <p>
            Some Kobo models read straight from Dropbox or Google Drive: Dropbox on the Forma, Sage, Elipsa and recent Clara
            models, and Google Drive on the Forma, Sage, Elipsa 2E and Libra Colour. A reMarkable can link Google Drive, Dropbox
            or OneDrive without a subscription. Point Calibre&rsquo;s output at that folder and the morning file is waiting on the
            device.
          </p>
          <p>
            <strong>Good for:</strong> tinkerers who want particular sites. <strong>The catch:</strong> the schedule only runs
            while your computer is on and Calibre is open, recipes break when a site redesigns, and on most Kobo models
            there&rsquo;s no cloud folder, so it&rsquo;s back to a USB cable.
          </p>

          <h2>4. Read on reMarkable</h2>
          <p>
            reMarkable&rsquo;s own Chrome extension sends the page you&rsquo;re looking at to the tablet, as a cleaned-up article
            or a PDF. It doesn&rsquo;t need a Connect subscription.
          </p>
          <p>
            <strong>Good for:</strong> saving a few articles to read and mark up with the pen. <strong>The catch:</strong> it&rsquo;s one page at a time, by hand, from a computer.
          </p>

          <h2>5. {PAPER_NAME}</h2>
          <p>
            This is ours. Every morning at 5 a.m. in your time zone, a finished newspaper is ready behind a private link that
            only you have: a lead story from The Conversation, the day&rsquo;s events in brief, world reporting, science from
            NASA, the forecast for any city you choose, stories printed on this date in 1926, a chapter of a classic novel, a
            poem, and a sudoku, cryptogram and word search. It&rsquo;s laid out like an old broadsheet, as a PDF cut to your
            screen (three columns on a 10-inch reMarkable or Kobo Elipsa) or as an EPUB, and takes about twenty minutes to
            read.
          </p>
          <p>How it gets onto the reader:</p>
          <ul>
            <li>
              <strong>Kobo or PocketBook with KOReader:</strong> add your link as an OPDS catalog once, then download each
              morning&rsquo;s edition from it in two taps.
            </li>
            <li>
              <strong>reMarkable:</strong> open the link on your phone or computer and send the file to the tablet with the
              reMarkable app, or save it to a linked Google Drive or Dropbox folder.
            </li>
            <li>
              <strong>Boox and tablets:</strong> open the link in the reader&rsquo;s browser and the file downloads.
            </li>
          </ul>
          <p>
            <strong>Good for:</strong> people who want a paper that ends, without running software or choosing feeds.{" "}
            <strong>The catch:</strong> you don&rsquo;t pick the stories, it costs {PRICE_PER_MONTH} a month after {TRIAL_DAYS}{" "}
            free days, and outside KOReader it&rsquo;s still a tap or two each morning, because neither reader can be sent a file
            the way a Kindle can. You can <Link href="/sample">read today&rsquo;s edition</Link> before deciding.
          </p>
        </div>

        <TryIt />

        <div className="prose">
          <h2>A note on Kindle</h2>
          <p>
            If you also have a Kindle, or are choosing between readers, Kindles are the easiest to send news to, because each
            has its own email address. Our <Link href="/guides/daily-news-on-kindle">Kindle guide</Link> covers the options
            there.
          </p>
        </div>
      </article>
    </PageShell>
  );
}
