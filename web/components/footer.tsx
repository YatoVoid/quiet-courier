import Link from "next/link";
import { contactEmail } from "@/lib/server/config";

export function Footer() {
  const email = contactEmail();
  return (
    <footer className="footer">
      <p>
        Letters to the editor: <a href={`mailto:${email}`}>{email}</a>
      </p>
      <p>
        Place names from <a href="https://www.geonames.org/">GeoNames</a>, CC BY 4.0.
      </p>
      <nav aria-label="More">
        <Link href="/guides/daily-news-on-kindle">Daily news on a Kindle</Link>
        <Link href="/guides/daily-news-on-kobo-and-remarkable">On a Kobo or reMarkable</Link>
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
      </nav>
    </footer>
  );
}
