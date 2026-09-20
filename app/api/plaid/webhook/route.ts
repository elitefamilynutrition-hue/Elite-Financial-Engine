import { NextResponse } from 'next/server';
import { plaidClient } from '@/lib/plaid';
import { getServiceSupabase } from '@/lib/supabase';
import { decryptToken } from '@/lib/crypto';

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    const { webhook_type, webhook_code, item_id } = payload;

    console.log(`[Plaid Webhook] Ingested: type=${webhook_type}, code=${webhook_code}, item_id=${item_id}`);

    // We specifically listen for transactions sync events
    if (webhook_type === 'TRANSACTIONS' && (webhook_code === 'SYNC_UPDATES_AVAILABLE' || webhook_code === 'DEFAULT_UPDATE')) {
      const supabase = getServiceSupabase();

      // 1. Fetch item credentials
      const { data: item, error: itemError } = await supabase
        .from('plaid_items')
        .select('*')
        .eq('item_id', item_id)
        .single();

      if (itemError || !item) {
        console.warn(`[Plaid Webhook] Item not found: ${item_id}`);
        return NextResponse.json({ message: 'Item not registered' }, { status: 404 });
      }

      const accessToken = decryptToken(item.access_token);
      let cursor = item.next_cursor || undefined;
      let hasMore = true;

      // 2. Refresh balances
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
      } catch (balErr: any) {
        console.warn(`[Plaid Webhook] Balance update failed:`, balErr.message);
      }

      // 3. Process transaction delta stream
      while (hasMore) {
        const syncRes = await plaidClient.transactionsSync({
          access_token: accessToken,
          cursor: cursor,
          count: 100,
        });

        const data = syncRes.data;
        hasMore = data.has_more;
        cursor = data.next_cursor;

        const toUpsert = [...data.added, ...data.modified].map((tx) => ({
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
          await supabase
            .from('transactions')
            .upsert(toUpsert, { onConflict: 'plaid_transaction_id' });
        }

        if (data.removed.length > 0) {
          const removedIds = data.removed.map((r) => r.transaction_id);
          await supabase
            .from('transactions')
            .delete()
            .in('plaid_transaction_id', removedIds);
        }
      }

      // 4. Update cursor
      await supabase
        .from('plaid_items')
        .update({
          next_cursor: cursor,
          updated_at: new Date().toISOString(),
        })
        .eq('item_id', item_id);

      console.log(`[Plaid Webhook] Sync complete for item: ${item_id}`);
    }

    // Always acknowledge Plaid with 200 OK immediately
    return NextResponse.json({ status: 'ACKNOWLEDGED' });
  } catch (err: any) {
    console.error('[Plaid Webhook Error]:', err.message || err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}