'use client';

import { useMemo } from 'react';
import { aggregateCategoryBurn } from '@/lib/analytics/burn-aggregate';
import type { CategoryBucketId } from '@/lib/analytics/category-buckets';

interface Account {
  id: string;
  account_name: string;
  custom_name?: string | null;
  account_type: string;
  current_balance: number;
  plaid_account_id?: string;
}

interface Transaction {
  id: string;
  amount: number;
  category: string | null;
  date: string;
  name: string;
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

interface TelemetryGridProps {
  accounts: Account[];
  transactions: Transaction[];
  /** Optional server-precomputed burn (preferred). */
  burnBuckets?: {
    bucketId: CategoryBucketId;
    label: string;
    amount: number;
    dominantIntent: 'survival' | 'creep';
    percentage: number;
  }[];
  burnTotal?: number;
  onBucketClick?: (bucketId: CategoryBucketId) => void;
}

export function TelemetryGrid({
  accounts,
  transactions,
  burnBuckets,
  burnTotal,
  onBucketClick,
}: TelemetryGridProps) {
  const liquidCapital = accounts
    .filter((a) => (a.account_type || '').toLowerCase() === 'depository')
    .reduce((sum, a) => sum + Number(a.current_balance || 0), 0);

  const revolvingDebt = accounts
    .filter((a) => (a.account_type || '').toLowerCase() === 'credit')
    .reduce((sum, a) => sum + Number(a.current_balance || 0), 0);

  const netLiquidity = liquidCapital - revolvingDebt;

  const liveSet = useMemo(
    () => new Set(accounts.map((a) => a.plaid_account_id).filter(Boolean) as string[]),
    [accounts]
  );

  const computed = useMemo(
    () => aggregateCategoryBurn(transactions, liveSet, 30),
    [transactions, liveSet]
  );

  const sortedBuckets = burnBuckets && burnBuckets.length > 0 ? burnBuckets : computed.buckets;
  const operationalBurn =
    burnTotal != null && burnTotal >= 0 ? burnTotal : computed.operationalBurn;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-1">
          <p className="text-xs font-mono uppercase tracking-wider text-zinc-400">Liquid Capital</p>
          <p className="text-2xl font-bold tracking-tight text-emerald-400">
            ${liquidCapital.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-1">
          <p className="text-xs font-mono uppercase tracking-wider text-zinc-400">Revolving Debt</p>
          <p className="text-2xl font-bold tracking-tight text-rose-400">
            ${revolvingDebt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-1">
          <p className="text-xs font-mono uppercase tracking-wider text-zinc-400">Net Liquidity</p>
          <p className={`text-2xl font-bold tracking-tight ${netLiquidity >= 0 ? 'text-white' : 'text-rose-400'}`}>
            ${netLiquidity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-1">
          <p className="text-xs font-mono uppercase tracking-wider text-zinc-400">30-Day Outflow Burn</p>
          <p className="text-2xl font-bold tracking-tight text-amber-400">
            ${operationalBurn.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-[10px] text-zinc-500">Credits netted · orphans excluded</p>
        </div>
      </div>

      {sortedBuckets.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-5">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
            Category Burn Distribution (Trailing 30 Days)
          </h3>
          <div className="space-y-4">
            {sortedBuckets.map(({ bucketId, label, amount, dominantIntent, percentage }) => {
              const barColor = dominantIntent === 'creep' ? 'bg-rose-500' : 'bg-zinc-500';

              return (
                <button
                  key={bucketId}
                  type="button"
                  onClick={() => onBucketClick?.(bucketId)}
                  className="w-full text-left space-y-1.5 group rounded-lg focus:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500"
                >
                  <div className="flex justify-between text-sm">
                    <span className="font-medium text-zinc-200 group-hover:text-indigo-300 transition">
                      {label}
                      <span className="ml-2 text-[10px] text-zinc-600 group-hover:text-zinc-400">
                        view ledger
                      </span>
                    </span>
                    <span className="font-mono text-zinc-400">
                      ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({percentage.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
                    <div
                      className={`${barColor} h-full rounded-full transition-all duration-300`}
                      style={{ width: `${Math.min(percentage, 100)}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
