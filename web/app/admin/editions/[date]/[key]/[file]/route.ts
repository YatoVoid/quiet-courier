import { readFile } from "node:fs/promises";
import { editionPath, isAdmin } from "@/lib/server/admin";
import { audit } from "@/lib/server/audit";
import { clientIp, currentUser } from "@/lib/server/session";

const notFound = () => new Response("Not found", { status: 404 });

export async function GET(_req: Request, { params }: { params: Promise<{ date: string; key: string; file: string }> }) {
  const user = await currentUser();
  if (!isAdmin(user)) return notFound();
  const { date, key, file } = await params;
  const found = editionPath(date, key, file);
  if (!found) return notFound();
  let body: Buffer;
  try {
    body = await readFile(found);
  } catch {
    return notFound();
  }
  await audit("admin_edition_downloaded", { userId: user!.id, ip: await clientIp(), detail: { date, key, file } });
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": file.endsWith(".epub") ? "application/epub+zip" : "application/pdf",
      "Content-Disposition": `attachment; filename="${date}-${file}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
