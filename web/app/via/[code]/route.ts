import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { appUrl, isProduction } from "@/lib/server/config";
import { followLink, REF_COOKIE, REF_TTL_MS } from "@/lib/server/referrals";
import { clientIp } from "@/lib/server/session";

export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const kept = await followLink(code.toLowerCase(), await clientIp());
  const res = NextResponse.redirect(`${appUrl()}/`, 302);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("X-Robots-Tag", "noindex");
  // First touch wins: a reader who already followed one link keeps that referrer.
  if (kept && !(await cookies()).get(REF_COOKIE)) {
    res.cookies.set(REF_COOKIE, kept, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      expires: new Date(Date.now() + REF_TTL_MS),
    });
  }
  return res;
}
