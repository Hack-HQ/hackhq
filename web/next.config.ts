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
  },
};

export default nextConfig;
