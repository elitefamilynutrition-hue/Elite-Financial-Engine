import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/require-user';
import { requireActiveSubscription } from '@/lib/auth/require-entitlement';
import { ApiError, toErrorResponse } from '@/lib/http/api-error';
import { createServerSupabaseClient } from '@/lib/supabase-server';

/**
 * Legacy profile read. Mutations belong on /api/profile/setup and
 * /api/profile/recalculate — POST here returns 410.
 */
export async function GET() {
  try {
    const user = await requireUser();
    await requireActiveSubscription(user);

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from('user_financial_profiles')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) throw error;

    return NextResponse.json({ profile: data || null });
  } catch (error: unknown) {
    return toErrorResponse(error, 'profile-get');
  }
}

export async function POST() {
  return toErrorResponse(
    ApiError.gone(
      'POST /api/profile is retired. Use /api/profile/setup or /api/profile/recalculate.'
    ),
    'profile-post'
  );
}
