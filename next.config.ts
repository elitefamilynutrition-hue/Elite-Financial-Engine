import type { NextConfig } from "next";
import path from "node:path";

/**
 * Runtime Sentry is wired via instrumentation.ts / instrumentation-client.ts.
 * Skip withSentryConfig — @sentry/nextjs v11 does not export it from the
 * package root used by Next's config loader, and we intentionally disable
 * source-map upload (no SENTRY_AUTH_TOKEN).
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {
    root: path.resolve(__dirname),
  },
  poweredByHeader: false,
};

export default nextConfig;
