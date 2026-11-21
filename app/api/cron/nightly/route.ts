import { NextResponse } from 'next/server';
import { requireCronSecret } from '@/lib/auth/require-cron-secret';
import { toErrorResponse } from '@/lib/http/api-error';
import { getServiceSupabase } from '@/lib/supabase-admin';
import { syncUserTransactions } from '@/lib/plaid/sync-user';
import { stampHistoricalSnapshot } from '@/lib/analytics/stamp-snapshot';

export const maxDuration = 300;

/**
 * Phase 6.3 — Vercel Cron nightly sync + historical snapshot.
 *
 * Auth: CRON_SECRET via Authorization: Bearer … or x-cron-secret.
 * Local/dev: cron does not fire; use Stamp Snapshot + Sync Telemetry manually.
 * Production: vercel.json schedule hits this route on deploy.
 */
export async function GET(request: Request) {
  return runNightly(request);
}

export async function POST(request: Request) {
  return runNightly(request);
}

async function runNightly(request: Request) {
  try {
    requireCronSecret(request);
    const supabase = getServiceSupabase();

    const { data: items, error } = await supabase
      .from('plaid_items')
      .select('user_id')
      .not('user_id', 'is', null);

    if (error) throw error;

    const userIds = [
      ...new Set((items || []).map((row) => row.user_id).filter(Boolean) as string[]),
    ];

    const results: {
      user_id: string;
      sync?: Record<string, unknown>;
      snapshot?: Record<string, unknown>;
      error?: string;
    }[] = [];

    for (const userId of userIds) {
      const entry: (typeof results)[number] = { user_id: userId };
      try {
        const sync = await syncUserTransactions(userId, { forceReset: false });
        entry.sync = {
          added: sync.added,
          modified: sync.modified,
          removed: sync.removed,
          orphans_deleted: sync.orphans_deleted,
          sync_errors: sync.sync_errors,
        };

        const stamped = await stampHistoricalSnapshot(userId);
        entry.snapshot = {
          snapshot_date: stamped.snapshot_date,
          liquid_capital: stamped.liquid_capital,
          investment_capital: stamped.investment_capital,
          total_liabilities: stamped.total_liabilities,
        };
      } catch (err: unknown) {
        entry.error = err instanceof Error ? err.message : 'Nightly user failed';
        console.error(`[cron/nightly] user ${userId}:`, entry.error);
      }
      results.push(entry);
    }

    const ok = results.filter((r) => !r.error).length;
    const failed = results.filter((r) => r.error).length;

    return NextResponse.json({
      status: 'SUCCESS',
      message:
        'Nightly sync+snapshot complete. Schedule only runs on Vercel; local stays manual Stamp Snapshot.',
      users: userIds.length,
      ok,
      failed,
      results,
    });
  } catch (error) {
    return toErrorResponse(error, 'cron-nightly');
  }
}
