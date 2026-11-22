'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import PaystubDropzone from '@/components/PayStubDropzone';
import { supabase } from '@/lib/supabase';
import { calculateMarginalTaxBracket } from '@/components/DayZeroIntake';

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export default function SettingsDrawer({ isOpen, onClose, onSaved }: SettingsDrawerProps) {
  const [activeTab, setActiveTab] = useState<'architecture' | 'funds' | 'paystub' | 'legal'>('architecture');
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [latestPayDate, setLatestPayDate] = useState<string | null>(null);

  // Master Forensic State
  const [profile, setProfile] = useState({
    current_age: 35,
    target_retirement_age: 55,
    annual_gross_salary: 140000,
    annual_bonus_target: 0,
    target_emergency_months: 6,
    safe_withdrawal_rate: 4.0,
    expected_inflation_rate: 3.0,
    relationship_status: 'Single',
    dependents_count: 0,
    employment_type: 'W-2',
    housing_status: 'Rent',
    state_of_residence: 'AZ',
    health_plan_type: 'Unknown',
    traditional_ira_balance: 0,
    term_life_coverage: 0,
    living_trust_established: false,
    rsu_vesting_flag: false,
    mega_backdoor_eligible: false,
    real_estate_tax_loophole_flag: false,
    nqdc_participation_flag: false,
    child_investment_accounts: false,
    financial_kryptonite: '',
  });

  // Sinking Funds State
  type SinkingFund = {
    id?: string;
    fund_name: string;
    target_amount: number | string;
    due_date?: string | null;
    recurring_schedule: string;
    isNew?: boolean;
  };
  const [sinkingFunds, setSinkingFunds] = useState<SinkingFund[]>([]);

  const fetchProfileData = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) return;

      // 1. Fetch Profile
      const { data: profileData } = await supabase
        .from('user_financial_profiles')
        .select('*')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (profileData) {
        setProfile({
          current_age: profileData.current_age || 35,
          target_retirement_age: profileData.target_retirement_age || 55,
          annual_gross_salary: Number(profileData.annual_gross_salary || 0),
          annual_bonus_target: Number(profileData.annual_bonus_target || 0),
          target_emergency_months: profileData.target_emergency_months || 6,
          safe_withdrawal_rate: Number(profileData.safe_withdrawal_rate || 4.0),
          expected_inflation_rate: Number(profileData.expected_inflation_rate || 3.0),
          relationship_status: profileData.relationship_status || 'Single',
          dependents_count: profileData.dependents_count || 0,
          employment_type: profileData.employment_type || 'W-2',
          housing_status: profileData.housing_status || 'Rent',
          state_of_residence: profileData.state_of_residence || 'AZ',
          health_plan_type: profileData.health_plan_type || 'Unknown',
          traditional_ira_balance: Number(profileData.traditional_ira_balance || 0),
          term_life_coverage: Number(profileData.term_life_coverage || 0),
          living_trust_established: profileData.living_trust_established || false,
          rsu_vesting_flag: profileData.rsu_vesting_flag || false,
          mega_backdoor_eligible: profileData.mega_backdoor_eligible || false,
          real_estate_tax_loophole_flag: profileData.real_estate_tax_loophole_flag || false,
          nqdc_participation_flag: profileData.nqdc_participation_flag || false,
          child_investment_accounts: profileData.child_investment_accounts || false,
          financial_kryptonite: profileData.financial_kryptonite || '',
        });
      }

      // 2. Fetch Sinking Funds
      const { data: fundsData } = await supabase
        .from('sinking_funds')
        .select('*')
        .eq('user_id', session.user.id);

      if (fundsData) setSinkingFunds(fundsData as SinkingFund[]);
    } catch (error) {
      console.error('Failed to fetch settings data:', error);
    }
  }, []);

  const checkPaystubCompliance = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) return;

      const { data: latestStub } = await supabase
        .from('paystub_records')
        .select('pay_date')
        .eq('user_id', session.user.id)
        .order('pay_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestStub?.pay_date) {
        setLatestPayDate(latestStub.pay_date);
      }
    } catch (err) {
      console.error('Failed to check paystub compliance:', err);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      void fetchProfileData();
      void checkPaystubCompliance();
    }
  }, [isOpen, fetchProfileData, checkPaystubCompliance]);

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatusMsg(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) throw new Error('No active session');

      const dynamicBracket = calculateMarginalTaxBracket(
        profile.annual_gross_salary,
        profile.annual_bonus_target,
        profile.relationship_status
      );

      const res = await fetch('/api/profile/recalculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...profile,
          marginal_tax_bracket: dynamicBracket,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Recalculate failed');

      setStatusMsg({
        text: `Architecture recalculated (Tax Bracket: ${dynamicBracket}%). Survival floor & wealth quota refreshed.`,
        type: 'success',
      });
      onSaved();
    } catch (err: unknown) {
      setStatusMsg({ text: err instanceof Error ? err.message : String(err), type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // Sinking Fund Handlers
  const addSinkingFund = () => {
    setSinkingFunds([...sinkingFunds, { fund_name: '', target_amount: '', due_date: '', recurring_schedule: 'Annual', isNew: true }]);
  };

  const updateSinkingFund = (index: number, field: string, value: string) => {
    const updated = [...sinkingFunds];
    updated[index] = { ...updated[index], [field]: value };
    setSinkingFunds(updated);
  };

  const deleteSinkingFund = async (index: number) => {
    const fund = sinkingFunds[index];
    try {
      if (fund.id) {
        const { error } = await supabase.from('sinking_funds').delete().eq('id', fund.id);
        if (error) throw error;
      }
      setSinkingFunds(sinkingFunds.filter((_, i) => i !== index));
      setStatusMsg({ text: 'Landmine removed.', type: 'success' });
      onSaved();
    } catch (err: unknown) {
      setStatusMsg({ text: err instanceof Error ? err.message : String(err), type: 'error' });
    }
  };

  const saveSinkingFunds = async () => {
    setLoading(true);
    setStatusMsg(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) return;

      const newFunds = sinkingFunds
        .filter((f) => f.fund_name && f.target_amount && f.due_date && f.isNew)
        .map((f) => ({
          user_id: session.user.id,
          fund_name: f.fund_name,
          target_amount: typeof f.target_amount === 'string' ? parseFloat(f.target_amount) : f.target_amount,
          due_date: f.due_date,
          recurring_schedule: f.recurring_schedule,
        }));

      const existingFunds = sinkingFunds
        .filter((f) => f.fund_name && f.target_amount && f.due_date && !f.isNew)
        .map((f) => ({
          id: f.id,
          user_id: session.user.id,
          fund_name: f.fund_name,
          target_amount: typeof f.target_amount === 'string' ? parseFloat(f.target_amount) : f.target_amount,
          due_date: f.due_date,
          recurring_schedule: f.recurring_schedule,
        }));

      if (newFunds.length > 0) {
        const { error } = await supabase.from('sinking_funds').insert(newFunds);
        if (error) throw error;
      }

      if (existingFunds.length > 0) {
        const { error } = await supabase.from('sinking_funds').upsert(existingFunds);
        if (error) throw error;
      }

      setStatusMsg({ text: 'Landmine matrix updated successfully.', type: 'success' });
      void fetchProfileData();
      onSaved();
    } catch (err: unknown) {
      setStatusMsg({ text: err instanceof Error ? err.message : String(err), type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const isPaystubStale = () => {
    if (!latestPayDate) return true;
    const lastDate = new Date(latestPayDate).getTime();
    const now = new Date().getTime();
    const diffDays = (now - lastDate) / (1000 * 60 * 60 * 24);
    return diffDays > 35;
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-zinc-900 border-l border-zinc-800 p-6 flex flex-col justify-between overflow-y-auto">
        <div className="space-y-6">
          <div className="flex justify-between items-center border-b border-zinc-800 pb-4">
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">System Configuration</h2>
              <p className="text-xs text-zinc-400">Recalculate your financial architecture</p>
            </div>
            <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 font-mono text-sm">Close</button>
          </div>

          {/* Dynamic Tabs */}
          <div className="grid grid-cols-4 gap-1 bg-zinc-950 p-1 rounded-lg border border-zinc-800">
            <button
              onClick={() => { setActiveTab('architecture'); setStatusMsg(null); }}
              className={`py-2 text-xs font-semibold rounded-md transition ${activeTab === 'architecture' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              Architecture
            </button>
            <button
              onClick={() => { setActiveTab('funds'); setStatusMsg(null); }}
              className={`py-2 text-xs font-semibold rounded-md transition ${activeTab === 'funds' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              Landmines
            </button>
            <button
              onClick={() => { setActiveTab('paystub'); setStatusMsg(null); }}
              className={`py-2 text-xs font-semibold rounded-md transition ${activeTab === 'paystub' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              Paystub OCR
            </button>
            <button
              onClick={() => { setActiveTab('legal'); setStatusMsg(null); }}
              className={`py-2 text-xs font-semibold rounded-md transition ${activeTab === 'legal' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              Legal
            </button>
          </div>

          {statusMsg && (
            <div className={`p-3 border text-xs rounded ${statusMsg.type === 'success' ? 'bg-emerald-900/20 border-emerald-800 text-emerald-400' : 'bg-rose-900/20 border-rose-800 text-rose-400'}`}>
              {statusMsg.text}
            </div>
          )}

          {/* TAB 1: ARCHITECTURE */}
          {activeTab === 'architecture' && (
            <form onSubmit={handleProfileSubmit} className="space-y-5 text-sm animate-in fade-in duration-300">
              <div className="space-y-3">
                <h3 className="text-xs font-mono uppercase text-indigo-400">Demographics & Targets</h3>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-zinc-500 mb-1 text-xs">Age</label>
                    <input type="number" value={profile.current_age} onChange={(e) => setProfile({ ...profile, current_age: Number(e.target.value) })} className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-100 text-xs" />
                  </div>
                  <div>
                    <label className="block text-zinc-500 mb-1 text-xs">Retire Age</label>
                    <input type="number" value={profile.target_retirement_age} onChange={(e) => setProfile({ ...profile, target_retirement_age: Number(e.target.value) })} className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-100 text-xs" />
                  </div>
                  <div>
                    <label className="block text-zinc-500 mb-1 text-xs">State</label>
                    <input type="text" maxLength={2} value={profile.state_of_residence} onChange={(e) => setProfile({ ...profile, state_of_residence: e.target.value.toUpperCase() })} className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-100 text-xs" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-zinc-500 mb-1 text-xs">Filing Status</label>
                    <select value={profile.relationship_status} onChange={(e) => setProfile({ ...profile, relationship_status: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-100 text-xs">
                      <option value="Single">Single</option>
                      <option value="Married Filing Jointly">Married (Joint)</option>
                      <option value="Married Filing Separately">Married (Separate)</option>
                      <option value="Head of Household">Head of Household</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-zinc-500 mb-1 text-xs">Dependents</label>
                    <input type="number" value={profile.dependents_count} onChange={(e) => setProfile({ ...profile, dependents_count: Number(e.target.value) })} className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-100 text-xs" />
                  </div>
                </div>
              </div>

              <div className="space-y-3 pt-3 border-t border-zinc-800">
                <h3 className="text-xs font-mono uppercase text-indigo-400">Income & FI/RE Baselines</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-zinc-500 mb-1 text-xs">Base Salary ($)</label>
                    <input type="number" value={profile.annual_gross_salary} onChange={(e) => setProfile({ ...profile, annual_gross_salary: Number(e.target.value) })} className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-100 text-xs" />
                  </div>
                  <div>
                    <label className="block text-zinc-500 mb-1 text-xs">Bonus Target ($)</label>
                    <input type="number" value={profile.annual_bonus_target} onChange={(e) => setProfile({ ...profile, annual_bonus_target: Number(e.target.value) })} className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-100 text-xs" />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-zinc-500 mb-1 text-xs">Emergency (Mo)</label>
                    <select value={profile.target_emergency_months} onChange={(e) => setProfile({ ...profile, target_emergency_months: Number(e.target.value) })} className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-100 text-xs">
                      <option value={3}>3 Mo</option>
                      <option value={6}>6 Mo</option>
                      <option value={9}>9 Mo</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-zinc-500 mb-1 text-xs">SWR (%)</label>
                    <input type="number" step="0.1" value={profile.safe_withdrawal_rate} onChange={(e) => setProfile({ ...profile, safe_withdrawal_rate: Number(e.target.value) })} className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-100 text-xs" />
                  </div>
                  <div>
                    <label className="block text-zinc-500 mb-1 text-xs">CPI (%)</label>
                    <input type="number" step="0.1" value={profile.expected_inflation_rate} onChange={(e) => setProfile({ ...profile, expected_inflation_rate: Number(e.target.value) })} className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-100 text-xs" />
                  </div>
                </div>
              </div>

              <div className="space-y-3 pt-3 border-t border-zinc-800">
                <h3 className="text-xs font-mono uppercase text-amber-400">Estate, Risk & The Vault</h3>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="block text-zinc-500 mb-1 text-xs">Term Life ($)</label>
                    <input type="number" value={profile.term_life_coverage} onChange={(e) => setProfile({ ...profile, term_life_coverage: Number(e.target.value) })} className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-100 text-xs" />
                  </div>
                  <div>
                    <label className="block text-zinc-500 mb-1 text-xs">Trad. IRA Balance ($)</label>
                    <input type="number" value={profile.traditional_ira_balance} onChange={(e) => setProfile({ ...profile, traditional_ira_balance: Number(e.target.value) })} className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-100 text-xs" />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="flex items-center justify-between p-2 bg-zinc-950 border border-zinc-800 rounded cursor-pointer">
                    <span className="text-xs text-zinc-300">Living Trust Established</span>
                    <input type="checkbox" checked={profile.living_trust_established} onChange={e => setProfile({ ...profile, living_trust_established: e.target.checked })} className="w-4 h-4 accent-amber-500" />
                  </label>
                  <label className="flex items-center justify-between p-2 bg-zinc-950 border border-zinc-800 rounded cursor-pointer">
                    <span className="text-xs text-zinc-300">Corporate RSU Vesting</span>
                    <input type="checkbox" checked={profile.rsu_vesting_flag} onChange={e => setProfile({ ...profile, rsu_vesting_flag: e.target.checked })} className="w-4 h-4 accent-indigo-500" />
                  </label>
                  <label className="flex items-center justify-between p-2 bg-zinc-950 border border-zinc-800 rounded cursor-pointer">
                    <span className="text-xs text-zinc-300">Mega-Backdoor Roth Eligible</span>
                    <input type="checkbox" checked={profile.mega_backdoor_eligible} onChange={e => setProfile({ ...profile, mega_backdoor_eligible: e.target.checked })} className="w-4 h-4 accent-indigo-500" />
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-zinc-500 mb-1 text-xs">Financial Kryptonite</label>
                <input type="text" value={profile.financial_kryptonite} onChange={(e) => setProfile({ ...profile, financial_kryptonite: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-100 text-xs" placeholder="e.g. Dining out, car parts..." />
              </div>

              <button type="submit" disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-500 py-3 rounded font-semibold text-white transition disabled:opacity-50 mt-4 text-xs">
                {loading ? 'Recalculating...' : 'Recalculate Architecture'}
              </button>
            </form>
          )}

          {/* TAB 2: SINKING FUNDS */}
          {activeTab === 'funds' && (
            <div className="space-y-4 animate-in fade-in duration-300">
              <p className="text-xs text-zinc-400">Manage non-monthly liabilities (e.g., vehicle registrations, insurance) to pad your Survival Floor.</p>
              
              <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
                {sinkingFunds.map((fund, index) => (
                  <div key={index} className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg space-y-2 relative group">
                    <button onClick={() => deleteSinkingFund(index)} className="absolute top-2 right-2 text-zinc-500 hover:text-rose-400 transition">✕</button>
                    <input type="text" value={fund.fund_name} onChange={e => updateSinkingFund(index, 'fund_name', e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 rounded p-1.5 text-white text-xs pr-6" placeholder="Fund Name" />
                    <div className="grid grid-cols-3 gap-2">
                    <input type="number" value={fund.target_amount} onChange={e => updateSinkingFund(index, 'target_amount', e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 rounded p-1.5 text-white text-xs" placeholder="Amount ($)" />
                    <input type="date" value={(fund.due_date ?? '').split('T')[0]} onChange={e => updateSinkingFund(index, 'due_date', e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 rounded p-1.5 text-white text-xs [color-scheme:dark]" />
                      <select value={fund.recurring_schedule} onChange={e => updateSinkingFund(index, 'recurring_schedule', e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 rounded p-1.5 text-white text-xs">
                        <option>Annual</option>
                        <option>Semi-Annual</option>
                        <option>Quarterly</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>

              <button onClick={addSinkingFund} className="w-full py-2 border border-dashed border-zinc-700 text-zinc-400 hover:text-indigo-400 rounded transition-colors text-xs font-semibold">
                + Add Landmine
              </button>

              <button onClick={saveSinkingFunds} disabled={loading} className="w-full bg-emerald-600 hover:bg-emerald-500 py-3 rounded font-semibold text-white transition disabled:opacity-50 mt-4 text-sm">
                {loading ? 'Saving...' : 'Update Landmine Matrix'}
              </button>
            </div>
          )}

          {/* TAB 3: PAYSTUB OCR */}
          {activeTab === 'paystub' && (
            <div className="space-y-4 animate-in fade-in duration-300">
              <div className={`p-3 rounded-lg border text-xs flex justify-between items-center ${
                !isPaystubStale()
                  ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
                  : 'bg-amber-950/40 border-amber-800 text-amber-300'
              }`}>
                <div>
                  <p className="font-semibold">{!isPaystubStale() ? 'Telemetry Active' : 'Monthly Paystub Overdue'}</p>
                  <p className="text-[10px] opacity-80 mt-0.5">
                    {latestPayDate ? `Last verified pay date: ${latestPayDate}` : 'No paystubs recorded yet.'}
                  </p>
                </div>
                <span className={`w-2.5 h-2.5 rounded-full ${!isPaystubStale() ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
              </div>

              <PaystubDropzone onUploadSuccess={() => {
                setStatusMsg({ text: 'Paystub extracted and tax shields synchronized.', type: 'success' });
                checkPaystubCompliance();
                onSaved();
              }} />
            </div>
          )}

          {activeTab === 'legal' && (
            <div className="space-y-4 text-sm animate-in fade-in duration-300">
              <div className="p-3 rounded-lg border border-amber-900/50 bg-amber-950/20 text-amber-200/90 text-xs leading-relaxed">
                Elite Capital Engine is educational telemetry only — not financial, tax, legal, or
                investment advice. AI outputs can be wrong. Verify before you act. Policies below are
                working stubs and have not been reviewed by counsel.
              </div>
              <ul className="space-y-2 text-zinc-300">
                <li>
                  <Link href="/about" onClick={onClose} className="text-indigo-400 hover:text-indigo-300">
                    About Elite Capital Engine
                  </Link>
                </li>
                <li>
                  <Link href="/privacy" onClick={onClose} className="text-indigo-400 hover:text-indigo-300">
                    Privacy
                  </Link>
                </li>
                <li>
                  <Link href="/terms" onClick={onClose} className="text-indigo-400 hover:text-indigo-300">
                    Terms of use (incl. subscription / EULA-style terms)
                  </Link>
                </li>
              </ul>
              <p className="text-[11px] text-zinc-500 leading-relaxed">
                Subscription: 7-day trial, then $20/month via Stripe. Manage or cancel through Stripe
                customer receipts / portal when available.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
