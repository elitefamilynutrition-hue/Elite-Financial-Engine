import { ApiError } from '@/lib/http/api-error';

/**
 * Gate for Vercel Cron / ops callers. Expects:
 *   Authorization: Bearer <CRON_SECRET>
 * or header x-cron-secret: <CRON_SECRET>
 */
export function requireCronSecret(request: Request): void {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    throw ApiError.forbidden('CRON_SECRET is not configured.');
  }

  const auth = request.headers.get('authorization') || '';
  const bearer = auth.toLowerCase().startsWith('bearer ')
    ? auth.slice(7).trim()
    : '';
  const headerSecret = request.headers.get('x-cron-secret')?.trim() || '';
  const provided = bearer || headerSecret;

  if (!provided || provided !== expected) {
    throw ApiError.unauthorized('Invalid cron secret.');
  }
}
