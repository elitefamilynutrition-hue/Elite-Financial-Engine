import { NextResponse } from 'next/server';
import { plaidClient } from '@/lib/plaid';
import { getServiceSupabase } from '@/lib/supabase';
import { decryptToken } from '@/lib/crypto';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export async function POST() {
  try {
    const supabaseAuth = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getServiceSupabase();

    // 1. Fetch all linked items strictly for this user
    const { data: items, error: itemError } = await supabase
      .from('plaid_items')
      .select('*')
      .eq('user_id', user.id);

    if (itemError) throw itemError;
    if (!items || items.length === 0) {
      return NextResponse.json({ message: 'No linked items found to sync.' });
    }

    let totalAdded = 0;
    let totalModified = 0;
    let totalRemoved = 0;

    for (const item of items) {
      // Decrypt token at runtime (handles unencrypted legacy tokens via fallback)
      const accessToken = decryptToken(item.access_token);
      let cursor = item.next_cursor || undefined;
      let hasMore = true;

      // Update real-time account balances
      try {
        const accRes = await plaidClient.accountsGet({ access_token: accessToken });
        const accountsPayload = accRes.data.accounts.map((acc) => ({
          plaid_account_id: acc.account_id,
          account_name: acc.name,
          account_type: acc.type,
          account_subtype: acc.subtype || null,
          current_balance: acc.balances.current || 0,
          available_balance: acc.balances.available || null,
          currency_code: acc.balances.iso_currency_code || 'USD',
          updated_at: new Date().toISOString(),
        }));

        await supabase
          .from('financial_accounts')
          .upsert(accountsPayload, { onConflict: 'plaid_account_id' });
      } catch (err: any) {
        console.warn(`Balance refresh skipped for item ${item.item_id}:`, err.message);
      }

      // Delta sync transactions
      while (hasMore) {
        const syncRes = await plaidClient.transactionsSync({
          access_token: accessToken,
          cursor: cursor,
          count: 100,
        });

        const data = syncRes.data;
        const added = data.added;
        const modified = data.modified;
        const removed = data.removed;

        hasMore = data.has_more;
        cursor = data.next_cursor;

        // Upsert added/modified transactions
        const toUpsert = [...added, ...modified].map((tx) => ({
          plaid_transaction_id: tx.transaction_id,
          account_id: tx.account_id,
          name: tx.name,
          merchant_name: tx.merchant_name || null,
          amount: tx.amount,
          date: tx.date,
          category: tx.category ? tx.category.join(', ') : null,
          pending: tx.pending,
        }));

        if (toUpsert.length > 0) {
          const { error: txError } = await supabase
            .from('transactions')
            .upsert(toUpsert, { onConflict: 'plaid_transaction_id' });
          if (txError) console.error('Error upserting transactions:', txError);
        }

        // Handle removals
        if (removed.length > 0) {
          const removedIds = removed.map((r) => r.transaction_id);
          await supabase
            .from('transactions')
            .delete()
            .in('plaid_transaction_id', removedIds);
        }

        totalAdded += added.length;
        totalModified += modified.length;
        totalRemoved += removed.length;
      }

      // Persist cursor
      await supabase
        .from('plaid_items')
        .update({
          next_cursor: cursor,
          updated_at: new Date().toISOString(),
        })
        .eq('item_id', item.item_id);
    }

    return NextResponse.json({
      status: 'SUCCESS',
      added: totalAdded,
      modified: totalModified,
      removed: totalRemoved,
    });
  } catch (error: any) {
    console.error('Transaction Sync Error:', error?.response?.data || error.message || error);
    return NextResponse.json(
      { error: error?.response?.data?.error_message || error.message || 'Sync failed.' },
      { status: 500 }
    );
  }
}