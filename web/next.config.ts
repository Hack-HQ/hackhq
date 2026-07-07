import type { NextConfig } from "next";

// Single source of repo identity (mirrors lib/repo.ts; kept inline so the
// config file has no local-module import). Override via NEXT_PUBLIC_REPO_SLUG.
const REPO_SLUG =
  process.env.NEXT_PUBLIC_REPO_SLUG ?? "Jose-Gael-Cruz-Lopez/hackhq";

const nextConfig: NextConfig = {
  logging: {
    browserToTerminal: false,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "raw.githubusercontent.com",
        pathname: `/${REPO_SLUG}/**`,
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
