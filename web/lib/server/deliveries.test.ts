import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: {} }));

import { describeDelivery } from "./deliveries";

const base = {
  id: 1, userId: "u", editionKey: "general", format: "small", attempts: 1, providerId: null, error: null,
  createdAt: new Date(), updatedAt: new Date(),
};

describe("describeDelivery", () => {
  it("states when the last paper went out, in the reader's time", () => {
    const row = { ...base, editionDate: "2026-10-02", status: "sent" as const, sentAt: new Date("2026-10-02T10:01:00Z") };
    expect(describeDelivery(row, "America/Chicago")).toBe("The October 2 edition was sent at 5:01\u00a0a.m.");
  });

  it("says a failed send is being retried during the morning window", () => {
    const row = { ...base, editionDate: "2026-10-03", status: "failed" as const, sentAt: null };
    expect(describeDelivery(row, "America/Chicago", new Date("2026-10-03T12:30:00Z"))).toContain("We retry every hour");
  });

  it("stops promising retries after 10 a.m. or the last attempt", () => {
    const row = { ...base, editionDate: "2026-10-03", status: "failed" as const, sentAt: null };
    const late = describeDelivery(row, "America/Chicago", new Date("2026-10-03T18:00:00Z"));
    expect(late).toBe("The October 3 edition couldn't be sent. The next paper comes at 5 a.m. as usual.");
    const spent = describeDelivery({ ...row, attempts: 5 }, "America/Chicago", new Date("2026-10-03T13:00:00Z"));
    expect(spent).not.toContain("We retry");
    expect(describeDelivery(row, "America/Chicago", new Date("2026-10-04T12:30:00Z"))).not.toContain("We retry");
  });

  it("returns nothing before the first paper", () => {
    expect(describeDelivery(null, "UTC")).toBeNull();
  });
});
