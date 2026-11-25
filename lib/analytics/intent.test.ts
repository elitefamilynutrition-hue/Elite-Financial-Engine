import { describe, expect, it } from 'vitest';
import {
  countsTowardCategoryBurn,
  isExcludedFromBurn,
  isInternalTransfer,
  resolveIntent,
} from '@/lib/analytics/intent';

describe('resolveIntent', () => {
  it('honors user override', () => {
    expect(
      resolveIntent({
        amount: 50,
        name: 'Spotify',
        user_intent_override: 'creep',
        transaction_intent: 'survival',
      })
    ).toBe('creep');
  });

  it('treats reimbursed as transfer', () => {
    expect(
      resolveIntent({
        amount: 100,
        name: 'Hotel',
        override_reason: 'reimbursed',
      })
    ).toBe('transfer');
  });

  it('defaults discretionary keywords to creep', () => {
    expect(
      resolveIntent({
        amount: 40,
        name: 'Spotify Premium',
        category: 'Entertainment',
      })
    ).toBe('creep');
  });
});

describe('isInternalTransfer / isExcludedFromBurn', () => {
  it('flags transfer categories', () => {
    expect(
      isInternalTransfer({
        amount: 500,
        name: 'Payment',
        category: 'TRANSFER_OUT_ACCOUNT_TRANSFER',
      })
    ).toBe(true);
  });

  it('excludes override reasons and explicit burn flags', () => {
    expect(isExcludedFromBurn({ amount: 10, exclude_from_burn: true })).toBe(true);
    expect(isExcludedFromBurn({ amount: 10, override_reason: 'one_off' })).toBe(true);
    expect(countsTowardCategoryBurn({ amount: 10, pending: true, name: 'Coffee' })).toBe(false);
  });
});
