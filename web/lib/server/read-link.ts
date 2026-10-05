import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { deliveries, users, type User } from "@/db/schema";
import type { FormatId } from "@/lib/formats";
import { audit } from "./audit";
import { planFor } from "./billing";
import { appUrl, linkSecret as secret } from "./config";
import { editionFilename, editionsDir } from "./editions";
import { isLimited, LIMITS, record } from "./rate-limit";

// The link carries the user id and a signature over it and readLinkVersion, so the account page can
// show it again at any time and nothing that works as a link is stored in the database.
const ID_CHARS = 22;
const MAC_BYTES = 18;
const TOKEN = /^[A-Za-z0-9_-]{46}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const KEY = /^(general|gn-\d+)$/;
const FORMATS = new Set<string>(["small", "large", "epub"]);

function mac(userId: string, version: number) {
  return createHmac("sha256", secret()).update(`read-link:${userId}:${version}`).digest().subarray(0, MAC_BYTES);
}

export function readToken(user: Pick<User, "id" | "readLinkVersion">) {
  const id = Buffer.from(user.id.replaceAll("-", ""), "hex").toString("base64url");
  return id + mac(user.id, user.readLinkVersion).toString("base64url");
}

function parseToken(token: string) {
  if (!TOKEN.test(token)) return null;
  const hex = Buffer.from(token.slice(0, ID_CHARS), "base64url").toString("hex");
  if (hex.length !== 32) return null;
  const userId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  return { userId, mac: Buffer.from(token.slice(ID_CHARS), "base64url") };
}

export function readLinkUrl(user: Pick<User, "id" | "readLinkVersion">) {
  return `${appUrl()}/read/${readToken(user)}`;
}

export function opdsUrl(user: Pick<User, "id" | "readLinkVersion">) {
  return `${readLinkUrl(user)}/opds`;
}

export async function resetReadLink(user: User, ip: string) {
  await db
    .update(users)
    .set({ readLinkVersion: sql`${users.readLinkVersion} + 1`, updatedAt: new Date() })
    .where(eq(users.id, user.id));
  await audit("read_link_reset", { userId: user.id, ip });
}

export type ReadAccess =
  | { ok: true; user: User }
  | { ok: false; reason: "throttled" | "unknown" | "ended" };

export async function openReadLink(token: string, ip: string, now = new Date()): Promise<ReadAccess> {
  const failKey = `read_fail:ip:${ip}`;
  if (await isLimited(failKey, LIMITS.readFailuresPerIp, now)) return { ok: false, reason: "throttled" };
  const parsed = parseToken(token);
  const [user] = parsed ? await db.select().from(users).where(eq(users.id, parsed.userId)) : [];
  if (!parsed || !user || !timingSafeEqual(parsed.mac, mac(user.id, user.readLinkVersion))) {
    await record(failKey, now);
    return { ok: false, reason: "unknown" };
  }
  const key = `read:user:${user.id}`;
  if (await isLimited(key, LIMITS.readsPerUser, now)) return { ok: false, reason: "throttled" };
  await record(key, now);
  if (planFor(user, now).kind === "ended") return { ok: false, reason: "ended" };
  return { ok: true, user };
}

export type ReadyEdition = { date: string; key: string; format: FormatId; readyAt: Date; path: string; bytes: number };

// Only papers the delivery job recorded for this reader, so the link can never reach another edition.
export async function readyEditions(userId: string, limit = 7): Promise<ReadyEdition[]> {
  const rows = await db
    .select()
    .from(deliveries)
    .where(and(eq(deliveries.userId, userId), eq(deliveries.status, "sent")))
    .orderBy(desc(deliveries.editionDate))
    .limit(limit);
  const out: ReadyEdition[] = [];
  for (const row of rows) {
    if (!DATE.test(row.editionDate) || !KEY.test(row.editionKey) || !FORMATS.has(row.format)) continue;
    const format = row.format as FormatId;
    const file = path.join(editionsDir(), row.editionDate, row.editionKey, editionFilename(row.editionKey, format));
    const info = await stat(file).catch(() => null);
    if (info?.isFile()) {
      out.push({ date: row.editionDate, key: row.editionKey, format, readyAt: row.sentAt ?? row.updatedAt, path: file, bytes: info.size });
    }
  }
  return out;
}

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
};

export function readMessage(status: number, lines: string[]) {
  return new Response(`${lines.join("\n\n")}\n`, {
    status,
    headers: { ...PRIVATE_HEADERS, "Content-Type": "text/plain; charset=utf-8" },
  });
}

export function refusal(reason: "throttled" | "unknown" | "ended") {
  const account = `${appUrl()}/account`;
  switch (reason) {
    case "throttled":
      return readMessage(429, ["Too many requests for this link. Try again in an hour."]);
    case "unknown":
      return readMessage(404, [
        "This link doesn't open a paper. It may have been replaced by a newer one.",
        `Sign in at ${account} to see your current link.`,
      ]);
    case "ended":
      return readMessage(403, [
        "Your free trial has ended, so new papers have stopped.",
        `Subscribe at ${appUrl()}/subscribe and the next morning's paper will be here.`,
      ]);
  }
}

export function longEditionDate(date: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`),
  );
}

export function mimeType(format: FormatId) {
  return format === "epub" ? "application/epub+zip" : "application/pdf";
}

export async function serveEdition(user: User, edition: ReadyEdition, ip: string) {
  let body: Buffer;
  try {
    body = await readFile(edition.path);
  } catch {
    return readMessage(404, ["That paper is no longer kept. Each one stays available for 14 days."]);
  }
  await audit("edition_downloaded", { userId: user.id, ip, detail: { date: edition.date, format: edition.format } });
  const name = `The Quiet Courier ${edition.date}.${edition.format === "epub" ? "epub" : "pdf"}`;
  return new Response(new Uint8Array(body), {
    headers: {
      ...PRIVATE_HEADERS,
      "Content-Type": mimeType(edition.format),
      "Content-Length": String(body.length),
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  });
}

export function nothingYet(user: User) {
  return readMessage(404, [
    user.deliveryStatus === "paused"
      ? `Delivery is paused, so there's no paper here. Resume it at ${appUrl()}/account.`
      : "Your first paper isn't ready yet. It appears here at 5 a.m. your time each morning.",
  ]);
}

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const OPDS_TYPE = "application/atom+xml;profile=opds-catalog;kind=acquisition";

export function opdsFeed(user: User, editions: ReadyEdition[], now = new Date()) {
  const self = opdsUrl(user);
  const base = readLinkUrl(user);
  const updated = (editions[0]?.readyAt ?? now).toISOString();
  const entries = editions.map((e) => {
    const title = `The Quiet Courier, ${longEditionDate(e.date)}`;
    return `  <entry>
    <title>${xml(title)}</title>
    <id>urn:quietcourier:edition:${e.date}:${e.key}:${e.format}</id>
    <updated>${e.readyAt.toISOString()}</updated>
    <author><name>The Quiet Courier</name></author>
    <dc:language>en</dc:language>
    <dc:issued>${e.date}</dc:issued>
    <summary>${xml(`The morning paper for ${longEditionDate(e.date)}.`)}</summary>
    <link rel="http://opds-spec.org/acquisition" href="${xml(`${base}/${e.date}`)}" type="${mimeType(e.format)}" length="${e.bytes}"/>
  </entry>`;
  });
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/terms/" xmlns:opds="http://opds-spec.org/2010/catalog">
  <id>${xml(self)}</id>
  <title>The Quiet Courier</title>
  <updated>${updated}</updated>
  <author><name>The Quiet Courier</name><uri>${xml(appUrl())}</uri></author>
  <link rel="self" href="${xml(self)}" type="${OPDS_TYPE}"/>
  <link rel="start" href="${xml(self)}" type="${OPDS_TYPE}"/>
${entries.join("\n")}
</feed>
`;
  return new Response(body, { headers: { ...PRIVATE_HEADERS, "Content-Type": `${OPDS_TYPE}; charset=utf-8` } });
}
