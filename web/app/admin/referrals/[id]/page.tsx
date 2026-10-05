import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { referrers } from "@/db/schema";
import { PageShell } from "@/components/page-shell";
import { ActionForm } from "@/components/action-form";
import { CopyField } from "@/components/copy-field";
import { addLinkAction, endReferrerAction, recordPayoutAction, setPausedAction, updateTermsAction } from "@/app/actions/referrals";
import { requireAdmin } from "@/lib/server/admin";
import { appUrl } from "@/lib/server/config";
import { FORM_1099_CENTS, monthlyFigures, referrerFigures, referrerLinks, referrerPayouts, referrerStatus, statsUrl } from "@/lib/server/referrals";

export const metadata: Metadata = { title: "Referrer", robots: { index: false, follow: false } };

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const isoDay = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

export default async function ReferrerPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [referrer] = await db.select().from(referrers).where(eq(referrers.id, id));
  if (!referrer) notFound();
  const [figures] = (await referrerFigures()).filter((r) => r.referrer.id === id);
  const [links, months, payouts] = await Promise.all([referrerLinks(id), monthlyFigures(id), referrerPayouts(id)]);
  const status = referrerStatus(referrer);
  const needsW9 = referrer.kind === "individual" && !referrer.w9OnFile && figures.paidThisYearCents >= FORM_1099_CENTS * 0.8;
  const thisMonth = new Date().toISOString().slice(0, 7);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <PageShell wide>
      <p>
        <Link href="/admin/referrals">All referrals</Link>
      </p>
      <h1>{referrer.name}</h1>
      <p className="lede">
        {referrer.kind === "individual" ? "Individual" : "Organization"}, {status}. {usd(referrer.payoutCents)} per paying reader
        {referrer.maxPayouts != null ? `, capped at ${referrer.maxPayouts}` : ""}.
        {referrer.contact ? ` Contact: ${referrer.contact}.` : ""}
      </p>
      {needsW9 && (
        <div className="notice" role="alert">
          <p>
            Paid {usd(figures.paidThisYearCents)} this year with no W-9 on file. Get one before payouts reach $600; you&rsquo;ll file a
            1099-NEC for them.
          </p>
        </div>
      )}

      <dl className="tally">
        {(
          [
            ["Clicks", figures.clicks],
            ["Sign-ups", figures.signups],
            ["Paying", figures.paying],
            ["Earned", usd(figures.earnedCents)],
            ["Paid out", usd(figures.paidOutCents)],
            ["Owed", usd(figures.owedCents)],
          ] as [string, string | number][]
        ).map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      <h2>Their stats page</h2>
      <p>Send this to {referrer.name}. It shows their clicks, sign-ups and paying readers live, and nothing else.</p>
      <CopyField id="stats-url" label="Private stats page" value={statsUrl(id)} />

      <h2>Links</h2>
      {links.map((l) => (
        <div key={l.code}>
          <CopyField id={`link-${l.code}`} label={`${l.label ?? l.code}${l.disabledAt ? " (off)" : ""}: ${l.clicks} clicks, ${l.signups} sign-ups, ${l.paying} paying`} value={`${appUrl()}/via/${l.code}`} />
        </div>
      ))}
      <ActionForm action={addLinkAction} submitLabel="Add link">
        <input type="hidden" name="referrerId" value={id} />
        <div className="field">
          <label htmlFor="code">New link code</label>
          <input id="code" name="code" type="text" required maxLength={32} pattern="[a-z0-9\-]{2,32}" />
        </div>
        <div className="field">
          <label htmlFor="label">What it&rsquo;s for</label>
          <input id="label" name="label" type="text" maxLength={80} />
        </div>
      </ActionForm>

      <h2>By month</h2>
      {months.length ? (
        <div className="figures-wrap">
          <table className="figures">
            <thead>
              <tr>
                <th>Month</th>
                <th>Clicks</th>
                <th>Sign-ups</th>
                <th>Paying</th>
                <th>Voided</th>
                <th>Earned</th>
                <th>Paid out</th>
                <th>Statement</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.month}>
                  <td>{m.month}</td>
                  <td>{m.clicks}</td>
                  <td>{m.signups}</td>
                  <td>{m.paying}</td>
                  <td>{m.voided}</td>
                  <td>{usd(m.earnedCents - m.voidedCents)}</td>
                  <td>{usd(m.paidOutCents)}</td>
                  <td>
                    <a href={`/admin/referrals/${id}/statement/${m.month}`}>CSV</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>
          Nothing yet. <a href={`/admin/referrals/${id}/statement/${thisMonth}`}>This month&rsquo;s statement</a> will fill in as readers arrive.
        </p>
      )}

      <h2>Record a payout</h2>
      <ActionForm action={recordPayoutAction} submitLabel="Record payout">
        <input type="hidden" name="referrerId" value={id} />
        <div className="field">
          <label htmlFor="amount">Amount (USD)</label>
          <span className="hint">Owed now: {usd(figures.owedCents)}.</span>
          <input id="amount" name="amount" type="text" inputMode="decimal" required />
        </div>
        <div className="field">
          <label htmlFor="paidOn">Paid on</label>
          <input id="paidOn" name="paidOn" type="date" defaultValue={today} required />
        </div>
        <div className="field">
          <label htmlFor="method">Method</label>
          <select id="method" name="method" defaultValue="Zelle">
            <option>Zelle</option>
            <option>PayPal</option>
            <option>Bank transfer</option>
            <option>Other</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="note">Note</label>
          <input id="note" name="note" type="text" maxLength={200} />
        </div>
      </ActionForm>
      {payouts.length > 0 && (
        <div className="figures-wrap">
          <table className="figures">
            <thead>
              <tr>
                <th>Paid on</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {payouts.map((p) => (
                <tr key={p.id}>
                  <td>{p.paidOn}</td>
                  <td>{usd(p.amountCents)}</td>
                  <td>{p.method}</td>
                  <td>{p.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>Terms</h2>
      <ActionForm action={updateTermsAction} submitLabel="Save terms">
        <input type="hidden" name="referrerId" value={id} />
        <div className="field">
          <label htmlFor="payout">Paid per paying reader (USD)</label>
          <span className="hint">Applies to readers who pay from now on. Past months keep their rate.</span>
          <input id="payout" name="payout" type="text" inputMode="decimal" defaultValue={(referrer.payoutCents / 100).toFixed(2)} required />
        </div>
        <div className="field">
          <label htmlFor="maxPayouts">Cap on paying readers</label>
          <input id="maxPayouts" name="maxPayouts" type="text" inputMode="numeric" defaultValue={referrer.maxPayouts ?? ""} />
        </div>
        <div className="field">
          <label htmlFor="endsOn">Ends on</label>
          <input id="endsOn" name="endsOn" type="date" defaultValue={isoDay(referrer.endsAt)} />
        </div>
        <div className="field">
          <label htmlFor="agreedOn">Agreed in writing on</label>
          <input id="agreedOn" name="agreedOn" type="date" defaultValue={referrer.agreedAt ?? ""} />
        </div>
        <label className="check">
          <input type="checkbox" name="w9" defaultChecked={referrer.w9OnFile} />
          <span>W-9 on file</span>
        </label>
      </ActionForm>

      <div className="actions-row spaced">
        {status !== "ended" && (
          <form action={setPausedAction}>
            <input type="hidden" name="referrerId" value={id} />
            <input type="hidden" name="pause" value={referrer.pausedAt ? "0" : "1"} />
            <button className="button button-quiet" type="submit">
              {referrer.pausedAt ? "Resume" : "Pause new sign-ups"}
            </button>
          </form>
        )}
        {status !== "ended" && (
          <form action={endReferrerAction}>
            <input type="hidden" name="referrerId" value={id} />
            <button className="link-button" type="submit">
              End this referrer now
            </button>
          </form>
        )}
      </div>
    </PageShell>
  );
}
