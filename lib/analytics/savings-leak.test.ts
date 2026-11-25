import { describe, expect, it } from 'vitest';
import { computeSavingsRatio, detectSubscriptionLeaks } from '@/lib/analytics/savings-leak';

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

describe('computeSavingsRatio', () => {
  it('computes inflow vs lifestyle outflow (Plaid: negative = money in)', () => {
    const result = computeSavingsRatio(
      [
        {
          amount: -3000,
          date: daysAgo(2),
          name: 'ACME Payroll',
          category: 'INCOME_WAGES',
          transaction_intent: 'offense',
        },
        {
          amount: 400,
          date: daysAgo(1),
          name: 'Rent',
          category: 'RENT_AND_UTILITIES_RENT',
          transaction_intent: 'survival',
        },
        {
          amount: 50,
          date: daysAgo(1),
          name: 'Spotify',
          category: 'Entertainment',
          transaction_intent: 'creep',
        },
      ],
      30
    );
    expect(result.net_inflow).toBeGreaterThan(0);
    expect(result.operational_outflow).toBeGreaterThan(0);
    expect(result.monthly_savings).toBe(result.net_inflow - result.operational_outflow);
  });
});

describe('detectSubscriptionLeaks', () => {
  it('flags repeating subscription-like merchants', () => {
    const leaks = detectSubscriptionLeaks(
      [
        { amount: 15.99, date: daysAgo(10), name: 'Spotify', merchant_name: 'Spotify' },
        { amount: 15.99, date: daysAgo(40), name: 'Spotify', merchant_name: 'Spotify' },
        { amount: 15.99, date: daysAgo(70), name: 'Spotify', merchant_name: 'Spotify' },
      ],
      120
    );
    expect(leaks.some((l) => l.display_name.toLowerCase().includes('spotify'))).toBe(true);
  });
});
