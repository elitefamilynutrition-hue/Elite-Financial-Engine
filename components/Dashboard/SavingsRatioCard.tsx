'use client';

export interface SavingsRatioPayload {
  window_days: number;
  net_inflow: number;
  operational_outflow: number;
  monthly_savings: number;
  monthly_savings_rate_pct: number | null;
  annualized_savings: number;
}

export function SavingsRatioCard({ data }: { data: SavingsRatioPayload | null }) {
  if (!data) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
          Savings ratio
        </h3>
        <p className="text-xs text-zinc-500 mt-2">Sync transactions to compute trailing savings.</p>
      </div>
    );
  }

  const rate = data.monthly_savings_rate_pct;
  const rateColor =
    rate == null ? 'text-zinc-300' : rate >= 20 ? 'text-emerald-400' : rate >= 0 ? 'text-amber-400' : 'text-rose-400';

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
        Savings ratio ({data.window_days}d)
      </h3>
      <div className="flex justify-between items-baseline">
        <span className={`text-2xl font-bold ${rateColor}`}>
          {rate == null ? 'n/a' : `${rate.toFixed(1)}%`}
        </span>
        <span className="text-xs text-zinc-500">of net inflow</span>
      </div>
      <div className="space-y-1 text-xs text-zinc-400">
        <div className="flex justify-between">
          <span>Net inflow</span>
          <span className="font-mono">${data.net_inflow.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
        </div>
        <div className="flex justify-between">
          <span>Lifestyle outflow</span>
          <span className="font-mono">${data.operational_outflow.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
        </div>
        <div className="flex justify-between">
          <span>Period surplus</span>
          <span className={`font-mono ${data.monthly_savings >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            ${data.monthly_savings.toLocaleString('en-US', { maximumFractionDigits: 0 })}
          </span>
        </div>
        <div className="flex justify-between pt-1 border-t border-zinc-800">
          <span>Annualized</span>
          <span className="font-mono">
            ${data.annualized_savings.toLocaleString('en-US', { maximumFractionDigits: 0 })}
          </span>
        </div>
      </div>
    </div>
  );
}
