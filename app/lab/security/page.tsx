'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase-browser';

/**
 * Supabase TOTP enroll / verify for operator accounts.
 * Operator must enable MFA in Supabase Auth dashboard first.
 */
export default function LabSecurityPage() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [factors, setFactors] = useState<{ id: string; friendly_name?: string; status: string }[]>(
    []
  );
  const [aal, setAal] = useState<string | null>(null);
  const [enrollId, setEnrollId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setError(null);
    const { data: factorsData, error: listErr } = await supabase.auth.mfa.listFactors();
    if (listErr) {
      setError(listErr.message);
      return;
    }
    setFactors(
      (factorsData?.totp || []).map((f) => ({
        id: f.id,
        friendly_name: f.friendly_name,
        status: f.status,
      }))
    );
    const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    setAal(aalData?.currentLevel || null);
  }, [supabase]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const startEnroll = async () => {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const { data, error: enrollErr } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'ECE Lab TOTP',
      });
      if (enrollErr) throw enrollErr;
      setEnrollId(data.id);
      setQr(data.totp.qr_code);
      setSecret(data.totp.secret);
      setStatus('Scan the QR in your authenticator app, then enter a code to verify.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Enroll failed');
    } finally {
      setBusy(false);
    }
  };

  const verifyEnroll = async () => {
    if (!enrollId || !code.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const challenge = await supabase.auth.mfa.challenge({ factorId: enrollId });
      if (challenge.error) throw challenge.error;
      const verified = await supabase.auth.mfa.verify({
        factorId: enrollId,
        challengeId: challenge.data.id,
        code: code.trim(),
      });
      if (verified.error) throw verified.error;
      setStatus('TOTP verified. You are at AAL2 for this session.');
      setEnrollId(null);
      setQr(null);
      setSecret(null);
      setCode('');
      await refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Verify failed');
    } finally {
      setBusy(false);
    }
  };

  const challengeExisting = async (factorId: string) => {
    if (!code.trim()) {
      setError('Enter the 6-digit code first.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const challenge = await supabase.auth.mfa.challenge({ factorId });
      if (challenge.error) throw challenge.error;
      const verified = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.data.id,
        code: code.trim(),
      });
      if (verified.error) throw verified.error;
      setStatus('Challenge passed — session elevated to AAL2.');
      setCode('');
      await refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Challenge failed');
    } finally {
      setBusy(false);
    }
  };

  const unenroll = async (factorId: string) => {
    setBusy(true);
    setError(null);
    try {
      const { error: unErr } = await supabase.auth.mfa.unenroll({ factorId });
      if (unErr) throw unErr;
      setStatus('Factor removed.');
      await refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unenroll failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 max-w-lg">
      <div className="space-y-2">
        <p className="text-[10px] uppercase tracking-wider text-amber-500">Lab · Security</p>
        <h1 className="text-2xl font-bold text-white">MFA (TOTP)</h1>
        <p className="text-sm text-zinc-400 leading-relaxed">
          Enable Multi-Factor Authentication in the Supabase dashboard (Authentication → Providers /
          MFA) before enrolling. Set <code className="text-zinc-300">ENFORCE_MFA_FOR_LAB=true</code>{' '}
          to require AAL2 on Lab API routes once a verified factor exists.
        </p>
        <p className="text-xs text-zinc-500">
          Current assurance level: <span className="text-zinc-300">{aal || 'unknown'}</span>
        </p>
      </div>

      {error && (
        <p className="text-sm text-rose-400" role="alert">
          {error}
        </p>
      )}
      {status && <p className="text-sm text-emerald-400">{status}</p>}

      <section className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
        <h2 className="text-sm font-semibold text-zinc-200">Enrolled factors</h2>
        {factors.length === 0 ? (
          <p className="text-xs text-zinc-500">No TOTP factors yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {factors.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-2 justify-between">
                <span className="text-zinc-300">
                  {f.friendly_name || f.id.slice(0, 8)}{' '}
                  <span className="text-zinc-500">({f.status})</span>
                </span>
                <span className="flex gap-2">
                  {f.status === 'verified' && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => challengeExisting(f.id)}
                      className="text-xs bg-zinc-800 hover:bg-zinc-700 px-2 py-1 rounded"
                    >
                      Challenge
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => unenroll(f.id)}
                    className="text-xs text-rose-300 hover:text-rose-200"
                  >
                    Remove
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="space-y-3">
        <label className="block text-xs text-zinc-400">
          Authenticator code
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="mt-1 w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-100"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
          />
        </label>

        {!enrollId ? (
          <button
            type="button"
            disabled={busy}
            onClick={startEnroll}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold py-2 px-4 rounded-lg text-sm"
          >
            {busy ? 'Working…' : 'Start TOTP enroll'}
          </button>
        ) : (
          <div className="space-y-3">
            {qr && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt="TOTP QR code" className="bg-white p-2 rounded-md w-48 h-48" />
            )}
            {secret && (
              <p className="text-xs text-zinc-500 break-all">
                Manual secret: <span className="font-mono text-zinc-300">{secret}</span>
              </p>
            )}
            <button
              type="button"
              disabled={busy || !code.trim()}
              onClick={verifyEnroll}
              className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold py-2 px-4 rounded-lg text-sm"
            >
              Verify enrollment
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
