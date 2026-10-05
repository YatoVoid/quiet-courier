import { readFile } from "node:fs/promises";
import { latestSample } from "@/lib/server/editions";
import type { FormatId } from "@/lib/formats";

const FILES: Record<string, { format: FormatId; type: string; ext: string }> = {
  "small.pdf": { format: "small", type: "application/pdf", ext: "pdf" },
  "large.pdf": { format: "large", type: "application/pdf", ext: "pdf" },
  "edition.epub": { format: "epub", type: "application/epub+zip", ext: "epub" },
};

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const wanted = FILES[(await params).file];
  if (!wanted) return new Response("Not found", { status: 404 });
  const sample = await latestSample();
  const path = sample?.files[wanted.format];
  if (!sample || !path) return new Response("No sample edition yet. The next one is printed tomorrow morning.", { status: 404 });
  const body = await readFile(path);
  // PDFs open in the browser so the sample can be read on a phone; an EPUB has to be saved.
  const disposition = wanted.ext === "pdf" ? "inline" : "attachment";
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": wanted.type,
      "Content-Length": String(body.length),
      "Content-Disposition": `${disposition}; filename="The Quiet Courier sample ${sample.date}.${wanted.ext}"`,
      "Cache-Control": "public, max-age=600",
    },
  });
}
