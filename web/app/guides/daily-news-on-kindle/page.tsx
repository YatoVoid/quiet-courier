import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import { PAPER_NAME, PRICE_PER_MONTH, TRIAL_DAYS } from "@/lib/site";

const TITLE = "How to Get a Daily Newspaper on Your Kindle";
const DESCRIPTION =
  "Five ways to have news waiting on your Kindle every morning, from Amazon's own newspaper subscriptions to Calibre and RSS, with what each one costs and what it takes to set up.";
const UPDATED = "2026-10-03";
const PATH = "/guides/daily-news-on-kindle";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PATH },
  openGraph: { type: "article", title: TITLE, description: DESCRIPTION, url: PATH },
};

const METHODS = [
  {
    name: "A newspaper subscription from the Kindle Store",
    cost: "Set by each publisher",
    setup: "A few minutes",
    computer: "No",
    gets: "One newspaper, delivered overnight",
  },
  {
    name: "Calibre's Fetch News",
    cost: "Free",
    setup: "An hour or so",
    computer: "Yes, it must be on",
    gets: "Any site Calibre has a recipe for",
  },
  {
    name: "An RSS-to-Kindle service",
    cost: "Free to a few dollars a month",
    setup: "Choosing and pruning feeds",
    computer: "No",
    gets: "Whatever feeds you pick, as one daily file",
  },
  {
    name: "Sending articles one at a time",
    cost: "Free",
    setup: "None",
    computer: "No, but it's by hand",
    gets: "Only what you send that day",
  },
  {
    name: PAPER_NAME,
    cost: `${TRIAL_DAYS} days free, then ${PRICE_PER_MONTH} a month`,
    setup: "About five minutes",
    computer: "No",
    gets: "A finished paper at 5 a.m. with your weather",
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
        {PAPER_NAME} arrives on your Kindle at 5 a.m. with your city&rsquo;s weather, real reporting, a page from 1926 and a word
        search. {TRIAL_DAYS} days free, no card needed.
      </p>
      <p>
        <Link className="button" href="/">
          See the paper
        </Link>
      </p>
    </aside>
  );
}

export default function DailyNewsOnKindle() {
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
          Five ways to have the news waiting on your Kindle in the morning, what each one costs, and how much fiddling it takes.
        </p>
        <p className="guide-byline">
          By the editors of {PAPER_NAME} &middot; Updated <time dateTime={UPDATED}>October 3, 2026</time>
        </p>

        <div className="prose">
          <p className="dropcap">
            A Kindle is a fine thing to read the news on: no notifications, no autoplay, and it doesn&rsquo;t glow at you over
            breakfast. The hard part is getting the news onto it every day without doing it by hand. Here are the ways that work,
            starting with the one Amazon sells.
          </p>
          <p>
            We make one of them, {PAPER_NAME}, so read the last section with that in mind. The other four are described as fairly
            as we can manage.
          </p>
        </div>

        <h2>The short version</h2>
        <table className="compare">
          <thead>
            <tr>
              <th scope="col">Method</th>
              <th scope="col">Cost</th>
              <th scope="col">Setup</th>
              <th scope="col">Needs your computer on</th>
              <th scope="col">What you get</th>
            </tr>
          </thead>
          <tbody>
            {METHODS.map((m) => (
              <tr key={m.name}>
                <th scope="row">{m.name}</th>
                <td data-label="Cost">{m.cost}</td>
                <td data-label="Setup">{m.setup}</td>
                <td data-label="Needs your computer on">{m.computer}</td>
                <td data-label="What you get">{m.gets}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="prose">
          <h2>1. A newspaper subscription from the Kindle Store</h2>
          <p>
            Some newspapers and magazines sell a Kindle edition through Amazon. Find the paper in the Kindle Store, subscribe,
            and each new issue downloads to your Kindle overnight while it&rsquo;s on Wi-Fi.
          </p>
          <p>
            <strong>Good for:</strong> readers who already know the one paper they want. <strong>The catch:</strong> each
            subscription is one publication at its own price, the list of papers is limited and varies by country, and the layout
            is the publisher&rsquo;s plain ebook text rather than a newspaper page.
          </p>

          <h2>2. Calibre&rsquo;s Fetch News</h2>
          <p>
            Calibre, the free ebook manager for Windows, Mac and Linux, has a <em>Fetch news</em> button with built-in
            &ldquo;recipes&rdquo; for hundreds of news sites. It downloads the articles, turns them into an ebook, and can email
            the result to your Kindle&rsquo;s Send to Kindle address on a schedule.
          </p>
          <p>
            <strong>Good for:</strong> tinkerers who want a particular site and don&rsquo;t mind some setup.{" "}
            <strong>The catch:</strong> the schedule only runs while your computer is on and Calibre is open, recipes break when
            a site redesigns, and paywalled sites need your login.
          </p>

          <h2>3. An RSS-to-Kindle service</h2>
          <p>
            Services and open-source projects such as KindleEar take the RSS feeds of sites you choose, bundle the new articles
            into one file, and email it to your Kindle each day. Some are hosted for you; KindleEar you run yourself.
          </p>
          <p>
            <strong>Good for:</strong> people who already follow blogs or newsletters by RSS. <strong>The catch:</strong> you are
            the editor. Pick too many feeds and the file is enormous; too few and it&rsquo;s thin. Many feeds carry only a
            summary, not the whole article.
          </p>

          <h2>4. Sending articles one at a time</h2>
          <p>
            Amazon&rsquo;s Send to Kindle browser extension and app send any web page to your Kindle, and you can email documents
            to your Kindle&rsquo;s address. It costs nothing and works with almost any site.
          </p>
          <p>
            <strong>Good for:</strong> saving a few long reads for later. <strong>The catch:</strong> it&rsquo;s by hand, every
            day, so it&rsquo;s a reading list rather than a morning paper.
          </p>

          <h2>5. {PAPER_NAME}</h2>
          <p>
            This is ours. Every morning at 5 a.m. in your time zone, a finished newspaper arrives in your Kindle library: a lead
            story from The Conversation, the day&rsquo;s events in brief, world reporting from Global Voices, science from NASA,
            the forecast for any city you choose, stories printed on this date in 1926, a chapter of a classic novel, a poem,
            and a sudoku, cryptogram and word search. It&rsquo;s laid out in
            columns like an old broadsheet, sized to your Kindle&rsquo;s screen, and takes about twenty minutes to read.
          </p>
          <p>
            <strong>Good for:</strong> people who want a paper that ends, without running software or choosing feeds.{" "}
            <strong>The catch:</strong> you don&rsquo;t pick the stories, and it costs {PRICE_PER_MONTH} a month after{" "}
            {TRIAL_DAYS} free days. Setup is approving one email address in your Amazon account, which our{" "}
            <Link href="/guide">setup guide</Link> walks through with screenshots.
          </p>
        </div>

        <TryIt />

        <div className="prose">
          <h2>Whichever you choose: approve the sender</h2>
          <p>
            Every method except the Kindle Store emails files to your Kindle, and Amazon only accepts email from addresses you
            approve. Go to Amazon&rsquo;s <em>Manage Your Content and Devices</em> page, open <em>Preferences</em>, then{" "}
            <em>Personal Document Settings</em>, and add the sending address under the approved email list. Your Kindle&rsquo;s own
            Send to Kindle address is listed on the same page.
          </p>

          <h2>Other e-ink readers</h2>
          <p>
            PocketBook readers have their own email address and work the same way as a Kindle. Boox tablets can install the
            Kindle app and use its Send to Kindle address. Kobo and reMarkable don&rsquo;t accept files by email, so the
            emailed methods above need a computer or the reader&rsquo;s own browser to bring the file across. The Quiet
            Courier gives those readers a private download link instead, which KOReader can also follow as a catalog. Our{" "}
            <Link href="/guides/daily-news-on-kobo-and-remarkable">Kobo and reMarkable guide</Link> covers every option for
            those readers.
          </p>
        </div>
      </article>
    </PageShell>
  );
}
