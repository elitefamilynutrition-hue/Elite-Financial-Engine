import * as Sentry from '@sentry/nextjs';

/**
 * Browser Sentry init. Prefer NEXT_PUBLIC_SENTRY_DSN (same value as SENTRY_DSN).
 * No-ops when unset so local/CI without Sentry stays quiet.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN || undefined;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  tracesSampleRate: 0.1,
  environment: process.env.NODE_ENV,
});
