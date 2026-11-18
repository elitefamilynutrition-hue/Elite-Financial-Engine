'use client';

import { useState } from 'react';

export interface AnomalyItem {
  id: string;
  date: string;
  name: string;
  amount: number;
  category: string | null;
  reason: string;
}

interface AnomalyReviewPanelProps {
  anomalies: AnomalyItem[];
  onResolved: () => void;
  onAskAi?: (prompt: string) => void;
}

export function AnomalyReviewPanel({ anomalies, onResolved, onAskAi }: AnomalyReviewPanelProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  if (!anomalies.length) return null;

  const visible = anomalies.filter((a) => !dismissed.has(a.id));
  if (!visible.length) return null;

  const apply = async (id: string, body: Record<string, unknown>) => {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/transactions/${id}/override`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      setDismissed((prev) => new Set(prev).add(id));
      onResolved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="bg-zinc-900 border border-amber-500/30 rounded-xl p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-amber-400">
          Review charges
        </h2>
        <p className="text-xs text-zinc-500 mt-1">
          Large or unusual outflows — mark one-off / reimbursed, or confirm as expected (keeps burn).
        </p>
      </div>

      {error && <p className="text-xs text-rose-400">{error}</p>}

      <div className="space-y-3">
        {visible.map((a) => {
          const busy = busyId === a.id;
          return (
            <div
              key={a.id}
              className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 space-y-2"
            >
              <div className="flex justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-100 truncate">{a.name}</p>
                  <p className="text-[11px] text-zinc-500 font-mono">
                    {a.date} · {a.reason}
                  </p>
                </div>
                <p className="text-sm font-mono text-zinc-200 shrink-0">
                  ${a.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  disabled={busy}
                  onClick={() =>
                    apply(a.id, {
                      override_reason: 'one_off',
                      exclude_from_burn: true,
                    })
                  }
                  className="text-[10px] px-2 py-1 rounded border border-zinc-700 text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
                >
                  One-off
                </button>
                <button
                  disabled={busy}
                  onClick={() =>
                    apply(a.id, {
                      override_reason: 'reimbursed',
                      exclude_from_burn: true,
                      user_intent_override: 'transfer',
                    })
                  }
                  className="text-[10px] px-2 py-1 rounded border border-zinc-700 text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
                >
                  Reimbursed
                </button>
                <button
                  disabled={busy}
                  onClick={() =>
                    apply(a.id, {
                      override_reason: 'miscategorized',
                      exclude_from_burn: false,
                      user_intent_override: 'survival',
                    })
                  }
                  className="text-[10px] px-2 py-1 rounded border border-emerald-700/50 text-emerald-300 hover:bg-emerald-950 disabled:opacity-40"
                >
                  Expected (keep)
                </button>
                {onAskAi && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      onAskAi(
                        `I have a charge "${a.name}" for $${a.amount.toFixed(2)} on ${a.date} (${a.reason}). Help me decide if this is one-off, reimbursed, or expected recurring/sinking-fund spend.`
                      )
                    }
                    className="text-[10px] px-2 py-1 rounded border border-indigo-700/50 text-indigo-300 hover:bg-indigo-950 disabled:opacity-40"
                  >
                    Ask AI
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
