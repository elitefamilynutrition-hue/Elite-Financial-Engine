'use client';

import {
  resolveCategoryBucketId,
  bucketLabel,
  type CategoryBucketId,
} from '@/lib/analytics/category-buckets';
import { countsTowardCategoryBurn, resolveIntent } from '@/lib/analytics/intent';

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
  transaction_intent?: string | null;
  is_internal_transfer?: boolean | null;
  user_intent_override?: string | null;
  exclude_from_burn?: boolean | null;
  override_reason?: string | null;
  pending?: boolean | null;
}

interface TelemetryGridProps {
  accounts: Account[];
  transactions: Transaction[];
  onBucketClick?: (bucketId: CategoryBucketId) => void;
}

export function TelemetryGrid({ accounts, transactions, onBucketClick }: TelemetryGridProps) {
  const liquidCapital = accounts
    .filter((a) => (a.account_type || '').toLowerCase() === 'depository')
    .reduce((sum, a) => sum + Number(a.current_balance || 0), 0);

  const revolvingDebt = accounts
    .filter((a) => (a.account_type || '').toLowerCase() === 'credit')
    .reduce((sum, a) => sum + Number(a.current_balance || 0), 0);

  const netLiquidity = liquidCapital - revolvingDebt;

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  let operationalBurn = 0;
  const bucketMap: Record<
    string,
    { amount: number; survivalAmt: number; creepAmt: number }
  > = {};

  transactions.forEach((t) => {
    const txDate = new Date(t.date);
    if (txDate < thirtyDaysAgo) return;
    if (!countsTowardCategoryBurn(t)) return;

    const amt = Number(t.amount || 0);
    operationalBurn += amt;

    const bucketId = resolveCategoryBucketId(t.category);
    if (!bucketMap[bucketId]) {
      bucketMap[bucketId] = { amount: 0, survivalAmt: 0, creepAmt: 0 };
    }
    bucketMap[bucketId].amount += amt;
    const intent = resolveIntent(t);
    if (intent === 'creep') bucketMap[bucketId].creepAmt += amt;
    else bucketMap[bucketId].survivalAmt += amt;
  });

  const sortedBuckets = Object.entries(bucketMap)
    .map(([bucketId, data]) => ({
      bucketId: bucketId as CategoryBucketId,
      label: bucketLabel(bucketId as CategoryBucketId),
      amount: data.amount,
      dominantIntent: data.creepAmt > data.survivalAmt ? 'creep' : 'survival',
      percentage: operationalBurn > 0 ? (data.amount / operationalBurn) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

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
