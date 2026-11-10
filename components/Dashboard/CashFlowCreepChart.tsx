'use client';

import React, { useMemo } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from 'recharts';

export default function CashFlowCreepChart({ transactions }: { transactions: any[] }) {
  const { chartData, diagnostics } = useMemo(() => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    let income = 0;
    let fixedSurvival = 0;
    let discretionaryCreep = 0;
    let financialOffense = 0;

    transactions.forEach((t) => {
      const txDate = new Date(t.date);
      if (txDate < thirtyDaysAgo) return;

      const amount = Number(t.amount || 0);

      // Plaid maps income/deposits as negative amounts
      if (amount < 0) {
        income += Math.abs(amount);
        return;
      }

      // Respect the database intent classification (internal transfers, survival, creep, offense)
      if (t.is_internal_transfer || t.transaction_intent === 'transfer') {
        return; // Completely ignore internal card payments and balance sweeps
      }

      const intent = t.transaction_intent || 'survival';

      if (intent === 'offense') {
        financialOffense += amount;
      } else if (intent === 'creep') {
        discretionaryCreep += amount;
      } else {
        fixedSurvival += amount; // Defaults to survival
      }
    });

    const totalOutflow = fixedSurvival + discretionaryCreep + financialOffense;
    const creepPercentage = totalOutflow > 0 ? (discretionaryCreep / totalOutflow) * 100 : 0;
    
    // Status Logic
    const isBleeding = discretionaryCreep > (income * 0.25); // Bleeding if Creep > 25% of Income

    return {
      chartData: [
        { name: 'Income', Income: income, Fixed: 0, Creep: 0, Offense: 0 },
        { name: 'Outflow', Income: 0, Fixed: fixedSurvival, Creep: discretionaryCreep, Offense: financialOffense }
      ],
      diagnostics: {
        income,
        totalOutflow,
        fixedSurvival,
        discretionaryCreep,
        financialOffense,
        creepPercentage,
        isBleeding
      }
    };
  }, [transactions]);

  if (!transactions || transactions.length === 0) return null;

  return (
    <div className="bg-zinc-900 rounded-xl border border-zinc-800 shadow-xl overflow-hidden">
      <div className="p-6 border-b border-zinc-800">
        <div className="flex justify-between items-center mb-6">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-bold text-zinc-100">30-Day Cash Flow & Creep Engine</h3>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border tracking-wide uppercase ${diagnostics.isBleeding ? 'bg-rose-500/10 text-rose-400 border-rose-500/20 animate-pulse' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`}>
                {diagnostics.isBleeding ? '🚨 Creep Detected' : '🛡️ Operational'}
              </span>
            </div>
            <p className="text-xs text-zinc-400">Trailing 30-day Plaid telemetry</p>
          </div>
        </div>

        <div className="h-40 w-full mb-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 30, left: 0, bottom: 0 }}>
              <XAxis type="number" stroke="#71717a" fontSize={12} tickFormatter={(val) => `$${val / 1000}k`} />
              <YAxis dataKey="name" type="category" stroke="#71717a" fontSize={12} width={65} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '0.5rem', color: '#f4f4f5' }}
                formatter={(value: any) => [`$${Number(value).toLocaleString(undefined, {minimumFractionDigits: 2})}`, '']}
              />
              <Bar dataKey="Income" stackId="a" fill="#3b82f6" name="Total Inflow" radius={[0, 4, 4, 0]} />
              <Bar dataKey="Fixed" stackId="a" fill="#71717a" name="Fixed Survival" />
              <Bar dataKey="Creep" stackId="a" fill="#f43f5e" name="Discretionary Creep" />
              <Bar dataKey="Offense" stackId="a" fill="#10b981" name="Financial Offense" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Custom Educational Legend */}
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 mt-4 pb-2 text-xs text-zinc-400">
          <div className="flex items-center gap-1.5 group relative cursor-help">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
            <span>Total Inflow</span>
            <span className="text-[9px] font-bold border border-zinc-600 text-zinc-500 rounded-full w-3.5 h-3.5 flex items-center justify-center group-hover:border-zinc-400 group-hover:text-zinc-300 transition-colors">i</span>
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2.5 bg-zinc-800 text-zinc-200 text-xs rounded-lg border border-zinc-700 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-xl text-center">
              All inbound capital from payroll, business income, or deposits.
            </div>
          </div>
          
          <div className="flex items-center gap-1.5 group relative cursor-help">
            <span className="w-2.5 h-2.5 rounded-full bg-zinc-500"></span>
            <span>Fixed Survival</span>
            <span className="text-[9px] font-bold border border-zinc-600 text-zinc-500 rounded-full w-3.5 h-3.5 flex items-center justify-center group-hover:border-zinc-400 group-hover:text-zinc-300 transition-colors">i</span>
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2.5 bg-zinc-800 text-zinc-200 text-xs rounded-lg border border-zinc-700 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-xl text-center">
              Non-negotiable baseline operations: mortgage, utilities, baseline groceries, healthcare.
            </div>
          </div>

          <div className="flex items-center gap-1.5 group relative cursor-help">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
            <span>Discretionary Creep</span>
            <span className="text-[9px] font-bold border border-zinc-600 text-zinc-500 rounded-full w-3.5 h-3.5 flex items-center justify-center group-hover:border-zinc-400 group-hover:text-zinc-300 transition-colors">i</span>
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2.5 bg-zinc-800 text-zinc-200 text-xs rounded-lg border border-zinc-700 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-xl text-center">
              Unnecessary lifestyle bleed: dining out, shopping, travel, entertainment.
            </div>
          </div>

          <div className="flex items-center gap-1.5 group relative cursor-help">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
            <span>Financial Offense</span>
            <span className="text-[9px] font-bold border border-zinc-600 text-zinc-500 rounded-full w-3.5 h-3.5 flex items-center justify-center group-hover:border-zinc-400 group-hover:text-zinc-300 transition-colors">i</span>
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 p-2.5 bg-zinc-800 text-zinc-200 text-xs rounded-lg border border-zinc-700 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-xl text-center">
              Capital deployed to crush liabilities or buy assets: debt payoff, investments, savings.
            </div>
          </div>
        </div>
      </div>

      {/* AI Tactical Assessment */}
      <div className="p-6 bg-zinc-950/50">
        <h4 className="text-sm font-bold text-zinc-300 mb-3 uppercase tracking-wider">Tactical Assessment</h4>
        <div className="space-y-4">
          <div className="flex gap-4 items-center">
            <div className="flex-1 bg-zinc-900 border border-zinc-800 p-3 rounded-lg">
              <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Total Burn</div>
              <div className="text-lg font-mono text-zinc-200">${diagnostics.totalOutflow.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
            </div>
            <div className="flex-1 bg-rose-950/20 border border-rose-900/30 p-3 rounded-lg">
              <div className="text-xs text-rose-500 uppercase tracking-wider mb-1">Lifestyle Bleed</div>
              <div className="text-lg font-mono text-rose-400">${diagnostics.discretionaryCreep.toLocaleString(undefined, {minimumFractionDigits: 2})} ({diagnostics.creepPercentage.toFixed(1)}%)</div>
            </div>
          </div>
          <p className="text-sm text-zinc-400 leading-relaxed">
            {diagnostics.isBleeding 
              ? `You are burning $${diagnostics.discretionaryCreep.toLocaleString(undefined, {minimumFractionDigits: 2})} on lifestyle and discretionary categories over the last 30 days. This capital is being vaporized instead of being deployed as financial offense against your liabilities. Audit discretionary outlays immediately.`
              : `Your lifestyle creep is contained. You are successfully capping discretionary spending and routing capital efficiently. Maintain current operational discipline and push excess free cash flow toward debt payoff or your 401k.`}
          </p>
        </div>
      </div>
    </div>
  );
}