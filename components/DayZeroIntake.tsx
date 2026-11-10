"use client";

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import PaystubDropzone from '@/components/PayStubDropzone';

const Tooltip = ({ text }: { text: string }) => (
  <div className="group relative inline-block ml-2">
    <span className="flex items-center justify-center w-4 h-4 rounded-full bg-zinc-700 text-xs text-zinc-300 cursor-help select-none">i</span>
    <div className="hidden group-hover:block absolute z-50 w-64 p-3 mt-2 text-xs text-zinc-300 bg-zinc-800 border border-zinc-700 rounded shadow-xl -left-32">
      {text}
    </div>
  </div>
);

export function calculateMarginalTaxBracket(
  grossSalary: number,
  bonusTarget: number,
  filingStatus: string
): number {
  const status = (filingStatus || 'Single').toLowerCase();
  let standardDeduction = 15000;
  if (status.includes('joint') || status === 'married') {
    standardDeduction = 30000;
  } else if (status.includes('head')) {
    standardDeduction = 22500;
  }

  const taxableIncome = Math.max(0, grossSalary + bonusTarget - standardDeduction);

  if (status.includes('joint') || status === 'married') {
    if (taxableIncome > 751600) return 37;
    if (taxableIncome > 501050) return 35;
    if (taxableIncome > 394600) return 32;
    if (taxableIncome > 206700) return 24;
    if (taxableIncome > 96950) return 22;
    if (taxableIncome > 23850) return 12;
    return 10;
  } else {
    if (taxableIncome > 626350) return 37;
    if (taxableIncome > 250525) return 35;
    if (taxableIncome > 197300) return 32;
    if (taxableIncome > 103350) return 24;
    if (taxableIncome > 48475) return 22;
    if (taxableIncome > 11925) return 12;
    return 10;
  }
}

export default function DayZeroIntake({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [recentPaystubCount, setRecentPaystubCount] = useState<number>(0);
  const [newHireOverride, setNewHireOverride] = useState<boolean>(false);

  // Master State Object
  const [formData, setFormData] = useState({
    // Step 1: Vitals
    age: '',
    relationship_status: 'Single',
    dependents_count: 0,
    state_of_residence: '',
    housing_status: 'Rent',
    living_trust_established: false,
    term_life_coverage: '',
    // Step 2: Income
    employment_type: 'W-2',
    base_salary: '',
    annual_bonus_target: '',
    variable_compensation_flag: false,
    business_entity_type: 'None',
    // Step 3: Goals, FI/RE & Inflation
    target_retirement_age: '',
    target_emergency_months: 6,
    expected_inflation_rate: '3.0',
    safe_withdrawal_rate: '4.0',
    financial_kryptonite: '',
    // Step 4: The Vault (Advanced Levers)
    health_plan_type: 'Unknown',
    traditional_ira_balance: '0',
    rsu_vesting_flag: false,
    mega_backdoor_eligible: false,
    real_estate_tax_loophole_flag: false,
    nqdc_participation_flag: false,
    child_investment_accounts: false,
    // Step 5: Event Horizon
    event_name: '',
    event_target_date: '',
    event_target_amount: '',
    // Step 6: Sinking Funds
    sinking_funds: [] as { fund_name: string; target_amount: string; due_date: string; recurring_schedule: string }[],
  });

  useEffect(() => {
    fetchExistingPaystubCount();
  }, []);

  const fetchExistingPaystubCount = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) return;

      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 95);
      const cutoffDate = ninetyDaysAgo.toISOString().split('T')[0];

      const { count } = await supabase
        .from('paystub_records')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', session.user.id)
        .gte('pay_date', cutoffDate);

      setRecentPaystubCount(count || 0);
    } catch (err) {
      console.error('Failed to check existing paystub count:', err);
    }
  };

  const addSinkingFund = () => {
    setFormData(prev => ({
      ...prev,
      sinking_funds: [...prev.sinking_funds, { fund_name: '', target_amount: '', due_date: '', recurring_schedule: 'Annual' }],
    }));
  };

  const updateSinkingFund = (index: number, field: string, value: string) => {
    const updated = [...formData.sinking_funds];
    updated[index] = { ...updated[index], [field]: value };
    setFormData(prev => ({ ...prev, sinking_funds: updated }));
  };

  const removeSinkingFund = (index: number) => {
    const updated = formData.sinking_funds.filter((_, i) => i !== index);
    setFormData(prev => ({ ...prev, sinking_funds: updated }));
  };

  const updateForm = (key: string, value: any) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const estimatedMarginalBracket = calculateMarginalTaxBracket(
     parseFloat(formData.base_salary as string) || 0,
    parseFloat(formData.annual_bonus_target as string) || 0,
    formData.relationship_status
  );

  const swrNum = parseFloat(formData.safe_withdrawal_rate) || 4.0;
  const fireMultiplier = swrNum > 0 ? (100 / swrNum).toFixed(1) : '25.0';

  const isStep2Locked =
    formData.employment_type === 'W-2' &&
    recentPaystubCount < 3 &&
    !newHireOverride;

  const handleNext = () => {
    setSubmitError(null);
    setStep(prev => prev + 1);
  };

  const handleBack = () => {
    setSubmitError(null);
    setStep(prev => prev - 1);
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) throw new Error('No authenticated user session found.');

      const grossSalary = formData.base_salary ? parseFloat(formData.base_salary as string) : 0;
      const bonusTarget = formData.annual_bonus_target ? parseFloat(formData.annual_bonus_target as string) : 0;

      // 1. Upsert the Core Profile with explicit onConflict: 'user_id'
      const { error: profileError } = await supabase
        .from('user_financial_profiles')
        .upsert(
          {
            user_id: session.user.id,
            current_age: formData.age ? parseInt(formData.age as string) : null,
            target_retirement_age: formData.target_retirement_age ? parseInt(formData.target_retirement_age as string) : null,
            annual_gross_salary: grossSalary,
            annual_bonus_target: bonusTarget,
            marginal_tax_bracket: estimatedMarginalBracket,
            target_emergency_months: formData.target_emergency_months,
            expected_inflation_rate: parseFloat(formData.expected_inflation_rate) || 3.0,
            safe_withdrawal_rate: parseFloat(formData.safe_withdrawal_rate) || 4.0,
            relationship_status: formData.relationship_status,
            dependents_count: formData.dependents_count || 0,
            employment_type: formData.employment_type,
            housing_status: formData.housing_status,
            state_of_residence: formData.state_of_residence,
            health_plan_type: formData.health_plan_type,
            traditional_ira_balance: parseFloat(formData.traditional_ira_balance as string) || 0,
            term_life_coverage: formData.term_life_coverage ? parseFloat(formData.term_life_coverage as string) : 0,
            living_trust_established: formData.living_trust_established,
            business_entity_type: formData.business_entity_type,
            variable_compensation_flag: formData.variable_compensation_flag,
            rsu_vesting_flag: formData.rsu_vesting_flag,
            mega_backdoor_eligible: formData.mega_backdoor_eligible,
            real_estate_tax_loophole_flag: formData.real_estate_tax_loophole_flag,
            nqdc_participation_flag: formData.nqdc_participation_flag,
            child_investment_accounts: formData.child_investment_accounts,
            financial_kryptonite: formData.financial_kryptonite,
          },
          { onConflict: 'user_id' }
        );

      if (profileError) throw profileError;

      // 2. Insert Event Horizon if provided
      if (formData.event_name && formData.event_target_amount) {
        const { error: eventError } = await supabase.from('future_liquidity_events').insert({
          user_id: session.user.id,
          event_name: formData.event_name,
          target_date: formData.event_target_date || new Date().toISOString(),
          target_amount: parseFloat(formData.event_target_amount as string),
        });
        if (eventError) throw eventError;
      }

      // 3. Insert Sinking Funds
      const validFunds = formData.sinking_funds.filter(f => f.fund_name && f.target_amount && f.due_date);
      if (validFunds.length > 0) {
        const mappedFunds = validFunds.map(f => ({
          user_id: session.user.id,
          fund_name: f.fund_name,
          target_amount: parseFloat(f.target_amount),
          due_date: f.due_date,
          recurring_schedule: f.recurring_schedule,
        }));
        const { error: fundsError } = await supabase.from('sinking_funds').insert(mappedFunds);
        if (fundsError) throw fundsError;
      }

      onComplete();
    } catch (error: any) {
      console.error('Failed to save Day Zero profile:', error);
      setSubmitError(error?.message || 'Failed to save Day Zero profile.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const tradIraNum = parseFloat(formData.traditional_ira_balance) || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header Progress */}
        <div className="p-6 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50">
          <div>
            <h2 className="text-xl font-bold text-white">Day Zero Onboarding</h2>
            <p className="text-sm text-zinc-400">Step {step} of 6</p>
          </div>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className={`h-2 w-8 rounded-full ${step >= i ? 'bg-emerald-500' : 'bg-zinc-800'}`} />
            ))}
          </div>
        </div>

        {/* Scrollable Content Area */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {submitError && (
            <div className="p-3 bg-rose-950/40 border border-rose-800 rounded-lg text-xs text-rose-300">
              {submitError}
            </div>
          )}

          {/* STEP 1: VITALS */}
          {step === 1 && (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
              <h3 className="text-lg font-semibold text-emerald-400">The Vitals & Demographics</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Age</label>
                  <input type="number" value={formData.age} onChange={e => updateForm('age', e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-white" />
                </div>
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">State of Residence</label>
                  <input type="text" maxLength={2} value={formData.state_of_residence} onChange={e => updateForm('state_of_residence', e.target.value.toUpperCase())} className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-white placeholder-zinc-700" placeholder="e.g., AZ, TX, NY" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Tax Filing Status</label>
                  <select value={formData.relationship_status} onChange={e => updateForm('relationship_status', e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-white text-sm">
                    <option value="Single">Single</option>
                    <option value="Married Filing Jointly">Married (Joint)</option>
                    <option value="Married Filing Separately">Married (Separate)</option>
                    <option value="Head of Household">Head of Household</option>
                  </select>
                </div>
                <div>
                  <label className="flex items-center text-sm text-zinc-400 mb-1">
                    Tax Dependents <Tooltip text="Only count dependents you claim on your taxes. If you co-parent and your ex-spouse claims them, enter 0 so the tax engine doesn't miscalculate your withholdings." />
                  </label>
                  <input type="number" value={formData.dependents_count} onChange={e => updateForm('dependents_count', parseInt(e.target.value) || 0)} className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-white" />
                </div>
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Housing Status</label>
                  <select value={formData.housing_status} onChange={e => updateForm('housing_status', e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-white text-sm">
                    <option>Rent</option>
                    <option>Own</option>
                  </select>
                </div>
              </div>

              <div className="p-4 bg-zinc-800/50 border border-zinc-700 rounded-lg space-y-4">
                <h4 className="text-sm font-semibold text-amber-400 flex items-center">
                  Catastrophic Risk Audit <Tooltip text="Estate planning (Trusts/Life Insurance) is required for anyone with heirs, real estate, or co-parenting dynamics, regardless of who claims the child on taxes." />
                </h4>
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Term Life Coverage ($)</label>
                  <input type="number" value={formData.term_life_coverage} onChange={e => updateForm('term_life_coverage', e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-white" />
                </div>
                <label className="flex items-center gap-3 text-sm text-zinc-300 cursor-pointer">
                  <input type="checkbox" checked={formData.living_trust_established} onChange={e => updateForm('living_trust_established', e.target.checked)} className="w-4 h-4 accent-emerald-500" />
                  Living Trust Established (Probate Bypass)
                </label>
              </div>
            </div>
          )}

          {/* STEP 2: INCOME ARCHITECTURE & 3-MONTH PAYSTUB MANDATE */}
          {step === 2 && (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold text-emerald-400">Income Architecture</h3>
                <span className="px-2.5 py-1 bg-indigo-950/60 border border-indigo-800 text-indigo-300 rounded text-xs font-mono">
                  Est. Marginal Bracket: {estimatedMarginalBracket}%
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="flex items-center text-sm text-zinc-400 mb-1">
                    Guaranteed Base Salary ($) <Tooltip text="We separate steady monthly W-2 paychecks from quarterly bonuses or stock vests. Baseline survival runs strictly on guaranteed base." />
                  </label>
                  <input type="number" value={formData.base_salary} onChange={e => updateForm('base_salary', e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-white" placeholder="Annual base salary" />
                </div>
                <div>
                  <label className="flex items-center text-sm text-zinc-400 mb-1">
                    Annual Bonus / Variable Target ($) <Tooltip text="Expected annual cash bonus or commission target. Used to project marginal tax exposure and windfall deployment." />
                  </label>
                  <input type="number" value={formData.annual_bonus_target} onChange={e => updateForm('annual_bonus_target', e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-white" placeholder="0" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Employment Type</label>
                  <select value={formData.employment_type} onChange={e => updateForm('employment_type', e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-white">
                    <option>W-2</option>
                    <option>1099</option>
                    <option>Business Owner</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Side / Active Business Entity</label>
                  <select value={formData.business_entity_type} onChange={e => updateForm('business_entity_type', e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-white">
                    <option value="None">None</option>
                    <option value="LLC">LLC</option>
                    <option value="S-Corp">S-Corp</option>
                    <option value="C-Corp">C-Corp</option>
                    <option value="Sole Proprietorship">Sole Proprietorship</option>
                  </select>
                </div>
              </div>

              <label className="flex items-center gap-3 text-sm text-zinc-300 cursor-pointer pt-1">
                <input type="checkbox" checked={formData.variable_compensation_flag} onChange={e => updateForm('variable_compensation_flag', e.target.checked)} className="w-4 h-4 accent-emerald-500" />
                I receive variable compensation (Commissions, performance bonuses, or seasonal distributions)
              </label>

              {/* 3-MONTH PAYSTUB OCR MANDATE FOR W-2 */}
              {formData.employment_type === 'W-2' && (
                <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl space-y-3 mt-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <h4 className="text-sm font-semibold text-white">90-Day Paystub Telemetry Mandate</h4>
                      <p className="text-xs text-zinc-400">
                        Upload your last 3 months of paystubs (min. 3 stubs) so the engine can extract true net inflow, 401(k)/HSA tax shields, and withholding drift.
                      </p>
                    </div>
                    <span className={`px-2.5 py-1 rounded text-xs font-mono font-semibold shrink-0 ml-3 ${
                      recentPaystubCount >= 3
                        ? 'bg-emerald-950/60 border border-emerald-800 text-emerald-400'
                        : 'bg-amber-950/60 border border-amber-800 text-amber-400'
                    }`}>
                      {recentPaystubCount} / 3 Verified
                    </span>
                  </div>

                  <PaystubDropzone onUploadSuccess={() => setRecentPaystubCount(prev => prev + 1)} />

                  {recentPaystubCount < 3 && (
                    <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer pt-1">
                      <input
                        type="checkbox"
                        checked={newHireOverride}
                        onChange={e => setNewHireOverride(e.target.checked)}
                        className="w-3.5 h-3.5 accent-amber-500"
                      />
                      Override: I am a new hire or have fewer than 3 paystubs available right now
                    </label>
                  )}
                </div>
              )}
            </div>
          )}

          {/* STEP 3: GOALS, RULE OF 25 & INFLATION DEFLATOR */}
          {step === 3 && (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
              <h3 className="text-lg font-semibold text-emerald-400">Financial Freedom & Inflation Baselines</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Target Retirement Age</label>
                  <input type="number" value={formData.target_retirement_age} onChange={e => updateForm('target_retirement_age', e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-white" placeholder="55" />
                </div>
                <div>
                  <label className="flex items-center text-sm text-zinc-400 mb-1">
                    Emergency Floor (Months) <Tooltip text="A 6-month target builds a fortified moat against job loss. The engine dynamically calculates the dollar amount based on trailing 90-day spend." />
                  </label>
                  <select value={formData.target_emergency_months} onChange={e => updateForm('target_emergency_months', parseInt(e.target.value))} className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-white">
                    <option value={3}>3 Months (Aggressive)</option>
                    <option value={6}>6 Months (Standard)</option>
                    <option value={9}>9 Months (Conservative)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="flex items-center text-sm text-zinc-400 mb-1">
                    Safe Withdrawal Rate (%) <Tooltip text="The 4.0% Rule (Rule of 25) means you achieve Financial Freedom when your invested assets equal 25x your annual burn. Lowering to 3.5% increases safety to 28.6x." />
                  </label>
                  <input type="number" step="0.1" value={formData.safe_withdrawal_rate} onChange={e => updateForm('safe_withdrawal_rate', e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-white" />
                </div>
                <div>
                  <label className="flex items-center text-sm text-zinc-400 mb-1">
                    Expected Inflation / CPI (%) <Tooltip text="Nominal returns lie. A 10% market return with 3% inflation yields ~6.8% real purchasing power growth. Used by the Purchasing Power Deflator." />
                  </label>
                  <input type="number" step="0.1" value={formData.expected_inflation_rate} onChange={e => updateForm('expected_inflation_rate', e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-white" />
                </div>
              </div>

              <div className="p-3 bg-emerald-950/20 border border-emerald-800/60 rounded-lg text-xs text-emerald-300 font-mono">
                FI/RE Freedom Target Formula: {fireMultiplier}x Annual Operational Burn (at {swrNum.toFixed(1)}% SWR, deflated by {formData.expected_inflation_rate || '3.0'}% annual CPI)
              </div>

              <div>
                <label className="flex items-center text-sm text-zinc-400 mb-1">
                  Financial Kryptonite <Tooltip text="What is your non-negotiable luxury? By naming it (e.g., car parts, golf, dining), the engine walls off a guilt-free allocation instead of lecturing you later." />
                </label>
                <input type="text" value={formData.financial_kryptonite} onChange={e => updateForm('financial_kryptonite', e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-white placeholder-zinc-700" placeholder="e.g., Dining out, car parts, golf..." />
              </div>
            </div>
          )}

          {/* STEP 4: THE VAULT (ADVANCED LEVERS) */}
          {step === 4 && (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
              <h3 className="text-lg font-semibold text-emerald-400">The Vault: Institutional Levers</h3>
              <p className="text-xs text-zinc-500 mb-2">Select any advanced tax or corporate equity structures you actively utilize or receive.</p>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="flex items-center text-xs text-zinc-400 mb-1">
                    Health Plan Architecture <Tooltip text="High-Deductible Health Plans (HDHP) unlock the HSA—the only triple-tax-advantaged wealth vehicle in the IRS tax code." />
                  </label>
                  <select value={formData.health_plan_type} onChange={e => updateForm('health_plan_type', e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-white text-sm">
                    <option value="HDHP (HSA Eligible)">HDHP (HSA Eligible)</option>
                    <option value="PPO / HMO">Traditional PPO / HMO</option>
                    <option value="Unknown">Unknown / Other</option>
                  </select>
                </div>
                <div>
                  <label className="flex items-center text-xs text-zinc-400 mb-1">
                    Traditional / Rollover IRA Balance ($) <Tooltip text="CRITICAL: Holding a pre-tax balance > $0 in a Traditional, SEP, or Rollover IRA triggers the IRS Pro-Rata tax penalty when executing a Backdoor Roth IRA." />
                  </label>
                  <input type="number" value={formData.traditional_ira_balance} onChange={e => updateForm('traditional_ira_balance', e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-white text-sm" placeholder="0" />
                </div>
              </div>

              {tradIraNum > 0 && formData.mega_backdoor_eligible && (
                <div className="p-3 bg-amber-950/40 border border-amber-800 rounded-lg text-xs text-amber-300">
                  <strong>IRS Pro-Rata Warning:</strong> You have ${tradIraNum.toLocaleString()} in a Traditional IRA. Execute a reverse rollover into your employer 401(k) before running Backdoor Roth conversions to avoid pro-rata taxation.
                </div>
              )}

              <div className="space-y-2.5 pt-2">
                <label className="flex items-center justify-between p-3 bg-zinc-950 border border-zinc-800 rounded cursor-pointer hover:border-emerald-500/50 transition-colors">
                  <span className="text-sm text-zinc-300 flex items-center">
                    Corporate RSU Vesting <Tooltip text="Triggers the engine to execute 'Lump Sum Strikes' on offline vehicle debt or mortgages rather than relying on monthly cash flow." />
                  </span>
                  <input type="checkbox" checked={formData.rsu_vesting_flag} onChange={e => updateForm('rsu_vesting_flag', e.target.checked)} className="w-4 h-4 accent-emerald-500" />
                </label>

                <label className="flex items-center justify-between p-3 bg-zinc-950 border border-zinc-800 rounded cursor-pointer hover:border-emerald-500/50 transition-colors">
                  <span className="text-sm text-zinc-300 flex items-center">
                    Mega-Backdoor / Backdoor Roth Eligible <Tooltip text="Checks if your 401(k) allows in-service distributions to bypass the standard limit and funnel up to $69k+ into tax-free growth." />
                  </span>
                  <input type="checkbox" checked={formData.mega_backdoor_eligible} onChange={e => updateForm('mega_backdoor_eligible', e.target.checked)} className="w-4 h-4 accent-emerald-500" />
                </label>

                <label className="flex items-center justify-between p-3 bg-zinc-950 border border-zinc-800 rounded cursor-pointer hover:border-emerald-500/50 transition-colors">
                  <span className="text-sm text-zinc-300 flex items-center">
                    Active Real Estate / STR Offset <Tooltip text="Allows the engine to offset active W-2 income with passive depreciation and cost-segregation losses." />
                  </span>
                  <input type="checkbox" checked={formData.real_estate_tax_loophole_flag} onChange={e => updateForm('real_estate_tax_loophole_flag', e.target.checked)} className="w-4 h-4 accent-emerald-500" />
                </label>

                <label className="flex items-center justify-between p-3 bg-zinc-950 border border-zinc-800 rounded cursor-pointer hover:border-emerald-500/50 transition-colors">
                  <span className="text-sm text-zinc-300 flex items-center">
                    Executive NQDC Plan <Tooltip text="Non-Qualified Deferred Compensation. Allows deferring pre-tax salary beyond IRS 401(k) limits into a corporate trust." />
                  </span>
                  <input type="checkbox" checked={formData.nqdc_participation_flag} onChange={e => updateForm('nqdc_participation_flag', e.target.checked)} className="w-4 h-4 accent-emerald-500" />
                </label>

                <label className="flex items-center justify-between p-3 bg-zinc-950 border border-zinc-800 rounded cursor-pointer hover:border-emerald-500/50 transition-colors">
                  <span className="text-sm text-zinc-300 flex items-center">
                    Custodial / Child Investment Accounts (UGMA / 529) <Tooltip text="Flags minor custodial accounts so the engine walls them off from your personal liquid net worth and FI/RE retirement math." />
                  </span>
                  <input type="checkbox" checked={formData.child_investment_accounts} onChange={e => updateForm('child_investment_accounts', e.target.checked)} className="w-4 h-4 accent-emerald-500" />
                </label>
              </div>
            </div>
          )}

          {/* STEP 5: EVENT HORIZON */}
          {step === 5 && (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
              <h3 className="text-lg font-semibold text-emerald-400">Future Liquidity Events</h3>
              <p className="text-xs text-zinc-400">
                Are you planning a major capital deployment in the next 12-36 months? (e.g., an international family trip, property acquisition, or vehicle down payment). We need to wall this off so it doesn't drain your emergency floor.
              </p>
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Event Name (Optional)</label>
                <input type="text" value={formData.event_name} onChange={e => updateForm('event_name', e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-white placeholder-zinc-700" placeholder="e.g., Home renovation, international trip, sabbatical..." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Target Date</label>
                  <input type="date" value={formData.event_target_date} onChange={e => updateForm('event_target_date', e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-white [color-scheme:dark]" />
                </div>
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Estimated Cost ($)</label>
                  <input type="number" value={formData.event_target_amount} onChange={e => updateForm('event_target_amount', e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-white" />
                </div>
              </div>
            </div>
          )}

          {/* STEP 6: SINKING FUNDS (HIDDEN LIABILITIES) */}
          {step === 6 && (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
              <h3 className="text-lg font-semibold text-emerald-400">Sinking Funds</h3>
              <p className="text-xs text-zinc-400">
                Non-monthly landmines. Enter your vehicle registrations, semi-annual insurance premiums, or predictable medical out-of-pocket costs. The engine will divide these and automatically pad your Survival Floor so you are never caught off guard.
              </p>

              {formData.sinking_funds.map((fund, index) => (
                <div key={index} className="p-4 bg-zinc-950 border border-zinc-800 rounded-lg space-y-3 relative group">
                  <button onClick={() => removeSinkingFund(index)} className="absolute top-2 right-2 text-zinc-500 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition">✕</button>
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">Fund Name (e.g., Vehicle Registration)</label>
                    <input type="text" value={fund.fund_name} onChange={e => updateSinkingFund(index, 'fund_name', e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 rounded p-2 text-white placeholder-zinc-700 text-sm" placeholder="Name" />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-zinc-500 mb-1">Amount ($)</label>
                      <input type="number" value={fund.target_amount} onChange={e => updateSinkingFund(index, 'target_amount', e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 rounded p-2 text-white text-sm" placeholder="400" />
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-500 mb-1">Next Due</label>
                      <input type="date" value={fund.due_date} onChange={e => updateSinkingFund(index, 'due_date', e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 rounded p-2 text-white text-sm [color-scheme:dark]" />
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-500 mb-1">Frequency</label>
                      <select value={fund.recurring_schedule} onChange={e => updateSinkingFund(index, 'recurring_schedule', e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 rounded p-2 text-white text-sm">
                        <option>Annual</option>
                        <option>Semi-Annual</option>
                        <option>Quarterly</option>
                      </select>
                    </div>
                  </div>
                </div>
              ))}

              <button onClick={addSinkingFund} className="w-full py-3 border border-dashed border-zinc-700 text-zinc-400 hover:text-emerald-400 hover:border-emerald-500/50 rounded-lg transition-colors text-sm font-semibold flex items-center justify-center gap-2">
                + Add Hidden Liability
              </button>
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="p-6 border-t border-zinc-800 bg-zinc-900 flex justify-between items-center">
          <button onClick={handleBack} disabled={step === 1 || isSubmitting} className="px-4 py-2 text-sm text-zinc-400 hover:text-white disabled:opacity-50 transition-colors">
            Back
          </button>

          {step < 6 ? (
            <button
              onClick={handleNext}
              disabled={step === 2 && isStep2Locked}
              className="px-6 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-800 disabled:text-zinc-500 text-black font-semibold rounded text-sm transition-colors"
            >
              {step === 2 && isStep2Locked ? 'Upload 3 Paystubs to Unlock' : 'Next'}
            </button>
          ) : (
            <button onClick={handleSubmit} disabled={isSubmitting} className="px-6 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold rounded text-sm flex items-center gap-2 transition-colors">
              {isSubmitting ? 'Architecting...' : 'Initialize Command Center'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}