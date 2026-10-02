import Link from "next/link";
import { MOTTO, PAPER_NAME } from "@/lib/site";

export function CompactMasthead({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="masthead-compact">
      <p className="nameplate">
        <Link href="/">{PAPER_NAME}</Link>
      </p>
      <nav aria-label="Site">
        <Link href="/guide">Setup guide</Link>
        {signedIn ? <Link href="/account">Your account</Link> : <Link href="/signin">Sign in</Link>}
      </nav>
    </header>
  );
}

export function FrontMasthead({ date, signedIn }: { date: string; signedIn: boolean }) {
  return (
    <header className="masthead">
      <div className="masthead-top">
        <div className="ear">
          <p className="ear-head">Delivery</p>
          <p>To your Kindle by email, early each morning wherever you are.</p>
        </div>
        <div className="title-block">
          <h1 className="nameplate">{PAPER_NAME}</h1>
          <p className="motto">&ldquo;{MOTTO}&rdquo;</p>
        </div>
        <div className="ear">
          <p className="ear-head">Price</p>
          <p>Four dollars a month after fourteen free days.</p>
        </div>
      </div>
      <div className="dateline">
        <span>{date}</span>
        <nav aria-label="Site">
          <Link href="/guide">Setup guide</Link>
          {signedIn ? <Link href="/account">Your account</Link> : <Link href="/signin">Sign in</Link>}
        </nav>
      </div>
    </header>
  );
}
