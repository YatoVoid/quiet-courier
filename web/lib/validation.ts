import { z } from "zod";
import { FORMAT_IDS } from "./formats";

// Device inboxes only accept mail from senders the owner approved, so a mistyped or
// borrowed address can't be used to send someone unwanted mail. Other addresses get a
// confirmation link first.
const DEVICE_INBOX_DOMAINS = ["kindle.com", "free.kindle.com", "pbsync.com"];

export function normalizeEmail(raw: string) {
  return raw.trim().toLowerCase();
}

export const emailSchema = z
  .string()
  .transform(normalizeEmail)
  .pipe(z.email({ error: "Enter an email address like name@example.com." }).max(254, { error: "That address is too long." }));

function cleanText(raw: string) {
  return raw.replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim();
}

export const nameSchema = z
  .string()
  .transform(cleanText)
  .pipe(z.string().min(1, { error: "Enter the name to print on your paper." }).max(60, { error: "Keep the name under 60 characters." }));

export function isDeviceInbox(email: string) {
  const domain = email.split("@")[1] ?? "";
  return DEVICE_INBOX_DOMAINS.includes(domain);
}

export function profileSchema(cityIds: string[]) {
  return z.object({
    name: nameSchema,
    cityId: z.string().refine((id) => cityIds.includes(id), { error: "Choose a city from the list." }),
    format: z.enum(FORMAT_IDS, { error: "Choose the size of your reader." }),
    deliveryEmail: emailSchema,
  });
}

export type Profile = z.infer<ReturnType<typeof profileSchema>>;

export function fieldErrors(error: z.ZodError) {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}
