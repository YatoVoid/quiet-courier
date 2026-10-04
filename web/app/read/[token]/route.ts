import { openReadLink, nothingYet, readyEditions, refusal, serveEdition } from "@/lib/server/read-link";
import { clientIp } from "@/lib/server/session";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ip = await clientIp();
  const access = await openReadLink(token, ip);
  if (!access.ok) return refusal(access.reason);
  const [latest] = await readyEditions(access.user.id, 1);
  return latest ? serveEdition(access.user, latest, ip) : nothingYet(access.user);
}
