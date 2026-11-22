import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getServiceSupabase } from '@/lib/supabase-admin';
import { requireActiveSubscription } from '@/lib/auth/require-entitlement';
import { toErrorResponse } from '@/lib/http/api-error';

export async function GET(req: Request) {
  try {
    const supabaseAuth = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await requireActiveSubscription(user);

    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from('capital_windfalls')
      .select('*')
      .eq('user_id', user.id)
      .order('expected_date', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ status: 'SUCCESS', windfalls: data || [] });
  } catch (error: unknown) {
    return toErrorResponse(error, 'windfalls-get');
  }
}

export async function POST(req: Request) {
  try {
    const supabaseAuth = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await requireActiveSubscription(user);

    const { source_name, source_type, expected_date, gross_amount, tax_drag_pct, target_liability_id } = await req.json();

    if (!source_name || !source_type || !expected_date || !gross_amount) {
      return NextResponse.json({ error: 'Missing required windfall fields.' }, { status: 400 });
    }

    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from('capital_windfalls')
      .insert({
        user_id: user.id,
        source_name,
        source_type,
        expected_date,
        gross_amount: Number(gross_amount),
        tax_drag_pct: Number(tax_drag_pct ?? 0.3215),
        target_liability_id: target_liability_id || null,
        status: 'PENDING'
      })
      .select()
      .single();

    if (error) throw error;

    const netYield = Number(gross_amount) * (1 - Number(tax_drag_pct ?? 0.3215));

    return NextResponse.json({
      status: 'SUCCESS',
      windfall: data,
      projections: {
        gross_amount: Number(gross_amount),
        net_liquid_yield: netYield
      }
    });
  } catch (error: unknown) {
    return toErrorResponse(error, 'windfalls-post');
  }
}