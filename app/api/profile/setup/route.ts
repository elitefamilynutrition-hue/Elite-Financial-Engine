import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/require-user';
import { toErrorResponse } from '@/lib/http/api-error';
import { getServiceSupabase } from '@/lib/supabase-admin';
import { loadUserFinancials } from '@/lib/data/user-financials';
import { computeSurvivalFloor } from '@/lib/analytics/survival-floor';
import { computeWealthQuota } from '@/lib/analytics/wealth-quota';

/**
 * Week 4 Day 2: session-scoped Day Zero / profile setup.
 * Upserts user_financial_profiles (+ optional sinking_funds) then returns recalculated telemetry.
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const supabase = getServiceSupabase();

    const profilePatch = sanitizeProfile(body, user.id);
    const { data: profile, error: profileError } = await supabase
      .from('user_financial_profiles')
      .upsert(profilePatch, { onConflict: 'user_id' })
      .select('*')
      .single();

    if (profileError) throw profileError;

    const funds = Array.isArray(body.sinking_funds) ? body.sinking_funds : [];
    if (funds.length > 0) {
      const rows = funds
        .filter(
          (f: { fund_name?: string; target_amount?: number | string; due_date?: string }) =>
            f.fund_name && f.target_amount && f.due_date
        )
        .map(
          (f: {
            fund_name: string;
            target_amount: number | string;
            due_date: string;
            recurring_schedule?: string;
          }) => ({
            user_id: user.id,
            fund_name: String(f.fund_name).slice(0, 120),
            target_amount: Number(f.target_amount) || 0,
            due_date: f.due_date,
            recurring_schedule: f.recurring_schedule || 'Annual',
          })
        );
      if (rows.length > 0) {
        const { error: fundsError } = await supabase.from('sinking_funds').insert(rows);
        if (fundsError) throw fundsError;
      }
    }

    if (body.event_name && body.event_target_amount) {
      const { error: eventError } = await supabase.from('future_liquidity_events').insert({
        user_id: user.id,
        event_name: String(body.event_name).slice(0, 120),
        target_date: body.event_target_date || new Date().toISOString(),
        target_amount: Number(body.event_target_amount) || 0,
      });
      if (eventError) throw eventError;
    }

    const telemetry = await buildRecalcTelemetry(user.id);

    return NextResponse.json({
      status: 'SUCCESS',
      profile,
      telemetry,
    });
  } catch (error) {
    return toErrorResponse(error, 'profile-setup');
  }
}

function sanitizeProfile(body: Record<string, unknown>, userId: string) {
  const num = (v: unknown, fallback: number | null = null) => {
    if (v === undefined || v === null || v === '') return fallback;
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  return {
    user_id: userId,
    current_age: num(body.current_age ?? body.currentAge, null),
    target_retirement_age: num(body.target_retirement_age ?? body.targetRetirementAge, null),
    annual_gross_salary: num(body.annual_gross_salary ?? body.annualGrossSalary, 0) ?? 0,
    annual_bonus_target: num(body.annual_bonus_target ?? body.annualBonusTarget, 0) ?? 0,
    target_emergency_months: num(body.target_emergency_months ?? body.targetEmergencyMonths, 6) ?? 6,
    marginal_tax_bracket: num(body.marginal_tax_bracket ?? body.marginalTaxBracket, 24) ?? 24,
    safe_withdrawal_rate: num(body.safe_withdrawal_rate, 4) ?? 4,
    expected_inflation_rate: num(body.expected_inflation_rate, 3) ?? 3,
    relationship_status: body.relationship_status ? String(body.relationship_status).slice(0, 40) : null,
    dependents_count: num(body.dependents_count, 0) ?? 0,
    employment_type: body.employment_type ? String(body.employment_type).slice(0, 40) : null,
    housing_status: body.housing_status ? String(body.housing_status).slice(0, 40) : null,
    state_of_residence: body.state_of_residence ? String(body.state_of_residence).slice(0, 8) : null,
    health_plan_type: body.health_plan_type ? String(body.health_plan_type).slice(0, 40) : null,
    traditional_ira_balance: num(body.traditional_ira_balance, 0) ?? 0,
    term_life_coverage: num(body.term_life_coverage, 0) ?? 0,
    living_trust_established: Boolean(body.living_trust_established),
    business_entity_type: body.business_entity_type ? String(body.business_entity_type).slice(0, 40) : null,
    variable_compensation_flag: Boolean(body.variable_compensation_flag),
    rsu_vesting_flag: Boolean(body.rsu_vesting_flag),
    mega_backdoor_eligible: Boolean(body.mega_backdoor_eligible),
    real_estate_tax_loophole_flag: Boolean(body.real_estate_tax_loophole_flag),
    nqdc_participation_flag: Boolean(body.nqdc_participation_flag),
    child_investment_accounts: Boolean(body.child_investment_accounts),
    financial_kryptonite: body.financial_kryptonite
      ? String(body.financial_kryptonite).slice(0, 500)
      : null,
    updated_at: new Date().toISOString(),
  };
}

async function buildRecalcTelemetry(userId: string) {
  const financials = await loadUserFinancials(userId);
  const survival = computeSurvivalFloor({
    transactions: financials.transactions,
    sinkingFunds: financials.sinkingFunds,
    targetMonths: Number(financials.profile?.target_emergency_months || 0) || null,
  });
  const quota = computeWealthQuota(
    financials.latestPaystub,
    Number(financials.profile?.annual_gross_salary || 0)
  );
  return {
    survival_matrix: {
      target_months: survival.target_months,
      monthly_baseline_burn: survival.monthly_burn_rate,
      required_emergency_floor: survival.survival_floor,
      monthly_sinking_pad: survival.monthly_sinking_pad,
    },
    wealth_quota: {
      gross_target: quota.target_annual,
      remaining_monthly_requirement: quota.remaining_monthly,
      upstream_credited: quota.credited_annual,
    },
  };
}
