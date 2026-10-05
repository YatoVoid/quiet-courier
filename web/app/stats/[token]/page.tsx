import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/page-shell";
import { appUrl } from "@/lib/server/config";
import { monthlyFigures, openStats, referrerFigures, referrerLinks, referrerStatus } from "@/lib/server/referrals";
import { clientIp } from "@/lib/server/session";

export const metadata: Metadata = { title: "Your referral numbers", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const monthName = (m: string) =>
  new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${m}-01T00:00:00Z`));

export default async function StatsPage({ params }: { params: Promise<{ token: string }> }) {
  const referrer = await openStats((await params).token, await clientIp());
  if (!referrer) notFound();
  const [figures] = (await referrerFigures()).filter((r) => r.referrer.id === referrer.id);
  const [links, months] = await Promise.all([referrerLinks(referrer.id), monthlyFigures(referrer.id)]);
  const status = referrerStatus(referrer);

  return (
    <PageShell>
      <h1>Your referral numbers</h1>
      <p className="lede">
        {referrer.name}. These figures are live: reload the page to see the latest. {usd(referrer.payoutCents)} for every reader who
        becomes a paying subscriber{referrer.maxPayouts != null ? `, up to ${referrer.maxPayouts}` : ""}.
        {status !== "active" ? ` This arrangement is ${status}.` : ""}
      </p>
      <dl className="tally">
        {(
          [
            ["Link clicks", figures.clicks],
            ["Sign-ups", figures.signups],
            ["Finished setup", figures.finishedSetup],
            ["Paying readers", figures.paying],
            ["Earned", usd(figures.earnedCents)],
            ["Paid to you", usd(figures.paidOutCents)],
            ["Owed to you", usd(figures.owedCents)],
          ] as [string, string | number][]
        ).map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      <h2>Your {links.length === 1 ? "link" : "links"}</h2>
      <ul className="sample-files">
        {links.map((l) => (
          <li key={l.code}>
            <span className="address">
              {appUrl().replace(/^https?:\/\//, "")}/via/{l.code}
            </span>
            <span>
              {l.label ? `${l.label}. ` : ""}
              {l.clicks} clicks, {l.signups} sign-ups, {l.paying} paying{l.disabledAt ? ". This link is turned off." : ""}
            </span>
          </li>
        ))}
      </ul>

      {months.length > 0 && (
        <>
          <h2>By month</h2>
          <div className="figures-wrap">
            <table className="figures">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Clicks</th>
                  <th>Sign-ups</th>
                  <th>Paying</th>
                  <th>Earned</th>
                  <th>Paid</th>
                </tr>
              </thead>
              <tbody>
                {months.map((m) => (
                  <tr key={m.month}>
                    <td>{monthName(m.month)}</td>
                    <td>{m.clicks}</td>
                    <td>{m.signups}</td>
                    <td>{m.paying}</td>
                    <td>{usd(m.earnedCents - m.voidedCents)}</td>
                    <td>{usd(m.paidOutCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h2>How it counts</h2>
      <ul>
        <li>A click is counted each time someone opens your link. Nothing about who clicked is recorded.</li>
        <li>A sign-up counts when someone creates an account within 30 days of clicking, on any device.</li>
        <li>
          A paying reader counts when their first payment goes through, after the 14-day free trial. A full refund takes it back
          off.
        </li>
        <li>Payouts go out in the first week of each month for the month before, with no minimum.</li>
      </ul>
      <p className="small-note">Keep this page private. Anyone with the address can see these numbers.</p>
    </PageShell>
  );
}
