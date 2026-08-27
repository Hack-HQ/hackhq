import type { MetadataRoute } from "next";

/* The site had no sitemap at all, so /sitemap.xml returned 404 and the only
   thing pointing crawlers at these routes was the home page's own links.

   Listed explicitly rather than derived from the filesystem: /auth is a
   dynamic Clerk catch-all and /my is behind sign-in, so neither belongs in a
   sitemap, and a directory walk would happily include both. Keeping this a
   short hand-written list makes that decision visible instead of incidental. */

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://hacking-hq.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const routes: Array<{
    path: string;
    changeFrequency: "daily" | "weekly" | "monthly";
    priority: number;
  }> = [
    { path: "/", changeFrequency: "daily", priority: 1 },
    { path: "/globe", changeFrequency: "daily", priority: 0.9 },
    { path: "/deck", changeFrequency: "daily", priority: 0.9 },
    { path: "/hackathons", changeFrequency: "daily", priority: 0.8 },
    { path: "/resources", changeFrequency: "monthly", priority: 0.6 },
    { path: "/privacy", changeFrequency: "monthly", priority: 0.2 },
    { path: "/terms", changeFrequency: "monthly", priority: 0.2 },
  ];

  return routes.map((r) => ({
    url: new URL(r.path, SITE_URL).toString(),
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));
}
