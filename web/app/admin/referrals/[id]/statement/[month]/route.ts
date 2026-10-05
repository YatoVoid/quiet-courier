import { eq } from "drizzle-orm";
import { db } from "@/db";
import { referrers } from "@/db/schema";
import { isAdmin } from "@/lib/server/admin";
import { audit } from "@/lib/server/audit";
import { monthlyFigures, referrerFigures, statementCsv } from "@/lib/server/referrals";
import { clientIp, currentUser } from "@/lib/server/session";

const notFound = () => new Response("Not found", { status: 404 });

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; month: string }> }) {
  const user = await currentUser();
  if (!isAdmin(user)) return notFound();
  const { id: rawId, month } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || !/^\d{4}-\d{2}$/.test(month)) return notFound();
  const [referrer] = await db.select().from(referrers).where(eq(referrers.id, id));
  if (!referrer) return notFound();
  const [figures] = (await referrerFigures()).filter((r) => r.referrer.id === id);
  const body = statementCsv(referrer.name, month, await monthlyFigures(id), figures);
  await audit("admin_referral_changed", { userId: user!.id, ip: await clientIp(), detail: { action: "statement", referrerId: id, month } });
  const slug = referrer.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `referrer-${id}`;
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="quiet-courier-${slug}-${month}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
