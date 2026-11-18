/**
 * Display rollup for Category Burn. Detailed PFC stays in DB for drill-down;
 * charts use these ~8 buckets so the UI stays digestible.
 */

export type CategoryBucketId =
  | 'housing'
  | 'essentials'
  | 'food_drink'
  | 'transport'
  | 'travel'
  | 'shopping'
  | 'fun_personal'
  | 'other';

export interface CategoryBucket {
  id: CategoryBucketId;
  label: string;
}

export const CATEGORY_BUCKETS: readonly CategoryBucket[] = [
  { id: 'housing', label: 'Housing & utilities' },
  { id: 'essentials', label: 'Groceries & essentials' },
  { id: 'food_drink', label: 'Food & drink' },
  { id: 'transport', label: 'Transport' },
  { id: 'travel', label: 'Travel' },
  { id: 'shopping', label: 'Shopping' },
  { id: 'fun_personal', label: 'Fun & personal' },
  { id: 'other', label: 'Other' },
] as const;

const BUCKET_BY_ID = Object.fromEntries(CATEGORY_BUCKETS.map((b) => [b.id, b])) as Record<
  CategoryBucketId,
  CategoryBucket
>;

/** Detailed PFC codes that belong in Groceries & essentials (not Food & drink). */
const ESSENTIALS_DETAILED = new Set([
  'FOOD_AND_DRINK_GROCERIES',
  'MEDICAL_PRIMARY_CARE',
  'MEDICAL_PHARMACIES_AND_SUPPLEMENTS',
  'MEDICAL_DENTAL_CARE',
  'MEDICAL_EYE_CARE',
  'MEDICAL_VETERINARY_SERVICES',
  'INSURANCE_INSURANCE',
]);

const ESSENTIALS_PRIMARY = new Set(['MEDICAL', 'INSURANCE']);

function normalizeRaw(raw: string | null | undefined): string {
  return (raw || '').split(',')[0].trim().toUpperCase();
}

/** Infer Plaid primary from a stored detailed or primary string. */
export function pfcPrimaryFromCategory(raw: string | null | undefined): string {
  const code = normalizeRaw(raw);
  if (!code) return '';

  const knownPrimaries = [
    'INCOME',
    'TRANSFER_IN',
    'TRANSFER_OUT',
    'LOAN_PAYMENTS',
    'BANK_FEES',
    'ENTERTAINMENT',
    'FOOD_AND_DRINK',
    'GENERAL_MERCHANDISE',
    'GENERAL_SERVICES',
    'GOVERNMENT_AND_NON_PROFIT',
    'HOME_IMPROVEMENT',
    'MEDICAL',
    'PERSONAL_CARE',
    'RENT_AND_UTILITIES',
    'TRANSPORTATION',
    'TRAVEL',
    'INSURANCE',
  ];

  for (const primary of knownPrimaries) {
    if (code === primary || code.startsWith(`${primary}_`)) return primary;
  }

  return code;
}

export function resolveCategoryBucketId(raw: string | null | undefined): CategoryBucketId {
  const code = normalizeRaw(raw);
  if (!code) return 'other';

  if (ESSENTIALS_DETAILED.has(code)) return 'essentials';

  const primary = pfcPrimaryFromCategory(code);

  if (primary === 'RENT_AND_UTILITIES') return 'housing';
  if (ESSENTIALS_PRIMARY.has(primary)) return 'essentials';
  if (primary === 'FOOD_AND_DRINK') return 'food_drink';
  if (primary === 'TRANSPORTATION') return 'transport';
  if (primary === 'TRAVEL') return 'travel';
  if (primary === 'GENERAL_MERCHANDISE' || primary === 'HOME_IMPROVEMENT') return 'shopping';
  if (
    primary === 'ENTERTAINMENT' ||
    primary === 'PERSONAL_CARE' ||
    primary === 'GENERAL_SERVICES'
  ) {
    return 'fun_personal';
  }

  return 'other';
}

export function resolveCategoryBucket(raw: string | null | undefined): CategoryBucket {
  return BUCKET_BY_ID[resolveCategoryBucketId(raw)];
}

export function bucketLabel(id: CategoryBucketId): string {
  return BUCKET_BY_ID[id]?.label || 'Other';
}

/** True when a transaction's stored category rolls into the given display bucket. */
export function categoryMatchesBucket(
  raw: string | null | undefined,
  bucketId: CategoryBucketId
): boolean {
  return resolveCategoryBucketId(raw) === bucketId;
}
