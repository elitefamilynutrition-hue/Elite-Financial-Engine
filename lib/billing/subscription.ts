/** Shared subscription status helpers (safe for client + server). */

const ACTIVE_STATUSES = new Set(['active', 'trialing']);

export function isSubscriptionActive(status: string | null | undefined): boolean {
  return ACTIVE_STATUSES.has((status || '').toLowerCase());
}
