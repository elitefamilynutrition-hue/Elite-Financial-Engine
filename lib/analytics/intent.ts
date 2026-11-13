/**
 * Single source of truth for how a transaction is bucketed.
 *
 * Before this module existed, three places (TelemetryGrid, CashFlowCreepChart,
 * /api/baseline) each re-implemented the same rules slightly differently, so the
 * same transaction could be "survival" on one screen and "creep" on another.
 * Every consumer — server and client — must import from here.
 */

export type TransactionIntent = 'survival' | 'creep' | 'offense' | 'transfer';

export interface ClassifiableTransaction {
  amount: number | string | null;
  name?: string | null;
  merchant_name?: string | null;
  category?: string | null;
  transaction_intent?: string | null;
  is_internal_transfer?: boolean | null;
}

/** Keywords that indicate the outflow is NOT baseline living cost. */
export const DISCRETIONARY_KEYWORDS: readonly string[] = [
  'entertainment',
  'travel',
  'dining',
  'gifts',
  'spotify',
  'subscription',
  'restaurant',
  'amusement',
  'recreation',
  'shops',
  'shopping',
  'food and drink',
];

/** Keywords that indicate money movement rather than money spent. */
export const NON_OPERATIONAL_KEYWORDS: readonly string[] = [
  'transfer',
  'payment',
  'credit card',
  'deposit',
  'wire',
  'investment',
  'payroll',
  'brokerage',
  'down payment',
];

/**
 * Plaid's personal finance categories are far more reliable than substring
 * matching on merchant names. When present, they win.
 */
export const PLAID_TRANSFER_CATEGORIES: readonly string[] = [
  'TRANSFER_OUT_ACCOUNT_TRANSFER',
  'TRANSFER_OUT_SAVINGS',
  'TRANSFER_IN_ACCOUNT_TRANSFER',
  'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT',
  'LOAN_PAYMENTS_MORTGAGE_PAYMENT',
];

function haystack(tx: ClassifiableTransaction): string {
  return `${tx.category || ''} ${tx.name || ''} ${tx.merchant_name || ''}`.toLowerCase();
}

export function matchesAny(tx: ClassifiableTransaction, keywords: readonly string[]): boolean {
  const text = haystack(tx);
  return keywords.some((keyword) => text.includes(keyword));
}

/** True when the row represents money moving between the user's own accounts. */
export function isInternalTransfer(tx: ClassifiableTransaction): boolean {
  if (tx.is_internal_transfer) return true;
  if (tx.transaction_intent === 'transfer') return true;
  return matchesAny(tx, NON_OPERATIONAL_KEYWORDS);
}

/**
 * Resolves the bucket for a single transaction.
 *
 * Precedence: explicit DB classification wins, then internal-transfer detection,
 * then a keyword fallback, then unclassified rows default to `survival` (the
 * conservative choice: overstating the survival floor is safer than hiding spend
 * from the user).
 */
export function resolveIntent(tx: ClassifiableTransaction): TransactionIntent {
  const explicit = tx.transaction_intent as TransactionIntent | null | undefined;

  if (explicit === 'transfer' || explicit === 'offense' || explicit === 'creep' || explicit === 'survival') {
    return explicit;
  }

  if (tx.is_internal_transfer) return 'transfer';
  if (matchesAny(tx, NON_OPERATIONAL_KEYWORDS)) return 'transfer';
  if (matchesAny(tx, DISCRETIONARY_KEYWORDS)) return 'creep';

  return 'survival';
}

/** Only outflows from the survival bucket count toward the emergency floor. */
export function isSurvivalSpend(tx: ClassifiableTransaction): boolean {
  const amount = Number(tx.amount || 0);
  if (amount <= 0) return false;
  return resolveIntent(tx) === 'survival';
}

export function isWithinWindow(date: string | null | undefined, since: Date): boolean {
  if (!date) return false;
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed >= since;
}
