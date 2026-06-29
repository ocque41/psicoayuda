import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Don't advertise the framework on every response (tiny header savings + less fingerprinting).
  poweredByHeader: false,
  // Surface unsafe lifecycles / side effects early; no production runtime cost.
  reactStrictMode: true,
};

export default nextConfig;
