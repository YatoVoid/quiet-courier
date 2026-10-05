import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import { latestSample } from "@/lib/server/editions";
import { PRICE_PER_MONTH, TRIAL_DAYS } from "@/lib/site";

export const metadata: Metadata = {
  title: "A sample edition",
  description: "Today's edition of The Quiet Courier, free to read: the newspaper for Kindle and e-ink readers.",
  alternates: { canonical: "/sample" },
};

const long = (d: string) =>
  new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${d}T00:00:00Z`),
  );

export default async function SamplePage() {
  const sample = await latestSample();
  return (
    <PageShell>
      <h1>A sample edition</h1>
      {sample ? (
        <>
          <p className="lede">
            This is the real paper for {long(sample.date)}, the general edition without local weather. It&rsquo;s the same
            paper subscribers got this morning, apart from their own forecast. Open it on your phone, or send it to your reader.
          </p>
          <ul className="sample-files">
            {sample.files.small && (
              <li>
                <a href="/sample/small.pdf">For a 6 to 7 inch reader</a>
                <span>PDF, two columns. Kindle, Paperwhite, Kobo Clara.</span>
              </li>
            )}
            {sample.files.large && (
              <li>
                <a href="/sample/large.pdf">For a 10 inch reader or larger</a>
                <span>PDF, three columns. Kindle Scribe, Boox Note, reMarkable.</span>
              </li>
            )}
            {sample.files.epub && (
              <li>
                <a href="/sample/edition.epub">As a reflowable book</a>
                <span>EPUB, text resizes. Any reader.</span>
              </li>
            )}
          </ul>
        </>
      ) : (
        <p className="lede">The first sample edition is printed tomorrow morning. Check back then.</p>
      )}
      <p>
        Want one every morning at 5 a.m.? The first {TRIAL_DAYS} days are free with no card, then {PRICE_PER_MONTH} a month.
      </p>
      <div className="cta-row">
        <Link className="button" href="/signin">
          Start your free days
        </Link>
      </div>
    </PageShell>
  );
}
