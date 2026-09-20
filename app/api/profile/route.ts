import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('user_financial_profiles')
      .select('*')
      .eq('user_id', user.id)
      .single();

    // PGRST116 means zero rows returned (which is fine if the profile isn't created yet)
    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    return NextResponse.json({ profile: data || null });
  } catch (error: any) {
    console.error('Profile GET Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    
    const payload = {
      user_id: user.id,
      current_age: Number(body.currentAge || 35),
      target_retirement_age: Number(body.targetRetirementAge || 55),
      annual_gross_salary: Number(body.annualGrossSalary || 0),
      annual_bonus_target: Number(body.annualBonusTarget || 0),
      target_emergency_months: Number(body.targetEmergencyMonths || 6),
      marginal_tax_bracket: Number(body.marginalTaxBracket || 24.0),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('user_financial_profiles')
      .upsert(payload, { onConflict: 'user_id' })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ status: 'SUCCESS', profile: data });
  } catch (error: any) {
    console.error('Profile POST Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}