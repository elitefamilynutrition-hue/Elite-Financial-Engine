import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkRateLimit } from '@/lib/http/rate-limit';

describe('checkRateLimit', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows up to the limit then blocks', () => {
    const key = `test-${Math.random()}`;
    expect(checkRateLimit(key, 2, 60_000).ok).toBe(true);
    expect(checkRateLimit(key, 2, 60_000).ok).toBe(true);
    const blocked = checkRateLimit(key, 2, 60_000);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.retryAfterSec).toBeGreaterThan(0);
    }
  });

  it('resets after the window', () => {
    vi.useFakeTimers();
    const key = `window-${Math.random()}`;
    expect(checkRateLimit(key, 1, 1_000).ok).toBe(true);
    expect(checkRateLimit(key, 1, 1_000).ok).toBe(false);
    vi.advanceTimersByTime(1_001);
    expect(checkRateLimit(key, 1, 1_000).ok).toBe(true);
  });
});
