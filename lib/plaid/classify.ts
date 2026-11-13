import type { Transaction } from 'plaid';
import { resolveIntent, type TransactionIntent } from '@/lib/analytics/intent';

/**
 * Turns a Plaid transaction into the app's own intent vocabulary.
 *
 * Replaces the old heuristic that flagged anything whose merchant name contained
 * "chase", "citi", "american express", or whose category contained "service" as
 * an internal transfer. That silently deleted legitimate spending from the
 * survival floor (every Chase-branded purchase vanished from the user's burn).
 * Plaid's `personal_finance_category` is authoritative; keyword matching is only
 * a last resort.
 */

export interface ClassifiedTransaction {
  is_internal_transfer: boolean;
  transaction_intent: TransactionIntent;
}

const INTERNAL_TRANSFER_DETAILED = new Set([
  'TRANSFER_OUT_ACCOUNT_TRANSFER',
  'TRANSFER_OUT_SAVINGS',
  'TRANSFER_IN_ACCOUNT_TRANSFER',
  'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT',
]);

const OFFENSE_PREFIXES = ['TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS', 'LOAN_PAYMENTS_'];

const SURVIVAL_DETAILED = new Set([
  'FOOD_AND_DRINK_GROCERIES',
  'RENT_AND_UTILITIES_RENT',
  'RENT_AND_UTILITIES_GAS_AND_ELECTRICITY',
  'RENT_AND_UTILITIES_INTERNET_AND_CABLE',
  'RENT_AND_UTILITIES_WATER',
  'RENT_AND_UTILITIES_SEWAGE_AND_WASTE_MANAGEMENT',
  'RENT_AND_UTILITIES_TELEPHONE',
  'MEDICAL_PRIMARY_CARE',
  'MEDICAL_PHARMACIES_AND_SUPPLEMENTS',
  'INSURANCE_INSURANCE',
]);

const SURVIVAL_PRIMARY = new Set([
  'RENT_AND_UTILITIES',
  'MEDICAL',
  'INSURANCE',
  'GOVERNMENT_AND_NON_PROFIT',
  'BANK_FEES',
]);

const CREEP_PRIMARY = new Set([
  'FOOD_AND_DRINK',
  'ENTERTAINMENT',
  'TRAVEL',
  'GENERAL_MERCHANDISE',
  'PERSONAL_CARE',
  'GENERAL_SERVICES',
  'HOME_IMPROVEMENT',
]);

function pfcOf(tx: Transaction): { primary?: string; detailed?: string } | null {
  const pfc = (tx as unknown as { personal_finance_category?: { primary?: string; detailed?: string } })
    .personal_finance_category;
  return pfc ?? null;
}

export function classifyPlaidTransaction(tx: Transaction): ClassifiedTransaction {
  const pfc = pfcOf(tx);
  const detailed = (pfc?.detailed || '').toUpperCase();
  const primary = (pfc?.primary || '').toUpperCase();

  // Money in is never a spend bucket.
  if (primary === 'INCOME' || Number(tx.amount) < 0) {
    return { is_internal_transfer: false, transaction_intent: 'survival' };
  }

  if (detailed && INTERNAL_TRANSFER_DETAILED.has(detailed)) {
    return { is_internal_transfer: true, transaction_intent: 'transfer' };
  }

  if (detailed && OFFENSE_PREFIXES.some((prefix) => detailed.startsWith(prefix))) {
    return { is_internal_transfer: false, transaction_intent: 'offense' };
  }

  if (detailed && SURVIVAL_DETAILED.has(detailed)) {
    return { is_internal_transfer: false, transaction_intent: 'survival' };
  }

  if (primary && SURVIVAL_PRIMARY.has(primary)) {
    return { is_internal_transfer: false, transaction_intent: 'survival' };
  }

  if (primary && CREEP_PRIMARY.has(primary)) {
    return { is_internal_transfer: false, transaction_intent: 'creep' };
  }

  // No usable Plaid category — fall back to the shared keyword resolver so the
  // server and the client always agree on what a transaction is.
  const legacyIntent = resolveIntent({
    amount: tx.amount,
    name: tx.name,
    merchant_name: tx.merchant_name,
    category: tx.category ? tx.category.join(', ') : null,
  });

  return {
    is_internal_transfer: legacyIntent === 'transfer',
    transaction_intent: legacyIntent,
  };
}

/** Flattened category string for storage, matching what the UI reads. */
export function toCategoryString(tx: Transaction): string | null {
  const pfc = pfcOf(tx);
  if (pfc?.detailed) return pfc.detailed;
  if (pfc?.primary) return pfc.primary;
  return tx.category && tx.category.length > 0 ? tx.category.join(', ') : null;
}
