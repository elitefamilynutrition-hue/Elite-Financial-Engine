import { plaidClient } from '@/lib/plaid';
import { getServiceSupabase } from '@/lib/supabase-admin';

/** How far back to pull investment transactions on each sync. */
const INVESTMENT_LOOKBACK_DAYS = 30;

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Upserts the trailing window of investment transactions for one Plaid item.
 *
 * Institutions that don't support the Investments product throw — that is
 * expected and is reported as `null` rather than as a failure.
 */
export async function syncInvestmentTransactions({
  accessToken,
  userId,
  itemId,
}: {
  accessToken: string;
  userId: string;
  itemId: string;
}): Promise<number | null> {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - INVESTMENT_LOOKBACK_DAYS);

  let response;
  try {
    response = await plaidClient.investmentsTransactionsGet({
      access_token: accessToken,
      start_date: formatDate(startDate),
      end_date: formatDate(endDate),
    });
  } catch {
    return null;
  }

  const transactions = response.data.investment_transactions;
  if (transactions.length === 0) return 0;

  const payload = transactions.map((tx) => ({
    user_id: userId,
    plaid_item_id: itemId,
    plaid_investment_transaction_id: tx.investment_transaction_id,
    account_id: tx.account_id,
    security_id: tx.security_id || null,
    name: tx.name,
    amount: tx.amount,
    price: tx.price ?? null,
    quantity: tx.quantity ?? null,
    date: tx.date,
    type: tx.type,
    subtype: tx.subtype || null,
  }));

  const supabase = getServiceSupabase();
  const { error } = await supabase
    .from('investment_transactions')
    .upsert(payload, { onConflict: 'plaid_investment_transaction_id' });

  if (error) throw error;

  return transactions.length;
}
