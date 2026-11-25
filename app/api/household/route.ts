import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { requireUser } from '@/lib/auth/require-user';
import { ApiError, readJsonBody, toErrorResponse } from '@/lib/http/api-error';
import { getServiceSupabase } from '@/lib/supabase-admin';

function newInviteCode(): string {
  return randomBytes(4).toString('hex');
}

/** List households for the signed-in user. */
export async function GET() {
  try {
    const user = await requireUser();
    const supabase = getServiceSupabase();

    const { data: memberships, error } = await supabase
      .from('household_members')
      .select('role, joined_at, household_id, households(id, name, invite_code, created_at, created_by)')
      .eq('user_id', user.id);

    if (error) throw error;

    return NextResponse.json({
      status: 'SUCCESS',
      memberships: memberships || [],
    });
  } catch (error) {
    return toErrorResponse(error, 'household-list');
  }
}

/**
 * Create household { name } or join { invite_code }.
 * Session user only — never trust client user_id.
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await readJsonBody<{ name?: string; invite_code?: string }>(request);
    const supabase = getServiceSupabase();

    if (body.invite_code?.trim()) {
      const code = body.invite_code.trim().toLowerCase();
      const { data: house, error: findErr } = await supabase
        .from('households')
        .select('id, name')
        .eq('invite_code', code)
        .maybeSingle();
      if (findErr) throw findErr;
      if (!house) throw ApiError.notFound('Invalid invite code.');

      const { error: memErr } = await supabase.from('household_members').upsert(
        {
          household_id: house.id,
          user_id: user.id,
          role: 'member',
        },
        { onConflict: 'household_id,user_id' }
      );
      if (memErr) throw memErr;

      return NextResponse.json({ status: 'SUCCESS', action: 'joined', household: house });
    }

    const name = (body.name || '').trim();
    if (!name) throw ApiError.badRequest('Provide name to create, or invite_code to join.');

    const invite_code = newInviteCode();
    const { data: house, error: createErr } = await supabase
      .from('households')
      .insert({
        name,
        invite_code,
        created_by: user.id,
      })
      .select('id, name, invite_code, created_at')
      .single();
    if (createErr) throw createErr;

    const { error: ownerErr } = await supabase.from('household_members').insert({
      household_id: house.id,
      user_id: user.id,
      role: 'owner',
    });
    if (ownerErr) throw ownerErr;

    return NextResponse.json({ status: 'SUCCESS', action: 'created', household: house });
  } catch (error) {
    return toErrorResponse(error, 'household-mutate');
  }
}
