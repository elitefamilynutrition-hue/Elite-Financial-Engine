'use client';

import React, { useMemo, useState } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine } from 'recharts';
import { computeFireProjection } from '@/lib/analytics/fire-projection';

export interface FireDashboardPayload {
  fire_target: number;
  fire_multiplier: number;
  annual_burn: number;
  progress_pct: number;
  is_on_pace: boolean;
  pace_reason: string;
  series: { year: number; age: number; projected: number; fireTarget: number }[];
  effective_return_pct: number;
  real_return_pct: number;
  nominal_return_pct: number;
  terminal_projected: number;
  swr_pct: number;
  inflation_pct: number;
  annual_contribution: number;
  current_age: number;
  target_retirement_age: number;
  current_nw: number;
  invested_capital: number;
}

export default function WealthMatrixChart({ fire }: { fire: FireDashboardPayload | null }) {
  const [useReal, setUseReal] = useState(false);

  const recomputed = useMemo(() => {
    if (!fire) return null;
    return computeFireProjection({
      currentNetWorth: fire.current_nw,
      investedCapital: fire.invested_capital,
      monthlyBurn: fire.annual_burn / 12,
      safeWithdrawalRatePct: fire.swr_pct,
      inflationPct: fire.inflation_pct,
      nominalReturnPct: fire.nominal_return_pct,
      currentAge: fire.current_age,
      targetRetirementAge: fire.target_retirement_age,
      annualContribution: fire.annual_contribution,
      useRealReturns: useReal,
    });
  }, [fire, useReal]);

  if (!fire || !recomputed) {
    return (
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6 space-y-2">
        <h3 className="text-lg font-bold text-zinc-100">FI/RE Wealth Matrix</h3>
        <p className="text-sm text-zinc-500">
          Link accounts and set SWR / burn in Configure Targets to project FI capital.
        </p>
      </div>
    );
  }

  const chartData = recomputed.series.map((row) => ({
    year: row.year,
    Projected: row.projected,
    'FI Target': row.fireTarget,
  }));

  return (
    <div className="bg-zinc-900 rounded-xl border border-zinc-800 shadow-xl overflow-hidden">
      <div className="p-6 border-b border-zinc-800 flex flex-wrap justify-between items-start gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="text-lg font-bold text-zinc-100">FI/RE Wealth Matrix</h3>
            <span
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border tracking-wide uppercase ${
                recomputed.isOnPace
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
              }`}
            >
              {recomputed.isOnPace ? 'On Pace' : 'Behind Pace'}
            </span>
          </div>
          <p className="text-xs text-zinc-400">
            Current NW ${Math.round(fire.current_nw).toLocaleString()} · FI target $
            {Math.round(recomputed.fireTarget).toLocaleString()} ({recomputed.fireMultiplier}× burn @{' '}
            {fire.swr_pct}% SWR)
          </p>
          <p className="text-[11px] text-zinc-500 max-w-xl">{recomputed.paceReason}</p>
        </div>
        <div className="text-right space-y-2">
          <div>
            <p className="text-xs uppercase tracking-wider text-zinc-500 mb-1">Progress to FI</p>
            <p className="text-xl font-bold text-indigo-300">{recomputed.progressPct.toFixed(1)}%</p>
          </div>
          <label className="flex items-center gap-2 text-[11px] text-zinc-400 justify-end cursor-pointer">
            <input
              type="checkbox"
              checked={useReal}
              onChange={(e) => setUseReal(e.target.checked)}
              className="rounded border-zinc-600 bg-zinc-950"
            />
            Real returns (deflate {fire.inflation_pct}% CPI)
          </label>
          <p className="text-[10px] text-zinc-500 font-mono">
            Using {recomputed.effectiveReturnPct.toFixed(1)}%{' '}
            {useReal ? 'real' : 'nominal'} · +$
            {Math.round(fire.annual_contribution).toLocaleString()}/yr contrib
          </p>
        </div>
      </div>

      <div className="p-6">
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorProjected" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="year" stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis
                stroke="#71717a"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                tickFormatter={(val) =>
                  Math.abs(Number(val)) >= 1_000_000
                    ? `$${(Number(val) / 1_000_000).toFixed(1)}M`
                    : `$${Math.round(Number(val) / 1000)}k`
                }
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#18181b',
                  borderColor: '#27272a',
                  borderRadius: '0.5rem',
                  color: '#f4f4f5',
                }}
                formatter={(value) => [`$${Number(value ?? 0).toLocaleString()}`, '']}
                labelStyle={{ color: '#a1a1aa', marginBottom: '4px' }}
              />
              {recomputed.fireTarget > 0 && (
                <ReferenceLine
                  y={recomputed.fireTarget}
                  stroke="#f59e0b"
                  strokeDasharray="4 4"
                  label={{ value: 'FI', fill: '#f59e0b', fontSize: 10 }}
                />
              )}
              <Area
                type="monotone"
                dataKey="Projected"
                stroke="#6366f1"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorProjected)"
              />
              <Area
                type="monotone"
                dataKey="FI Target"
                stroke="#f59e0b"
                strokeWidth={1.5}
                strokeDasharray="6 4"
                fill="none"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
