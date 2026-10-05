import { describe, expect, it } from "vitest";
import sitemap from "./sitemap";

describe("sitemap", () => {
  it("lists the Kindle news guide so search engines find it", () => {
    const urls = sitemap().map((entry) => new URL(entry.url).pathname);
    expect(urls).toContain("/guides/daily-news-on-kindle");
    expect(urls).toContain("/guides/daily-news-on-kobo-and-remarkable");
  });
});
