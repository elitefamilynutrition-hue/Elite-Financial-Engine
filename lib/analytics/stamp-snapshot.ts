import { getServiceSupabase } from '@/lib/supabase-admin';
import { loadUserFinancials } from '@/lib/data/user-financials';
import { computeSurvivalFloor } from '@/lib/analytics/survival-floor';
import { computeWealthQuota } from '@/lib/analytics/wealth-quota';
import { computeLiveNetWorth } from '@/lib/analytics/net-worth';

export interface StampSnapshotResult {
  user_id: string;
  snapshot_date: string;
  liquid_capital: number;
  investment_capital: number;
  total_liabilities: number;
  survival_floor: number;
  monthly_burn_rate: number;
}

/**
 * Upsert today's balance-sheet snapshot for one tenant.
 * Shared by POST /api/snapshot and nightly cron.
 */
export async function stampHistoricalSnapshot(userId: string): Promise<StampSnapshotResult> {
  if (!userId) throw new Error('stampHistoricalSnapshot requires userId.');

  const financials = await loadUserFinancials(userId);
  const nw = computeLiveNetWorth(financials.accounts);
  const manualDebt = sum(financials.manualAccounts.map((account) => account.current_balance));
  const totalLiabilities = nw.revolvingDebt + manualDebt;

  const survival = computeSurvivalFloor({
    transactions: financials.transactions,
    sinkingFunds: financials.sinkingFunds,
    targetMonths: Number(financials.profile?.target_emergency_months || 0) || null,
  });

  const quota = computeWealthQuota(
    financials.latestPaystub,
    Number(financials.profile?.annual_gross_salary || 0)
  );

  const today = new Date().toISOString().split('T')[0];
  const supabase = getServiceSupabase();

  const row = {
    user_id: userId,
    snapshot_date: today,
    liquid_capital: round2(nw.liquidCapital),
    investment_capital: round2(nw.investmentCapital),
    total_liabilities: round2(totalLiabilities),
    survival_floor: survival.survival_floor,
    monthly_burn_rate: survival.monthly_burn_rate,
    wealth_quota_target: quota.target_annual,
    wealth_quota_actual: quota.credited_annual,
  };

  const { error } = await supabase
    .from('historical_snapshots')
    .upsert(row, { onConflict: 'user_id,snapshot_date' });

  if (error) throw error;

  return {
    user_id: userId,
    snapshot_date: today,
    liquid_capital: row.liquid_capital,
    investment_capital: row.investment_capital,
    total_liabilities: row.total_liabilities,
    survival_floor: row.survival_floor,
    monthly_burn_rate: row.monthly_burn_rate,
  };
}

function sum(values: (number | string | null | undefined)[]): number {
  return values.reduce<number>((total, value) => {
    const parsed = Number(value ?? 0);
    return total + (Number.isFinite(parsed) ? parsed : 0);
  }, 0);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
