import type { Metadata } from "next";
import { PageShell } from "@/components/page-shell";
import {
  activity,
  deliveriesByDay,
  failedDeliveries,
  partnerHistory,
  readerCounts,
  recentEditions,
  recentSignups,
  requireAdmin,
} from "@/lib/server/admin";
import { audit } from "@/lib/server/audit";
import { deliveryLive } from "@/lib/server/deliveries";
import { clientIp } from "@/lib/server/session";

export const metadata: Metadata = { title: "Publisher's desk", robots: { index: false, follow: false } };

const day = (d: string) =>
  new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(`${d}T00:00:00Z`),
  );
const when = (d: Date) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(d) +
  " UTC";
const size = (bytes: number) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`);

function Tally({ figures }: { figures: [string, number | string][] }) {
  return (
    <dl className="tally">
      {figures.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export default async function AdminPage() {
  const admin = await requireAdmin();
  await audit("admin_viewed", { userId: admin.id, ip: await clientIp() });

  const [readers, month, byDay, failures, partner, signups, editions] = await Promise.all([
    readerCounts(),
    activity(30),
    deliveriesByDay(7),
    failedDeliveries(),
    partnerHistory(),
    recentSignups(),
    recentEditions(),
  ]);
  const live = deliveryLive();

  return (
    <PageShell wide>
      <h1>Publisher&rsquo;s desk</h1>
      <p className="lede">Counts come from the site&rsquo;s own database. Nothing here tracks readers on the page.</p>
      <div className="notice" role="status">
        <p>
          Daily delivery is <strong>{live ? "on" : "off"}</strong>
          {live ? "." : ". Nothing is emailed until DELIVERY_ENABLED=1 is set on the server."}
        </p>
      </div>

      <h2>Readers</h2>
      <Tally
        figures={[
          ["Accounts", readers.accounts],
          ["Finished setup", readers.onboarded],
          ["Getting the paper", readers.receiving],
          ["Paused", readers.paused],
          ["Address unconfirmed", readers.unconfirmed],
        ]}
      />
      <p className="small-note">
        Of those getting the paper: {readers.small} small PDF, {readers.large} large PDF, {readers.epub} EPUB;{" "}
        {readers.general} on the general edition.
      </p>

      <h3>Newest accounts</h3>
      {signups.length ? (
        <div className="figures-wrap">
        <table className="figures">
          <thead>
            <tr>
              <th scope="col">Email</th>
              <th scope="col">Joined</th>
              <th scope="col">Setup</th>
            </tr>
          </thead>
          <tbody>
            {signups.map((s) => (
              <tr key={s.email}>
                <td className="address">{s.email}</td>
                <td>{when(s.createdAt)}</td>
                <td>{s.onboarded ? "Done" : "Not finished"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      ) : (
        <p>No accounts yet.</p>
      )}

      <h2>The last 30 days</h2>
      <Tally
        figures={[
          ["Sign-ups", month.signups],
          ["Finished setup", month.setupsFinished],
          ["Paused", month.paused],
          ["Resumed", month.resumed],
          ["Deleted", month.deleted],
          ["Delivered", month.successRate == null ? "None yet" : `${Math.round(month.successRate * 100)}%`],
        ]}
      />
      <p className="small-note">
        {month.sent} papers sent, {month.failed} failed for good. {month.signInsThrottled} sign-in requests throttled,{" "}
        {month.linksRejected} sign-in links rejected. Account events are kept 90 days.
      </p>

      <h2>Deliveries</h2>
      {byDay.length ? (
        <div className="figures-wrap">
        <table className="figures">
          <thead>
            <tr>
              <th scope="col">Edition</th>
              <th scope="col">Sent</th>
              <th scope="col">Pending</th>
              <th scope="col">Failed</th>
            </tr>
          </thead>
          <tbody>
            {byDay.map((d) => (
              <tr key={d.date}>
                <td>{day(d.date)}</td>
                <td>{d.sent}</td>
                <td>{d.pending}</td>
                <td>{d.failed}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      ) : (
        <p>No deliveries in the last week.</p>
      )}

      <h3>Failed sends</h3>
      {failures.length ? (
        <div className="figures-wrap">
        <table className="figures">
          <thead>
            <tr>
              <th scope="col">Edition</th>
              <th scope="col">Reader</th>
              <th scope="col">Tries</th>
              <th scope="col">Error</th>
            </tr>
          </thead>
          <tbody>
            {failures.map((f) => (
              <tr key={f.id}>
                <td>
                  {day(f.date)}
                  <br />
                  {f.editionKey}, {f.format}
                </td>
                <td className="address">
                  {f.email}
                  <br />
                  {f.deliveryEmail}
                </td>
                <td>{f.attempts}</td>
                <td className="error-text">{f.error ?? "No error recorded"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      ) : (
        <p>None.</p>
      )}

      <h2>Editions</h2>
      {editions.length ? (
        <div className="figures-wrap">
        <table className="figures">
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Edition</th>
              <th scope="col">Files</th>
            </tr>
          </thead>
          <tbody>
            {editions.map((e) => (
              <tr key={`${e.date}/${e.key}`}>
                <td>{day(e.date)}</td>
                <td>{e.key}</td>
                <td>
                  {e.files.map((f, i) => (
                    <span key={f.name}>
                      {i > 0 && ", "}
                      <a href={`/admin/editions/${e.date}/${e.key}/${f.name}`} download>
                        {f.name.slice(e.key.length).replace(/^_/, "")}
                      </a>{" "}
                      ({size(f.bytes)})
                    </span>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      ) : (
        <p>No editions have been built on this server in the last few days.</p>
      )}

      <h2>The Conversation</h2>
      <p>Copies of each edition that ran their articles, and the monthly usage reports, as agreed with their republishing team.</p>
      <h3>Edition copies</h3>
      {partner.copies.length ? (
        <ul>
          {partner.copies.map((c) => (
            <li key={c.editionDate}>
              {day(c.editionDate)}: {c.articles} {c.articles === 1 ? "article" : "articles"}, sent {when(c.sentAt)}
            </li>
          ))}
        </ul>
      ) : (
        <p>None sent yet. They start with the first delivered edition.</p>
      )}
      <h3>Monthly reports</h3>
      {partner.reports.length ? (
        <ul>
          {partner.reports.map((r) => (
            <li key={r.month}>
              {r.month}: {r.articles} articles, {r.subscribers} readers, sent {when(r.sentAt)}
            </li>
          ))}
        </ul>
      ) : (
        <p>None sent yet. The first goes out on the 1st of the month after delivery starts.</p>
      )}
    </PageShell>
  );
}
