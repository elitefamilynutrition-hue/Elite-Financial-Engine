/**
 * Merchant / name hints that override bad Plaid PFC labels.
 */

const INSURER_HINTS = [
  'root insurance',
  'root.com',
  'geico',
  'progressive',
  'state farm',
  'allstate',
  'usaa',
  'liberty mutual',
  'farmers insurance',
  'nationwide',
  'travelers insurance',
  'lemonade insurance',
  'erieve',
  'insurance',
] as const;

export function normalizeMerchantKey(raw: string | null | undefined): string {
  return (raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isInsuranceMerchant(name?: string | null, merchantName?: string | null): boolean {
  const blob = `${name || ''} ${merchantName || ''}`.toLowerCase();
  return INSURER_HINTS.some((hint) => blob.includes(hint));
}

/** Stable key for same-merchant credit/debit netting. */
export function merchantNetKey(name?: string | null, merchantName?: string | null): string {
  const preferred = normalizeMerchantKey(merchantName || name || '');
  // Collapse "ROOT INSURANCE" / "Root Insurance" variants.
  if (preferred.includes('root')) return 'root insurance';
  return preferred || 'unknown';
}
