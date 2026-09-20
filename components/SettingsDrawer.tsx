'use client';

import React, { useState, useEffect } from 'react';
import PaystubDropzone from '@/components/PayStubDropzone';

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export default function SettingsDrawer({ isOpen, onClose, onSaved }: SettingsDrawerProps) {
  const [activeTab, setActiveTab] = useState<'profile' | 'paystub'>('profile');
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Profile Form State
  const [profile, setProfile] = useState({
    current_age: 35,
    target_retirement_age: 55,
    annual_gross_salary: 140000,
    annual_bonus_target: 0,
    target_emergency_months: 6,
    marginal_tax_bracket: 24,
  });

  // Paystub Form State
  const [paystub, setPaystub] = useState({
    pay_period_start: new Date().toISOString().split('T')[0],
    pay_period_end: new Date().toISOString().split('T')[0],
    pay_date: new Date().toISOString().split('T')[0],
    gross_pay: 5904.17,
    net_pay: 3982.40,
    federal_tax_withheld: 780.50,
    state_tax_withheld: 150.25,
    fica_medicare_tax: 451.67,
    pre_tax_401k: 354.25,
    post_tax_roth_401k: 0.00,
    employer_401k_match: 118.08,
    hsa_contribution: 85.00,
    healthcare_premiums: 182.02,
  });

  useEffect(() => {
    if (isOpen) {
      fetch('/api/profile')
        .then((res) => res.json())
        .then((data) => {
          if (data.profile) {
            setProfile({
              current_age: data.profile.current_age,
              target_retirement_age: data.profile.target_retirement_age,
              annual_gross_salary: Number(data.profile.annual_gross_salary),
              annual_bonus_target: Number(data.profile.annual_bonus_target || 0),
              target_emergency_months: data.profile.target_emergency_months,
              marginal_tax_bracket: Number(data.profile.marginal_tax_bracket || 24),
            });
          }
        })
        .catch(console.error);
    }
  }, [isOpen]);

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatusMsg(null);
    try {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      });
      const data = await res.json();
      if (data.status === 'SUCCESS') {
        setStatusMsg('Profile benchmarks updated successfully.');
        onSaved();
      } else {
        setStatusMsg(data.error || 'Failed to save profile.');
      }
    } catch (err: any) {
      setStatusMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePaystubSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatusMsg(null);
    try {
      const res = await fetch('/api/telemetry/paystub', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(paystub),
      });
      const data = await res.json();
      if (data.status === 'SUCCESS') {
        setStatusMsg('Paystub telemetry recorded successfully.');
        onSaved();
      } else {
        setStatusMsg(data.error || 'Failed to record paystub.');
      }
    } catch (err: any) {
      setStatusMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-zinc-900 border-l border-zinc-800 p-6 flex flex-col justify-between overflow-y-auto">
        <div className="space-y-6">
          <div className="flex justify-between items-center border-b border-zinc-800 pb-4">
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">Telemetry Configuration</h2>
              <p className="text-xs text-zinc-400">Manage profile targets & upstream paystubs</p>
            </div>
            <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 font-mono text-sm">Close</button>
          </div>

          {/* Tabs */}
          <div className="grid grid-cols-2 gap-2 bg-zinc-950 p-1 rounded-lg border border-zinc-800">
            <button
              onClick={() => { setActiveTab('profile'); setStatusMsg(null); }}
              className={`py-2 text-xs font-semibold rounded-md transition ${
                activeTab === 'profile' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Profile & Retirement
            </button>
            <button
              onClick={() => { setActiveTab('paystub'); setStatusMsg(null); }}
              className={`py-2 text-xs font-semibold rounded-md transition ${
                activeTab === 'paystub' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Log Paystub
            </button>
          </div>

          {statusMsg && (
            <div className="p-3 bg-zinc-800 border border-zinc-700 text-xs rounded text-emerald-400">
              {statusMsg}
            </div>
          )}

          {/* Profile Form */}
          {activeTab === 'profile' && (
            <form onSubmit={handleProfileSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-zinc-400 mb-1">Current Age</label>
                  <input
                    type="number"
                    value={profile.current_age}
                    onChange={(e) => setProfile({ ...profile, current_age: Number(e.target.value) })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-100"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1">Target Retirement Age</label>
                  <input
                    type="number"
                    value={profile.target_retirement_age}
                    onChange={(e) => setProfile({ ...profile, target_retirement_age: Number(e.target.value) })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Annual Gross Salary ($)</label>
                <input
                  type="number"
                  value={profile.annual_gross_salary}
                  onChange={(e) => setProfile({ ...profile, annual_gross_salary: Number(e.target.value) })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-zinc-400 mb-1">Target Emergency Months</label>
                  <input
                    type="number"
                    value={profile.target_emergency_months}
                    onChange={(e) => setProfile({ ...profile, target_emergency_months: Number(e.target.value) })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-100"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1">Marginal Tax Bracket (%)</label>
                  <input
                    type="number"
                    value={profile.marginal_tax_bracket}
                    onChange={(e) => setProfile({ ...profile, marginal_tax_bracket: Number(e.target.value) })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-100"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-indigo-600 hover:bg-indigo-500 py-2.5 rounded font-semibold text-white transition disabled:opacity-50 mt-4"
              >
                {loading ? 'Saving Profile...' : 'Save Profile Benchmarks'}
              </button>
            </form>
          )}

          {/* Paystub Form */}
          {activeTab === 'paystub' && (
            <div className="mt-4">
              <PaystubDropzone onUploadSuccess={() => {
                setStatusMsg('Paystub extracted and recorded successfully.');
                onSaved();
              }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}