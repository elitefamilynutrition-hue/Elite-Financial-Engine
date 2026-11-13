import { getServiceSupabase } from '@/lib/supabase-admin';

/**
 * One loader for everything the analytics need, always scoped to a single
 * tenant. Every service-role read in the app should come through here or be
 * filtered by `user_id` at the call site — never fetched unscoped.
 */

export interface FinancialAccount {
  id: string;
  user_id: string;
  plaid_account_id: string;
  account_name: string;
  custom_name: string | null;
  account_type: string;
  account_subtype: string | null;
  current_balance: number | string | null;
  available_balance: number | string | null;
  currency_code: string | null;
}

export interface ManualAccount {
  id: string;
  user_id: string;
  account_name: string;
  institution_name: string | null;
  current_balance: number | string | null;
  interest_rate: number | string | null;
  minimum_payment: number | string | null;
}

export interface TransactionRow {
  id: string;
  user_id: string | null;
  account_id: string;
  plaid_transaction_id: string;
  name: string | null;
  merchant_name: string | null;
  amount: number | string | null;
  date: string | null;
  category: string | null;
  pending: boolean | null;
  transaction_intent: string | null;
  is_internal_transfer: boolean | null;
}

export interface FinancialProfile {
  user_id: string;
  current_age: number | null;
  target_retirement_age: number | null;
  annual_gross_salary: number | string | null;
  annual_bonus_target: number | string | null;
  target_emergency_months: number | string | null;
  marginal_tax_bracket: number | string | null;
  relationship_status: string | null;
  [key: string]: unknown;
}

export interface PaystubRecord {
  id: string;
  user_id: string;
  pay_date: string;
  pay_period_start: string | null;
  pay_period_end: string | null;
  gross_pay: number | string | null;
  net_pay: number | string | null;
  pre_tax_401k: number | string | null;
  post_tax_roth_401k: number | string | null;
  hsa_contribution: number | string | null;
  healthcare_premiums: number | string | null;
  other_deductions: number | string | null;
  federal_tax_withheld: number | string | null;
  state_tax_withheld: number | string | null;
  fica_medicare_tax: number | string | null;
}

export interface UserFinancials {
  accounts: FinancialAccount[];
  manualAccounts: ManualAccount[];
  transactions: TransactionRow[];
  sinkingFunds: { target_amount: number | string | null; recurring_schedule: string | null }[];
  profile: FinancialProfile | null;
  latestPaystub: PaystubRecord | null;
}

export const TRANSACTION_LOOKBACK_DAYS = 180;

/**
 * Loads the tenant's balance sheet plus the trailing transaction window.
 * `transactions` is read in a paginated loop so a long history cannot blow up
 * a single response.
 */
export async function loadUserFinancials(userId: string): Promise<UserFinancials> {
  if (!userId) {
    throw new Error('loadUserFinancials requires a userId.');
  }

  const supabase = getServiceSupabase();

  const since = new Date();
  since.setDate(since.getDate() - TRANSACTION_LOOKBACK_DAYS);
  const sinceIso = since.toISOString().split('T')[0];

  const [accountsRes, manualRes, sinkingRes, profileRes, paystubRes] = await Promise.all([
    supabase.from('financial_accounts').select('*').eq('user_id', userId),
    supabase.from('manual_accounts').select('*').eq('user_id', userId),
    supabase.from('sinking_funds').select('target_amount, recurring_schedule').eq('user_id', userId),
    supabase.from('user_financial_profiles').select('*').eq('user_id', userId).maybeSingle(),
    supabase
      .from('paystub_records')
      .select('*')
      .eq('user_id', userId)
      .order('pay_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const accounts = (accountsRes.data || []) as FinancialAccount[];
  const accountIds = accounts.map((account) => account.plaid_account_id).filter(Boolean);

  const transactions = accountIds.length > 0 ? await fetchTransactions(userId, accountIds, sinceIso) : [];

  return {
    accounts,
    manualAccounts: (manualRes.data || []) as ManualAccount[],
    transactions,
    sinkingFunds: sinkingRes.data || [],
    profile: (profileRes.data as FinancialProfile | null) ?? null,
    latestPaystub: (paystubRes.data as PaystubRecord | null) ?? null,
  };
}

/**
 * Fetches transactions scoped by `user_id` when the column exists, and by the
 * tenant's Plaid account ids as a belt-and-braces fallback for older rows that
 * were written before `user_id` was added.
 */
async function fetchTransactions(
  userId: string,
  accountIds: string[],
  sinceIso: string
): Promise<TransactionRow[]> {
  const supabase = getServiceSupabase();
  const pageSize = 1000;
  const rows: TransactionRow[] = [];

  for (let page = 0; page < 20; page += 1) {
    const from = page * pageSize;
    const to = from + pageSize - 1;

    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .in('account_id', accountIds)
      .gte('date', sinceIso)
      .order('date', { ascending: false })
      .range(from, to);

    if (error) throw error;
    if (!data || data.length === 0) break;

    rows.push(...(data as TransactionRow[]));
    if (data.length < pageSize) break;
  }

  // Defensive: drop anything that somehow belongs to another tenant.
  return rows.filter((row) => !row.user_id || row.user_id === userId);
}

export function accountById(accounts: FinancialAccount[]): Map<string, FinancialAccount> {
  return new Map(accounts.map((account) => [account.plaid_account_id, account]));
}
