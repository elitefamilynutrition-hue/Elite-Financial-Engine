import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';

export async function POST() {
  try {
    const supabase = getServiceSupabase();

    // 1. Fetch current revolving debt snapshot
    const { data: accounts, error: accError } = await supabase
      .from('financial_accounts')
      .select('*');

    if (accError) throw accError;

    const baselineRevolvingDebt = (accounts || [])
      .filter((a) => a.account_type.toLowerCase() === 'credit')
      .reduce((sum, a) => sum + Number(a.current_balance || 0), 0);

    // 2. Fetch historical transactions (prior 180 days / ~6 months)
    const now = new Date();
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setDate(now.getDate() - 180);

    const { data: txs, error: txError } = await supabase
      .from('transactions')
      .select('*')
      .gte('date', sixMonthsAgo.toISOString().split('T')[0]);

    if (txError) throw txError;

    const debitTxs = (txs || []).filter((t) => Number(t.amount) > 0);

    let totalDiscretionary = 0;
    let totalFixed = 0;

    const discretionaryKeywords = [
      'food and drink',
      'restaurant',
      'coffee',
      'shops',
      'subscription',
      'entertainment',
      'travel',
      'digital',
    ];

    debitTxs.forEach((tx) => {
      const amount = Number(tx.amount || 0);
      const cat = (tx.category || '').toLowerCase();
      const isDiscretionary = discretionaryKeywords.some((kw) => cat.includes(kw));

      if (isDiscretionary) {
        totalDiscretionary += amount;
      } else {
        totalFixed += amount;
      }
    });

    // Normalize to monthly averages (180 days = ~6 months; minimum divisor 1)
    const monthsEvaluated = Math.max(1, 6);
    const avgMonthlyBurn = (totalDiscretionary + totalFixed) / monthsEvaluated;
    const avgDiscretionary = totalDiscretionary / monthsEvaluated;
    const avgFixed = totalFixed / monthsEvaluated;

    // 3. Upsert into program_baselines
    const baselinePayload = {
      user_id: '00000000-0000-0000-0000-000000000000',
      onboarding_date: now.toISOString().split('T')[0],
      baseline_avg_monthly_burn: Number(avgMonthlyBurn.toFixed(2)),
      baseline_discretionary_burn: Number(avgDiscretionary.toFixed(2)),
      baseline_fixed_burn: Number(avgFixed.toFixed(2)),
      baseline_revolving_debt: Number(baselineRevolvingDebt.toFixed(2)),
    };

    const { data, error: baselineError } = await supabase
      .from('program_baselines')
      .upsert(baselinePayload, { onConflict: 'user_id' })
      .select()
      .single();

    if (baselineError) throw baselineError;

    return NextResponse.json({
      status: 'SUCCESS',
      baseline: data,
    });
  } catch (error: any) {
    console.error('Baseline Computation Error:', error.message || error);
    return NextResponse.json(
      { error: error.message || 'Failed to compute baseline.' },
      { status: 500 }
    );
  }
}