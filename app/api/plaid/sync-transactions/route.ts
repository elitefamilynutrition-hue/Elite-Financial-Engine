import { NextResponse, NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { checkRateLimit, rateLimitResponse } from '@/lib/http/rate-limit';
import { syncUserTransactions } from '@/lib/plaid/sync-user';

export async function POST(request: NextRequest) {
  try {
    const supabaseAuth = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const limited = checkRateLimit(`plaid-sync:${user.id}`, 10, 60_000);
    if (!limited.ok) return rateLimitResponse(limited.retryAfterSec);

    const forceReset = request.nextUrl.searchParams.get('reset') === 'true';
    const result = await syncUserTransactions(user.id, { forceReset });

    if (result.message && result.items === 0) {
      return NextResponse.json({ status: 'SUCCESS', message: result.message });
    }

    return NextResponse.json({
      status: 'SUCCESS',
      added: result.added,
      modified: result.modified,
      removed: result.removed,
      investments_added: result.investments_added,
      orphans_deleted: result.orphans_deleted,
      sync_errors: result.sync_errors.length > 0 ? result.sync_errors : undefined,
    });
  } catch (error: unknown) {
    const err = error as {
      response?: { data?: { error_message?: string } };
      message?: string;
    };
    console.error(
      'Fatal Transaction Sync Error:',
      err?.response?.data || err.message || error
    );
    return NextResponse.json(
      { error: err?.response?.data?.error_message || err.message || 'Sync failed.' },
      { status: 500 }
    );
  }
}
