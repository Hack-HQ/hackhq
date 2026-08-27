import { withSentryConfig } from "@sentry/nextjs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

import type { NextConfig } from "next";

// Single source of repo identity (mirrors lib/repo.ts; kept inline so the
// config file has no local-module import). Override via NEXT_PUBLIC_REPO_SLUG.
const REPO_SLUG =
  process.env.NEXT_PUBLIC_REPO_SLUG ?? "Hack-HQ/hackhq";

const nextConfig: NextConfig = {
  // The repo-root data files (README.md, listings.json, geocodes.json) are no
  // longer read from disk at request time — scripts/prepare-repo-data.mjs copies
  // them into lib/generated/ at build time and the loaders import them as
  // constants. So there is nothing outside web/ to trace into the bundle, and
  // the runtime carries no filesystem dependency (this is what lets it deploy to
  // Cloudflare Workers). No outputFileTracing* overrides are needed.
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
    // Pin the workspace root to web/ instead of letting Turbopack infer it.
    // Inference walks up looking for a lockfile, so a stray package-lock.json
    // anywhere above this directory silently wins — it has resolved to $HOME on
    // a dev machine. Pinning also matches what the app actually needs: since
    // #230 nothing outside web/ is read at build (repo data is copied into
    // lib/generated/ first), and Turbopack does not resolve files outside the
    // root, so this makes that invariant enforced rather than incidental.
    root: dirname(fileURLToPath(import.meta.url)),
  },
};

export default withSentryConfig(nextConfig, {
  org: "hackhq",
  project: "javascript-nextjs",

  silent: !process.env.CI,
});
