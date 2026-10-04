import { openReadLink, opdsFeed, readyEditions, refusal } from "@/lib/server/read-link";
import { clientIp } from "@/lib/server/session";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const access = await openReadLink(token, await clientIp());
  if (!access.ok) return refusal(access.reason);
  return opdsFeed(access.user, await readyEditions(access.user.id));
}
