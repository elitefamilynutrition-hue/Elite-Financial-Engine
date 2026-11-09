import { NextResponse, NextRequest } from 'next/server';
import { plaidClient } from '@/lib/plaid';
import { getServiceSupabase } from '@/lib/supabase-admin';
import { decryptToken } from '@/lib/crypto';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export async function POST(request: NextRequest) {
  try {
    const supabaseAuth = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getServiceSupabase();
    
    // Check if user requested a full cursor reset to catch missed ledger entries
    const searchParams = request.nextUrl.searchParams;
    const forceReset = searchParams.get('reset') === 'true';

    if (forceReset) {
      console.warn(`[Plaid Sync] Force reset requested by user ${user.id}. Clearing all cursors.`);
      await supabase
        .from('plaid_items')
        .update({ next_cursor: null })
        .eq('user_id', user.id);
    }

    // 1. Fetch all linked items strictly for this user
    const { data: items, error: itemError } = await supabase
      .from('plaid_items')
      .select('*')
      .eq('user_id', user.id);

    if (itemError) throw itemError;
    if (!items || items.length === 0) {
      return NextResponse.json({ status: 'SUCCESS', message: 'No linked items found to sync.' });
    }

    let totalAdded = 0;
    let totalModified = 0;
    let totalRemoved = 0;
    let totalInvestmentsAdded = 0;
    const errors: string[] = [];

    for (const item of items) {
      try {
        // Fail closed — never hand raw/ciphertext DB values to Plaid as a token.
        const accessToken = decryptToken(item.access_token);

        // If forceReset is true, treat cursor as undefined
        let cursor = forceReset ? undefined : (item.next_cursor || undefined);
        let hasMore = true;

        // Update real-time account balances
        try {
          const accRes = await plaidClient.accountsGet({ access_token: accessToken });
          
          const activeAccountIds = accRes.data.accounts.map((acc) => acc.account_id);
          const accountNames = accRes.data.accounts.map((acc) => acc.name);

          // Prune stale account records if Plaid rotated account IDs during re-auth
          if (accountNames.length > 0) {
            await supabase
              .from('financial_accounts')
              .delete()
              .eq('user_id', item.user_id)
              .in('account_name', accountNames)
              .not('plaid_account_id', 'in', `(${activeAccountIds.map((id) => `"${id}"`).join(',')})`);
          }

          const accountsPayload = accRes.data.accounts.map((acc) => ({
            user_id: item.user_id, // Crucial: Bind to tenant user ID
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
        } catch (err: any) {
          console.error(`Fatal balance refresh error for item ${item.item_id}:`, err.message);
        }

        // Delta sync normal transactions with CURSOR_TOO_OLD auto-recovery
        while (hasMore) {
          let syncRes;
          try {
            syncRes = await plaidClient.transactionsSync({
              access_token: accessToken,
              cursor: cursor,
              count: 100,
            });
          } catch (plaidErr: any) {
            const errorCode = plaidErr?.response?.data?.error_code;
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

          const toUpsert = [...added, ...modified].map((tx) => {
            const catString = tx.category ? tx.category.join(', ') : '';
            const nameLower = (tx.name || '').toLowerCase();
            const catLower = catString.toLowerCase();

            // Auto-detect internal transfers and credit card payments to protect Survival Floor
             // Update your transfer detection rules:
            const isTransfer = catLower.includes('payment') || 
                               catLower.includes('transfer') || 
                               catLower.includes('service') ||
                               nameLower.includes('payment') || 
                               nameLower.includes('autopay') || 
                               nameLower.includes('ach deposit') ||
                               nameLower.includes('chase') || 
                               nameLower.includes('citi') || 
                               nameLower.includes('american express');

            return {
              user_id: item.user_id,
              plaid_transaction_id: tx.transaction_id,
              account_id: tx.account_id,
              name: tx.name,
              merchant_name: tx.merchant_name || null,
              amount: tx.amount,
              date: tx.date,
              category: catString || null,
              pending: tx.pending,
              is_internal_transfer: isTransfer,
              transaction_intent: isTransfer ? 'transfer' : null,
            };
          });

          if (toUpsert.length > 0) {
            const { error: txError } = await supabase
              .from('transactions')
              .upsert(toUpsert, { onConflict: 'plaid_transaction_id' });
            if (txError) console.error('Error upserting transactions:', txError);
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
        }

        // Sync Investment Transactions (Trailing 30 Days)
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
              
            if (!invError) {
              totalInvestmentsAdded += invTransactions.length;
            }
          }
        } catch {
          // Institution doesn't support investments
        }

        // Persist cursor (tenant-scoped, matches webhook)
        await supabase
          .from('plaid_items')
          .update({
            next_cursor: cursor,
            updated_at: new Date().toISOString(),
          })
          .eq('item_id', item.item_id)
          .eq('user_id', item.user_id);

      } catch (itemErr: any) {
        const errorMsg = itemErr?.response?.data?.error_message || itemErr.message || 'Unknown item sync error';
        console.error(`Error syncing item ${item.item_id}:`, errorMsg);
        errors.push(`Item ${item.item_id}: ${errorMsg}`);
      }
    }

    return NextResponse.json({
      status: 'SUCCESS',
      added: totalAdded,
      modified: totalModified,
      removed: totalRemoved,
      investments_added: totalInvestmentsAdded,
      sync_errors: errors.length > 0 ? errors : undefined
    });
  } catch (error: any) {
    console.error('Fatal Transaction Sync Error:', error?.response?.data || error.message || error);
    return NextResponse.json(
      { error: error?.response?.data?.error_message || error.message || 'Sync failed.' },
      { status: 500 }
    );
  }
}