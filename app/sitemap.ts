import type { MetadataRoute } from "next";

import { source } from "@/lib/source";

// CF-22: hanya halaman publik terindeks. /login dan /signup noindex
// (metadata robots) sehingga tidak masuk sitemap — hemat crawl budget.
// NCF-15: subtree /docs/* digenerate dari sumber fumadocs yang sama dengan
// halaman docs (bukan daftar manual yang basi).
const PUBLIC_PATHS = ["/", "/features", "/about", "/faq", "/docs"];

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://chainventory.vercel.app";

  // Tanpa API dinamis (cookies/headers) rute ini static: lastModified
  // dibekukan saat build, bukan per request.
  const now = new Date();
  const statics: MetadataRoute.Sitemap = PUBLIC_PATHS.map((path) => ({
    url: `${baseUrl}${path === "/" ? "" : path}`,
    lastModified: now,
    changeFrequency: path === "/" ? "monthly" : "yearly",
    priority: path === "/" ? 1 : 0.7,
  }));

  const docs: MetadataRoute.Sitemap = source.getPages().map((page) => ({
    url: `${baseUrl}${page.url}`,
    lastModified: now,
    changeFrequency: "yearly",
    priority: 0.5,
  }));

  const seen = new Set<string>();
  return [...statics, ...docs].filter((entry) => {
    if (seen.has(entry.url)) return false;
    seen.add(entry.url);
    return true;
  });
}
