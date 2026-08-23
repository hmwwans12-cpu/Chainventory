import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/dashboard",
        "/inventory",
        "/transactions",
        "/members",
        "/analytics",
        "/notifications",
        "/blockchain",
        "/settings",
        "/api/",
      ],
    },
    sitemap: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://chainventory.vercel.app"}/sitemap.xml`,
  };
}
