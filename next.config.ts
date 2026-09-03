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
};

export default nextConfig;
