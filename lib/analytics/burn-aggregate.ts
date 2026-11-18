import {
  resolveCategoryBucketId,
  bucketLabel,
  type CategoryBucketId,
} from '@/lib/analytics/category-buckets';
import { isExcludedFromBurn, resolveIntent } from '@/lib/analytics/intent';
import { isInsuranceMerchant, merchantNetKey, normalizeMerchantKey } from '@/lib/analytics/merchants';

export interface BurnTx {
  id: string;
  amount: number | string | null;
  category?: string | null;
  date: string;
  name?: string | null;
  merchant_name?: string | null;
  account_id?: string | null;
  transaction_intent?: string | null;
  is_internal_transfer?: boolean | null;
  user_intent_override?: string | null;
  exclude_from_burn?: boolean | null;
  override_reason?: string | null;
  pending?: boolean | null;
  reimbursement_tx_id?: string | null;
}

export interface BurnBucketRow {
  bucketId: CategoryBucketId;
  label: string;
  amount: number;
  dominantIntent: 'survival' | 'creep';
  percentage: number;
}

export interface AnomalyCandidate {
  id: string;
  date: string;
  name: string;
  amount: number;
  category: string | null;
  reason: string;
}

function isInsurerTx(tx: BurnTx): boolean {
  if (isInsuranceMerchant(tx.name, tx.merchant_name)) return true;
  return (tx.category || '').toUpperCase().includes('INSURANCE');
}

function effectiveBucketId(tx: BurnTx): CategoryBucketId {
  if (isInsurerTx(tx)) return 'essentials';
  return resolveCategoryBucketId(tx.category);
}

function effectiveIntent(tx: BurnTx): 'survival' | 'creep' | 'offense' | 'transfer' {
  if (isInsurerTx(tx) && !tx.user_intent_override) return 'survival';
  return resolveIntent(tx);
}

/** Outflow eligible for Category Burn after insurance remap. */
function isBurnOutflow(tx: BurnTx): boolean {
  const amt = Number(tx.amount || 0);
  if (amt <= 0) return false;
  if (tx.pending) return false;
  if (isExcludedFromBurn(tx)) return false;
  const intent = effectiveIntent(tx);
  return intent === 'survival' || intent === 'creep';
}

/**
 * Category Burn with live-account scope (caller filters), credit netting,
 * and cross-account duplicate collapse.
 */
export function aggregateCategoryBurn(
  transactions: BurnTx[],
  liveAccountIds: Set<string>,
  windowDays = 30
): { operationalBurn: number; buckets: BurnBucketRow[] } {
  const since = new Date();
  since.setDate(since.getDate() - windowDays);

  const inWindow = transactions.filter((tx) => {
    if (liveAccountIds.size > 0 && tx.account_id && !liveAccountIds.has(tx.account_id)) {
      return false;
    }
    const d = new Date(tx.date);
    return !Number.isNaN(d.getTime()) && d >= since;
  });

  // Credits by merchant for netting (Plaid: negative = inflow).
  const creditByMerchant = new Map<string, number>();
  const creditById = new Map<string, number>();
  for (const tx of inWindow) {
    const amt = Number(tx.amount || 0);
    if (amt >= 0 || tx.pending) continue;
    const abs = Math.abs(amt);
    creditById.set(tx.id, abs);
    const key = merchantNetKey(tx.name, tx.merchant_name);
    creditByMerchant.set(key, (creditByMerchant.get(key) || 0) + abs);
  }

  // Cross-account outflow dedupe + burn eligibility (prefer live-account rows already in list).
  const seen = new Set<string>();
  const uniqueOutflows: BurnTx[] = [];
  for (const tx of inWindow) {
    if (!isBurnOutflow(tx)) continue;
    const amt = Number(tx.amount || 0);
    const key = `${tx.date}|${amt.toFixed(2)}|${normalizeMerchantKey(tx.name)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueOutflows.push(tx);
  }

  const bucketMap: Record<string, { amount: number; survivalAmt: number; creepAmt: number }> = {};
  let operationalBurn = 0;

  for (const tx of uniqueOutflows) {
    const rawAmt = Number(tx.amount || 0);
    let netAmt = rawAmt;

    // Linked reimbursement id first (deterministic), then same-merchant credit pool.
    if (tx.reimbursement_tx_id) {
      const linked = creditById.get(tx.reimbursement_tx_id) || 0;
      if (linked > 0) {
        const applied = Math.min(netAmt, linked);
        netAmt -= applied;
        creditById.set(tx.reimbursement_tx_id, linked - applied);
        const mKeyLinked = merchantNetKey(tx.name, tx.merchant_name);
        const pool = creditByMerchant.get(mKeyLinked) || 0;
        if (pool > 0) creditByMerchant.set(mKeyLinked, Math.max(0, pool - applied));
      }
    }

    const mKey = merchantNetKey(tx.name, tx.merchant_name);
    const available = creditByMerchant.get(mKey) || 0;
    if (netAmt > 0.009 && available > 0) {
      const applied = Math.min(netAmt, available);
      netAmt -= applied;
      creditByMerchant.set(mKey, available - applied);
    }
    if (netAmt <= 0.009) continue;

    const bucketId = effectiveBucketId(tx);
    if (!bucketMap[bucketId]) bucketMap[bucketId] = { amount: 0, survivalAmt: 0, creepAmt: 0 };
    bucketMap[bucketId].amount += netAmt;
    operationalBurn += netAmt;

    const intent = effectiveIntent(tx);
    if (intent === 'creep') bucketMap[bucketId].creepAmt += netAmt;
    else bucketMap[bucketId].survivalAmt += netAmt;
  }

  const buckets: BurnBucketRow[] = Object.entries(bucketMap)
    .map(([bucketId, data]) => ({
      bucketId: bucketId as CategoryBucketId,
      label: bucketLabel(bucketId as CategoryBucketId),
      amount: round2(data.amount),
      dominantIntent: (data.creepAmt > data.survivalAmt ? 'creep' : 'survival') as
        | 'survival'
        | 'creep',
      percentage: operationalBurn > 0 ? (data.amount / operationalBurn) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  return { operationalBurn: round2(operationalBurn), buckets };
}

export function detectAnomalies(
  transactions: BurnTx[],
  liveAccountIds: Set<string>,
  opts?: { absoluteFloor?: number; windowDays?: number }
): AnomalyCandidate[] {
  const absoluteFloor = opts?.absoluteFloor ?? 500;
  const windowDays = opts?.windowDays ?? 30;
  const since = new Date();
  since.setDate(since.getDate() - windowDays);

  const outflows = transactions.filter((tx) => {
    if (liveAccountIds.size > 0 && tx.account_id && !liveAccountIds.has(tx.account_id)) return false;
    if (tx.pending || isExcludedFromBurn(tx)) return false;
    if (tx.user_intent_override || tx.override_reason) return false;
    const amt = Number(tx.amount || 0);
    if (amt <= 0) return false;
    const d = new Date(tx.date);
    return !Number.isNaN(d.getTime()) && d >= since;
  });

  const amounts = outflows.map((t) => Number(t.amount)).sort((a, b) => a - b);
  const median = amounts.length ? amounts[Math.floor(amounts.length / 2)] : absoluteFloor;
  const threshold = Math.max(absoluteFloor, median * 2.5);

  const merchantCounts = new Map<string, number>();
  for (const tx of outflows) {
    const key = merchantNetKey(tx.name, tx.merchant_name);
    merchantCounts.set(key, (merchantCounts.get(key) || 0) + 1);
  }

  const seen = new Set<string>();
  const results: AnomalyCandidate[] = [];

  for (const tx of outflows) {
    const amt = Number(tx.amount || 0);
    const dedupeKey = `${tx.date}|${amt.toFixed(2)}|${normalizeMerchantKey(tx.name)}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const key = merchantNetKey(tx.name, tx.merchant_name);
    const reasons: string[] = [];
    if (amt >= threshold) reasons.push(`Large vs typical ($${Math.round(threshold)}+)`);
    if ((merchantCounts.get(key) || 0) <= 1 && amt >= Math.min(300, absoluteFloor)) {
      reasons.push('New or rare merchant');
    }
    if (isInsurerTx(tx) && amt >= 200) {
      reasons.push('Insurance spike — expected sinking fund or one-off?');
    }
    if (reasons.length === 0) continue;

    results.push({
      id: tx.id,
      date: tx.date,
      name: tx.name || 'Unknown',
      amount: amt,
      category: tx.category || null,
      reason: reasons.join(' · '),
    });
  }

  return results.sort((a, b) => b.amount - a.amount).slice(0, 8);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
