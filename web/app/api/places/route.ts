import { NextResponse, type NextRequest } from "next/server";
import { searchPlaces } from "@/lib/server/places";
import { currentUser } from "@/lib/server/session";

export async function GET(request: NextRequest) {
  if (!(await currentUser())) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const q = request.nextUrl.searchParams.get("q") ?? "";
  const results = await searchPlaces(q);
  return NextResponse.json({ results }, { headers: { "Cache-Control": "private, no-store" } });
}
