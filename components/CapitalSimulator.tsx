'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface CapitalSimulatorProps {
  initialLiquid: number;
  initialDebt: number;
  monthlyBurn: number;
  emergencyMonths?: number;
  annualGrowthRate?: number; // default 0.08 (8%)
  targetYears?: number; // default 20 years (age 35 to 55)
}

export default function CapitalSimulator({
  initialLiquid,
  initialDebt,
  monthlyBurn,
  emergencyMonths = 6,
  annualGrowthRate = 0.08,
  targetYears = 20,
}: CapitalSimulatorProps) {
  const [isExecuted, setIsExecuted] = useState(false);
  const [windfalls, setWindfalls] = useState<Array<{ source_name: string; source_type: string; expected_date: string; gross_amount: number; tax_drag_pct?: number }>>([]);

  const fetchWindfalls = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) return;
    const { data } = await supabase
      .from('capital_windfalls')
      .select('*')
      .eq('user_id', session.user.id)
      .eq('status', 'PENDING')
      .order('expected_date', { ascending: true });
    if (data) setWindfalls(data);
  };

  useEffect(() => {
    fetchWindfalls();
  }, []);

  // Sample windfall seeder for simulator demos (generic, not employer-specific)
  const seedTestWindfall = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) return;
    const sampleDate = new Date();
    sampleDate.setMonth(sampleDate.getMonth() + 1);
    await supabase.from('capital_windfalls').insert({
      user_id: session.user.id,
      source_name: 'Sample equity vest',
      source_type: 'RSU',
      expected_date: sampleDate.toISOString().split('T')[0],
      gross_amount: 10000,
      tax_drag_pct: 0.3215,
      status: 'PENDING'
    });
    fetchWindfalls();
  };

  const totalNetWindfalls = windfalls.reduce((sum, w) => {
    return sum + (Number(w.gross_amount) * (1 - Number(w.tax_drag_pct || 0)));
  }, 0);

  const effectiveLiquid = initialLiquid + (isExecuted ? totalNetWindfalls : 0);

  // Deterministic calculations powered by scalable liquidity & windfalls
  const efCeiling = Number((monthlyBurn * emergencyMonths).toFixed(2));
  const debtToClear = Math.min(effectiveLiquid, initialDebt);
  const liquidAfterDebt = Math.max(0, effectiveLiquid - debtToClear);
  const remainingDebt = Math.max(0, initialDebt - debtToClear);

  const emergencyReserve = Math.min(liquidAfterDebt, efCeiling);
  const surplusCapital = Math.max(0, liquidAfterDebt - emergencyReserve);

  // Compound growth calculations over targetYears at annualGrowthRate
  const futureValueDeployed = surplusCapital * Math.pow(1 + annualGrowthRate, targetYears);
  const futureValueIdle = surplusCapital * Math.pow(1 + 0.015, targetYears);
  const opportunityCost = futureValueDeployed - futureValueIdle;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-slate-100 shadow-xl space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-800 pb-4">
        <div>
          <span className="text-xs font-semibold tracking-wider text-emerald-400 uppercase">Phase 4 Engine</span>
          <h2 className="text-xl font-bold tracking-tight text-white">Capital Reallocation & Opportunity Cost Simulator</h2>
          <p className="text-sm text-slate-400">
            Model the Work-Backwards Order of Operations to deploy cash drag into wealth engines.
          </p>
        </div>
        <button
          onClick={() => setIsExecuted(!isExecuted)}
          className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-200 ${
            isExecuted
              ? 'bg-amber-600 hover:bg-amber-500 text-white'
              : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/30'
          }`}
        >
          {isExecuted ? 'Reset to Current Telemetry' : 'Simulate Order of Operations'}
        </button>
      </div>

      {/* Scheduled Windfalls Accelerator Panel */}
      <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 space-y-3">
        <div className="flex justify-between items-center text-xs font-mono uppercase text-emerald-400">
          <span>Scheduled Capital Windfalls (+${totalNetWindfalls.toLocaleString('en-US', { minimumFractionDigits: 2 })} Net)</span>
          <div className="flex items-center gap-3">
            <span>{windfalls.length} Active Inflows</span>
            <button
              onClick={seedTestWindfall}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-2.5 py-1 rounded text-[10px] font-semibold transition"
            >
              + Add sample windfall
            </button>
          </div>
        </div>

        {windfalls.length === 0 ? (
          <div className="border border-dashed border-slate-800 rounded p-4 text-center text-slate-500 text-xs">
            No scheduled windfalls ingested. Click <span className="text-indigo-400 font-semibold">&quot;+ Add sample windfall&quot;</span> above to simulate an equity vest or bonus injection.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {windfalls.map((w, idx) => {
              const netYield = Number(w.gross_amount) * (1 - Number(w.tax_drag_pct || 0));
              return (
                <div key={idx} className="p-2.5 bg-slate-900 border border-slate-800 rounded text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-indigo-400 font-semibold">{w.source_name}</span>
                    <span className="text-slate-400 text-[10px]">{w.expected_date}</span>
                  </div>
                  <div className="flex justify-between font-mono">
                    <span className="text-slate-400">Net Yield:</span>
                    <span className="text-emerald-400 font-bold">${netYield.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Execution Cascade Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Step 2 Card */}
        <div className={`p-4 rounded-lg border transition-colors ${
          isExecuted ? 'bg-slate-800/80 border-emerald-500/40' : 'bg-slate-800/40 border-slate-700/60'
        }`}>
          <div className="text-xs font-medium text-slate-400 uppercase">Step 2: Debt Elimination</div>
          <div className="mt-1 text-2xl font-bold tracking-tight">
            ${isExecuted ? remainingDebt.toLocaleString('en-US', { minimumFractionDigits: 2 }) : initialDebt.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <div className="mt-2 text-xs text-slate-400">
            {isExecuted ? (
              <span className="text-emerald-400 font-semibold">Erased: -${debtToClear.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
            ) : (
              <span>Pending payoff via liquid cash</span>
            )}
          </div>
        </div>

        {/* Step 3 Card */}
        <div className={`p-4 rounded-lg border transition-colors ${
          isExecuted ? 'bg-slate-800/80 border-cyan-500/40' : 'bg-slate-800/40 border-slate-700/60'
        }`}>
          <div className="text-xs font-medium text-slate-400 uppercase">Step 3: 6-Mo Emergency Fund</div>
          <div className="mt-1 text-2xl font-bold tracking-tight text-cyan-400">
            ${emergencyReserve.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <div className="mt-2 text-xs text-slate-400">
            Ceiling: ${efCeiling.toLocaleString('en-US', { minimumFractionDigits: 2 })} (HYSA Locked)
          </div>
        </div>

        {/* Step 4 Card */}
        <div className={`p-4 rounded-lg border transition-colors ${
          isExecuted ? 'bg-slate-800/80 border-amber-500/40' : 'bg-slate-800/40 border-slate-700/60'
        }`}>
          <div className="text-xs font-medium text-slate-400 uppercase">Step 4: Deployable Wealth Engine</div>
          <div className="mt-1 text-2xl font-bold tracking-tight text-amber-400">
            ${isExecuted ? surplusCapital.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '0.00'}
          </div>
          <div className="mt-2 text-xs text-slate-400">
            Surplus cash ready for VOO / VTI
          </div>
        </div>
      </div>

      {/* Opportunity Cost Forensics */}
      <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-4 space-y-3">
        <div className="flex justify-between items-center text-sm font-semibold">
          <span className="text-slate-300">20-Year Opportunity Cost of Idle Cash Drag (${surplusCapital.toLocaleString('en-US', { minimumFractionDigits: 2 })})</span>
          <span className="text-xs text-emerald-400 uppercase tracking-wide">Target Age: 55</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <div className="p-3 bg-slate-900/80 rounded border border-slate-800">
            <span className="text-xs text-slate-400">Status Quo (Idle in Bank @ ~1.5%):</span>
            <div className="text-lg font-bold text-slate-300">
              ${futureValueIdle.toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </div>
            <span className="text-xs text-rose-400">Massive loss to real inflation</span>
          </div>

          <div className="p-3 bg-slate-900/80 rounded border border-slate-800">
            <span className="text-xs text-slate-400">Deployed to Index Funds (VOO/VTI @ 8.0%):</span>
            <div className="text-lg font-bold text-emerald-400">
              ${futureValueDeployed.toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </div>
            <span className="text-xs text-emerald-400 font-medium">
              +${opportunityCost.toLocaleString('en-US', { maximumFractionDigits: 0 })} Wealth Delta
            </span>
          </div>
        </div>

        <p className="text-xs text-slate-500 pt-1">
          *Calculated over a 20-year horizon (current age 35 to retirement age 55) based on historical broad-market returns. Zero friction execution eliminates Step 2 interest penalties immediately.
        </p>
      </div>
    </div>
  );
}
