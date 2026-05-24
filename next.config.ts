import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {},
  serverActions: {
    bodySizeLimit: "10mb",
  },
  async redirects() {
    return [
      {
        source: "/",
        destination: "/dashboard",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
