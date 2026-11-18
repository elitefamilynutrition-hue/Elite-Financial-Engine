'use client';

import { useMemo, useState } from 'react';
import { formatCategoryLabel } from '@/lib/format/category-label';
import {
  bucketLabel,
  categoryMatchesBucket,
  type CategoryBucketId,
} from '@/lib/analytics/category-buckets';
import { isInsuranceMerchant } from '@/lib/analytics/merchants';
import { resolveIntent, type OverrideReason, type TransactionIntent } from '@/lib/analytics/intent';

function matchesBurnBucket(
  tx: { category?: string | null; name?: string | null; merchant_name?: string | null },
  bucketId: CategoryBucketId
): boolean {
  if (isInsuranceMerchant(tx.name, tx.merchant_name) || (tx.category || '').toUpperCase().includes('INSURANCE')) {
    return bucketId === 'essentials';
  }
  return categoryMatchesBucket(tx.category, bucketId);
}

export interface BurnDrawerTransaction {
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
}

interface CategoryBurnDrawerProps {
  bucketId: CategoryBucketId;
  transactions: BurnDrawerTransaction[];
  accountNameByPlaidId: Map<string, string>;
  onClose: () => void;
  onOverrideSaved: () => void;
}

export function CategoryBurnDrawer({
  bucketId,
  transactions,
  accountNameByPlaidId,
  onClose,
  onOverrideSaved,
}: CategoryBurnDrawerProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [linkForId, setLinkForId] = useState<string | null>(null);

  const thirtyDaysAgo = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d;
  }, []);

  const rows = useMemo(() => {
    return transactions
      .filter((tx) => {
        if (!matchesBurnBucket(tx, bucketId)) return false;
        const amt = Number(tx.amount || 0);
        if (amt <= 0) return false;
        const txDate = new Date(tx.date);
        return txDate >= thirtyDaysAgo;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [transactions, bucketId, thirtyDaysAgo]);

  const inflowCandidates = useMemo(() => {
    return transactions
      .filter((tx) => Number(tx.amount) < 0)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 40);
  }, [transactions]);

  const applyOverride = async (
    txId: string,
    body: Record<string, unknown>
  ) => {
    setBusyId(txId);
    setError(null);
    try {
      const res = await fetch(`/api/transactions/${txId}/override`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Override failed');
      setLinkForId(null);
      onOverrideSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Override failed');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-xl bg-zinc-900 border-l border-zinc-800 shadow-2xl z-50 flex flex-col">
      <div className="flex justify-between items-start p-4 border-b border-zinc-800 bg-zinc-950 gap-3">
        <div>
          <h3 className="font-bold text-white text-sm">{bucketLabel(bucketId)}</h3>
          <p className="text-xs text-zinc-400 mt-0.5">
            Trailing 30 days · {rows.length} transaction{rows.length === 1 ? '' : 's'}
          </p>
        </div>
        <button onClick={onClose} className="text-zinc-400 hover:text-white text-xs font-mono">
          [Close]
        </button>
      </div>

      {error && (
        <p className="px-4 py-2 text-xs text-rose-400 border-b border-zinc-800">{error}</p>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {rows.length === 0 ? (
          <p className="text-sm text-zinc-500 text-center py-10">
            No transactions in this bucket for the last 30 days.
          </p>
        ) : (
          rows.map((tx) => {
            const intent = resolveIntent(tx);
            const accountLabel = tx.account_id
              ? accountNameByPlaidId.get(tx.account_id) || tx.account_id
              : '—';
            const busy = busyId === tx.id;

            return (
              <div
                key={tx.id}
                className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 space-y-2"
              >
                <div className="flex justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-100 truncate">{tx.name}</p>
                    <p className="text-[11px] text-zinc-500 font-mono">{tx.date}</p>
                  </div>
                  <p className="text-sm font-mono text-zinc-200 shrink-0">
                    ${Number(tx.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-500">
                  <span>{accountLabel}</span>
                  <span className="uppercase tracking-wide text-zinc-400">{intent}</span>
                  <span>{formatCategoryLabel(tx.category)}</span>
                  {tx.exclude_from_burn ? (
                    <span className="text-amber-400">Excluded from burn</span>
                  ) : null}
                  {tx.override_reason ? (
                    <span className="text-indigo-400">{tx.override_reason}</span>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-1.5 pt-1">
                  {(
                    [
                      ['one_off', 'One-off'],
                      ['reimbursed', 'Reimbursed'],
                      ['business', 'Business'],
                    ] as [OverrideReason, string][]
                  ).map(([reason, label]) => (
                    <button
                      key={reason}
                      disabled={busy}
                      onClick={() =>
                        applyOverride(tx.id, {
                          override_reason: reason,
                          exclude_from_burn: true,
                          user_intent_override:
                            reason === 'reimbursed' || reason === 'business'
                              ? 'transfer'
                              : undefined,
                        })
                      }
                      className="text-[10px] px-2 py-1 rounded border border-zinc-700 text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
                    >
                      {label}
                    </button>
                  ))}
                  {(['survival', 'creep', 'offense', 'transfer'] as TransactionIntent[]).map(
                    (forced) => (
                      <button
                        key={forced}
                        disabled={busy}
                        onClick={() =>
                          applyOverride(tx.id, {
                            user_intent_override: forced,
                            override_reason: 'miscategorized',
                            exclude_from_burn: false,
                          })
                        }
                        className="text-[10px] px-2 py-1 rounded border border-zinc-700 text-zinc-400 hover:bg-zinc-800 disabled:opacity-40"
                      >
                        → {forced}
                      </button>
                    )
                  )}
                  <button
                    disabled={busy}
                    onClick={() => setLinkForId(linkForId === tx.id ? null : tx.id)}
                    className="text-[10px] px-2 py-1 rounded border border-indigo-700/60 text-indigo-300 hover:bg-indigo-950 disabled:opacity-40"
                  >
                    Link deposit
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => applyOverride(tx.id, { clear: true })}
                    className="text-[10px] px-2 py-1 rounded border border-zinc-700 text-zinc-500 hover:bg-zinc-800 disabled:opacity-40"
                  >
                    Reset
                  </button>
                </div>

                {linkForId === tx.id && (
                  <div className="mt-2 border-t border-zinc-800 pt-2 space-y-1.5">
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wider">
                      Pick matching inflow (reimbursement)
                    </p>
                    {inflowCandidates.length === 0 ? (
                      <p className="text-xs text-zinc-600">No inflows in recent feed.</p>
                    ) : (
                      inflowCandidates.map((inflow) => (
                        <button
                          key={inflow.id}
                          disabled={busy}
                          onClick={() =>
                            applyOverride(tx.id, {
                              override_reason: 'reimbursed',
                              exclude_from_burn: true,
                              user_intent_override: 'transfer',
                              reimbursement_tx_id: inflow.id,
                            })
                          }
                          className="w-full text-left text-xs px-2 py-1.5 rounded bg-zinc-900 border border-zinc-800 hover:border-indigo-600 text-zinc-300 disabled:opacity-40"
                        >
                          <span className="font-mono text-zinc-500">{inflow.date}</span>{' '}
                          {inflow.name}{' '}
                          <span className="text-emerald-400">
                            ${Math.abs(Number(inflow.amount)).toFixed(2)}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
