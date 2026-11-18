/**
 * Week 4 Day 4: FI/RE projection from profile SWR + burn (no hardcoded $42k theater).
 */

export interface FireProjectionInput {
  currentNetWorth: number;
  investedCapital: number;
  /** Monthly lifestyle burn used for FI target (survival + pad preferred). */
  monthlyBurn: number;
  /** Safe withdrawal rate as percent, e.g. 4.0 */
  safeWithdrawalRatePct: number;
  /** Expected inflation as percent, e.g. 3.0 */
  inflationPct: number;
  /** Assumed nominal portfolio return as percent (default 8). */
  nominalReturnPct?: number;
  currentAge: number;
  targetRetirementAge: number;
  /** Annual savings available to invest (from savings ratio or wealth quota residual). */
  annualContribution?: number;
  useRealReturns?: boolean;
}

export interface FireYearRow {
  year: number;
  age: number;
  projected: number;
  fireTarget: number;
}

export interface FireProjectionResult {
  fireMultiplier: number;
  annualBurn: number;
  fireTarget: number;
  yearsToTarget: number;
  nominalReturnPct: number;
  realReturnPct: number;
  effectiveReturnPct: number;
  progressPct: number;
  isOnPace: boolean;
  paceReason: string;
  series: FireYearRow[];
  terminalProjected: number;
}

export function computeFireProjection(input: FireProjectionInput): FireProjectionResult {
  const swr = Math.max(0.5, Number(input.safeWithdrawalRatePct) || 4);
  const inflation = Math.max(0, Number(input.inflationPct) || 3);
  const nominal = Math.max(0, Number(input.nominalReturnPct ?? 8));
  const realReturnPct = ((1 + nominal / 100) / (1 + inflation / 100) - 1) * 100;
  const useReal = Boolean(input.useRealReturns);
  const effectiveReturnPct = useReal ? realReturnPct : nominal;
  const r = effectiveReturnPct / 100;

  const annualBurn = Math.max(0, Number(input.monthlyBurn) || 0) * 12;
  const fireMultiplier = 100 / swr;
  const fireTarget = annualBurn > 0 ? annualBurn * fireMultiplier : 0;

  const currentAge = Number(input.currentAge) || 35;
  const targetAge = Number(input.targetRetirementAge) || 55;
  const yearsToTarget = Math.max(1, targetAge - currentAge);
  const currentYear = new Date().getFullYear();

  const annualContribution = Math.max(0, Number(input.annualContribution) || 0);
  let simulated = Math.max(0, Number(input.currentNetWorth) || 0);
  const series: FireYearRow[] = [];

  for (let i = 0; i <= yearsToTarget; i++) {
    const year = currentYear + i;
    series.push({
      year,
      age: currentAge + i,
      projected: Math.round(simulated),
      fireTarget: Math.round(fireTarget),
    });
    simulated = simulated * (1 + r) + annualContribution;
  }

  const terminalProjected = series[series.length - 1]?.projected || 0;
  const progressPct =
    fireTarget > 0
      ? Math.min(999, (Math.max(0, input.investedCapital || input.currentNetWorth) / fireTarget) * 100)
      : 0;

  // Honest pace: will terminal projection clear the FI target with stated contributions?
  const isOnPace =
    fireTarget <= 0
      ? false
      : terminalProjected >= fireTarget * 0.95 || progressPct >= 100;

  let paceReason = '';
  if (fireTarget <= 0) {
    paceReason = 'Set monthly burn / SWR to compute a FI target.';
  } else if (progressPct >= 100) {
    paceReason = 'Invested capital already meets Rule-of-SWR target.';
  } else if (isOnPace) {
    paceReason = `On track to reach ~$${Math.round(fireTarget).toLocaleString()} by age ${targetAge} at ${effectiveReturnPct.toFixed(1)}% ${useReal ? 'real' : 'nominal'} returns.`;
  } else {
    paceReason = `Short of target: terminal ~$${Math.round(terminalProjected).toLocaleString()} vs FI ~$${Math.round(fireTarget).toLocaleString()}. Raise savings or extend horizon.`;
  }

  return {
    fireMultiplier: round1(fireMultiplier),
    annualBurn: round2(annualBurn),
    fireTarget: round2(fireTarget),
    yearsToTarget,
    nominalReturnPct: round1(nominal),
    realReturnPct: round1(realReturnPct),
    effectiveReturnPct: round1(effectiveReturnPct),
    progressPct: round1(progressPct),
    isOnPace,
    paceReason,
    series,
    terminalProjected: round2(terminalProjected),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
