import { isAdmin } from "@/lib/server/admin";
import { audit } from "@/lib/server/audit";
import { accountingCsv } from "@/lib/server/referrals";
import { clientIp, currentUser } from "@/lib/server/session";

export async function GET(_req: Request, { params }: { params: Promise<{ year: string }> }) {
  const user = await currentUser();
  if (!isAdmin(user)) return new Response("Not found", { status: 404 });
  const { year } = await params;
  if (!/^\d{4}$/.test(year)) return new Response("Not found", { status: 404 });
  const body = await accountingCsv(Number(year));
  await audit("admin_referral_changed", { userId: user!.id, ip: await clientIp(), detail: { action: "accounting_export", year } });
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="quiet-courier-referral-payouts-${year}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
