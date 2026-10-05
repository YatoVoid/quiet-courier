import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import { ActionForm } from "@/components/action-form";
import { createReferrerAction } from "@/app/actions/referrals";
import { requireAdmin } from "@/lib/server/admin";
import { audit } from "@/lib/server/audit";
import { referrerFigures } from "@/lib/server/referrals";
import { clientIp } from "@/lib/server/session";

export const metadata: Metadata = { title: "Referrals", robots: { index: false, follow: false } };

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export default async function ReferralsPage() {
  const admin = await requireAdmin();
  await audit("admin_viewed", { userId: admin.id, ip: await clientIp(), detail: { page: "referrals" } });
  const rows = await referrerFigures();
  const sum = (k: "clicks" | "signups" | "finishedSetup" | "paying" | "voided" | "earnedCents" | "paidOutCents" | "owedCents") =>
    rows.reduce((s, r) => s + r[k], 0);
  const year = new Date().getUTCFullYear();

  return (
    <PageShell wide>
      <p>
        <Link href="/admin">Publisher&rsquo;s desk</Link>
      </p>
      <h1>Referrals</h1>
      <p className="lede">
        Who sends readers, and what each is owed. A reader counts as paying at their first charge; a full refund takes it back.
      </p>

      {rows.length ? (
        <div className="figures-wrap">
          <table className="figures">
            <thead>
              <tr>
                <th>Referrer</th>
                <th>Status</th>
                <th>Links</th>
                <th>Clicks</th>
                <th>Sign-ups</th>
                <th>Set up</th>
                <th>Paying</th>
                <th>Voided</th>
                <th>Earned</th>
                <th>Paid out</th>
                <th>Owed</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.referrer.id}>
                  <td>
                    <Link href={`/admin/referrals/${r.referrer.id}`}>{r.referrer.name}</Link>
                  </td>
                  <td>{r.status}</td>
                  <td>{r.links}</td>
                  <td>{r.clicks}</td>
                  <td>{r.signups}</td>
                  <td>{r.finishedSetup}</td>
                  <td>{r.paying}</td>
                  <td>{r.voided}</td>
                  <td>{usd(r.earnedCents)}</td>
                  <td>{usd(r.paidOutCents)}</td>
                  <td>{usd(r.owedCents)}</td>
                </tr>
              ))}
              <tr className="totals">
                <td>Total</td>
                <td />
                <td />
                <td>{sum("clicks")}</td>
                <td>{sum("signups")}</td>
                <td>{sum("finishedSetup")}</td>
                <td>{sum("paying")}</td>
                <td>{sum("voided")}</td>
                <td>{usd(sum("earnedCents"))}</td>
                <td>{usd(sum("paidOutCents"))}</td>
                <td>{usd(sum("owedCents"))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <p>No referrers yet.</p>
      )}
      <p className="small-note">
        <a href={`/admin/referrals/accounting/${year}`}>Every payout in {year} as a CSV</a> for the tax return.
      </p>

      <h2>Add a referrer</h2>
      <ActionForm action={createReferrerAction} submitLabel="Add referrer and link">
        <div className="field">
          <label htmlFor="name">Who is paid</label>
          <input id="name" name="name" type="text" required maxLength={120} />
        </div>
        <div className="field">
          <label htmlFor="contact">Contact</label>
          <span className="hint">Email, handle or where you talk to them.</span>
          <input id="contact" name="contact" type="text" maxLength={200} />
        </div>
        <div className="field">
          <label htmlFor="kind">Kind</label>
          <span className="hint">Individuals paid $600 or more in a year need a W-9 and a 1099-NEC.</span>
          <select id="kind" name="kind" defaultValue="individual">
            <option value="individual">Individual</option>
            <option value="organization">Organization</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="payout">Paid per paying reader (USD)</label>
          <input id="payout" name="payout" type="text" inputMode="decimal" defaultValue="3" required />
        </div>
        <div className="field">
          <label htmlFor="maxPayouts">Cap on paying readers</label>
          <span className="hint">Leave empty for no cap.</span>
          <input id="maxPayouts" name="maxPayouts" type="text" inputMode="numeric" />
        </div>
        <div className="field">
          <label htmlFor="endsOn">Ends on</label>
          <span className="hint">Optional. Readers arriving after this aren&rsquo;t counted; those already sent still are.</span>
          <input id="endsOn" name="endsOn" type="date" />
        </div>
        <div className="field">
          <label htmlFor="agreedOn">Agreed in writing on</label>
          <input id="agreedOn" name="agreedOn" type="date" />
        </div>
        <div className="field">
          <label htmlFor="code">Link code</label>
          <span className="hint">The link becomes quietcourier.com/via/code. Lowercase letters, numbers and dashes.</span>
          <input id="code" name="code" type="text" required maxLength={32} pattern="[a-z0-9\-]{2,32}" />
        </div>
        <div className="field">
          <label htmlFor="label">What the link is for</label>
          <span className="hint">Optional, e.g. &ldquo;TikTok video, October&rdquo;.</span>
          <input id="label" name="label" type="text" maxLength={80} />
        </div>
      </ActionForm>
    </PageShell>
  );
}
