import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { getServiceSupabase } from '@/lib/supabase';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export async function POST() {
  try {
    const supabaseAuth = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY is not configured.' }, { status: 500 });
    }

    const supabase = getServiceSupabase();

    // 1. Fetch live Accounts and recent Transactions strictly for this user
    const { data: accounts } = await supabase.from('financial_accounts').select('*').eq('user_id', user.id);
    
    // We can't filter transactions directly by user_id since they map to account_id.
    // However, we only select transactions belonging to the user's accounts.
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

    // 2. Fetch User Profile, Pre-Program Baseline, Snapshots, and Upstream Paystub mapped to user_id
    const { data: profile } = await supabase.from('user_financial_profiles').select('*').eq('user_id', user.id).single();
    const { data: baseline } = await supabase.from('program_baselines').select('*').eq('user_id', user.id).single();
    const { data: historicalSnapshots } = await supabase
      .from('monthly_telemetry_snapshots')
      .select('*')
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

    const txList = transactions || [];
    
    // Normalized Operational Burn Filter
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

    // 4. Compute Targets from Profile & Paystub
    const grossSalary = profile?.annual_gross_salary ? Number(profile.annual_gross_salary) : 141300;
    const monthlyWealthTarget = (grossSalary * 0.20) / 12;
    const targetEFMonths = profile?.target_emergency_months || 6;
    
    const emergencyFundCeiling = operationalBurn * targetEFMonths;

    // Upstream payroll calculations
    let paystubMetrics: any = null;
    if (latestPaystub) {
      const gross = Number(latestPaystub.gross_pay || 0);
      const totalTaxes =
        Number(latestPaystub.federal_tax_withheld || 0) +
        Number(latestPaystub.state_tax_withheld || 0) +
        Number(latestPaystub.fica_medicare_tax || 0);
      const effectiveTaxRate = gross > 0 ? (totalTaxes / gross) * 100 : 0;
      const preTaxSheltered = Number(latestPaystub.pre_tax_401k || 0) + Number(latestPaystub.hsa_contribution || 0);

      paystubMetrics = {
        gross_pay: gross,
        net_pay: Number(latestPaystub.net_pay || 0),
        total_taxes: totalTaxes,
        effective_tax_rate_pct: Number(effectiveTaxRate.toFixed(2)),
        pre_tax_401k: Number(latestPaystub.pre_tax_401k || 0),
        employer_401k_match: Number(latestPaystub.employer_401k_match || 0),
        hsa_contribution: Number(latestPaystub.hsa_contribution || 0),
        pre_tax_sheltered_total: preTaxSheltered,
      };
    }

    // 5. Construct BudgetDog Engine Prompt
    const promptPayload = `
You are the BudgetDog Financial Engine Auditor operating on the Brennan Schlagbaum financial blueprint.
Your tone is blunt, uncompromising, math-first, and focused on building wealth through radical debt elimination and aggressive index fund investing.

USER FINANCIAL PROFILE & BENCHMARKS:
- Annual Gross Salary: $${grossSalary.toLocaleString()}
- Target Retirement Age: ${profile?.target_retirement_age || 55}
- Target Emergency Fund Months: ${targetEFMonths} Months
- True Operational Monthly Burn (Excluding Transfers): $${operationalBurn.toFixed(2)}
- 6-Month Emergency Fund Ceiling (Operational Burn * ${targetEFMonths}): $${emergencyFundCeiling.toFixed(2)}
- Non-Operational Transfer Movement (Internal transfers/payments): $${transferMovement.toFixed(2)}
- Brennan 20%+ Wealth Rule Monthly Quota: $${monthlyWealthTarget.toFixed(2)} / month

UPSTREAM PAYROLL & TAX DEDUCTIONS TELEMETRY:
${JSON.stringify(paystubMetrics || 'No paystub telemetry ingested yet.', null, 2)}

PRE-PROGRAM DAY-ZERO BASELINE:
${JSON.stringify(baseline || 'No pre-program baseline established.', null, 2)}

CURRENT FINANCIAL TELEMETRY:
- Total Liquid Capital (Checking/Savings): $${liquidCapital.toFixed(2)}
- Total Revolving Debt (Credit Cards/Lines): $${revolvingDebt.toFixed(2)}
- Net Immediate Liquidity: $${netLiquidity.toFixed(2)}
- Operational Spending Distribution:
${JSON.stringify(categoryBreakdown, null, 2)}

HISTORICAL TELEMETRY SNAPSHOTS:
${JSON.stringify(historicalSnapshots || [], null, 2)}

BUDGETDOG ORDER OF OPERATIONS TO AUDIT AGAINST:
1. Mini Emergency Fund ($1,000 - $2,500)
2. Eliminate Non-Mortgage Debt (0% tolerance for high-interest/consumer debt)
3. 3-6 Months Fully Funded Emergency Fund in HYSA (Flag any "Cash Drag" if idle cash sits above the $${emergencyFundCeiling.toFixed(2)} ceiling)
4. 20%+ Wealth Building Rule (Tax-advantaged pipeline -> Low-cost Index Funds like VOO/VTI)
5. Early Mortgage Payoff / Generational Wealth

Generate a structured forensic audit report with these exact section headers:

**1. BudgetDog Phase Diagnosis & Net Position**
Identify which exact step of the order of operations the user is currently on based on liquid capital vs revolving debt. Compare against their pre-program baseline debt load.

**2. Upstream Tax Drag & Deduction Audit**
Audit the user's paystub efficiency. Analyze effective tax rate drag, verify whether employer 401(k) match is being maximized, and evaluate pre-tax optimization (401k/HSA sheltering).

**3. Downstream Cash Drag & Leakage Audit**
Audit spending categories against the pre-program baseline. Call out lifestyle creep based strictly on operational burn ($${operationalBurn.toFixed(2)}), distinguishing it from non-operational transfer volume ($${transferMovement.toFixed(2)}). Quantify true idle cash sitting above the $${emergencyFundCeiling.toFixed(2)} ceiling.

**4. Three Tactical Directives**
Provide 3 ranked, concrete action steps with exact dollar moves to hit their $${monthlyWealthTarget.toFixed(2)}/mo Step 4 investing quota and optimize tax sheltering.

**5. Longitudinal Trend & Accountability Score**
Evaluate trajectory compared to historical snapshots and pre-program baseline. Grade their behavioral discipline (A to F) with a blunt rationale.
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
  } catch (error: any) {
    console.error('Gemini Audit Error:', error?.message || error);
    return NextResponse.json(
      { error: error?.message || 'Failed to complete financial audit.' },
      { status: 500 }
    );
  }
}