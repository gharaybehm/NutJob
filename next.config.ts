import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

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

export default withNextIntl(nextConfig);
