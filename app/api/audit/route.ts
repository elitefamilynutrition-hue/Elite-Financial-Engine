import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { getServiceSupabase } from '@/lib/supabase-admin';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { checkRateLimit, rateLimitResponse } from '@/lib/http/rate-limit';
import { requireActiveSubscription } from '@/lib/auth/require-entitlement';
import { toErrorResponse } from '@/lib/http/api-error';

export async function POST() {
  try {
    const supabaseAuth = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await requireActiveSubscription(user);

    const limited = checkRateLimit(`audit:${user.id}`, 5, 60_000);
    if (!limited.ok) return rateLimitResponse(limited.retryAfterSec);

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY is not configured.' }, { status: 500 });
    }

    const supabase = getServiceSupabase();

    // 1. Fetch live Accounts, Manual Liabilities, and recent Transactions strictly for this user
    const { data: accounts } = await supabase.from('financial_accounts').select('*').eq('user_id', user.id);
    const { data: manualAccounts } = await supabase.from('manual_accounts').select('*').eq('user_id', user.id);
    
    const accountIds = accounts?.map(acc => acc.plaid_account_id) || [];
    let transactions: any[] = [];
    
    if (accountIds.length > 0) {
      const { data: txs } = await supabase
        .from('transactions')
        .select('*')
        .in('account_id', accountIds)
        .order('date', { ascending: false })
        .limit(100);
      transactions = txs || [];
    }

    if (!accounts || accounts.length === 0) {
      return NextResponse.json({ error: 'No account telemetry found to audit.' }, { status: 400 });
    }

    const aiOptimizedAccounts = accounts.map(acc => ({
      account_name: acc.custom_name || acc.account_name,
      account_type: acc.account_type,
      current_balance: acc.current_balance
    }));

    // 2. Fetch Profile, Baseline, Snapshots, and Paystub telemetry
    const { data: profile } = await supabase.from('user_financial_profiles').select('*').eq('user_id', user.id).single();
    const { data: baseline } = await supabase.from('program_baselines').select('*').eq('user_id', user.id).single();
    // Sole snapshot SoT: same table stamped by POST /api/snapshot and read by charts.
    const { data: historicalSnapshots } = await supabase
      .from('historical_snapshots')
      .select(
        'snapshot_date, liquid_capital, investment_capital, total_liabilities, survival_floor, monthly_burn_rate, wealth_quota_target, wealth_quota_actual'
      )
      .eq('user_id', user.id)
      .order('snapshot_date', { ascending: false })
      .limit(3);
    const { data: latestPaystub } = await supabase
      .from('paystub_records')
      .select('*')
      .eq('user_id', user.id)
      .order('pay_date', { ascending: false })
      .limit(1)
      .single();

    // 3. Pre-Aggregate Live Telemetry
    const liquidCapital = accounts
      .filter((a) => a.account_type.toLowerCase() === 'depository')
      .reduce((sum, a) => sum + Number(a.current_balance || 0), 0);

    const revolvingDebt = accounts
      .filter((a) => a.account_type.toLowerCase() === 'credit')
      .reduce((sum, a) => sum + Number(a.current_balance || 0), 0);

    const netLiquidity = liquidCapital - revolvingDebt;

    // Total Fixed Liabilities (Secured Debt Service / Minimums)
    const totalFixedLiabilitiesMonthly = manualAccounts?.reduce((sum, m) => sum + Number(m.minimum_payment || 0), 0) || 0;

    const txList = transactions || [];
    const nonOperationalKeywords = ['transfer', 'payment', 'credit card', 'deposit', 'wire', 'investment', 'payroll'];

    let operationalBurn = 0;
    let transferMovement = 0;
    const categoryBreakdown: { [key: string]: number } = {};

    txList
      .filter((t) => Number(t.amount) > 0)
      .forEach((t) => {
        const amt = Number(t.amount);
        const cat = (t.category || '').toLowerCase();
        const name = (t.name || '').toLowerCase();
        const isExcluded = nonOperationalKeywords.some((kw) => cat.includes(kw) || name.includes(kw));

        if (isExcluded) {
          transferMovement += amt;
        } else {
          operationalBurn += amt;
          const primaryCat = t.category ? t.category.split(',')[0].trim() : 'Uncategorized';
          categoryBreakdown[primaryCat] = (categoryBreakdown[primaryCat] || 0) + amt;
        }
      });

    // 4. Work-Backwards Waterfall Calculation
    const grossSalary = profile?.annual_gross_salary != null ? Number(profile.annual_gross_salary) : null;
    const grossMonthlyIncome = grossSalary != null ? grossSalary / 12 : null;
    
    // Step 1: The 20% Gross Wealth Quota
    const grossWealthQuotaMonthly = grossMonthlyIncome != null ? grossMonthlyIncome * 0.20 : null; 
    
    // Upstream Payroll & Protection Layers (Steps 2 & 3)
    let paystubMetrics: any = null;
    let monthlyPayrollWealthContribution = 0;
    let fixedHealthAndPayrollLeaksMonthly = 0;
    let estimatedNetMonthlyInflow: number | null = null;

    if (latestPaystub) {
      const gross = Number(latestPaystub.gross_pay || 0);
      const totalTaxes =
        Number(latestPaystub.federal_tax_withheld || 0) +
        Number(latestPaystub.state_tax_withheld || 0) +
        Number(latestPaystub.fica_medicare_tax || 0);
      const effectiveTaxRate = gross > 0 ? (totalTaxes / gross) * 100 : 0;
      
      const preTax401k = Number(latestPaystub.pre_tax_401k || 0);
      const roth401k = Number(latestPaystub.post_tax_roth_401k || 0);
      const hsa = Number(latestPaystub.hsa_contribution || 0);
      const healthcare = Number(latestPaystub.healthcare_premiums || 0);
      const otherDed = Number(latestPaystub.other_deductions || 0);

      monthlyPayrollWealthContribution = (preTax401k + roth401k) * 2;
      fixedHealthAndPayrollLeaksMonthly = (healthcare + hsa + otherDed) * 2;
      estimatedNetMonthlyInflow = Number(latestPaystub.net_pay || 0) * 2; // normalized bi-weekly/semi-monthly

      paystubMetrics = {
        gross_pay: gross,
        net_pay: Number(latestPaystub.net_pay || 0),
        effective_tax_rate_pct: Number(effectiveTaxRate.toFixed(2)),
        pre_tax_401k: preTax401k,
        post_tax_roth_401k: roth401k,
        hsa_contribution: hsa,
        healthcare_premiums: healthcare,
        other_deductions: otherDed,
      };
    }

    // POST-WEALTH RESIDUAL CAP FORMULA:
    // Net Inflow minus (Mandatory 20% Wealth Quota) minus (Fixed Debt Service) minus (Health & Protection Leaks)
    const postWealthResidualCap =
      estimatedNetMonthlyInflow != null && grossWealthQuotaMonthly != null
        ? Math.max(
            0,
            estimatedNetMonthlyInflow -
              grossWealthQuotaMonthly -
              totalFixedLiabilitiesMonthly -
              fixedHealthAndPayrollLeaksMonthly
          )
        : null;

    const targetEFMonths = profile?.target_emergency_months || 6;
    const emergencyFundCeiling = operationalBurn * targetEFMonths;
    const fmtMoney = (n: number | null) => (n == null ? 'not set' : `$${n.toFixed(2)}`);

    // 5. Construct Protocol Audit Payload
    const promptPayload = `
You are the Elite Capital Engine Auditor executing the strict "Work Backwards" Protocol.
Your tone is blunt, uncompromising, analytical, and uncompromisingly disciplined. You enforce savings and debt destruction as absolute non-negotiable laws, treating variable lifestyle spending strictly as a dynamic residual.

PRIORITY HIERARCHY WATERFALL:
1. MANDATORY 20% GROSS WEALTH QUOTA: ${fmtMoney(grossWealthQuotaMonthly)} / month (Automatically satisfied via automated payroll 401k contributions of ~$${monthlyPayrollWealthContribution.toFixed(2)}/mo + discretionary post-tax investments/debt payoff).
2. PROTECTION, HEALTH & FIXED OBLIGATIONS:
   - Fixed Debt Service (manual liabilities): $${totalFixedLiabilitiesMonthly.toFixed(2)} / month
   - Health Premiums, HSA & Fixed Payroll Leaks: $${fixedHealthAndPayrollLeaksMonthly.toFixed(2)} / month
3. EMERGENCY FUND FLOOR: 3 to 6 months fully funded in high-yield cash. (Current target ceiling: $${emergencyFundCeiling.toFixed(2)}).
4. POST-WEALTH RESIDUAL SPENDING CAP (The Maximum Allowable Operational Burn): ${fmtMoney(postWealthResidualCap)} / month.

CURRENT AUDIT TELEMETRY:
- Estimated Net Monthly Inflow: ${fmtMoney(estimatedNetMonthlyInflow)}
- Actual Trailing Operational Burn: $${operationalBurn.toFixed(2)}
- Residual Variance (Deficit / Surplus): ${postWealthResidualCap == null ? 'not set' : `$${(postWealthResidualCap - operationalBurn).toFixed(2)}`}
- Total Liquid Capital: $${liquidCapital.toFixed(2)}
- Total Revolving Credit Debt: $${revolvingDebt.toFixed(2)}

UPSTREAM PAYROLL & HEALTH DEDUCTIONS:
${JSON.stringify(paystubMetrics || 'No paystub telemetry ingested.', null, 2)}

ACTIVE ACCOUNT LEDGER:
${JSON.stringify(aiOptimizedAccounts, null, 2)}

OPERATIONAL SPENDING DISTRIBUTION (Plaid Categories):
${JSON.stringify(categoryBreakdown, null, 2)}

HISTORICAL SNAPSHOTS & BASELINE (from historical_snapshots — liquid/investment capital, total_liabilities, survival_floor, monthly_burn_rate, wealth quotas):
- Baseline: ${JSON.stringify(baseline || 'None')}
- Snapshots (newest first): ${JSON.stringify(historicalSnapshots || [])}

Generate a structured forensic audit report following the Work-Backwards Order of Operations with these section headers:

**1. Work-Backwards Waterfall & Residual Audit**
Evaluate whether current operational burn ($${operationalBurn.toFixed(2)}) strictly respects the Post-Wealth Residual Cap (${fmtMoney(postWealthResidualCap)}). Expose any month where lifestyle spending invaded capital reserved for the 20% wealth quota or fixed protection layers. If salary/paystub data is "not set", say so and avoid inventing numbers.

**2. Upstream Protection & Tax Drag Audit**
Audit health/HSA sheltering, effective tax rate drag, and fixed payroll leaks against the protection layer of the hierarchy.

**3. Downstream Cash Drag & Leakage Audit**
Audit Plaid spending categories against the residual cap. Differentiate operational lifestyle burn from non-operational transfer volume ($${transferMovement.toFixed(2)}), and flag cash drag above the emergency fund ceiling ($${emergencyFundCeiling.toFixed(2)}).

**4. Three Tactical Directives**
Provide 3 ranked, concrete action steps with exact dollar moves to lock in the Post-Wealth Residual Cap and accelerate debt/investing velocity according to the protocol.

**5. Longitudinal Trend & Accountability Score**
Evaluate trajectory against historical telemetry. Grade behavioral discipline (A to F) with a blunt rationale.
`;

    const ai = new GoogleGenAI({ apiKey });

    let response: any = null;
    const maxRetries = 3;
    const delays = [1500, 3000];

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        response = await ai.models.generateContent({
          model: 'gemini-3.6-flash',
          contents: promptPayload,
        });
        if (response?.text) break;
      } catch (err: any) {
        const isUnavailable = err?.status === 503 || err?.message?.includes('503');
        if (isUnavailable && attempt < maxRetries - 1) {
          console.warn(`Gemini 503 spike detected. Retrying attempt ${attempt + 2}/${maxRetries}...`);
          await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
        } else {
          throw err;
        }
      }
    }

    return NextResponse.json({
      status: 'SUCCESS',
      auditReport: response?.text || 'No audit response generated.',
    });
  } catch (error: unknown) {
    return toErrorResponse(error, 'audit');
  }
}