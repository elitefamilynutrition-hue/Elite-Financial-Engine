import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';

export async function POST() {
  try {
    const supabase = getServiceSupabase();

    // 1. Fetch live balance sheet
    const { data: accounts, error: accError } = await supabase
      .from('financial_accounts')
      .select('*');

    if (accError) throw accError;

    const liquidCapital = (accounts || [])
      .filter((a) => a.account_type === 'depository')
      .reduce((sum, a) => sum + Number(a.current_balance || 0), 0);

    const revolvingDebt = (accounts || [])
      .filter((a) => a.account_type === 'credit')
      .reduce((sum, a) => sum + Number(a.current_balance || 0), 0);

    const netLiquidity = liquidCapital - revolvingDebt;

    // 2. Fetch trailing 30-day burn & category distribution
    const now = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(now.getDate() - 30);

    const { data: transactions, error: txError } = await supabase
      .from('transactions')
      .select('*')
      .gte('date', thirtyDaysAgo.toISOString().split('T')[0]);

    if (txError) throw txError;

    let totalBurn = 0;
    const categoryMap: Record<string, number> = {};

    (transactions || []).forEach((tx) => {
      const amount = Number(tx.amount || 0);
      if (amount > 0) {
        totalBurn += amount;
        const cat = tx.category ? tx.category.split(',')[0].trim() : 'Uncategorized';
        categoryMap[cat] = (categoryMap[cat] || 0) + amount;
      }
    });

    // 3. Normalize snapshot date to first day of current month (YYYY-MM-01)
    const snapshotDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

    const snapshotPayload = {
      user_id: '00000000-0000-0000-0000-000000000000',
      snapshot_date: snapshotDate,
      liquid_capital: Number(liquidCapital.toFixed(2)),
      revolving_debt: Number(revolvingDebt.toFixed(2)),
      net_liquidity: Number(netLiquidity.toFixed(2)),
      total_burn: Number(totalBurn.toFixed(2)),
      top_categories: categoryMap,
    };

    const { data, error: snapshotError } = await supabase
      .from('monthly_telemetry_snapshots')
      .upsert(snapshotPayload, { onConflict: 'user_id,snapshot_date' })
      .select()
      .single();

    if (snapshotError) throw snapshotError;

    return NextResponse.json({
      status: 'SUCCESS',
      snapshot: data,
    });
  } catch (error: any) {
    console.error('Snapshot Generation Error:', error.message || error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate monthly snapshot.' },
      { status: 500 }
    );
  }
}