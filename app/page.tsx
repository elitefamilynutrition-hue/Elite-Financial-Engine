'use client';

import { useState, useEffect } from 'react';
import { PlaidLinkButton } from '@/components/PlaidLinkButton';
import { TelemetryGrid } from '@/components/TelemetryGrid';
import CapitalSimulator from '@/components/CapitalSimulator';
import SettingsDrawer from '@/components/SettingsDrawer';
import { supabase } from '@/lib/supabase';

export default function Dashboard() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [auditReport, setAuditReport] = useState<string | null>(null);
  const [isAuditing, setIsAuditing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const fetchDashboardData = async () => {
    const { data: accData } = await supabase.from('financial_accounts').select('*');
    if (accData) setAccounts(accData);

    const { data: txData } = await supabase
      .from('transactions')
      .select('*')
      .order('date', { ascending: false });
    if (txData) setTransactions(txData);
  };

  const syncTransactions = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch('/api/plaid/sync-transactions', { 
         method: 'POST',
         headers: { 'Content-Type': 'application/json' }
      });
      
      if (!res.ok) {
         throw new Error(`HTTP error! status: ${res.status}`);
      }
      
      const data = await res.json();
      if (data.status === 'SUCCESS' || data.message) {
        await fetchDashboardData();
      }
    } catch (error) {
      console.error('Failed to sync transactions:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    // TEMPORARILY DISABLE AUTO-SYNC TO PREVENT IFRAME RE-RENDERS
    // syncTransactions(); 
    fetchDashboardData();
  }, []);

  const runGeminiAudit = async () => {
    setIsAuditing(true);
    setAuditReport(null);
    try {
      const res = await fetch('/api/audit', { method: 'POST' });
      const data = await res.json();
      if (data.auditReport) {
        setAuditReport(data.auditReport);
      } else {
        alert(data.error || 'Failed to run audit');
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsAuditing(false);
    }
  };

  const liquidCapital = accounts
    .filter((a) => a.account_type?.toLowerCase() === 'depository')
    .reduce((sum, a) => sum + Number(a.current_balance || 0), 0);

  const revolvingDebt = accounts
    .filter((a) => a.account_type?.toLowerCase() === 'credit')
    .reduce((sum, a) => sum + Number(a.current_balance || 0), 0);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const nonOperationalKeywords = ['transfer', 'payment', 'credit card payment', 'deposit', 'wire'];
  const trailingBurn = transactions
    .filter((t) => {
      const amt = Number(t.amount || 0);
      const cat = (t.category || '').toLowerCase();
      const name = (t.name || '').toLowerCase();
      const isExcluded = nonOperationalKeywords.some((kw) => cat.includes(kw) || name.includes(kw));
      return amt > 0 && !isExcluded && new Date(t.date) >= thirtyDaysAgo;
    })
    .reduce((sum, t) => sum + Number(t.amount), 0);

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 p-8">
      <div className="max-w-6xl mx-auto space-y-10">
        <header className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 border-b border-zinc-800 pb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">BudgetDog Financial Engine</h1>
            <p className="text-zinc-400 text-sm">Automated sync and intelligent portfolio telemetry</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 font-semibold py-2.5 px-4 rounded-lg transition text-sm"
            >
              Configure Targets
            </button>
            <button
              onClick={syncTransactions}
              disabled={isSyncing}
              className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 disabled:opacity-50 text-zinc-200 font-semibold py-2.5 px-4 rounded-lg transition flex items-center gap-2 text-sm"
            >
              <span className={`h-2 w-2 rounded-full ${isSyncing ? 'bg-amber-400 animate-ping' : 'bg-emerald-400'}`} />
              {isSyncing ? 'Syncing...' : 'Sync Telemetry'}
            </button>
            <button
              onClick={runGeminiAudit}
              disabled={isAuditing || accounts.length === 0}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-semibold py-2.5 px-5 rounded-lg transition text-sm"
            >
              {isAuditing ? 'Auditing Portfolios...' : 'Run Gemini Audit'}
            </button>
            <PlaidLinkButton onSuccessAction={() => { syncTransactions(); fetchDashboardData(); }} />
          </div>
        </header>

        {/* AI Audit Report Modal/Box */}
        {auditReport && (
          <section className="bg-zinc-900 border border-indigo-500/40 rounded-xl p-6 space-y-4 shadow-lg shadow-indigo-500/5">
            <div className="flex justify-between items-center border-b border-zinc-800 pb-3">
              <h2 className="text-xl font-bold text-indigo-400">Gemini Pro Forensic Audit</h2>
              <button
                onClick={() => setAuditReport(null)}
                className="text-zinc-500 hover:text-zinc-300 text-sm font-mono"
              >
                Close
              </button>
            </div>
            <div className="text-zinc-300 text-sm whitespace-pre-wrap leading-relaxed">
              {auditReport}
            </div>
          </section>
        )}

        {/* Telemetry Dashboard */}
        <TelemetryGrid accounts={accounts} transactions={transactions} />

        {/* Capital Reallocation & Opportunity Cost Simulator */}
        <CapitalSimulator
          initialLiquid={liquidCapital}
          initialDebt={revolvingDebt}
          monthlyBurn={trailingBurn > 0 ? trailingBurn : 392.08}
          emergencyMonths={6}
          annualGrowthRate={0.08}
          targetYears={20}
        />

        {/* Linked Accounts */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold tracking-tight">Active Accounts</h2>
          {accounts.length === 0 ? (
            <div className="border border-dashed border-zinc-800 rounded-xl p-8 text-center text-zinc-500">
              No accounts linked yet. Click &apos;Connect Bank Account&apos; to link via Plaid Sandbox.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {accounts.map((acc) => (
                <div key={acc.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-2">
                  <div className="text-xs font-mono uppercase tracking-wider text-emerald-400">{acc.account_type}</div>
                  <div className="font-semibold text-lg">{acc.account_name}</div>
                  <div className="text-2xl font-bold tracking-tight">
                    ${Number(acc.current_balance).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Transactions Telemetry Feed */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold tracking-tight">Recent Transactions</h2>
          {transactions.length === 0 ? (
            <div className="border border-dashed border-zinc-800 rounded-xl p-6 text-center text-zinc-500 text-sm">
              No transaction history ingested yet.
            </div>
          ) : (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-950 border-b border-zinc-800 text-zinc-400 uppercase text-xs">
                  <tr>
                    <th className="p-4">Date</th>
                    <th className="p-4">Description</th>
                    <th className="p-4">Category</th>
                    <th className="p-4 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {transactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-zinc-800/40 transition">
                      <td className="p-4 text-zinc-400 font-mono text-xs">{tx.date}</td>
                      <td className="p-4 font-medium text-zinc-200">{tx.name}</td>
                      <td className="p-4 text-zinc-400 text-xs">{tx.category || 'General'}</td>
                      <td className={`p-4 text-right font-mono font-semibold ${tx.amount > 0 ? 'text-zinc-100' : 'text-emerald-400'}`}>
                        ${Number(tx.amount).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {/* Settings & Paystub Drawer */}
      <SettingsDrawer
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSaved={fetchDashboardData}
      />
    </main>
  );
}