import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Hide the floating dev-tools badge (overlaps the mobile bottom nav and
  // confuses preview users); dev-only, production unaffected.
  devIndicators: false,
  allowedDevOrigins: [
    "172.30.227.225",
    "localhost",
    "127.0.0.1",
  ],
};

export default nextConfig;
