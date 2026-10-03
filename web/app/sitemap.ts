import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const site = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return [
    { url: `${site}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${site}/guide`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${site}/signin`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${site}/terms`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${site}/privacy`, changeFrequency: "yearly", priority: 0.2 },
  ];
}
