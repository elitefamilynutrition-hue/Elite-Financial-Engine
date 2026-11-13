import type { User } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { ApiError } from '@/lib/http/api-error';

/**
 * The single source of truth for "who is calling this route".
 *
 * Every authenticated handler must derive the tenant from the session here.
 * Never accept a user id (or any tenant identifier) from the request body or
 * query string — that is how cross-tenant reads/writes happen.
 */
export async function requireUser(): Promise<User> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw ApiError.unauthorized('You must be signed in to do that.');
  }

  return user;
}

/**
 * Admin gate. Members of ADMIN_EMAILS (comma separated) may run operational
 * routes; everyone else gets a 403 even if they are signed in.
 */
export function requireAdmin(user: User): void {
  const allowlist = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  const email = (user.email || '').toLowerCase();

  if (allowlist.length === 0 || !allowlist.includes(email)) {
    throw ApiError.forbidden('Administrator access required.');
  }
}
