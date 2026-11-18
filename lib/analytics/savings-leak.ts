/**
 * Week 4 Day 3: savings ratio + crude subscription/leak detection.
 * Deterministic heuristics only — no ML.
 */

import { isExcludedFromBurn, resolveIntent } from '@/lib/analytics/intent';
import { merchantNetKey, normalizeMerchantKey } from '@/lib/analytics/merchants';

export interface LeakTx {
  id?: string;
  amount: number | string | null;
  date: string;
  name?: string | null;
  merchant_name?: string | null;
  category?: string | null;
  transaction_intent?: string | null;
  is_internal_transfer?: boolean | null;
  user_intent_override?: string | null;
  exclude_from_burn?: boolean | null;
  override_reason?: string | null;
  pending?: boolean | null;
}

export interface SavingsRatioResult {
  window_days: number;
  net_inflow: number;
  operational_outflow: number;
  monthly_savings: number;
  monthly_savings_rate_pct: number | null;
  annualized_savings: number;
}

export interface SubscriptionLeak {
  merchant_key: string;
  display_name: string;
  occurrences: number;
  avg_amount: number;
  last_amount: number;
  last_date: string;
  estimated_monthly: number;
  estimated_annual: number;
  cadence: 'monthly' | 'annual' | 'irregular';
}

const SUB_HINTS = [
  'netflix',
  'spotify',
  'hulu',
  'disney',
  'apple.com/bill',
  'apple.com',
  'icloud',
  'youtube',
  'amazon prime',
  'prime video',
  'adobe',
  'microsoft 365',
  'office 365',
  'dropbox',
  'github',
  'openai',
  'chatgpt',
  'anthropic',
  'cursor',
  'notion',
  'slack',
  'gym',
  'planet fitness',
  'peloton',
  'audible',
  'paramount',
  'hbo',
  'max.com',
  'crunchyroll',
  'nytimes',
  'washington post',
  'patreon',
  'onlyfans',
  'subscription',
];

function isLifestyleOutflow(tx: LeakTx): boolean {
  const amt = Number(tx.amount || 0);
  if (amt <= 0 || tx.pending || isExcludedFromBurn(tx)) return false;
  const intent = resolveIntent(tx);
  return intent === 'survival' || intent === 'creep';
}

function isInflow(tx: LeakTx): boolean {
  const amt = Number(tx.amount || 0);
  if (amt >= 0 || tx.pending) return false;
  const intent = resolveIntent(tx);
  return intent !== 'transfer';
}

export function computeSavingsRatio(
  transactions: LeakTx[],
  windowDays = 30
): SavingsRatioResult {
  const since = new Date();
  since.setDate(since.getDate() - windowDays);

  let netInflow = 0;
  let operationalOutflow = 0;

  for (const tx of transactions) {
    const d = new Date(tx.date);
    if (Number.isNaN(d.getTime()) || d < since) continue;
    const amt = Number(tx.amount || 0);
    if (isInflow(tx)) netInflow += Math.abs(amt);
    if (isLifestyleOutflow(tx)) operationalOutflow += amt;
  }

  const monthlySavings = netInflow - operationalOutflow;
  const rate =
    netInflow > 0 ? (monthlySavings / netInflow) * 100 : null;

  return {
    window_days: windowDays,
    net_inflow: round2(netInflow),
    operational_outflow: round2(operationalOutflow),
    monthly_savings: round2(monthlySavings),
    monthly_savings_rate_pct: rate == null ? null : round2(rate),
    annualized_savings: round2(monthlySavings * (365 / windowDays)),
  };
}

export function detectSubscriptionLeaks(
  transactions: LeakTx[],
  windowDays = 120
): SubscriptionLeak[] {
  const since = new Date();
  since.setDate(since.getDate() - windowDays);

  const groups = new Map<
    string,
    { name: string; amounts: number[]; dates: string[] }
  >();

  for (const tx of transactions) {
    if (!isLifestyleOutflow(tx)) continue;
    const d = new Date(tx.date);
    if (Number.isNaN(d.getTime()) || d < since) continue;

    const amt = Number(tx.amount || 0);
    if (amt < 4 || amt > 800) continue;

    const blob = `${tx.name || ''} ${tx.merchant_name || ''}`.toLowerCase();
    const hinted = SUB_HINTS.some((h) => blob.includes(h));
    const key = merchantNetKey(tx.name, tx.merchant_name);
    if (!hinted && !blob.includes('subscription')) {
      // Still group repeats of same merchant with similar amounts later.
    }

    const g = groups.get(key) || {
      name: tx.merchant_name || tx.name || key,
      amounts: [],
      dates: [],
    };
    g.amounts.push(amt);
    g.dates.push(tx.date);
    groups.set(key, g);
  }

  const leaks: SubscriptionLeak[] = [];

  for (const [key, g] of groups) {
    if (g.amounts.length < 2 && !SUB_HINTS.some((h) => key.includes(h) || g.name.toLowerCase().includes(h))) {
      continue;
    }
    if (g.amounts.length < 2) continue;

    const avg =
      g.amounts.reduce((s, a) => s + a, 0) / g.amounts.length;
    const varianceOk = g.amounts.every(
      (a) => Math.abs(a - avg) / Math.max(avg, 1) < 0.35
    );
    if (!varianceOk && g.amounts.length < 3) continue;

    const sortedDates = [...g.dates].sort();
    const gaps: number[] = [];
    for (let i = 1; i < sortedDates.length; i++) {
      const a = new Date(sortedDates[i - 1]).getTime();
      const b = new Date(sortedDates[i]).getTime();
      gaps.push((b - a) / (1000 * 60 * 60 * 24));
    }
    const medianGap =
      gaps.length > 0
        ? gaps.sort((x, y) => x - y)[Math.floor(gaps.length / 2)]
        : 30;

    let cadence: SubscriptionLeak['cadence'] = 'irregular';
    let estimatedMonthly = avg;
    if (medianGap >= 25 && medianGap <= 40) {
      cadence = 'monthly';
      estimatedMonthly = avg;
    } else if (medianGap >= 300 && medianGap <= 400) {
      cadence = 'annual';
      estimatedMonthly = avg / 12;
    } else if (g.amounts.length >= 2) {
      cadence = medianGap < 45 ? 'monthly' : 'irregular';
      estimatedMonthly = cadence === 'monthly' ? avg : avg / Math.max(medianGap / 30, 1);
    }

    const lastIdx = sortedDates.length - 1;
    leaks.push({
      merchant_key: key,
      display_name: g.name,
      occurrences: g.amounts.length,
      avg_amount: round2(avg),
      last_amount: round2(g.amounts[g.amounts.length - 1]),
      last_date: sortedDates[lastIdx],
      estimated_monthly: round2(estimatedMonthly),
      estimated_annual: round2(estimatedMonthly * 12),
      cadence,
    });
  }

  return leaks
    .sort((a, b) => b.estimated_annual - a.estimated_annual)
    .slice(0, 12);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Normalize for tests / UI labels. */
export function leakMerchantLabel(name: string): string {
  return normalizeMerchantKey(name) || name;
}
