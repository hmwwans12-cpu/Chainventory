import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // CF-22: lengkapi disallow untuk semua rute privat/auth agar tidak
      // ter-crawl (sinkron dengan PROTECTED_ROUTES + AUTH_ROUTES).
      disallow: [
        "/dashboard",
        "/inventory",
        "/transactions",
        "/members",
        "/analytics",
        "/notifications",
        "/blockchain",
        "/settings",
        "/console",
        "/login",
        "/signup",
        "/onboarding",
        "/invite",
        "/forgot-password",
        "/reset-password",
        "/auth",
        "/api/",
      ],
    },
    sitemap: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://chainventory.vercel.app"}/sitemap.xml`,
  };
}
