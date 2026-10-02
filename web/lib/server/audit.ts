import "server-only";
import { db } from "@/db";
import { auditEvents } from "@/db/schema";

export type AuditEvent =
  | "sign_in_requested"
  | "sign_in_throttled"
  | "sign_in"
  | "sign_in_link_rejected"
  | "sign_out"
  | "sign_out_everywhere"
  | "account_created"
  | "terms_accepted"
  | "profile_updated"
  | "delivery_verify_sent"
  | "delivery_verified"
  | "delivery_paused"
  | "delivery_resumed"
  | "test_edition_sent"
  | "test_edition_failed"
  | "account_deleted"
  | "admin_viewed"
  | "admin_edition_downloaded";

export async function audit(event: AuditEvent, opts: { userId?: string | null; ip?: string | null; detail?: Record<string, unknown> } = {}) {
  try {
    await db.insert(auditEvents).values({ event, userId: opts.userId ?? null, ip: opts.ip ?? null, detail: opts.detail ?? null });
  } catch (err) {
    console.error("audit write failed", event, err);
  }
}
