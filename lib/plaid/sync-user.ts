import { plaidClient } from '@/lib/plaid';
import { getServiceSupabase } from '@/lib/supabase-admin';
import { decryptToken } from '@/lib/crypto';
import { classifyPlaidTransaction, toCategoryString } from '@/lib/plaid/classify';

export interface SyncUserResult {
  user_id: string;
  items: number;
  added: number;
  modified: number;
  removed: number;
  investments_added: number;
  orphans_deleted: number;
  sync_errors: string[];
  message?: string;
}

/**
 * Resume-cursor Plaid sync for one tenant (no Gemini). Used by
 * /api/plaid/sync-transactions and nightly cron.
 */
export async function syncUserTransactions(
  userId: string,
  opts?: { forceReset?: boolean }
): Promise<SyncUserResult> {
  if (!userId) throw new Error('syncUserTransactions requires userId.');

  const forceReset = Boolean(opts?.forceReset);
  const supabase = getServiceSupabase();

  if (forceReset) {
    console.warn(`[Plaid Sync] Force reset for user ${userId}. Clearing cursors.`);
    await supabase.from('plaid_items').update({ next_cursor: null }).eq('user_id', userId);
  }

  const { data: items, error: itemError } = await supabase
    .from('plaid_items')
    .select('*')
    .eq('user_id', userId);

  if (itemError) throw itemError;
  if (!items || items.length === 0) {
    return {
      user_id: userId,
      items: 0,
      added: 0,
      modified: 0,
      removed: 0,
      investments_added: 0,
      orphans_deleted: 0,
      sync_errors: [],
      message: 'No linked items found to sync.',
    };
  }

  let totalAdded = 0;
  let totalModified = 0;
  let totalRemoved = 0;
  let totalInvestmentsAdded = 0;
  const errors: string[] = [];

  for (const item of items) {
    try {
      const accessToken = decryptToken(item.access_token);
      let cursor = forceReset ? undefined : item.next_cursor || undefined;
      let hasMore = true;

      try {
        const accRes = await plaidClient.accountsGet({ access_token: accessToken });
        const activeAccountIds = accRes.data.accounts.map((acc) => acc.account_id);
        const accountNames = accRes.data.accounts.map((acc) => acc.name);

        if (accountNames.length > 0) {
          await supabase
            .from('financial_accounts')
            .delete()
            .eq('user_id', item.user_id)
            .in('account_name', accountNames)
            .not('plaid_account_id', 'in', `(${activeAccountIds.map((id) => `"${id}"`).join(',')})`);
        }

        const accountsPayload = accRes.data.accounts.map((acc) => ({
          user_id: item.user_id,
          plaid_account_id: acc.account_id,
          account_name: acc.name,
          account_type: acc.type,
          account_subtype: acc.subtype || null,
          current_balance: acc.balances.current || 0,
          available_balance: acc.balances.available || null,
          currency_code: acc.balances.iso_currency_code || 'USD',
          updated_at: new Date().toISOString(),
        }));

        const { error: accUpsertError } = await supabase
          .from('financial_accounts')
          .upsert(accountsPayload, { onConflict: 'plaid_account_id' });

        if (accUpsertError) {
          console.error(`Failed to upsert accounts for item ${item.item_id}:`, accUpsertError.message);
        }
      } catch (err: unknown) {
        console.error(
          `Fatal balance refresh error for item ${item.item_id}:`,
          err instanceof Error ? err.message : err
        );
      }

      while (hasMore) {
        let syncRes;
        try {
          syncRes = await plaidClient.transactionsSync({
            access_token: accessToken,
            cursor,
            count: 100,
          });
        } catch (plaidErr: unknown) {
          const errorCode = (plaidErr as { response?: { data?: { error_code?: string } } })
            ?.response?.data?.error_code;
          if (errorCode === 'CURSOR_TOO_OLD') {
            console.warn(`Stale cursor detected for item ${item.item_id}. Resetting cursor.`);
            cursor = undefined;
            await supabase
              .from('plaid_items')
              .update({ next_cursor: null })
              .eq('item_id', item.item_id)
              .eq('user_id', item.user_id);

            syncRes = await plaidClient.transactionsSync({
              access_token: accessToken,
              cursor: undefined,
              count: 100,
            });
          } else {
            throw plaidErr;
          }
        }

        const data = syncRes.data;
        const added = data.added;
        const modified = data.modified;
        const removed = data.removed;
        hasMore = data.has_more;
        cursor = data.next_cursor;

        const pendingIdsToDrop: string[] = [];
        const toUpsert = [...added, ...modified].map((tx) => {
          const classified = classifyPlaidTransaction(tx);
          const pendingParentId =
            !tx.pending && tx.pending_transaction_id ? tx.pending_transaction_id : null;
          if (pendingParentId) pendingIdsToDrop.push(pendingParentId);

          return {
            user_id: item.user_id,
            plaid_transaction_id: tx.transaction_id,
            account_id: tx.account_id,
            name: tx.name,
            merchant_name: tx.merchant_name || null,
            amount: tx.amount,
            date: tx.date,
            category: toCategoryString(tx),
            pending: tx.pending,
            pending_transaction_id: pendingParentId,
            is_internal_transfer: classified.is_internal_transfer,
            transaction_intent: classified.transaction_intent,
          };
        });

        if (toUpsert.length > 0) {
          const { error: txError } = await supabase
            .from('transactions')
            .upsert(toUpsert, { onConflict: 'plaid_transaction_id' });
          if (txError) console.error('Error upserting transactions:', txError);
        }

        if (pendingIdsToDrop.length > 0) {
          await supabase
            .from('transactions')
            .delete()
            .in('plaid_transaction_id', pendingIdsToDrop)
            .eq('user_id', item.user_id)
            .eq('pending', true);
        }

        if (removed.length > 0) {
          const removedIds = removed.map((r) => r.transaction_id);
          await supabase
            .from('transactions')
            .delete()
            .in('plaid_transaction_id', removedIds)
            .eq('user_id', item.user_id);
        }

        totalAdded += added.length;
        totalModified += modified.length;
        totalRemoved += removed.length;

        await supabase
          .from('plaid_items')
          .update({
            next_cursor: cursor,
            updated_at: new Date().toISOString(),
          })
          .eq('item_id', item.item_id)
          .eq('user_id', item.user_id);
      }

      try {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - 30);
        const formatYYYYMMDD = (d: Date) => d.toISOString().split('T')[0];

        const invRes = await plaidClient.investmentsTransactionsGet({
          access_token: accessToken,
          start_date: formatYYYYMMDD(startDate),
          end_date: formatYYYYMMDD(endDate),
        });

        const invTransactions = invRes.data.investment_transactions;
        if (invTransactions.length > 0) {
          const toUpsertInv = invTransactions.map((tx) => ({
            user_id: item.user_id,
            plaid_investment_transaction_id: tx.investment_transaction_id,
            account_id: tx.account_id,
            security_id: tx.security_id || null,
            name: tx.name,
            amount: tx.amount,
            price: tx.price || null,
            quantity: tx.quantity || null,
            date: tx.date,
            type: tx.type,
            subtype: tx.subtype,
          }));

          const { error: invError } = await supabase
            .from('investment_transactions')
            .upsert(toUpsertInv, { onConflict: 'plaid_investment_transaction_id' });

          if (!invError) totalInvestmentsAdded += invTransactions.length;
        }
      } catch {
        // Institution doesn't support investments
      }

      await supabase
        .from('plaid_items')
        .update({
          next_cursor: cursor,
          updated_at: new Date().toISOString(),
        })
        .eq('item_id', item.item_id)
        .eq('user_id', item.user_id);
    } catch (itemErr: unknown) {
      const err = itemErr as {
        response?: { data?: { error_message?: string } };
        message?: string;
      };
      const errorMsg =
        err?.response?.data?.error_message || err.message || 'Unknown item sync error';
      console.error(`Error syncing item ${item.item_id}:`, errorMsg);
      errors.push(`Item ${item.item_id}: ${errorMsg}`);
    }
  }

  try {
    const { data: pendingRows } = await supabase
      .from('transactions')
      .select('id, account_id, date, amount, name')
      .eq('user_id', userId)
      .eq('pending', true)
      .limit(200);

    for (const pending of pendingRows || []) {
      const { data: twin } = await supabase
        .from('transactions')
        .select('id')
        .eq('user_id', userId)
        .eq('pending', false)
        .eq('account_id', pending.account_id)
        .eq('date', pending.date)
        .eq('amount', pending.amount)
        .neq('id', pending.id)
        .limit(1)
        .maybeSingle();
      if (twin) {
        await supabase.from('transactions').delete().eq('id', pending.id).eq('user_id', userId);
      }
    }
  } catch (cleanupErr: unknown) {
    console.warn(
      '[Plaid Sync] Pending twin cleanup skipped:',
      cleanupErr instanceof Error ? cleanupErr.message : cleanupErr
    );
  }

  let orphansDeleted = 0;
  try {
    const { data: liveAccounts } = await supabase
      .from('financial_accounts')
      .select('plaid_account_id')
      .eq('user_id', userId);

    const liveIds = (liveAccounts || [])
      .map((a) => a.plaid_account_id)
      .filter(Boolean) as string[];

    if (liveIds.length > 0) {
      const liveSet = new Set(liveIds);
      const { data: accountIdSample } = await supabase
        .from('transactions')
        .select('account_id')
        .eq('user_id', userId)
        .limit(2000);

      const orphanAccountIds = [
        ...new Set(
          (accountIdSample || [])
            .map((r) => r.account_id)
            .filter((id): id is string => typeof id === 'string' && id.length > 0 && !liveSet.has(id))
        ),
      ];

      for (const orphanAccountId of orphanAccountIds) {
        const { data: deleted, error: orphanErr } = await supabase
          .from('transactions')
          .delete()
          .eq('user_id', userId)
          .eq('account_id', orphanAccountId)
          .select('id');
        if (orphanErr) {
          console.warn('[Plaid Sync] Orphan cleanup error:', orphanErr.message);
          continue;
        }
        orphansDeleted += deleted?.length || 0;
      }
    }
  } catch (orphanCleanupErr: unknown) {
    console.warn(
      '[Plaid Sync] Orphan account cleanup skipped:',
      orphanCleanupErr instanceof Error ? orphanCleanupErr.message : orphanCleanupErr
    );
  }

  return {
    user_id: userId,
    items: items.length,
    added: totalAdded,
    modified: totalModified,
    removed: totalRemoved,
    investments_added: totalInvestmentsAdded,
    orphans_deleted: orphansDeleted,
    sync_errors: errors,
  };
}
