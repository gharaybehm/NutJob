import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

// The CSP connect-src used to hardcode https://*.supabase.co, which breaks the
// moment Supabase is self-hosted on our own domain. Derive it from the URL the
// app is actually built against instead, so cloud and self-hosted both work
// with no edit here. Falls back to the wildcard if the var is missing at build.
const supabaseOrigin = (() => {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return 'https://*.supabase.co wss://*.supabase.co';
  try {
    const { origin } = new URL(raw);
    return `${origin} ${origin.replace(/^https:/, 'wss:')}`;
  } catch {
    return 'https://*.supabase.co wss://*.supabase.co';
  }
})();

const nextConfig: NextConfig = {
  // Emits .next/standalone — a self-contained server.js with only the modules
  // actually used. Required by the Dockerfile's runner stage.
  output: 'standalone',
  experimental: {
    staleTimes: {
      dynamic: 0,
    },
  },
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
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https: blob:",
              `connect-src 'self' ${supabaseOrigin} https://openrouter.ai https://api.open-meteo.com https://trefle.io`,
              "font-src 'self'",
              "worker-src 'self' blob:",
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
