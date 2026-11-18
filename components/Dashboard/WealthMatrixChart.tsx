'use client';

import React, { useEffect, useState } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';
import { supabase } from '@/lib/supabase';

type SnapshotRow = {
  snapshot_date: string;
  liquid_capital: number | string | null;
  investment_capital: number | string | null;
  total_liabilities: number | string | null;
};

type AccountRow = {
  account_type: string | null;
  current_balance: number | string | null;
};

export default function WealthMatrixChart({ userId }: { userId: string }) {
  const [data, setData] = useState<{ year: number; Target: number; Actual: number | null }[]>([]);
  const [metrics, setMetrics] = useState({ currentNW: 0, targetNW: 0, ror: 0, isOnPace: true });
  const [loading, setLoading] = useState(true);
  const [emptyReason, setEmptyReason] = useState<string | null>(null);

  useEffect(() => {
    async function fetchWealthData() {
      setLoading(true);
      setEmptyReason(null);

      const [{ data: snapshots }, { data: accounts }, { data: profile }] = await Promise.all([
        supabase
          .from('historical_snapshots')
          .select('snapshot_date, liquid_capital, investment_capital, total_liabilities')
          .eq('user_id', userId)
          .order('snapshot_date', { ascending: true })
          .limit(30),
        supabase
          .from('financial_accounts')
          .select('account_type, current_balance')
          .eq('user_id', userId),
        supabase
          .from('user_financial_profiles')
          .select('current_age, target_retirement_age')
          .eq('user_id', userId)
          .maybeSingle(),
      ]);

      const liveLiquid = (accounts || [])
        .filter((a: AccountRow) => (a.account_type || '').toLowerCase() === 'depository')
        .reduce((sum: number, a: AccountRow) => sum + Number(a.current_balance || 0), 0);
      const liveInvest = (accounts || [])
        .filter((a: AccountRow) => {
          const t = (a.account_type || '').toLowerCase();
          return t === 'investment' || t === 'brokerage';
        })
        .reduce((sum: number, a: AccountRow) => sum + Number(a.current_balance || 0), 0);
      const liveCredit = (accounts || [])
        .filter((a: AccountRow) => (a.account_type || '').toLowerCase() === 'credit')
        .reduce((sum: number, a: AccountRow) => sum + Number(a.current_balance || 0), 0);
      const liveNetWorth = liveLiquid + liveInvest - liveCredit;

      const rows = (snapshots || []) as SnapshotRow[];
      let currentNetWorth = liveNetWorth;
      let bmv = liveInvest;
      let emv = liveInvest;
      let usedSnapshots = false;

      if (rows.length > 0) {
        usedSnapshots = true;
        bmv = Number(rows[0].investment_capital || 0);
        emv = Number(rows[rows.length - 1].investment_capital || 0);
        const last = rows[rows.length - 1];
        currentNetWorth =
          Number(last.liquid_capital || 0) +
          Number(last.investment_capital || 0) -
          Number(last.total_liabilities || 0);
      }

      if (!Number.isFinite(currentNetWorth) || (Math.abs(currentNetWorth) < 1 && !usedSnapshots && (!accounts || accounts.length === 0))) {
        setEmptyReason('Link accounts or stamp a snapshot to project FI/RE capital.');
        setData([]);
        setLoading(false);
        return;
      }

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const { data: invTx } = await supabase
        .from('investment_transactions')
        .select('amount, type')
        .eq('user_id', userId)
        .gte('date', thirtyDaysAgo.toISOString().split('T')[0]);

      let externalCashFlow = 0;
      (invTx || []).forEach((tx: { amount: number | string | null; type: string | null }) => {
        if (tx.type === 'transfer' || tx.type === 'contribution') {
          externalCashFlow += Number(tx.amount || 0) * -1;
        }
      });

      const rorDecimal =
        bmv > 0 ? (emv - bmv - externalCashFlow) / (bmv + 0.5 * externalCashFlow) : 0;
      const periodRoR = rorDecimal * 100;

      const currentAge = Number(profile?.current_age || 35);
      const targetAge = Number(profile?.target_retirement_age || 55);
      const yearsToTarget = Math.max(1, targetAge - currentAge);
      const currentYear = new Date().getFullYear();
      const targetRetirementYear = currentYear + yearsToTarget;

      const projection: { year: number; Target: number; Actual: number | null }[] = [];
      let simulatedNW = currentNetWorth;

      for (let y = currentYear; y <= targetRetirementYear; y++) {
        projection.push({
          year: y,
          Target: Math.round(simulatedNW),
          Actual: y === currentYear ? Math.round(currentNetWorth) : null,
        });
        simulatedNW = simulatedNW * 1.08 + 42000;
      }

      const terminalTarget = projection[projection.length - 1]?.Target || 0;

      setMetrics({
        currentNW: currentNetWorth,
        targetNW: terminalTarget,
        ror: periodRoR,
        isOnPace: periodRoR >= 0.66 || currentNetWorth > 0,
      });
      setData(projection);
      setLoading(false);
    }

    if (userId) fetchWealthData();
  }, [userId]);

  if (loading) return <div className="h-64 bg-zinc-900 rounded-xl animate-pulse" />;

  if (emptyReason || data.length === 0) {
    return (
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6 space-y-2">
        <h3 className="text-lg font-bold text-zinc-100">FI/RE Wealth Matrix</h3>
        <p className="text-sm text-zinc-500">
          {emptyReason || 'No projection data yet. Stamp a snapshot or link investment accounts.'}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 rounded-xl border border-zinc-800 shadow-xl overflow-hidden">
      <div className="p-6 border-b border-zinc-800 flex justify-between items-start">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-bold text-zinc-100">FI/RE Wealth Matrix</h3>
            <span
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border tracking-wide uppercase ${
                metrics.isOnPace
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
              }`}
            >
              {metrics.isOnPace ? 'On Pace' : 'Audit Asset Mix'}
            </span>
          </div>
          <p className="text-xs text-zinc-400">
            Current NW ${Math.round(metrics.currentNW).toLocaleString()} · Terminal $
            {Math.round(metrics.targetNW).toLocaleString()}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wider text-zinc-500 mb-1">Period RoR</p>
          <p className={`text-xl font-bold ${metrics.ror >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {metrics.ror > 0 ? '+' : ''}
            {metrics.ror.toFixed(2)}%
          </p>
        </div>
      </div>

      <div className="p-6">
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorTarget" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="year" stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis
                stroke="#71717a"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                tickFormatter={(val) => `$${val / 1000}k`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#18181b',
                  borderColor: '#27272a',
                  borderRadius: '0.5rem',
                  color: '#f4f4f5',
                }}
                formatter={(value: number | string) => [`$${Number(value).toLocaleString()}`, '']}
                labelStyle={{ color: '#a1a1aa', marginBottom: '4px' }}
              />
              <Area
                type="monotone"
                dataKey="Target"
                stroke="#3b82f6"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorTarget)"
              />
              <Area
                type="monotone"
                dataKey="Actual"
                stroke="#10b981"
                strokeWidth={4}
                fill="none"
                activeDot={{ r: 6, fill: '#10b981' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
