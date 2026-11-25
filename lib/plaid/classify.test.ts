import { describe, expect, it } from 'vitest';
import type { Transaction } from 'plaid';
import { classifyPlaidTransaction, toCategoryString } from '@/lib/plaid/classify';

function fakeTx(partial: Partial<Transaction> & { name: string }): Transaction {
  return {
    account_id: 'acc',
    amount: 25,
    iso_currency_code: 'USD',
    unofficial_currency_code: null,
    category: null,
    category_id: null,
    check_number: null,
    date: '2026-01-15',
    datetime: null,
    authorized_date: null,
    authorized_datetime: null,
    location: {} as Transaction['location'],
    name: partial.name,
    merchant_name: partial.merchant_name ?? null,
    payment_meta: {} as Transaction['payment_meta'],
    payment_channel: 'online',
    pending: false,
    pending_transaction_id: null,
    account_owner: null,
    transaction_id: 'tx1',
    transaction_code: null,
    transaction_type: 'place',
    personal_finance_category: partial.personal_finance_category ?? null,
    ...partial,
  } as Transaction;
}

describe('classifyPlaidTransaction', () => {
  it('marks account transfers as transfer', () => {
    const result = classifyPlaidTransaction(
      fakeTx({
        name: 'Transfer to Savings',
        personal_finance_category: {
          primary: 'TRANSFER_OUT',
          detailed: 'TRANSFER_OUT_ACCOUNT_TRANSFER',
          confidence_level: 'VERY_HIGH',
        },
      })
    );
    expect(result.is_internal_transfer).toBe(true);
    expect(result.transaction_intent).toBe('transfer');
  });

  it('does not treat Chase-branded spend as a transfer', () => {
    const result = classifyPlaidTransaction(
      fakeTx({
        name: 'Chase Sapphire Dining',
        merchant_name: 'Local Bistro',
        personal_finance_category: {
          primary: 'FOOD_AND_DRINK',
          detailed: 'FOOD_AND_DRINK_RESTAURANT',
          confidence_level: 'HIGH',
        },
      })
    );
    expect(result.is_internal_transfer).toBe(false);
    expect(result.transaction_intent).not.toBe('transfer');
  });
});

describe('toCategoryString', () => {
  it('prefers PFC detailed when present', () => {
    expect(
      toCategoryString(
        fakeTx({
          name: 'Groceries',
          personal_finance_category: {
            primary: 'FOOD_AND_DRINK',
            detailed: 'FOOD_AND_DRINK_GROCERIES',
            confidence_level: 'VERY_HIGH',
          },
        })
      )
    ).toBe('FOOD_AND_DRINK_GROCERIES');
  });
});
