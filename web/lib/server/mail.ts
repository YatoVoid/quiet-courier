import "server-only";
import { isProduction, mailFrom } from "./config";

export type Mail = {
  to: string;
  subject: string;
  text: string;
  attachments?: { filename: string; content: Buffer }[];
  idempotencyKey?: string;
};

export class MailError extends Error {}

const RESEND_URL = "https://api.resend.com/emails";
const TIMEOUT_MS = 20_000;

export async function sendMail(mail: Mail): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (isProduction) throw new MailError("RESEND_API_KEY is not set");
    console.log(`\n[mail] to=${mail.to} subject=${mail.subject}\n${mail.text}\n` +
      (mail.attachments?.map((a) => `[attachment] ${a.filename} ${a.content.length} bytes`).join("\n") ?? ""));
    return;
  }

  let res: Response;
  try {
    res = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...(mail.idempotencyKey ? { "Idempotency-Key": mail.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from: mailFrom(),
        to: [mail.to],
        subject: mail.subject,
        text: mail.text,
        attachments: mail.attachments?.map((a) => ({ filename: a.filename, content: a.content.toString("base64") })),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new MailError(`mail provider unreachable: ${(err as Error).message}`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new MailError(`mail provider returned ${res.status}: ${body.slice(0, 300)}`);
  }
}
