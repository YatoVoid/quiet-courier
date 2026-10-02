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

export function editionFilename(cityId: string, format: FormatId) {
  return format === "epub" ? `${cityId}.epub` : `${cityId}_${format}.pdf`;
}

async function isFile(p: string) {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}

// Newest dated build first (out/<date>/<city>/), then the sample editions in out/.
// cityId and format come from allowlists, never straight from a request.
export async function findEdition(cityId: string, format: FormatId) {
  const root = editionsDir();
  const name = editionFilename(cityId, format);
  let dates: string[] = [];
  try {
    dates = (await readdir(root)).filter((d) => DATE_DIR.test(d)).sort().reverse();
  } catch {
    return null;
  }
  for (const date of dates) {
    const candidate = path.join(root, date, cityId, name);
    if (await isFile(candidate)) return { path: candidate, name, date };
  }
  const sample = path.join(root, name);
  return (await isFile(sample)) ? { path: sample, name, date: null } : null;
}

export async function readEdition(found: { path: string }) {
  const info = await stat(found.path);
  if (info.size > MAX_ATTACHMENT_BYTES) throw new Error(`edition file is ${info.size} bytes, over the attachment limit`);
  return readFile(found.path);
}
