/**
 * The 20% Gross Wealth Quota and the paystub-derived inflow numbers.
 *
 * Previously `/api/baseline` and `/api/snapshot` both multiplied every paystub
 * figure by a hardcoded 24 (semi-monthly) and fell back to the author's real
 * salary when a profile was missing. Both behaviours are gone: pay frequency is
 * inferred from the pay period, and there are no personal fallbacks.
 */

export const WEALTH_QUOTA_RATE = 0.2;

export interface Paystub {
  pay_period_start?: string | null;
  pay_period_end?: string | null;
  gross_pay: number | string | null;
  net_pay?: number | string | null;
  pre_tax_401k?: number | string | null;
  post_tax_roth_401k?: number | string | null;
  hsa_contribution?: number | string | null;
  healthcare_premiums?: number | string | null;
  other_deductions?: number | string | null;
}

export interface WealthQuotaResult {
  periods_per_year: number;
  gross_annual: number;
  gross_monthly: number;
  target_annual: number;
  target_monthly: number;
  credited_annual: number;
  credited_monthly: number;
  remaining_annual: number;
  remaining_monthly: number;
  net_monthly_inflow: number;
}

/**
 * Infers how many paychecks a year the user receives from the pay period length.
 * Falls back to 24 (semi-monthly) only when the dates are unusable.
 */
export function inferPeriodsPerYear(stub: Paystub): number {
  const start = stub.pay_period_start ? new Date(stub.pay_period_start).getTime() : NaN;
  const end = stub.pay_period_end ? new Date(stub.pay_period_end).getTime() : NaN;

  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return 24;
  }

  const periodDays = Math.max(1, Math.round((end - start) / 86_400_000));

  if (periodDays <= 8) return 52; // weekly
  if (periodDays <= 14) return 26; // bi-weekly
  if (periodDays >= 27) return 12; // monthly
  return 24; // semi-monthly
}

function num(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function computeWealthQuota(stub: Paystub | null, fallbackAnnualSalary = 0): WealthQuotaResult {
  if (!stub) {
    const grossAnnual = num(fallbackAnnualSalary);
    const grossMonthly = grossAnnual / 12;
    const targetAnnual = grossAnnual * WEALTH_QUOTA_RATE;
    return {
      periods_per_year: 0,
      gross_annual: round2(grossAnnual),
      gross_monthly: round2(grossMonthly),
      target_annual: round2(targetAnnual),
      target_monthly: round2(targetAnnual / 12),
      credited_annual: 0,
      credited_monthly: 0,
      remaining_annual: round2(targetAnnual),
      remaining_monthly: round2(targetAnnual / 12),
      net_monthly_inflow: 0,
    };
  }

  const periods = inferPeriodsPerYear(stub);
  const grossAnnual = num(stub.gross_pay) * periods;
  const targetAnnual = grossAnnual * WEALTH_QUOTA_RATE;

  const creditedAnnual =
    num(stub.pre_tax_401k) * periods +
    num(stub.post_tax_roth_401k) * periods +
    num(stub.hsa_contribution) * periods;

  const remainingAnnual = Math.max(0, targetAnnual - creditedAnnual);

  return {
    periods_per_year: periods,
    gross_annual: round2(grossAnnual),
    gross_monthly: round2(grossAnnual / 12),
    target_annual: round2(targetAnnual),
    target_monthly: round2(targetAnnual / 12),
    credited_annual: round2(creditedAnnual),
    credited_monthly: round2(creditedAnnual / 12),
    remaining_annual: round2(remainingAnnual),
    remaining_monthly: round2(remainingAnnual / 12),
    net_monthly_inflow: round2(num(stub.net_pay) * periods / 12),
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
