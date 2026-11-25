/**
 * Federal marginal bracket estimation — the only copy in the codebase.
 *
 * Previously this table existed twice (in `DayZeroIntake.tsx` and in
 * `api/telemetry/vision/route.ts`) with different inputs, so the same profile
 * produced two different brackets depending on which path ran.
 *
 * IMPORTANT: these are planning estimates, not tax advice. They ignore FICA,
 * state/local tax, NIIT, credits, and itemized deductions. Re-verify the table
 * against IRS Rev. Proc. for the current tax year before every filing season.
 */

export type FilingStatus = 'Single' | 'Married Filing Jointly' | 'Married Filing Separately' | 'Head of Household';

export const TAX_TABLE_YEAR = 2025;
export const TAX_TABLE_NOTE =
  'Federal marginal bracket estimate only. Excludes FICA, state, local, NIIT, and credits.';

type Bracket = { upTo: number; rate: number };

const SINGLE: Bracket[] = [
  { upTo: 11_925, rate: 10 },
  { upTo: 48_475, rate: 12 },
  { upTo: 103_350, rate: 22 },
  { upTo: 197_300, rate: 24 },
  { upTo: 250_525, rate: 32 },
  { upTo: 626_350, rate: 35 },
  { upTo: Number.POSITIVE_INFINITY, rate: 37 },
];

const MARRIED_JOINT: Bracket[] = [
  { upTo: 23_850, rate: 10 },
  { upTo: 96_950, rate: 12 },
  { upTo: 206_700, rate: 22 },
  { upTo: 394_600, rate: 24 },
  { upTo: 501_050, rate: 32 },
  { upTo: 751_600, rate: 35 },
  { upTo: Number.POSITIVE_INFINITY, rate: 37 },
];

const MARRIED_SEPARATE: Bracket[] = [
  { upTo: 11_925, rate: 10 },
  { upTo: 48_475, rate: 12 },
  { upTo: 103_350, rate: 22 },
  { upTo: 197_300, rate: 24 },
  { upTo: 250_525, rate: 32 },
  { upTo: 375_800, rate: 35 },
  { upTo: Number.POSITIVE_INFINITY, rate: 37 },
];

const HEAD_OF_HOUSEHOLD: Bracket[] = [
  { upTo: 17_000, rate: 10 },
  { upTo: 64_850, rate: 12 },
  { upTo: 103_350, rate: 22 },
  { upTo: 197_300, rate: 24 },
  { upTo: 250_525, rate: 32 },
  { upTo: 626_350, rate: 35 },
  { upTo: Number.POSITIVE_INFINITY, rate: 37 },
];

const STANDARD_DEDUCTION: Record<FilingStatus, number> = {
  Single: 15_000,
  'Married Filing Jointly': 30_000,
  'Married Filing Separately': 15_000,
  'Head of Household': 22_500,
};

export function normalizeFilingStatus(raw: string | null | undefined): FilingStatus {
  const status = (raw || 'Single').toLowerCase();
  if (status.includes('joint') || status === 'married') return 'Married Filing Jointly';
  if (status.includes('separate')) return 'Married Filing Separately';
  if (status.includes('head')) return 'Head of Household';
  return 'Single';
}

function bracketsFor(status: FilingStatus): Bracket[] {
  switch (status) {
    case 'Married Filing Jointly':
      return MARRIED_JOINT;
    case 'Married Filing Separately':
      return MARRIED_SEPARATE;
    case 'Head of Household':
      return HEAD_OF_HOUSEHOLD;
    default:
      return SINGLE;
  }
}

export function standardDeductionFor(status: FilingStatus): number {
  return STANDARD_DEDUCTION[status];
}

/**
 * Returns the marginal rate (10–37) applied to the top of the user's taxable
 * income. `annualPreTaxDeductions` covers 401(k)/HSA sheltering.
 */
export function calculateMarginalBracket({
  annualGross,
  annualBonus = 0,
  annualPreTaxDeductions = 0,
  filingStatus,
}: {
  annualGross: number;
  annualBonus?: number;
  annualPreTaxDeductions?: number;
  filingStatus: string | null | undefined;
}): number {
  const status = normalizeFilingStatus(filingStatus);

  const taxableIncome = Math.max(
    0,
    toNumber(annualGross) + toNumber(annualBonus) - toNumber(annualPreTaxDeductions) - standardDeductionFor(status)
  );

  for (const bracket of bracketsFor(status)) {
    if (taxableIncome <= bracket.upTo) return bracket.rate;
  }

  return 37;
}

function toNumber(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
