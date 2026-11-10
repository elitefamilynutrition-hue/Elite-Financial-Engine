import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getServiceSupabase } from '@/lib/supabase-admin';

export async function POST(req: Request) {
  try {
    const supabaseAuth = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { vest_date, shares_vesting, estimated_share_price, target_liability_balance } = await req.json();
    if (!vest_date || !shares_vesting || !estimated_share_price) {
      return NextResponse.json({ error: 'Missing required RSU telemetry fields.' }, { status: 400 });
    }

    const supabase = getServiceSupabase();
    // Table name is legacy; stores per-user equity vest schedule rows.
    const { data, error } = await supabase
      .from('amazon_rsu_schedule')
      .insert({
        user_id: user.id,
        vest_date,
        shares_vesting: Number(shares_vesting),
        estimated_share_price: Number(estimated_share_price),
        tax_drag_pct: 0.3215,
        status: 'PENDING'
      })
      .select()
      .single();

    if (error) throw error;

    const grossValue = Number(shares_vesting) * Number(estimated_share_price);
    const netLiquidYield = grossValue * (1 - 0.3215);
    const liabilityTarget = Number(target_liability_balance);
    const liabilityPayoffImpactPct =
      Number.isFinite(liabilityTarget) && liabilityTarget > 0
        ? (netLiquidYield / liabilityTarget) * 100
        : null;

    return NextResponse.json({
      status: 'SUCCESS',
      rsu_tranche: data,
      projections: {
        gross_value: grossValue,
        net_liquid_yield: netLiquidYield,
        liability_payoff_impact_pct: liabilityPayoffImpactPct,
      }
    });
  } catch (error: any) {
    console.error('RSU Ingestion Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to record RSU tranche.' }, { status: 500 });
  }
}