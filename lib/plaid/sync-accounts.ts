import { plaidClient } from '@/lib/plaid';
import { getServiceSupabase } from '@/lib/supabase-admin';

/**
 * Refreshes balances for one Plaid item and removes account rows Plaid has
 * rotated away.
 *
 * Every write is tagged with `user_id`. The previous version omitted it, so any
 * account discovered by a webhook was inserted with a null owner and became
 * invisible to the person who linked it.
 */
export async function syncAccountsForItem({
  accessToken,
  userId,
}: {
  accessToken: string;
  userId: string;
}): Promise<number> {
  const response = await plaidClient.accountsGet({ access_token: accessToken });
  const accounts = response.data.accounts;

  if (accounts.length === 0) return 0;

  const supabase = getServiceSupabase();
  const liveAccountIds = accounts.map((account) => account.account_id);

  await pruneRotatedAccounts({ userId, liveAccountIds });

  const payload = accounts.map((account) => ({
    user_id: userId,
    plaid_account_id: account.account_id,
    account_name: account.name,
    account_type: account.type,
    account_subtype: account.subtype || null,
    current_balance: account.balances.current ?? 0,
    available_balance: account.balances.available ?? null,
    currency_code: account.balances.iso_currency_code || 'USD',
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('financial_accounts')
    .upsert(payload, { onConflict: 'plaid_account_id' });

  if (error) throw error;

  return accounts.length;
}

/**
 * Deletes rows for this user whose Plaid account id no longer exists upstream
 * (happens after a re-auth that rotates account ids).
 */
async function pruneRotatedAccounts({
  userId,
  liveAccountIds,
}: {
  userId: string;
  liveAccountIds: string[];
}): Promise<void> {
  const supabase = getServiceSupabase();

  const { data: existing, error } = await supabase
    .from('financial_accounts')
    .select('id, plaid_account_id')
    .eq('user_id', userId);

  if (error || !existing) return;

  const live = new Set(liveAccountIds);
  const staleIds = existing
    .filter((row) => !live.has(String(row.plaid_account_id)))
    .map((row) => row.id);

  if (staleIds.length === 0) return;

  await supabase
    .from('financial_accounts')
    .delete()
    .eq('user_id', userId)
    .in('id', staleIds);
}
