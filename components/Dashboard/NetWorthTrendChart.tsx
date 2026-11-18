'use client';

import React, { useEffect, useState } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { supabase } from '@/lib/supabase';

export default function NetWorthTrendChart({ userId }: { userId: string }) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSnapshots() {
      try {
        const { data: snapshots, error } = await supabase
          .from('historical_snapshots')
          .select('snapshot_date, liquid_capital, investment_capital, total_liabilities, survival_floor')
          .eq('user_id', userId)
          .order('snapshot_date', { ascending: true })
          .limit(30);

        if (error) throw error;

        if (snapshots) {
          const formatted = snapshots.map((s: any) => ({
            date: new Date(s.snapshot_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            netWorth: (Number(s.liquid_capital || 0) + Number(s.investment_capital || 0)) - Number(s.total_liabilities || 0),
            liquidCapital: Number(s.liquid_capital || 0),
            survivalFloor: Number(s.survival_floor || 0)
          }));
          setData(formatted);
        }
      } catch (err) {
        console.error('Error fetching historical snapshots:', err);
      } finally {
        setLoading(false);
      }
    }

    if (userId) {
      fetchSnapshots();
    }
  }, [userId]);

  if (loading) {
    return <div className="p-6 text-zinc-400 bg-zinc-900 rounded-xl border border-zinc-800 animate-pulse">Loading wealth trajectory...</div>;
  }

  if (data.length === 0) {
    return (
      <div className="p-6 bg-zinc-900 rounded-xl border border-zinc-800 text-center">
        <p className="text-zinc-400">No historical snapshots recorded yet.</p>
        <p className="text-xs text-zinc-500 mt-1">Run your first manual snapshot to initialize the trendline.</p>
      </div>
    );
  }

  return (
    <div className="p-6 bg-zinc-900 rounded-xl border border-zinc-800 shadow-xl">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-lg font-bold text-zinc-100">Wealth & Survival Trajectory</h3>
          <p className="text-xs text-zinc-400">Trailing 30-day ledger history</p>
        </div>
      </div>

      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="netWorthGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis dataKey="date" stroke="#71717a" fontSize={12} />
            <YAxis stroke="#71717a" fontSize={12} tickFormatter={(val) => `$${val / 1000}k`} />
            <Tooltip 
              contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '0.5rem', color: '#f4f4f5' }}
              formatter={(value: any) => [`$${Number(value).toLocaleString()}`, '']}
            />
            <Area type="monotone" dataKey="netWorth" name="Net Worth" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#netWorthGrad)" />
            <Area type="monotone" dataKey="survivalFloor" name="Survival Floor" stroke="#f59e0b" strokeWidth={1.5} fill="none" strokeDasharray="4 4" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}