/**
 * Net-worth helpers that honor exclude_from_net_worth (UGMA / non-operational).
 */

export interface NwAccount {
  account_type?: string | null;
  current_balance?: number | string | null;
  exclude_from_net_worth?: boolean | null;
}

export function isExcludedFromNetWorth(account: NwAccount): boolean {
  return Boolean(account.exclude_from_net_worth);
}

/** Accounts that count toward NW / snapshots / Command Center totals. */
export function operationalAccounts<T extends NwAccount>(accounts: T[]): T[] {
  return accounts.filter((a) => !isExcludedFromNetWorth(a));
}

export function sumByType(
  accounts: NwAccount[],
  predicate: (type: string) => boolean
): number {
  return operationalAccounts(accounts)
    .filter((a) => predicate((a.account_type || '').toLowerCase()))
    .reduce((sum, a) => sum + Number(a.current_balance || 0), 0);
}

export function computeLiveNetWorth(accounts: NwAccount[]): {
  liquidCapital: number;
  investmentCapital: number;
  revolvingDebt: number;
  netWorth: number;
} {
  const liquidCapital = sumByType(accounts, (t) => t === 'depository');
  const investmentCapital = sumByType(
    accounts,
    (t) => t === 'investment' || t === 'brokerage'
  );
  const revolvingDebt = sumByType(accounts, (t) => t === 'credit' || t === 'loan');
  return {
    liquidCapital,
    investmentCapital,
    revolvingDebt,
    netWorth: liquidCapital + investmentCapital - revolvingDebt,
  };
}
