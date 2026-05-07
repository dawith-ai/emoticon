import type { MetadataRoute } from "next";

export const dynamic = "force-static";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://dawith-ai.github.io/emoticon";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const routes = [
    "",
    "/generate",
    "/editor",
    "/marketplace",
    "/tools",
    "/tools/outline",
    "/tools/resize",
    "/resources",
    "/settings",
    "/auth",
    "/privacy",
    "/terms",
  ];
  return routes.map((path) => ({
    url: `${BASE_URL}${path}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: path === "" ? 1 : 0.7,
  }));
}
