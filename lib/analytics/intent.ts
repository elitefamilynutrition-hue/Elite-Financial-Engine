/**
 * Single source of truth for how a transaction is bucketed.
 *
 * Precedence: user override → explicit DB intent → transfer flags → keywords → survival default.
 * Creep is a deviation warning and never feeds the Survival Floor.
 */

export type TransactionIntent = 'survival' | 'creep' | 'offense' | 'transfer';

export type OverrideReason = 'one_off' | 'reimbursed' | 'business' | 'miscategorized';

export interface ClassifiableTransaction {
  amount: number | string | null;
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
  'thank you',
  'autopay',
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

function asIntent(value: string | null | undefined): TransactionIntent | null {
  if (value === 'transfer' || value === 'offense' || value === 'creep' || value === 'survival') {
    return value;
  }
  return null;
}

/** True when the row represents money moving between the user's own accounts. */
export function isInternalTransfer(tx: ClassifiableTransaction): boolean {
  if (tx.is_internal_transfer) return true;
  if (asIntent(tx.user_intent_override) === 'transfer') return true;
  if (tx.transaction_intent === 'transfer') return true;
  if (PLAID_TRANSFER_CATEGORIES.some((c) => (tx.category || '').toUpperCase().includes(c))) {
    return true;
  }
  return matchesAny(tx, NON_OPERATIONAL_KEYWORDS);
}

/**
 * Resolves the bucket for a single transaction.
 * User override always wins when set.
 */
export function resolveIntent(tx: ClassifiableTransaction): TransactionIntent {
  const override = asIntent(tx.user_intent_override);
  if (override) return override;

  // Reimbursed / business without an explicit intent → treat as transfer (non-lifestyle).
  if (tx.override_reason === 'reimbursed' || tx.override_reason === 'business') {
    return 'transfer';
  }

  const explicit = asIntent(tx.transaction_intent);
  if (explicit) return explicit;

  if (tx.is_internal_transfer) return 'transfer';
  if (matchesAny(tx, NON_OPERATIONAL_KEYWORDS)) return 'transfer';
  if (matchesAny(tx, DISCRETIONARY_KEYWORDS)) return 'creep';

  return 'survival';
}

/** Excluded from Category Burn and Survival Floor analytics. */
export function isExcludedFromBurn(tx: ClassifiableTransaction): boolean {
  if (tx.exclude_from_burn) return true;
  const reason = tx.override_reason;
  return reason === 'one_off' || reason === 'reimbursed' || reason === 'business';
}

/** Only survival-bucket outflows that are not disputed away. */
export function isSurvivalSpend(tx: ClassifiableTransaction): boolean {
  const amount = Number(tx.amount || 0);
  if (amount <= 0) return false;
  if (isExcludedFromBurn(tx)) return false;
  if (tx.pending) return false;
  return resolveIntent(tx) === 'survival';
}

/** Counts toward Category Burn bars (survival + creep, not transfer/offense/excluded). */
export function countsTowardCategoryBurn(tx: ClassifiableTransaction): boolean {
  const amount = Number(tx.amount || 0);
  if (amount <= 0) return false;
  if (isExcludedFromBurn(tx)) return false;
  if (tx.pending) return false;
  const intent = resolveIntent(tx);
  return intent === 'survival' || intent === 'creep';
}

export function isWithinWindow(date: string | null | undefined, since: Date): boolean {
  if (!date) return false;
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed >= since;
}
