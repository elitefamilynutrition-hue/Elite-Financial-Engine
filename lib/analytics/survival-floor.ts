import { isSurvivalSpend, isWithinWindow } from '@/lib/analytics/intent';

/**
 * The Survival Floor: how much cash the user needs to survive `targetMonths`
 * with no income.
 *
 * This is the headline number of the whole product, so it lives in exactly one
 * place. `/api/baseline`, `/api/snapshot`, and the audit all call this function;
 * none of them are allowed to re-derive it.
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

  const survivalSpend = transactions.reduce((total, tx) => {
    if (!isWithinWindow(tx.date, windowStart)) return total;
    if (!isSurvivalSpend(tx)) return total;
    return total + Number(tx.amount || 0);
  }, 0);

  const baseMonthlyBurn = survivalSpend / (SURVIVAL_WINDOW_DAYS / 30);
  const pad = monthlySinkingPad(sinkingFunds);
  const monthlyBurnRate = baseMonthlyBurn + pad;

  const months = Number(targetMonths) > 0 ? Number(targetMonths) : DEFAULT_TARGET_MONTHS;

  return {
    window_days: SURVIVAL_WINDOW_DAYS,
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
