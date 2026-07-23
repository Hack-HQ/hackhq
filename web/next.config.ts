import path from "node:path";
import type { NextConfig } from "next";

// Single source of repo identity (mirrors lib/repo.ts; kept inline so the
// config file has no local-module import). Override via NEXT_PUBLIC_REPO_SLUG.
const REPO_SLUG =
  process.env.NEXT_PUBLIC_REPO_SLUG ?? "Hack-HQ/hackhq";

const nextConfig: NextConfig = {
  // The data pages read repo-root files at request time (hourly ISR
  // revalidation). Those files live outside web/, so Next's serverless file
  // tracing must be told to bundle them or the runtime read fails with ENOENT.
  // Set the tracing root to the repo root — there's no lockfile there, so it
  // would otherwise default to web/ and exclude the parent files — and
  // explicitly include every data file we read, for every route.
  //
  // ANY new fs.readFileSync of a repo-root file must be added here. A build
  // won't catch the omission: the file is on disk at build time, so it only
  // fails later, on the first ISR regeneration in production.
  outputFileTracingRoot: path.join(process.cwd(), ".."),
  outputFileTracingIncludes: {
    "/**": [
      "../README.md",
      "../.github/scripts/listings.json",
      // Read by lib/geo.ts to place listings on the globe.
      "../.github/scripts/geocodes.json",
    ],
  },
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
        // Baseline security headers for every response. Deliberately scoped to
        // safe, high-value headers: framing/clickjacking defense, referrer
        // trimming, MIME sniffing, HSTS, and a locked-down Permissions-Policy.
        // A full resource CSP (default-src/script-src/…) is intentionally NOT
        // set here — it needs per-integration allowances (Clerk, Mapbox,
        // next/image) and careful testing, so it's tracked as a follow-up. The
        // `frame-ancestors` directive below is safe on its own (it restricts
        // only who may embed us, not what we may load).
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'self'",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
      {
        // Repo assets are copied into public/repo-assets at build time
        // (scripts/copy-repo-assets.mjs). Their PATHS are stable but their
        // CONTENT is not — the stats banner and gallery photos are regenerated
        // and committed by CI at the same filename. A long/immutable cache would
        // freeze the live banner for returning visitors (and next/image), so use
        // a short CDN cache that revalidates and serves stale while doing so.
        // (X-Content-Type-Options is already set globally above.)
        source: "/repo-assets/:path*",
        headers: [
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
