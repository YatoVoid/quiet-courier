import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const site = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/account", "/admin", "/api/", "/welcome", "/subscribe", "/verify-delivery", "/signin/", "/read/", "/stats/", "/via/"],
    },
    sitemap: `${site}/sitemap.xml`,
  };
}
