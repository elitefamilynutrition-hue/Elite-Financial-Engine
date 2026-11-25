import { describe, expect, it } from 'vitest';
import {
  calculateMarginalBracket,
  normalizeFilingStatus,
  standardDeductionFor,
  TAX_TABLE_YEAR,
} from '@/lib/tax/brackets';

describe('normalizeFilingStatus', () => {
  it('maps common labels', () => {
    expect(normalizeFilingStatus('Single')).toBe('Single');
    expect(normalizeFilingStatus('married')).toBe('Married Filing Jointly');
    expect(normalizeFilingStatus('Married Filing Jointly')).toBe('Married Filing Jointly');
    expect(normalizeFilingStatus('Married Filing Separately')).toBe('Married Filing Separately');
    expect(normalizeFilingStatus('Head of Household')).toBe('Head of Household');
  });
});

describe('calculateMarginalBracket', () => {
  it('exposes the planning table year', () => {
    expect(TAX_TABLE_YEAR).toBe(2025);
  });

  it('returns 10% for income under the first single bracket after deduction', () => {
    expect(
      calculateMarginalBracket({
        annualGross: 20_000,
        filingStatus: 'Single',
      })
    ).toBe(10);
  });

  it('applies standard deduction so low gross stays in 10%', () => {
    const deduction = standardDeductionFor('Single');
    expect(
      calculateMarginalBracket({
        annualGross: deduction + 5_000,
        filingStatus: 'Single',
      })
    ).toBe(10);
  });

  it('subtracts pre-tax deductions (401k/HSA)', () => {
    const withoutShelter = calculateMarginalBracket({
      annualGross: 120_000,
      filingStatus: 'Single',
    });
    const withShelter = calculateMarginalBracket({
      annualGross: 120_000,
      annualPreTaxDeductions: 23_000,
      filingStatus: 'Single',
    });
    expect(withoutShelter).toBeGreaterThanOrEqual(withShelter);
  });

  it('handles married jointly higher thresholds', () => {
    const single = calculateMarginalBracket({
      annualGross: 100_000,
      filingStatus: 'Single',
    });
    const joint = calculateMarginalBracket({
      annualGross: 100_000,
      filingStatus: 'Married Filing Jointly',
    });
    expect(joint).toBeLessThanOrEqual(single);
  });
});
