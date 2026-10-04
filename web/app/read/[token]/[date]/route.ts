import { openReadLink, readMessage, readyEditions, refusal, serveEdition } from "@/lib/server/read-link";
import { clientIp } from "@/lib/server/session";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string; date: string }> }) {
  const { token, date } = await params;
  const ip = await clientIp();
  const access = await openReadLink(token, ip);
  if (!access.ok) return refusal(access.reason);
  const edition = (await readyEditions(access.user.id, 14)).find((e) => e.date === date);
  return edition
    ? serveEdition(access.user, edition, ip)
    : readMessage(404, ["There's no paper for that date. Each one stays available for 14 days."]);
}
