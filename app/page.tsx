'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { PlaidLinkButton } from '@/components/PlaidLinkButton';
import { TelemetryGrid } from '@/components/TelemetryGrid';
import CapitalSimulator from '@/components/CapitalSimulator';
import SettingsDrawer from '@/components/SettingsDrawer';
import { ManualLiabilityCard } from '@/components/ManualLiabilityCard';
import { AuditChatDrawer } from '@/components/AuditChatDrawer';
import DayZeroIntake from '@/components/DayZeroIntake';
import { supabase } from '@/lib/supabase';
import NetWorthTrendChart from '@/components/Dashboard/NetWorthTrendChart'; 
import CashFlowCreepChart from '@/components/Dashboard/CashFlowCreepChart';
import WealthMatrixChart from '@/components/Dashboard/WealthMatrixChart'; 

function DashboardContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const currentTab = searchParams.get('tab') || 'dashboard';

  const setTab = (tab: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('tab', tab);
    router.push(`${pathname}?${params.toString()}`);
  };

  const [accounts, setAccounts] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [auditReport, setAuditReport] = useState<string | null>(null);
  const [baselineTelemetry, setBaselineTelemetry] = useState<any>(null);
  const [isAuditing, setIsAuditing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [userId, setUserId] = useState<string>('');
  const [isSnapshotting, setIsSnapshotting] = useState(false);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  useEffect(() => {
    const checkProfileStatus = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) return;
      
      const { data, error } = await supabase
        .from('user_financial_profiles')
        .select('id')
        .eq('user_id', session.user.id)
        .single();
        
      if (error || !data) {
        setNeedsOnboarding(true);
      }
    };
    checkProfileStatus();
  }, []);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const handleNameUpdate = async (accountId: string) => {
    if (!editValue.trim()) {
      setEditingId(null);
      return;
    }
    setAccounts(accounts.map(acc => 
      acc.id === accountId ? { ...acc, custom_name: editValue } : acc
    ));
    setEditingId(null);

    const { error } = await supabase
      .from('financial_accounts')
      .update({ custom_name: editValue })
      .eq('id', accountId);

    if (error) console.error('Failed to update nickname:', error);
  };

  const fetchDashboardData = async () => {
    const { data: accData } = await supabase.from('financial_accounts').select('*');
    if (accData) setAccounts(accData);

    const { data: txData } = await supabase
      .from('transactions')
      .select('*')
      .order('date', { ascending: false });
    if (txData) setTransactions(txData);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const currentUserId = session?.user?.id || '';
      if (currentUserId) setUserId(currentUserId);
      
      const res = await fetch(`/api/baseline?userId=${currentUserId}`);
      
      if (res.ok) {
        const payload = await res.json();
        if (payload.status === 'SUCCESS') {
          setBaselineTelemetry(payload.telemetry);
        }
      } else {
        console.error('Backend returned status:', res.status);
      }
    } catch (error) {
      console.error('Failed to fetch baseline telemetry:', error);
    }
  };

  const syncTransactions = async () => {
    setIsSyncing(true);
    try {
      // Automatically force-reset cursors on sync to ensure fresh data and bypass stale caches
      const res = await fetch('/api/plaid/sync-transactions?reset=true', { 
         method: 'POST',
         headers: { 'Content-Type': 'application/json' }
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || `HTTP error! status: ${res.status}`);
      }
      
      if (data.sync_errors && data.sync_errors.length > 0) {
        alert("Sync partially failed. These banks require re-authentication:\n\n" + data.sync_errors.join('\n'));
      }
      
      if (data.status === 'SUCCESS' || data.message) await fetchDashboardData();
    } catch (error: any) {
      console.error('Failed to sync transactions:', error.message || error);
      // Optional: Add a UI toast/alert here if you want visible user feedback
      alert(`Sync Failed: ${error.message || 'Unknown error'}`);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
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

  const runManualSnapshot = async () => {
    if (!userId) return;
    setIsSnapshotting(true);
    try {
      const res = await fetch(`/api/snapshot?userId=${userId}`, { method: 'POST' });
      if (!res.ok) {
        const errorPayload = await res.json();
        throw new Error(`Database Reject: ${errorPayload.error || res.statusText}`);
      }
      
      // Force a hard reload to instantly update the chart and UI with the new data
      window.location.reload(); 
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSnapshotting(false);
    }
  };

  // Balance Sheet Engine: Categorization & Aggregation
  const depositoryAccounts = accounts.filter(a => (a.account_type || '').toLowerCase() === 'depository');
  const investmentAccounts = accounts.filter(a => (a.account_type || '').toLowerCase() === 'investment' || (a.account_type || '').toLowerCase() === 'brokerage');
  const liabilityAccounts = accounts.filter(a => (a.account_type || '').toLowerCase() === 'credit' || (a.account_type || '').toLowerCase() === 'loan');

  const liquidCapital = depositoryAccounts.reduce((sum, a) => sum + Number(a.current_balance || 0), 0);
  const investmentCapital = investmentAccounts.reduce((sum, a) => sum + Number(a.current_balance || 0), 0);
  const revolvingDebt = liabilityAccounts.reduce((sum, a) => sum + Number(a.current_balance || 0), 0);
  const totalNetWorth = liquidCapital + investmentCapital - revolvingDebt;

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const trailingBurn = transactions
    .filter((t) => {
      const amt = Number(t.amount || 0);
      const txDate = new Date(t.date);
      
      // Must be within 30 days and a positive debit (outflow)
      if (txDate < thirtyDaysAgo || amt <= 0) return false;

      // Respect database intent / internal transfer flags
      if (t.is_internal_transfer || t.transaction_intent === 'transfer') {
        return false;
      }

      // Exclude financial offense (investments/debt paydown) from base living burn
      if (t.transaction_intent === 'offense') {
        return false;
      }

      return true;
    })
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const renderCard = (acc: any, colorClass: string) => (
    <div key={acc.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-2 shadow-sm">
      <div className={`text-xs font-mono uppercase tracking-wider ${colorClass}`}>
        {acc.account_subtype || acc.account_type}
      </div>
      {editingId === acc.id ? (
        <input
          autoFocus
          className="w-full bg-zinc-950 border border-indigo-500 rounded px-2 py-0.5 text-lg font-semibold text-white focus:outline-none"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={() => handleNameUpdate(acc.id)}
          onKeyDown={(e) => e.key === 'Enter' && handleNameUpdate(acc.id)}
        />
      ) : (
        <div 
          className="font-semibold text-lg cursor-pointer hover:text-indigo-400 transition truncate"
          onClick={() => { setEditingId(acc.id); setEditValue(acc.custom_name || acc.account_name); }}
          title="Click to rename"
        >
          {acc.custom_name || acc.account_name}
        </div>
      )}
      <div className="text-2xl font-bold tracking-tight">
        ${Number(acc.current_balance).toLocaleString('en-US', { minimumFractionDigits: 2 })}
      </div>
    </div>
  );

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 p-8">
      {needsOnboarding && (
        <DayZeroIntake onComplete={() => {
          setNeedsOnboarding(false);
          fetchDashboardData();
        }} />
      )}
      
      <div className="max-w-6xl mx-auto space-y-10">
        <header className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 border-b border-zinc-800 pb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">Elite Capital Engine</h1>
            <p className="text-zinc-400 text-sm">Automated sync and intelligent portfolio telemetry</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap justify-end">
            <button
              onClick={handleSignOut}
              className="bg-zinc-950 hover:bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-zinc-200 font-semibold py-2.5 px-4 rounded-lg transition text-sm"
            >
              Sign out
            </button>
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
              onClick={() => setIsChatOpen(true)}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5 px-4 rounded-lg transition flex items-center gap-2 text-sm shadow-lg shadow-indigo-500/20"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
              Sparring Chat
            </button>
            <button
              onClick={runGeminiAudit}
              disabled={isAuditing || accounts.length === 0}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-semibold py-2.5 px-5 rounded-lg transition text-sm"
            >
              {isAuditing ? 'Auditing Portfolios...' : 'Run Gemini Audit'}
            </button>
            <button
              onClick={runManualSnapshot}
              disabled={isSnapshotting || !userId}
              className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold py-2.5 px-5 rounded-lg transition flex items-center gap-2 text-sm"
            >
              📸 {isSnapshotting ? 'Stamping...' : 'Stamp Snapshot'}
            </button>
            <PlaidLinkButton onSuccessAction={() => { syncTransactions(); fetchDashboardData(); }} />
          </div>
        </header>

        <div className="flex space-x-1 border-b border-zinc-800 pb-px">
          {[
            { id: 'dashboard', label: 'Command Center' },
            { id: 'balance-sheet', label: 'Balance Sheet' },
            { id: 'ledger', label: 'The Ledger' },
            { id: 'simulator', label: 'War Room' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-semibold rounded-t-lg transition ${
                currentTab === tab.id
                  ? 'bg-zinc-900 text-indigo-400 border-t border-l border-r border-zinc-800'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

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

        {currentTab === 'dashboard' && (
          <div className="space-y-10">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {userId && <NetWorthTrendChart userId={userId} />}
              <CashFlowCreepChart transactions={transactions} />
            </div>
            <TelemetryGrid accounts={accounts} transactions={transactions} />
            {userId && <WealthMatrixChart userId={userId} />}
            
            <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-6">
              <h2 className="text-lg font-semibold tracking-tight">Baseline Freeze & Wealth Matrix</h2>
              
              {!baselineTelemetry ? (
                <div className="border border-dashed border-zinc-800 rounded-xl p-8 text-center text-zinc-500 text-sm animate-pulse">
                  Ingesting dynamic telemetry...
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3 p-5 bg-zinc-950 border border-zinc-800 rounded-lg">
                    <h3 className="text-sm font-semibold text-indigo-400 uppercase tracking-wider">20% Wealth Quota</h3>
                    <div className="flex justify-between items-baseline">
                      <span className="text-2xl font-bold text-white">${Number(baselineTelemetry.wealth_quota.remaining_monthly_requirement).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      <span className="text-xs text-zinc-500">Remaining Mo. Target</span>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-zinc-400">
                        <span>Gross Target (Annual):</span>
                        <span>${Number(baselineTelemetry.wealth_quota.gross_target).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between text-xs text-zinc-400">
                        <span>Upstream Credited (401k/HSA):</span>
                        <span className="text-emerald-400">${Number(baselineTelemetry.wealth_quota.upstream_credited).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3 p-5 bg-zinc-950 border border-zinc-800 rounded-lg">
                    <h3 className="text-sm font-semibold text-amber-400 uppercase tracking-wider">Survival Floor ({baselineTelemetry.survival_matrix.target_months} Mo)</h3>
                    <div className="flex justify-between items-baseline">
                      <span className="text-2xl font-bold text-white">${Number(baselineTelemetry.survival_matrix.required_emergency_floor).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                      <span className="text-xs text-zinc-500">Target Cash</span>
                    </div>
                    
                    <div className="space-y-1 mt-2">
                      <div className="flex justify-between text-xs text-zinc-400 mb-1.5">
                        <span>Current Liquidity:</span>
                        <span className={liquidCapital >= baselineTelemetry.survival_matrix.required_emergency_floor ? "text-emerald-400 font-semibold" : "text-rose-400 font-semibold"}>
                          ${Number(liquidCapital).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="w-full bg-zinc-800 rounded-full h-1.5">
                        <div 
                          className={`h-1.5 rounded-full ${liquidCapital >= baselineTelemetry.survival_matrix.required_emergency_floor ? 'bg-emerald-400' : 'bg-rose-400'}`}
                          style={{ width: `${Math.min(100, (liquidCapital / (baselineTelemetry.survival_matrix.required_emergency_floor || 1)) * 100)}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}

        {currentTab === 'balance-sheet' && (
          <div className="space-y-10">
            <ManualLiabilityCard />
            
            <section className="space-y-6">
              <div className="flex justify-between items-end border-b border-zinc-800 pb-4">
                <h2 className="text-lg font-semibold tracking-tight">Active Balance Sheet</h2>
                <div className="text-right">
                  <span className="text-xs text-zinc-400 uppercase tracking-wider block">Total Net Worth</span>
                  <span className={`text-xl font-bold ${totalNetWorth >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    ${totalNetWorth.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
              
              {accounts.length === 0 ? (
                <div className="border border-dashed border-zinc-800 rounded-xl p-8 text-center text-zinc-500">
                  No accounts linked yet. Click &apos;Connect Bank Account&apos; to link via Plaid.
                </div>
              ) : (
                <div className="space-y-8">
                  {/* Liquid Capital */}
                  {depositoryAccounts.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Liquid Capital (Checking & Savings)</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {depositoryAccounts.map(acc => renderCard(acc, 'text-emerald-400'))}
                      </div>
                    </div>
                  )}

                  {/* Investment Capital */}
                  {investmentAccounts.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Wealth Engines (Brokerage & Retirement)</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {investmentAccounts.map(acc => renderCard(acc, 'text-indigo-400'))}
                      </div>
                    </div>
                  )}

                  {/* Liabilities */}
                  {liabilityAccounts.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Revolving & Term Debt</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {liabilityAccounts.map(acc => renderCard(acc, 'text-rose-400'))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>
        )}

        {currentTab === 'ledger' && (
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
        )}

        {currentTab === 'simulator' && (
          <CapitalSimulator
            initialLiquid={liquidCapital}
            initialDebt={revolvingDebt}
            monthlyBurn={trailingBurn > 0 ? trailingBurn : 392.08}
            emergencyMonths={6}
            annualGrowthRate={0.08}
            targetYears={20}
          />
        )}
      </div>

      <SettingsDrawer
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSaved={fetchDashboardData}
      />

      <AuditChatDrawer 
        isOpen={isChatOpen} 
        onClose={() => setIsChatOpen(false)} 
      />
    </main>
  );
}

export default function Dashboard() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-500">Loading Command Center...</div>}>
      <DashboardContent />
    </Suspense>
  );
}