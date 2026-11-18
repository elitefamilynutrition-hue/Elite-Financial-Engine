import { isSurvivalSpend, isWithinWindow } from '@/lib/analytics/intent';

/**
 * The Survival Floor: how much cash the user needs to survive `targetMonths`
 * with no income.
 *
 * Counts only the survival bucket (baseline living costs). Creep is excluded
 * on purpose — it is a deviation warning, not part of the emergency floor.
 * Annualized from up to 90 days of data using actual coverage in-window.
 */

export const SURVIVAL_WINDOW_DAYS = 90;
export const DEFAULT_TARGET_MONTHS = 6;

interface SpendingTransaction {
  amount: number | string | null;
  date?: string | null;
  name?: string | null;
  merchant_name?: string | null;
  category?: string | null;
  transaction_intent?: string | null;
  is_internal_transfer?: boolean | null;
  user_intent_override?: string | null;
  exclude_from_burn?: boolean | null;
  override_reason?: string | null;
  pending?: boolean | null;
}

export interface SinkingFund {
  target_amount: number | string | null;
  recurring_schedule: string | null;
}

export interface SurvivalFloorResult {
  window_days: number;
  survival_spend: number;
  base_monthly_burn: number;
  monthly_sinking_pad: number;
  monthly_burn_rate: number;
  target_months: number;
  survival_floor: number;
}

const SCHEDULE_DIVISOR: Record<string, number> = {
  Annual: 12,
  'Semi-Annual': 6,
  Quarterly: 3,
  Monthly: 1,
};

/**
 * Non-monthly obligations (registrations, insurance premiums) divided into a
 * monthly accrual so the emergency floor covers them too.
 */
export function monthlySinkingPad(funds: SinkingFund[]): number {
  return funds.reduce((total, fund) => {
    const amount = Number(fund.target_amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) return total;
    const divisor = SCHEDULE_DIVISOR[fund.recurring_schedule || 'Annual'] ?? 12;
    return total + amount / divisor;
  }, 0);
}

export function computeSurvivalFloor({
  transactions,
  sinkingFunds,
  targetMonths = DEFAULT_TARGET_MONTHS,
  now = new Date(),
}: {
  transactions: SpendingTransaction[];
  sinkingFunds: SinkingFund[];
  targetMonths?: number | null;
  now?: Date;
}): SurvivalFloorResult {
  const windowStart = new Date(now);
  windowStart.setDate(windowStart.getDate() - SURVIVAL_WINDOW_DAYS);

  let oldestInWindow: Date | null = null;
  let newestInWindow: Date | null = null;

  const survivalSpend = transactions.reduce((total, tx) => {
    if (!isWithinWindow(tx.date, windowStart)) return total;
    if (!isSurvivalSpend(tx)) return total;

    const parsed = new Date(tx.date as string);
    if (!Number.isNaN(parsed.getTime())) {
      if (!oldestInWindow || parsed < oldestInWindow) oldestInWindow = parsed;
      if (!newestInWindow || parsed > newestInWindow) newestInWindow = parsed;
    }

    return total + Number(tx.amount || 0);
  }, 0);

  // Annualize from actual coverage inside the window (not a fixed 90),
  // so sparse history does not look like a "weekly" understatement.
  let coveredDays = SURVIVAL_WINDOW_DAYS;
  if (oldestInWindow && newestInWindow) {
    const spanMs = newestInWindow.getTime() - oldestInWindow.getTime();
    const spanDays = Math.floor(spanMs / (1000 * 60 * 60 * 24)) + 1;
    coveredDays = Math.max(7, Math.min(SURVIVAL_WINDOW_DAYS, spanDays));
  }

  const baseMonthlyBurn = survivalSpend / (coveredDays / 30);
  const pad = monthlySinkingPad(sinkingFunds);
  const monthlyBurnRate = baseMonthlyBurn + pad;

  const months = Number(targetMonths) > 0 ? Number(targetMonths) : DEFAULT_TARGET_MONTHS;

  return {
    window_days: coveredDays,
    survival_spend: round2(survivalSpend),
    base_monthly_burn: round2(baseMonthlyBurn),
    monthly_sinking_pad: round2(pad),
    monthly_burn_rate: round2(monthlyBurnRate),
    target_months: months,
    survival_floor: round2(monthlyBurnRate * months),
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
