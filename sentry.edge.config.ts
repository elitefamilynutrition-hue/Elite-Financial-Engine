import * as Sentry from '@sentry/nextjs';

/**
 * Edge runtime Sentry init. No-ops when SENTRY_DSN is unset.
 */
Sentry.init({
  dsn: process.env.SENTRY_DSN || undefined,
  enabled: Boolean(process.env.SENTRY_DSN),
  tracesSampleRate: 0.1,
  environment: process.env.NODE_ENV,
});
