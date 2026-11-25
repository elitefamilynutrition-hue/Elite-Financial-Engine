'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { PlaidLinkButton } from '@/components/PlaidLinkButton';
import { TelemetryGrid } from '@/components/TelemetryGrid';
import CapitalSimulator from '@/components/CapitalSimulator';
import SettingsDrawer from '@/components/SettingsDrawer';
import { ManualLiabilityCard } from '@/components/ManualLiabilityCard';
import { AuditChatDrawer } from '@/components/AuditChatDrawer';
import { CategoryBurnDrawer } from '@/components/CategoryBurnDrawer';
import { AnomalyReviewPanel, type AnomalyItem } from '@/components/AnomalyReviewPanel';
import DayZeroIntake from '@/components/DayZeroIntake';
import { createBrowserSupabaseClient } from '@/lib/supabase-browser';
import NetWorthTrendChart from '@/components/Dashboard/NetWorthTrendChart'; 
import CashFlowCreepChart from '@/components/Dashboard/CashFlowCreepChart';
import WealthMatrixChart, { type FireDashboardPayload } from '@/components/Dashboard/WealthMatrixChart';
import { SavingsRatioCard, type SavingsRatioPayload } from '@/components/Dashboard/SavingsRatioCard';
import { SubscriptionAuditCard, type SubscriptionLeakRow } from '@/components/Dashboard/SubscriptionAuditCard';
import { formatCategoryLabel } from '@/lib/format/category-label';
import type { CategoryBucketId } from '@/lib/analytics/category-buckets';
import { computeLiveNetWorth } from '@/lib/analytics/net-worth';
import { isSubscriptionActive } from '@/lib/billing/subscription';
import { LegalFooter } from '@/components/LegalFooter';

function DashboardContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const currentTab = searchParams.get('tab') || 'dashboard';
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const billingSuccess = searchParams.get('billing') === 'success';

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
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);
  const [entitlementChecked, setEntitlementChecked] = useState(false);
  const [hasSubscription, setHasSubscription] = useState(false);
  const [activatingBilling, setActivatingBilling] = useState(false);
  const [burnBucketId, setBurnBucketId] = useState<CategoryBucketId | null>(null);
  const [burnBuckets, setBurnBuckets] = useState<
    { bucketId: CategoryBucketId; label: string; amount: number; dominantIntent: 'survival' | 'creep'; percentage: number }[]
  >([]);
  const [burnTotal, setBurnTotal] = useState<number | null>(null);
  const [anomalies, setAnomalies] = useState<AnomalyItem[]>([]);
  const [sinkingFunds, setSinkingFunds] = useState<
    { id?: string | number; fund_name?: string; target_amount: number; recurring_schedule?: string; due_date?: string }[]
  >([]);
  const [chatSeed, setChatSeed] = useState<string | null>(null);
  const [savingsRatio, setSavingsRatio] = useState<SavingsRatioPayload | null>(null);
  const [subscriptionLeaks, setSubscriptionLeaks] = useState<SubscriptionLeakRow[]>([]);
  const [firePayload, setFirePayload] = useState<FireDashboardPayload | null>(null);
  const [excludeBusyId, setExcludeBusyId] = useState<string | null>(null);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [labAllowed, setLabAllowed] = useState(false);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const startCheckout = async () => {
    setIsUpgrading(true);
    try {
      const res = await fetch('/api/billing/checkout', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        throw new Error(
          data.error ||
            'Checkout is not available. Confirm Stripe test keys are set on this deployment.'
        );
      }
      window.location.href = data.url;
    } catch (err: unknown) {
      console.error('Trial checkout failed:', err);
      alert(err instanceof Error ? err.message : 'Unable to start checkout.');
      setIsUpgrading(false);
    }
  };

  const openBillingPortal = async () => {
    setIsOpeningPortal(true);
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        throw new Error(data.error || 'Unable to open billing portal.');
      }
      window.location.href = data.url;
    } catch (err: unknown) {
      console.error('Billing portal failed:', err);
      alert(err instanceof Error ? err.message : 'Unable to open billing portal.');
      setIsOpeningPortal(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const checkOnce = async (): Promise<boolean> => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user?.id) {
        if (!cancelled) {
          setHasSubscription(false);
          setEntitlementChecked(true);
          setActivatingBilling(false);
        }
        return false;
      }

      if (!cancelled) setUserId(session.user.id);

      const { data, error } = await supabase
        .from('user_financial_profiles')
        .select('id, subscription_status')
        .eq('user_id', session.user.id)
        .maybeSingle();

      const entitled = isSubscriptionActive(data?.subscription_status);
      if (!cancelled) {
        setHasSubscription(entitled);
        setEntitlementChecked(true);
        if (entitled && (error || !data?.id)) {
          setNeedsOnboarding(true);
        }
      }
      return entitled;
    };

    const run = async () => {
      const entitled = await checkOnce();
      if (cancelled) return;

      if (entitled) {
        setActivatingBilling(false);
        if (billingSuccess) {
          router.replace(pathname);
        }
        return;
      }

      if (!billingSuccess) {
        setActivatingBilling(false);
        return;
      }

      // Webhook may lag Checkout redirect — poll briefly for trialing/active.
      setActivatingBilling(true);
      for (let i = 0; i < 12 && !cancelled; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        const ok = await checkOnce();
        if (cancelled) return;
        if (ok) {
          setActivatingBilling(false);
          router.replace(pathname);
          return;
        }
      }
      setActivatingBilling(false);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [supabase, searchParams, billingSuccess, pathname, router]);

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
    try {
      const res = await fetch('/api/telemetry/dashboard');
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        const statusHint =
          res.status === 401
            ? 'Session expired — sign in again.'
            : res.status === 402
              ? 'Subscription required — start or renew your trial.'
              : res.status === 429
                ? 'Too many requests — wait a moment and retry.'
                : payload.error || `Dashboard failed (${res.status}).`;
        setDashboardError(statusHint);
        console.error('Dashboard API status:', res.status, payload);
        return;
      }
      if (payload.status !== 'SUCCESS') {
        setDashboardError(payload.error || 'Dashboard returned an unexpected response.');
        return;
      }

      setDashboardError(null);
      if (payload.user_id) setUserId(payload.user_id);
      setAccounts(payload.accounts || []);
      setTransactions(payload.recent_transactions || []);
      if (payload.telemetry) setBaselineTelemetry(payload.telemetry);
      if (payload.burn?.buckets) setBurnBuckets(payload.burn.buckets);
      setBurnTotal(
        typeof payload.burn?.operational_burn === 'number' ? payload.burn.operational_burn : null
      );
      setAnomalies(Array.isArray(payload.anomalies) ? payload.anomalies : []);
      setSinkingFunds(Array.isArray(payload.sinking_funds) ? payload.sinking_funds : []);
      setSavingsRatio(payload.savings_ratio || null);
      setSubscriptionLeaks(Array.isArray(payload.subscription_leaks) ? payload.subscription_leaks : []);
      setFirePayload(payload.fire || null);
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
      setDashboardError(
        error instanceof Error ? error.message : 'Network error loading dashboard.'
      );
    }
  };

  /** Default: resume Plaid next_cursor. Pass forceReset for explicit full history refresh. */
  const syncTransactions = async (forceReset = false) => {
    setIsSyncing(true);
    try {
      const url = forceReset
        ? '/api/plaid/sync-transactions?reset=true'
        : '/api/plaid/sync-transactions';
      const res = await fetch(url, {
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
      alert(`Sync Failed: ${error.message || 'Unknown error'}`);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    if (hasSubscription) {
      fetchDashboardData();
    }
  }, [hasSubscription]);

  useEffect(() => {
    if (!hasSubscription) {
      setLabAllowed(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/lab/access');
        const data = await res.json().catch(() => ({}));
        if (!cancelled) setLabAllowed(Boolean(data.lab_allowed));
      } catch {
        if (!cancelled) setLabAllowed(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasSubscription]);

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

  // Balance Sheet lists all linked accounts; NW totals omit exclude_from_net_worth.
  const depositoryAccounts = accounts.filter(a => (a.account_type || '').toLowerCase() === 'depository');
  const investmentAccounts = accounts.filter(a => (a.account_type || '').toLowerCase() === 'investment' || (a.account_type || '').toLowerCase() === 'brokerage');
  const liabilityAccounts = accounts.filter(a => (a.account_type || '').toLowerCase() === 'credit' || (a.account_type || '').toLowerCase() === 'loan');

  const { liquidCapital, investmentCapital, revolvingDebt, netWorth: totalNetWorth } =
    computeLiveNetWorth(accounts);

  const toggleAccountExclusion = async (accountId: string, next: boolean) => {
    setExcludeBusyId(accountId);
    try {
      const res = await fetch(`/api/accounts/${accountId}/exclude`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exclude_from_net_worth: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to update exclusion');
      setAccounts((prev) =>
        prev.map((a) => (a.id === accountId ? { ...a, exclude_from_net_worth: next } : a))
      );
      await fetchDashboardData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to update account exclusion');
    } finally {
      setExcludeBusyId(null);
    }
  };

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
    <div key={acc.id} className={`bg-zinc-900 border rounded-xl p-5 space-y-2 shadow-sm ${acc.exclude_from_net_worth ? 'border-amber-500/30 opacity-80' : 'border-zinc-800'}`}>
      <div className="flex justify-between items-start gap-2">
        <div className={`text-xs font-mono uppercase tracking-wider ${colorClass}`}>
          {acc.account_subtype || acc.account_type}
        </div>
        <label className="flex items-center gap-1.5 text-[10px] text-zinc-500 cursor-pointer shrink-0">
          <input
            type="checkbox"
            checked={Boolean(acc.exclude_from_net_worth)}
            disabled={excludeBusyId === acc.id}
            onChange={(e) => toggleAccountExclusion(acc.id, e.target.checked)}
            className="rounded border-zinc-600 bg-zinc-950"
          />
          Exclude from NW
        </label>
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
      {acc.exclude_from_net_worth ? (
        <p className="text-[10px] text-amber-500">Omitted from net worth aggregates</p>
      ) : null}
    </div>
  );

  if (!entitlementChecked || activatingBilling) {
    return (
      <main className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-2 text-zinc-500">
        <p>{activatingBilling ? 'Activating subscription…' : 'Checking subscription…'}</p>
        {activatingBilling ? (
          <p className="text-xs text-zinc-600">Waiting for Stripe webhook — usually a few seconds.</p>
        ) : null}
      </main>
    );
  }

  if (!hasSubscription) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100 p-8 flex items-center justify-center">
        <div className="w-full max-w-lg space-y-6 border border-zinc-800 bg-zinc-900/80 rounded-xl p-8">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wider text-zinc-500">Elite Capital Engine</p>
            <h1 className="text-2xl font-bold text-white">Start your 7-day trial</h1>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Invite beta access requires an active subscription. Card on file —{' '}
              <span className="text-zinc-200">7 days free</span>, then{' '}
              <span className="text-zinc-200">$20/month</span>. Cancel anytime in Stripe.
            </p>
            {billingSuccess ? (
              <p className="text-sm text-amber-400/90">
                Checkout finished, but entitlement is not active yet. Wait a moment and refresh, or
                contact support if this persists.
              </p>
            ) : null}
          </div>
          <p className="text-xs text-zinc-500 leading-relaxed">
            Not financial, tax, or investment advice. By continuing you agree to the{' '}
            <Link href="/legal" className="text-indigo-400 hover:underline">
              Legal
            </Link>{' '}
            stubs (Terms &amp; Privacy).
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={startCheckout}
              disabled={isUpgrading}
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold py-3 px-4 rounded-lg transition text-sm"
            >
              {isUpgrading ? 'Redirecting…' : 'Start 7-day trial'}
            </button>
            <button
              onClick={handleSignOut}
              className="bg-zinc-950 hover:bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-zinc-200 font-semibold py-3 px-4 rounded-lg transition text-sm"
            >
              Sign out
            </button>
          </div>
          <LegalFooter className="pt-2" />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 p-8">
      {needsOnboarding && (
        <DayZeroIntake onComplete={() => {
          setNeedsOnboarding(false);
          fetchDashboardData();
        }} />
      )}
      
      <div className="max-w-6xl mx-auto space-y-10">
        {dashboardError && (
          <div
            className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg border border-rose-900/50 bg-rose-950/30 px-4 py-3 text-sm text-rose-200"
            role="alert"
          >
            <p>{dashboardError}</p>
            <button
              type="button"
              onClick={() => {
                void fetchDashboardData();
              }}
              className="shrink-0 bg-rose-800/60 hover:bg-rose-700/70 text-rose-50 font-semibold py-1.5 px-3 rounded-md transition text-xs"
            >
              Retry
            </button>
          </div>
        )}
        <header className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 border-b border-zinc-800 pb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">Elite Capital Engine</h1>
            <p className="text-zinc-400 text-sm">Automated sync and intelligent portfolio telemetry</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap justify-end">
            {labAllowed ? (
              <Link
                href="/lab"
                className="bg-amber-950/40 hover:bg-amber-900/50 border border-amber-800/60 text-amber-200 font-semibold py-2.5 px-4 rounded-lg transition text-sm"
              >
                Lab
              </Link>
            ) : null}
            <button
              onClick={openBillingPortal}
              disabled={isOpeningPortal}
              className="bg-zinc-950 hover:bg-zinc-800 border border-zinc-700 disabled:opacity-50 text-zinc-400 hover:text-zinc-200 font-semibold py-2.5 px-4 rounded-lg transition text-sm"
            >
              {isOpeningPortal ? 'Opening…' : 'Manage billing'}
            </button>
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
              onClick={() => syncTransactions(false)}
              disabled={isSyncing}
              className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 disabled:opacity-50 text-zinc-200 font-semibold py-2.5 px-4 rounded-lg transition flex items-center gap-2 text-sm"
            >
              <span className={`h-2 w-2 rounded-full ${isSyncing ? 'bg-amber-400 animate-ping' : 'bg-emerald-400'}`} />
              {isSyncing ? 'Syncing...' : 'Sync Telemetry'}
            </button>
            <button
              onClick={() => syncTransactions(true)}
              disabled={isSyncing}
              title="Clears Plaid cursors and re-downloads history"
              className="bg-zinc-950 hover:bg-zinc-800 border border-zinc-700 disabled:opacity-50 text-zinc-400 hover:text-zinc-200 font-semibold py-2.5 px-3 rounded-lg transition text-sm"
            >
              Full refresh
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
            <div className="flex flex-col items-end gap-1">
              <button
                onClick={runGeminiAudit}
                disabled={isAuditing || accounts.length === 0}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-semibold py-2.5 px-5 rounded-lg transition text-sm"
              >
                {isAuditing ? 'Auditing Portfolios...' : 'Run Gemini Audit'}
              </button>
              <p className="text-[10px] text-zinc-500 max-w-[14rem] text-right leading-snug">
                Not financial, tax, or investment advice. AI output can be wrong — verify before you act.
              </p>
            </div>
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
            <p className="text-xs text-zinc-500">
              Not financial, tax, or investment advice. AI output can be wrong — verify before you act.
            </p>
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
            <AnomalyReviewPanel
              anomalies={anomalies}
              onResolved={fetchDashboardData}
              onAskAi={(prompt) => {
                setChatSeed(prompt);
                setIsChatOpen(true);
              }}
            />
            <TelemetryGrid
              accounts={accounts}
              transactions={transactions}
              burnBuckets={burnBuckets}
              burnTotal={burnTotal ?? undefined}
              onBucketClick={(bucketId) => setBurnBucketId(bucketId)}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <SavingsRatioCard data={savingsRatio} />
              <SubscriptionAuditCard leaks={subscriptionLeaks} />
            </div>
            <WealthMatrixChart fire={firePayload} />
            
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
                    <p className="text-[11px] text-zinc-500">
                      Based on {baselineTelemetry.survival_matrix.window_days || 90}-day survival burn (creep excluded)
                      {' · '}
                      ~${Number(baselineTelemetry.survival_matrix.monthly_baseline_burn || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}/mo
                    </p>
                    <div className="flex justify-between text-xs text-zinc-400 pt-1">
                      <span>Sinking-fund pad:</span>
                      <span className="text-amber-300 font-mono">
                        ${Number(baselineTelemetry.survival_matrix.monthly_sinking_pad || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}/mo
                        {sinkingFunds.length > 0 ? ` · ${sinkingFunds.length} fund${sinkingFunds.length === 1 ? '' : 's'}` : ''}
                      </span>
                    </div>
                    {sinkingFunds.length > 0 && (
                      <ul className="mt-2 space-y-1 border-t border-zinc-800 pt-2">
                        {sinkingFunds.slice(0, 6).map((f, i) => (
                          <li key={f.id ?? i} className="flex justify-between text-[11px] text-zinc-500">
                            <span className="truncate pr-2">{f.fund_name || 'Sinking fund'}</span>
                            <span className="font-mono shrink-0">
                              ${Number(f.target_amount || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                              {f.recurring_schedule ? ` · ${f.recurring_schedule}` : ''}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    
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
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-3 border-b border-zinc-800 pb-4">
                <h2 className="text-lg font-semibold tracking-tight">Active Balance Sheet</h2>
                <div className="flex flex-wrap items-end gap-3">
                  <PlaidLinkButton
                    linkType="investment"
                    buttonText="Connect Brokerage"
                    onSuccessAction={() => {
                      syncTransactions();
                      fetchDashboardData();
                    }}
                  />
                  <div className="text-right">
                    <span className="text-xs text-zinc-400 uppercase tracking-wider block">Total Net Worth</span>
                    <span className={`text-xl font-bold ${totalNetWorth >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      ${totalNetWorth.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>
              
              {accounts.length === 0 ? (
                <div className="border border-dashed border-zinc-800 rounded-xl p-8 text-center text-zinc-500">
                  No accounts linked yet. Click &apos;Connect Bank / Card&apos; to link via Plaid.
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
                        <td className="p-4 font-medium text-zinc-200">
                          {tx.name}
                          {tx.exclude_from_burn ? (
                            <span className="ml-2 text-[10px] text-amber-500">excluded</span>
                          ) : null}
                        </td>
                        <td className="p-4 text-zinc-400 text-xs">
                          {formatCategoryLabel(tx.category)}
                        </td>
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
            monthlyBurn={
              burnTotal != null && burnTotal > 0
                ? burnTotal
                : trailingBurn > 0
                  ? trailingBurn
                  : 392.08
            }
            emergencyMonths={6}
            annualGrowthRate={0.08}
            targetYears={20}
          />
        )}

        <footer className="border-t border-zinc-800 pt-6 pb-2 flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-500">
          <span>Elite Capital Engine · Not financial advice</span>
          <LegalFooter />
        </footer>
      </div>

      <SettingsDrawer
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSaved={fetchDashboardData}
      />

      <AuditChatDrawer 
        isOpen={isChatOpen} 
        onClose={() => {
          setIsChatOpen(false);
          setChatSeed(null);
        }}
        seedPrompt={chatSeed}
      />

      {burnBucketId && (
        <CategoryBurnDrawer
          bucketId={burnBucketId}
          transactions={transactions}
          accountNameByPlaidId={
            new Map(
              accounts.map((a: { plaid_account_id?: string; account_name?: string; custom_name?: string }) => [
                a.plaid_account_id || '',
                a.custom_name || a.account_name || 'Account',
              ])
            )
          }
          onClose={() => setBurnBucketId(null)}
          onOverrideSaved={() => {
            fetchDashboardData();
          }}
        />
      )}
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