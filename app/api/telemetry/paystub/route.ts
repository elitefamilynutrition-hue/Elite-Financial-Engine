import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const supabase = getServiceSupabase();

    const {
      pay_period_start,
      pay_period_end,
      pay_date,
      gross_pay,
      net_pay,
      federal_tax_withheld = 0,
      state_tax_withheld = 0,
      fica_medicare_tax = 0,
      pre_tax_401k = 0,
      post_tax_roth_401k = 0,
      employer_401k_match = 0,
      hsa_contribution = 0,
      healthcare_premiums = 0,
      other_deductions = 0,
    } = body;

    if (!pay_period_start || !pay_period_end || !pay_date || gross_pay === undefined || net_pay === undefined) {
      return NextResponse.json(
        { error: 'Missing required paystub fields (pay_period_start, pay_period_end, pay_date, gross_pay, net_pay).' },
        { status: 400 }
      );
    }

    const gross = Number(gross_pay);
    const net = Number(net_pay);
    const fedTax = Number(federal_tax_withheld);
    const stateTax = Number(state_tax_withheld);
    const fica = Number(fica_medicare_tax);
    const pretax401k = Number(pre_tax_401k);
    const roth401k = Number(post_tax_roth_401k);
    const match401k = Number(employer_401k_match);
    const hsa = Number(hsa_contribution);
    const health = Number(healthcare_premiums);
    const other = Number(other_deductions);

    // Derived forensic metrics
    const totalTaxes = fedTax + stateTax + fica;
    const effectiveTaxRate = gross > 0 ? (totalTaxes / gross) * 100 : 0;
    const totalPreTaxSheltered = pretax401k + hsa;
    const preTaxSavingsRate = gross > 0 ? (totalPreTaxSheltered / gross) * 100 : 0;
    const takeHomePct = gross > 0 ? (net / gross) * 100 : 0;

    const paystubPayload = {
      user_id: '00000000-0000-0000-0000-000000000000',
      pay_period_start,
      pay_period_end,
      pay_date,
      gross_pay: gross,
      net_pay: net,
      federal_tax_withheld: fedTax,
      state_tax_withheld: stateTax,
      fica_medicare_tax: fica,
      pre_tax_401k: pretax401k,
      post_tax_roth_401k: roth401k,
      employer_401k_match: match401k,
      hsa_contribution: hsa,
      healthcare_premiums: health,
      other_deductions: other,
    };

    const { data, error: insertError } = await supabase
      .from('paystub_records')
      .insert(paystubPayload)
      .select()
      .single();

    if (insertError) throw insertError;

    return NextResponse.json({
      status: 'SUCCESS',
      paystub: data,
      metrics: {
        total_taxes_withheld: totalTaxes,
        effective_tax_rate_pct: Number(effectiveTaxRate.toFixed(2)),
        pre_tax_sheltered_total: totalPreTaxSheltered,
        pre_tax_savings_rate_pct: Number(preTaxSavingsRate.toFixed(2)),
        take_home_ratio_pct: Number(takeHomePct.toFixed(2)),
      },
    });
  } catch (error: any) {
    console.error('Paystub Ingestion Error:', error?.message || error);
    return NextResponse.json(
      { error: error?.message || 'Failed to ingest paystub telemetry.' },
      { status: 500 }
    );
  }
}