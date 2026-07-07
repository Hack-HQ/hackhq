import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
  turbopack: {
    resolveAlias: {
      // Vendored Framer modules (components/vendor/*) import "framer" for
      // design-tool APIs; route that package to a tiny local shim.
      framer: "./components/vendor/framer-shim.ts",
    },
  },
};

export default nextConfig;
