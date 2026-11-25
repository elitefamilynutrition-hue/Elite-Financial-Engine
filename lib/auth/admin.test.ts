import { describe, expect, it, afterEach, vi } from 'vitest';
import { canAccessLab, isAdminEmail, isLabEnabled } from '@/lib/auth/admin';
import type { User } from '@supabase/supabase-js';

function user(email: string): User {
  return { id: 'u1', email, app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '' } as User;
}

describe('admin / lab flags', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('fail-closes lab when ENABLE_LAB unset', () => {
    vi.stubEnv('ENABLE_LAB', '');
    vi.stubEnv('ADMIN_EMAILS', 'ops@example.com');
    expect(isLabEnabled()).toBe(false);
    expect(canAccessLab(user('ops@example.com'))).toBe(false);
  });

  it('allows admin when lab enabled', () => {
    vi.stubEnv('ENABLE_LAB', 'true');
    vi.stubEnv('ADMIN_EMAILS', 'ops@example.com, other@example.com');
    expect(isAdminEmail(user('ops@example.com'))).toBe(true);
    expect(canAccessLab(user('ops@example.com'))).toBe(true);
    expect(canAccessLab(user('stranger@example.com'))).toBe(false);
  });
});
