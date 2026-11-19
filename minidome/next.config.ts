import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // `pg` is only used in server code (sync service, admin corrections); keep it out of the bundle.
  serverExternalPackages: ["pg"],
  experimental: { staleTimes: { dynamic: 30, static: 180 } },
};

export default nextConfig;
