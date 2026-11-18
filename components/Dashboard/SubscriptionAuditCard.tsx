'use client';

export interface SubscriptionLeakRow {
  merchant_key: string;
  display_name: string;
  occurrences: number;
  avg_amount: number;
  last_amount: number;
  last_date: string;
  estimated_monthly: number;
  estimated_annual: number;
  cadence: 'monthly' | 'annual' | 'irregular';
}

export function SubscriptionAuditCard({ leaks }: { leaks: SubscriptionLeakRow[] }) {
  const annualTotal = leaks.reduce((s, l) => s + l.estimated_annual, 0);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
      <div className="flex justify-between items-start gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
          Subscription / leak scan
        </h3>
        {leaks.length > 0 && (
          <span className="text-xs font-mono text-amber-400">
            ~${annualTotal.toLocaleString('en-US', { maximumFractionDigits: 0 })}/yr
          </span>
        )}
      </div>
      <p className="text-[11px] text-zinc-500">
        Heuristic repeat merchants + known subscription names (120d). Not a bank-certified list.
      </p>
      {leaks.length === 0 ? (
        <p className="text-xs text-zinc-500">No clear recurring leaks detected in the window.</p>
      ) : (
        <ul className="space-y-2 max-h-56 overflow-y-auto">
          {leaks.map((l) => (
            <li
              key={l.merchant_key}
              className="flex justify-between gap-3 text-xs border-b border-zinc-800/80 pb-2"
            >
              <div className="min-w-0">
                <p className="text-zinc-200 truncate font-medium">{l.display_name}</p>
                <p className="text-[10px] text-zinc-500 font-mono">
                  {l.occurrences}× · {l.cadence} · last {l.last_date}
                </p>
              </div>
              <div className="text-right shrink-0 font-mono text-zinc-300">
                <p>${l.estimated_monthly.toFixed(0)}/mo</p>
                <p className="text-[10px] text-zinc-500">${l.estimated_annual.toFixed(0)}/yr</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
