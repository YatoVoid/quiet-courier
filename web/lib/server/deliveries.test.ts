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

  it("says a failed send is being retried", () => {
    const row = { ...base, editionDate: "2026-10-02", status: "failed" as const, sentAt: null };
    expect(describeDelivery(row, "Asia/Tokyo")).toContain("couldn't be sent");
  });

  it("returns nothing before the first paper", () => {
    expect(describeDelivery(null, "UTC")).toBeNull();
  });
});
