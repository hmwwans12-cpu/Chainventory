import type { MetadataRoute } from "next";

const PUBLIC_PATHS = [
  "/",
  "/features",
  "/about",
  "/faq",
  "/docs",
  "/login",
  "/signup",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://chainventory.vercel.app";

  return PUBLIC_PATHS.map((path) => ({
    url: `${baseUrl}${path === "/" ? "" : path}`,
    lastModified: new Date(),
    changeFrequency: path === "/" ? "monthly" : "yearly",
    priority: path === "/" ? 1 : 0.7,
  }));
}
