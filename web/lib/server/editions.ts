import "server-only";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { FormatId } from "@/lib/formats";

const DATE_DIR = /^\d{4}-\d{2}-\d{2}$/;
// Send-to-Kindle accepts attachments up to 50 MB; Resend caps a whole message at 40 MB.
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export function editionsDir() {
  return process.env.EDITIONS_DIR ?? path.resolve(/*turbopackIgnore: true*/ process.cwd(), "../out");
}

export function editionFilename(key: string, format: FormatId) {
  return format === "epub" ? `${key}.epub` : `${key}_${format}.pdf`;
}

async function isFile(p: string) {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}

const KEY = /^(general|gn-\d+|[a-z-]+)$/;

// The reader's own edition if one has been built, then the newest general edition, then any
// sample in out/. A test copy only has to prove delivery works, so another edition will do.
// Keys come from the database or a fixed list, and are checked again before touching the disk.
export async function findEdition(key: string | null, format: FormatId) {
  const root = editionsDir();
  let dates: string[] = [];
  try {
    dates = (await readdir(root)).filter((d) => DATE_DIR.test(d)).sort().reverse();
  } catch {
    return null;
  }
  for (const candidateKey of [key, "general"]) {
    if (!candidateKey || !KEY.test(candidateKey)) continue;
    const name = editionFilename(candidateKey, format);
    for (const date of dates) {
      const candidate = path.join(/*turbopackIgnore: true*/ root, date, candidateKey, name);
      if (await isFile(candidate)) return { path: candidate, name, date, own: candidateKey === key };
    }
  }
  const suffix = format === "epub" ? ".epub" : `_${format}.pdf`;
  const samples = (await readdir(root)).filter((f) => f.endsWith(suffix)).sort();
  for (const name of samples) {
    const candidate = path.join(/*turbopackIgnore: true*/ root, name);
    if (await isFile(candidate)) return { path: candidate, name, date: null, own: false };
  }
  return null;
}

export async function readEdition(found: { path: string }) {
  const info = await stat(found.path);
  if (info.size > MAX_ATTACHMENT_BYTES) throw new Error(`edition file is ${info.size} bytes, over the attachment limit`);
  return readFile(found.path);
}
