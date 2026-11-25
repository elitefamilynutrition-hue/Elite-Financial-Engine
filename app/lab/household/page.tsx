'use client';

import { useCallback, useEffect, useState } from 'react';

type Membership = {
  role: string;
  joined_at: string;
  household_id: string;
  households:
    | { id: string; name: string; invite_code: string; created_at: string }
    | { id: string; name: string; invite_code: string; created_at: string }[]
    | null;
};

function houseOf(m: Membership) {
  const h = m.households;
  return Array.isArray(h) ? h[0] : h;
}

export default function LabHouseholdPage() {
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [name, setName] = useState('');
  const [invite, setInvite] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    const res = await fetch('/api/household');
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(data.error || `Load failed (${res.status})`);
      return;
    }
    setMemberships(data.memberships || []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const res = await fetch('/api/household', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Create failed');
      setMsg(`Created “${data.household?.name}”. Invite: ${data.household?.invite_code}`);
      setName('');
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setBusy(false);
    }
  };

  const join = async () => {
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const res = await fetch('/api/household', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invite_code: invite }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Join failed');
      setMsg(`Joined “${data.household?.name}”.`);
      setInvite('');
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Join failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 max-w-xl">
      <div className="space-y-2">
        <p className="text-[10px] uppercase tracking-wider text-amber-500">Lab · Household</p>
        <h1 className="text-2xl font-bold text-white">Household tenancy</h1>
        <p className="text-sm text-zinc-400 leading-relaxed">
          Opt-in shared household. Sellable default stays personal until you join one. Apply
          migration <code className="text-zinc-300">20261126000000_households.sql</code> in Supabase
          before using.
        </p>
      </div>

      {err && (
        <p className="text-sm text-rose-400" role="alert">
          {err}
        </p>
      )}
      {msg && <p className="text-sm text-emerald-400">{msg}</p>}

      <section className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
        <h2 className="text-sm font-semibold">Your households</h2>
        {memberships.length === 0 ? (
          <p className="text-xs text-zinc-500">None yet.</p>
        ) : (
          <ul className="space-y-2 text-sm text-zinc-300">
            {memberships.map((m) => {
              const h = houseOf(m);
              return (
                <li key={m.household_id} className="border-b border-zinc-800 pb-2">
                  <span className="font-medium text-white">{h?.name || m.household_id}</span>
                  <span className="text-zinc-500"> · {m.role}</span>
                  {h?.invite_code && (
                    <p className="text-xs text-zinc-500 font-mono">invite: {h.invite_code}</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <label className="block text-xs text-zinc-400">
          Create household
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 text-sm"
            placeholder="Family capital"
          />
        </label>
        <button
          type="button"
          disabled={busy || !name.trim()}
          onClick={create}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold py-2 px-4 rounded-lg text-sm"
        >
          Create
        </button>
      </section>

      <section className="space-y-3">
        <label className="block text-xs text-zinc-400">
          Join with invite code
          <input
            value={invite}
            onChange={(e) => setInvite(e.target.value)}
            className="mt-1 w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 text-sm font-mono"
            placeholder="a1b2c3d4"
          />
        </label>
        <button
          type="button"
          disabled={busy || !invite.trim()}
          onClick={join}
          className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-100 font-semibold py-2 px-4 rounded-lg text-sm"
        >
          Join
        </button>
      </section>
    </div>
  );
}
