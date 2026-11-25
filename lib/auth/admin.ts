import type { User } from '@supabase/supabase-js';

/** Comma-separated ADMIN_EMAILS allowlist (lowercased). */
export function getAdminEmailAllowlist(): string[] {
  return (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

/** True when Lab feature flag is on (default off = fail-closed). */
export function isLabEnabled(): boolean {
  return (process.env.ENABLE_LAB || '').trim().toLowerCase() === 'true';
}

/** True when RAG tax lab flag is on. */
export function isRagTaxEnabled(): boolean {
  return (process.env.ENABLE_RAG_TAX || '').trim().toLowerCase() === 'true';
}

export function isAdminEmail(user: User | null | undefined): boolean {
  if (!user?.email) return false;
  const allowlist = getAdminEmailAllowlist();
  if (allowlist.length === 0) return false;
  return allowlist.includes(user.email.toLowerCase());
}

/** Lab requires ENABLE_LAB=true AND admin allowlist membership. */
export function canAccessLab(user: User | null | undefined): boolean {
  return isLabEnabled() && isAdminEmail(user);
}
