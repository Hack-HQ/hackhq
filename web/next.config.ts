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
        pathname: "/Jose-Gael-Cruz-Lopez/hackhq/**",
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
        // (scripts/copy-repo-assets.mjs). Serve them with nosniff and an
        // immutable long cache since their paths are content-stable.
        source: "/repo-assets/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
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
