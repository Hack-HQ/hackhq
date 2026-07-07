import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The data pages read the repo-root README.md and .github/scripts/listings.json
  // at request time (hourly ISR revalidation). Those files live outside web/, so
  // Next's serverless file tracing must be told to bundle them or the runtime
  // read fails with ENOENT. Set the tracing root to the repo root — there's no
  // lockfile there, so it would otherwise default to web/ and exclude the parent
  // files — and explicitly include the two data files for every route.
  outputFileTracingRoot: path.join(process.cwd(), ".."),
  outputFileTracingIncludes: {
    "/**": ["../README.md", "../.github/scripts/listings.json"],
  },
  logging: {
    browserToTerminal: false,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "raw.githubusercontent.com",
        pathname: "/Hack-HQ/hackhq/**",
      },
    ],
    dangerouslyAllowSVG: true,
    // Pair the SVG allowance with a strict CSP + forced download so a
    // user-influenced SVG served through next/image can't execute script.
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    contentDispositionType: "attachment",
  },
  async headers() {
    return [
      {
        // Repo assets are copied into public/repo-assets at build time
        // (scripts/copy-repo-assets.mjs). Their PATHS are stable but their
        // CONTENT is not — the stats banner and gallery photos are regenerated
        // and committed by CI at the same filename. A long/immutable cache would
        // freeze the live banner for returning visitors (and next/image), so use
        // a short CDN cache that revalidates and serves stale while doing so.
        source: "/repo-assets/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Cache-Control",
            value: "public, max-age=0, s-maxage=300, stale-while-revalidate=86400",
          },
        ],
      },
    ];
  },
  turbopack: {
    resolveAlias: {
      // Vendored Framer modules (components/vendor/*) import "framer" for
      // design-tool APIs; route that package to a tiny local shim.
      framer: "./components/vendor/framer-shim.ts",
    },
  },
};

export default nextConfig;
