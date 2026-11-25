import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/require-user';
import { ApiError, readJsonBody, toErrorResponse } from '@/lib/http/api-error';
import { getServiceSupabase } from '@/lib/supabase-admin';
import { decryptToken } from '@/lib/crypto';
import { plaidClient } from '@/lib/plaid';

const TENANT_TABLES = [
  'transactions',
  'investment_transactions',
  'manual_account_transactions',
  'paystub_records',
  'capital_windfalls',
  'historical_snapshots',
  'monthly_telemetry_snapshots',
  'amazon_rsu_schedule',
  'future_liquidity_events',
  'sinking_funds',
  'financial_accounts',
  'manual_accounts',
  'user_custom_categorization_rules',
  'user_financial_profiles',
  'plaid_items',
] as const;

/**
 * Session-scoped account wipe. Requires { confirm: true }.
 * Best-effort Plaid item revoke; never trusts a client-supplied user id.
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await readJsonBody<{ confirm?: boolean }>(request);

    if (body.confirm !== true) {
      throw ApiError.badRequest('Send JSON { "confirm": true } to permanently delete your data.');
    }

    const supabase = getServiceSupabase();
    const userId = user.id;
    const plaidWarnings: string[] = [];

    const { data: plaidItems } = await supabase
      .from('plaid_items')
      .select('item_id, access_token')
      .eq('user_id', userId);

    for (const item of plaidItems || []) {
      try {
        if (!item.access_token) continue;
        const accessToken = decryptToken(item.access_token);
        await plaidClient.itemRemove({ access_token: accessToken });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'unknown';
        plaidWarnings.push(`Plaid revoke failed for item ${item.item_id || 'unknown'}: ${msg}`);
        console.warn('[account-delete]', plaidWarnings[plaidWarnings.length - 1]);
      }
    }

    const deleted: string[] = [];
    const deleteErrors: string[] = [];

    for (const table of TENANT_TABLES) {
      const { error } = await supabase.from(table).delete().eq('user_id', userId);
      if (error) {
        // Table may not exist in every environment — log and continue.
        deleteErrors.push(`${table}: ${error.message}`);
        console.warn(`[account-delete] ${table}:`, error.message);
      } else {
        deleted.push(table);
      }
    }

    let authDeleted = false;
    let authMessage: string | null = null;
    try {
      const { error: authError } = await supabase.auth.admin.deleteUser(userId);
      if (authError) {
        authMessage = authError.message;
      } else {
        authDeleted = true;
      }
    } catch (err: unknown) {
      authMessage = err instanceof Error ? err.message : 'Auth delete failed';
    }

    if (authDeleted) {
      return NextResponse.json({
        status: 'SUCCESS',
        deleted_tables: deleted,
        plaid_warnings: plaidWarnings,
        auth_user_deleted: true,
      });
    }

    return NextResponse.json({
      status: 'PARTIAL',
      message:
        'Tenant data wipe attempted. Auth user was not removed — ask an operator to delete the auth user in Supabase, or retry later.',
      deleted_tables: deleted,
      delete_errors: deleteErrors,
      plaid_warnings: plaidWarnings,
      auth_user_deleted: false,
      next_step: authMessage || 'Delete the user from Supabase Auth dashboard.',
    });
  } catch (error) {
    return toErrorResponse(error, 'account-delete');
  }
}
