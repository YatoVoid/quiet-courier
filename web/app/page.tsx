import Image from "next/image";
import Link from "next/link";
import { FrontMasthead } from "@/components/masthead";
import { Footer } from "@/components/footer";
import { currentUser, isOnboarded } from "@/lib/server/session";
import { billingEnabled } from "@/lib/server/billing";
import { PRICE_PER_MONTH, TRIAL_DAYS } from "@/lib/site";
import { deliveryLive } from "@/lib/server/deliveries";
import front from "@/public/paper/kansas-city-large-front.png";
import science from "@/public/paper/kansas-city-large-science.png";
import archives from "@/public/paper/denver-large-archives.png";
import last from "@/public/paper/chicago-large-last.png";

const CONTENTS = [
  {
    title: "The lead story",
    body: "One long piece on page one, jumped inside like a real paper. Usually research explained by the scientist who did it.",
    source: "The Conversation",
  },
  {
    title: "World",
    body: "A report from somewhere you probably weren't reading about, written by people who live there.",
    source: "Global Voices",
  },
  {
    title: "Science and space",
    body: "Two shorter pieces from the missions, satellites and labs, with a halftone picture when there is one.",
    source: "NASA and NASA Earth Observatory",
  },
  {
    title: "Your weather, if you want it",
    body: "Today and tonight for any city in the world in the corners of the masthead, plus the full forecast inside. Or leave it out.",
    source: "National Weather Service and MET Norway",
  },
  {
    title: "A hundred years ago today",
    body: "Stories from a newspaper printed on this date in 1926, taken from the scanned original.",
    source: "Library of Congress",
  },
  {
    title: "The last page",
    body: "A poem, a word search built from its words, and the almanac: sunrise, sunset, and the moon.",
    source: "Public domain verse",
  },
];

const QUESTIONS = [
  {
    q: "Which readers does it work with?",
    a: "Any Kindle, through Amazon’s Send to Kindle email address. PocketBook readers have their own email address and work the same way, and Boox tablets can receive it through the Kindle app. Kobo and reMarkable don’t accept files by email yet.",
  },
  {
    q: "Is any of it written or summarized by AI?",
    a: "No. Every article is written by a person and printed whole, under its author’s name, with the license it was published under. Nothing is rewritten or condensed.",
  },
  {
    q: "Why does the paper end?",
    a: "Because a feed doesn’t. Each edition is fitted to fifteen or twenty minutes of reading. When you reach the puzzle, you’ve read the news for the day.",
  },
  {
    q: "Does my city change the news?",
    a: "No. The news is the same in every edition. Your city only sets the weather forecast, sunrise and sunset, and the almanac. Any city or town in the world works, or you can leave local weather out.",
  },
  {
    q: "Can I stop it for a while?",
    a: "Yes. Pause delivery from your account page and resume it when you’re back. Cancelling is on the same page as everything else.",
  },
  {
    q: "What do you keep about me?",
    a: "Your email, the name printed on your paper, your city or time zone, your reader size and the address your paper goes to. No tracking scripts. The privacy policy has the details.",
  },
];

function todayInCentral() {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Chicago",
  }).format(new Date());
}

export default async function Home({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const { deleted } = await searchParams;
  const user = await currentUser();
  const next = user ? (isOnboarded(user) ? "/account" : "/welcome") : "/signin";
  const nextLabel = user ? (isOnboarded(user) ? "Go to your account" : "Finish setting up") : "Start your free trial";

  return (
    <div className="sheet">
      <FrontMasthead date={todayInCentral()} signedIn={user != null} />
      <main id="main">
        {deleted && (
          <div className="notice spaced" role="status">
            <p>Your account has been deleted. Nothing more will be sent to you.</p>
          </div>
        )}
        <article className="lead">
          <div>
            <h2 className="headline">A morning paper for your e-reader, with a last page</h2>
            <p className="deck">
              Fifteen to twenty minutes of news, science and history, set in columns like a 1920s broadsheet and emailed to your Kindle before you wake up.
            </p>
            <div className="body-columns">
              <p className="dropcap">
                Most news now arrives as an endless scroll, built to keep you reading. The Quiet Courier comes once a day, as a
                file on your reader, and it ends. You read it front to back, do the word search, and you are finished with the
                news until tomorrow.
              </p>
              <p>
                Every edition is put together from writing that is free to republish: research explained by the people who
                did it, reporting from around the world, NASA&rsquo;s own news, a forecast for your city, and a newspaper printed
                on this date a hundred years ago. Each piece runs whole, with its author and license printed beside it.
              </p>
              <p>
                The page is cut to the size of your screen, so a Kindle Paperwhite shows a two-column page and a Kindle Scribe
                shows three, with no zooming or panning. Black ink on white, because that is what e-ink does well.
              </p>
            </div>
            <div className="cta-row">
              <Link className="button" href={next}>
                {nextLabel}
              </Link>
              <a href="#price">
                {TRIAL_DAYS} days free, then {PRICE_PER_MONTH} a month
              </a>
            </div>
          </div>
          <figure className="sheet-figure">
            <Image src={front} alt="The front page of a sample edition. The lead story is about Schrödinger's equation at 100, with two NASA stories beside it and the weather in the masthead." priority sizes="(max-width: 860px) 100vw, 30rem" />
            <figcaption>The Kansas City edition for October 1, 2026, as it appears on a Kindle Scribe.</figcaption>
          </figure>
        </article>

        <section className="section" aria-labelledby="inside">
          <h2 className="section-head" id="inside">What&rsquo;s inside</h2>
          <div className="contents">
            {CONTENTS.map((item) => (
              <div className="contents-item" key={item.title}>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
                <span className="source">{item.source}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="section" aria-labelledby="pages">
          <h2 className="section-head" id="pages">Pages from the sample editions</h2>
          <div className="pages">
            <figure className="sheet-figure">
              <Image src={science} alt="A science page carrying a study of how female tree frogs choose between calling males, by researchers at the University of Tennessee." sizes="(max-width: 860px) 100vw, 22rem" />
              <figcaption>Science. Long stories run across columns and jump between pages, as in a printed paper.</figcaption>
            </figure>
            <figure className="sheet-figure">
              <Image src={archives} alt="A page of stories reprinted from The Bismarck Tribune of October 1, 1926." sizes="(max-width: 860px) 100vw, 22rem" />
              <figcaption>From the archives: The Bismarck Tribune, October 1, 1926.</figcaption>
            </figure>
            <figure className="sheet-figure">
              <Image src={last} alt="The last page: a word search, the almanac for Chicago, and the words That's all for today." sizes="(max-width: 860px) 100vw, 22rem" />
              <figcaption>The last page. The word search uses words from the day&rsquo;s poem.</figcaption>
            </figure>
          </div>
        </section>

        <section className="section" aria-labelledby="how">
          <h2 className="section-head" id="how">How it reaches your reader</h2>
          <ol className="steps">
            <li>
              <h3>Sign in with your email</h3>
              <p>No password. We send a link that signs you in.</p>
            </li>
            <li>
              <h3>Choose your reader and weather</h3>
              <p>The reader sets the page size. A city adds its forecast and almanac; the news stays the same.</p>
            </li>
            <li>
              <h3>Approve our address with Amazon</h3>
              <p>
                Kindles only accept files from senders you list. The <Link href="/guide">setup guide</Link> shows where.
              </p>
            </li>
            <li>
              <h3>Read it with your coffee</h3>
              <p>The paper appears in your Kindle library each morning. Send yourself a test copy first to check.</p>
            </li>
          </ol>
        </section>

        <section className="section" aria-labelledby="price">
          <h2 className="section-head" id="price">Subscription</h2>
          <div className="price-box">
            <p className="price">{PRICE_PER_MONTH} a month</p>
            <p>
              The first {TRIAL_DAYS} days are free. It renews monthly until you cancel, which you can do from your account page
              at any time.
            </p>
            <p>
              <em>
                {billingEnabled()
                  ? "No card needed to start. The free days begin with your first paper, and nothing is charged unless you subscribe."
                  : deliveryLive()
                    ? "Billing has not started yet, so the paper is free for now. You won't be charged unless you choose a plan."
                    : "Daily delivery and billing have not started yet. Sign up now and we'll email you before the first edition goes out. You won't be charged unless you choose a plan."}
              </em>
            </p>
          </div>
        </section>

        <section className="section" aria-labelledby="questions">
          <h2 className="section-head" id="questions">Questions</h2>
          <div className="questions">
            {QUESTIONS.map((item) => (
              <div className="question" key={item.q}>
                <h3>{item.q}</h3>
                <p>{item.a}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
