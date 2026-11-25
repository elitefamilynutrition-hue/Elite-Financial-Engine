'use client';

import { useState, useEffect, useMemo } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase-browser';

interface ManualAccount {
  id: string;
  account_name: string;
  institution_name: string;
  current_balance: number;
  interest_rate: number;
  minimum_payment: number;
  updated_at: string;
}

export function ManualLiabilityCard() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [accounts, setAccounts] = useState<ManualAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<ManualAccount | null>(null);
  
  // Add Liability Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newAccount, setNewAccount] = useState({
    account_name: '',
    institution_name: '',
    current_balance: '',
    interest_rate: '',
    minimum_payment: ''
  });

  // Payment Modal State
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentType, setPaymentType] = useState<'standard' | 'principal'>('standard');
  const [paymentAmount, setPaymentAmount] = useState('');
  
  // Lump Sum Simulator State
  const [grossLumpSum, setGrossLumpSum] = useState('');

  // Schedule Modal State
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [scheduleData, setScheduleData] = useState<Array<{ date: string; interest: number; principal: number; balance: number }>>([]);

  const generateSchedule = (account: ManualAccount) => {
    let balance = calculateLiveBalance(account);
    const monthlyRate = (account.interest_rate / 100) / 12;
    const payment = account.minimum_payment;
    const schedule = [];
    
    let currentDate = new Date();

    if (balance * monthlyRate >= payment) return;

    while (balance > 0 && schedule.length < 120) {
      currentDate.setMonth(currentDate.getMonth() + 1);
      const interest = balance * monthlyRate;
      let principal = payment - interest;
      
      if (balance < principal) principal = balance;
      balance -= principal;
      
      schedule.push({
        date: currentDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        interest,
        principal,
        balance: Math.max(0, balance)
      });
    }
    setScheduleData(schedule);
    setIsScheduleModalOpen(true);
  };

  const fetchManualAccounts = async () => {
    const { data, error } = await supabase
      .from('manual_accounts')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (data) setAccounts(data);
    if (error) console.error('Error fetching manual accounts:', error);
  };

  useEffect(() => {
    void fetchManualAccounts();
  }, []);

  const handleAddAccount = async () => {
    if (!newAccount.account_name || !newAccount.current_balance || !newAccount.interest_rate) return;

    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      console.error('Unauthorized: No active user session found.');
      return;
    }

    const { error } = await supabase
      .from('manual_accounts')
      .insert({
        user_id: user.id,
        account_name: newAccount.account_name,
        institution_name: newAccount.institution_name,
        current_balance: Number(newAccount.current_balance),
        interest_rate: Number(newAccount.interest_rate),
        minimum_payment: Number(newAccount.minimum_payment)
      });

    if (error) {
      console.error('Failed to add liability:', error);
      return;
    }

    setIsAddModalOpen(false);
    setNewAccount({ account_name: '', institution_name: '', current_balance: '', interest_rate: '', minimum_payment: '' });
    fetchManualAccounts();
  };

  const calculateLiveBalance = (account: ManualAccount) => {
    const lastUpdate = new Date(account.updated_at).getTime();
    const now = new Date().getTime();
    const daysElapsed = Math.max(0, (now - lastUpdate) / (1000 * 3600 * 24));
    
    const dailyRate = (account.interest_rate / 100) / 365;
    const accruedInterest = account.current_balance * dailyRate * daysElapsed;
    
    return account.current_balance + accruedInterest;
  };

  const handleLogPayment = async () => {
    if (!selectedAccount || !paymentAmount) return;

    const amountNum = Number(paymentAmount);
    const liveBalance = calculateLiveBalance(selectedAccount);
    const newBalance = liveBalance - amountNum;

    const { error: updateError } = await supabase
      .from('manual_accounts')
      .update({ 
        current_balance: newBalance,
        updated_at: new Date().toISOString()
      })
      .eq('id', selectedAccount.id);

    if (updateError) {
      console.error('Failed to update balance:', updateError);
      return;
    }

    await supabase
      .from('manual_account_transactions')
      .insert({
        manual_account_id: selectedAccount.id,
        transaction_date: new Date().toISOString(),
        amount: amountNum,
        transaction_type: paymentType === 'principal' ? 'lump_sum_strike' : 'standard_payment'
      });

    setIsPaymentModalOpen(false);
    setPaymentAmount('');
    fetchManualAccounts();
  };

  return (
    <section className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold tracking-tight">Offline Liabilities</h2>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 font-semibold py-1.5 px-3 rounded-lg transition text-xs"
        >
          + Add Liability
        </button>
      </div>

      {accounts.length === 0 ? (
        <div className="border border-dashed border-zinc-800 rounded-xl p-8 text-center text-zinc-500">
          No offline liabilities tracked. Click &apos;+ Add Liability&apos; to build an amortization schedule.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {accounts.map((acc) => {
            const liveBalance = calculateLiveBalance(acc);
            const lumpSumValue = Number(grossLumpSum);
            const netLumpSum = lumpSumValue * (1 - 0.3215);
            const monthsSaved = lumpSumValue > 0 ? (netLumpSum / acc.minimum_payment) : 0;

            return (
              <div key={acc.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-6 shadow-md">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-xs font-mono uppercase tracking-wider text-rose-400">Fixed Liability</div>
                    <div className="font-bold text-xl text-white">{acc.account_name}</div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => generateSchedule(acc)}
                      className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 text-xs font-semibold py-1.5 px-3 rounded transition"
                    >
                      View Schedule
                    </button>
                    <button
                      onClick={() => { setSelectedAccount(acc); setIsPaymentModalOpen(true); }}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold py-1.5 px-3 rounded transition"
                    >
                      Log Payload
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 border-y border-zinc-800 py-4">
                  <div>
                    <div className="text-xs text-zinc-500 font-mono uppercase">Live Balance</div>
                    <div className="text-xl font-bold text-rose-400">
                      ${liveBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-500 font-mono uppercase">Interest Rate</div>
                    <div className="text-xl font-bold text-zinc-200">{acc.interest_rate.toFixed(2)}%</div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-500 font-mono uppercase">Min. Payment</div>
                    <div className="text-xl font-bold text-zinc-200">${acc.minimum_payment.toFixed(2)}</div>
                  </div>
                </div>

                <div className="space-y-3 bg-zinc-950 p-4 rounded-lg border border-zinc-800">
                  <div className="text-xs font-mono uppercase tracking-wider text-emerald-400">Lump Sum Payoff Simulator</div>
                  <div className="flex items-center gap-3">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-2 text-zinc-500">$</span>
                      <input
                        type="number"
                        placeholder="Gross Lump Sum Amount (Bonus, RSU, Gift)"
                        className="w-full bg-zinc-900 border border-zinc-700 rounded py-2 pl-7 pr-3 text-sm text-white focus:outline-none focus:border-indigo-500"
                        value={grossLumpSum}
                        onChange={(e) => setGrossLumpSum(e.target.value)}
                      />
                    </div>
                  </div>
                  {lumpSumValue > 0 && (
                    <div className="text-sm text-zinc-400 leading-relaxed">
                      Net cash after <span className="text-zinc-200 font-semibold">32.15% tax drag</span> is <span className="text-emerald-400 font-bold">${netLumpSum.toFixed(2)}</span>. Applying this strictly to principal destroys <span className="text-indigo-400 font-bold">{monthsSaved.toFixed(1)} months</span> of scheduled payments.
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Log Payment Modal */}
      {isPaymentModalOpen && selectedAccount && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 w-full max-w-md space-y-6 shadow-2xl">
            <div>
              <h3 className="text-xl font-bold text-white">Log Capital Deployment</h3>
              <p className="text-sm text-zinc-400">Target: {selectedAccount.account_name}</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-mono uppercase text-zinc-500 mb-1.5">Deployment Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setPaymentType('standard')}
                    className={`py-2 text-sm font-semibold rounded border ${paymentType === 'standard' ? 'bg-zinc-800 border-indigo-500 text-white' : 'bg-zinc-950 border-zinc-800 text-zinc-500 hover:border-zinc-600'}`}
                  >
                    Standard Payment
                  </button>
                  <button
                    onClick={() => setPaymentType('principal')}
                    className={`py-2 text-sm font-semibold rounded border ${paymentType === 'principal' ? 'bg-zinc-800 border-emerald-500 text-white' : 'bg-zinc-950 border-zinc-800 text-zinc-500 hover:border-zinc-600'}`}
                  >
                    Principal-Only Lump Sum
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono uppercase text-zinc-500 mb-1.5">Amount</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-zinc-500">$</span>
                  <input
                    type="number"
                    autoFocus
                    className="w-full bg-zinc-950 border border-zinc-700 rounded py-2 pl-7 pr-3 text-white focus:outline-none focus:border-indigo-500"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-2">
              <button
                onClick={() => setIsPaymentModalOpen(false)}
                className="px-4 py-2 text-sm font-semibold text-zinc-400 hover:text-white transition"
              >
                Cancel
              </button>
              <button
                onClick={handleLogPayment}
                disabled={!paymentAmount || Number(paymentAmount) <= 0}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-5 py-2 text-sm font-semibold rounded transition"
              >
                Execute
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Liability Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 w-full max-w-md space-y-6 shadow-2xl">
            <div>
              <h3 className="text-xl font-bold text-white">Track New Liability</h3>
              <p className="text-sm text-zinc-400">Enter the fixed loan parameters.</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-mono uppercase text-zinc-500 mb-1.5">Liability Name</label>
                <input
                  type="text"
                  placeholder="e.g., Auto loan / personal liability"
                  className="w-full bg-zinc-950 border border-zinc-700 rounded py-2 px-3 text-white focus:outline-none focus:border-indigo-500"
                  value={newAccount.account_name}
                  onChange={(e) => setNewAccount({ ...newAccount, account_name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-mono uppercase text-zinc-500 mb-1.5">Institution (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g., Bridgecrest"
                  className="w-full bg-zinc-950 border border-zinc-700 rounded py-2 px-3 text-white focus:outline-none focus:border-indigo-500"
                  value={newAccount.institution_name}
                  onChange={(e) => setNewAccount({ ...newAccount, institution_name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono uppercase text-zinc-500 mb-1.5">Current Balance</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-zinc-500">$</span>
                    <input
                      type="number"
                      className="w-full bg-zinc-950 border border-zinc-700 rounded py-2 pl-7 pr-3 text-white focus:outline-none focus:border-indigo-500"
                      value={newAccount.current_balance}
                      onChange={(e) => setNewAccount({ ...newAccount, current_balance: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-mono uppercase text-zinc-500 mb-1.5">Interest Rate (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="w-full bg-zinc-950 border border-zinc-700 rounded py-2 px-3 text-white focus:outline-none focus:border-indigo-500"
                    value={newAccount.interest_rate}
                    onChange={(e) => setNewAccount({ ...newAccount, interest_rate: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-mono uppercase text-zinc-500 mb-1.5">Minimum Monthly Payment</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-zinc-500">$</span>
                  <input
                    type="number"
                    className="w-full bg-zinc-950 border border-zinc-700 rounded py-2 pl-7 pr-3 text-white focus:outline-none focus:border-indigo-500"
                    value={newAccount.minimum_payment}
                    onChange={(e) => setNewAccount({ ...newAccount, minimum_payment: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-2">
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="px-4 py-2 text-sm font-semibold text-zinc-400 hover:text-white transition"
              >
                Cancel
              </button>
              <button
                onClick={handleAddAccount}
                disabled={!newAccount.account_name || !newAccount.current_balance}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-5 py-2 text-sm font-semibold rounded transition"
              >
                Save Liability
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Amortization Schedule Modal */}
      {isScheduleModalOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-xl font-bold text-white">Amortization Curve</h3>
                <p className="text-sm text-zinc-400">Projected payoff timeline based on standard minimums.</p>
              </div>
              <button
                onClick={() => setIsScheduleModalOpen(false)}
                className="text-zinc-500 hover:text-zinc-300 text-sm font-mono"
              >
                Close
              </button>
            </div>
            
            <div className="overflow-y-auto flex-1 bg-zinc-950 border border-zinc-800 rounded-lg">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-900 border-b border-zinc-800 text-zinc-400 uppercase text-xs sticky top-0">
                  <tr>
                    <th className="p-4">Date</th>
                    <th className="p-4 text-right">Principal</th>
                    <th className="p-4 text-right">Interest</th>
                    <th className="p-4 text-right">Remaining Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {scheduleData.map((row, i) => (
                    <tr key={i} className="hover:bg-zinc-800/40 transition">
                      <td className="p-4 font-mono text-zinc-300">{row.date}</td>
                      <td className="p-4 text-right text-emerald-400 font-mono">${row.principal.toFixed(2)}</td>
                      <td className="p-4 text-right text-rose-400 font-mono">${row.interest.toFixed(2)}</td>
                      <td className="p-4 text-right text-zinc-100 font-bold font-mono">${row.balance.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
