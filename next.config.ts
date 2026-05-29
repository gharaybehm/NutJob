import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {},
  async redirects() {
    return [
      {
        source: "/",
        destination: "/farms",
        permanent: false,
      },
      {
        source: "/dashboard",
        destination: "/farms",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
