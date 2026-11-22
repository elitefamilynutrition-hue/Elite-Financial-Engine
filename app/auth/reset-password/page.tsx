'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createBrowserSupabaseClient } from '@/lib/supabase-browser';

/**
 * Landing page for Supabase password-recovery links.
 * Operator must allow this URL in Supabase Auth → Redirect URLs.
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const client = createBrowserSupabaseClient();

    const prepare = async () => {
      const { data: { session } } = await client.auth.getSession();
      if (session) {
        if (!cancelled) setReady(true);
        return;
      }

      // Hash tokens from email link (implicit recovery flow)
      const hash = typeof window !== 'undefined' ? window.location.hash.replace(/^#/, '') : '';
      if (hash) {
        const params = new URLSearchParams(hash);
        const access_token = params.get('access_token');
        const refresh_token = params.get('refresh_token');
        if (access_token && refresh_token) {
          const { error: setErr } = await client.auth.setSession({ access_token, refresh_token });
          if (!cancelled) {
            if (setErr) setError(setErr.message);
            else setReady(true);
          }
          return;
        }
      }

      if (!cancelled) {
        setError('This reset link is invalid or expired. Request a new one from Sign In.');
      }
    };

    void prepare();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    const client = createBrowserSupabaseClient();
    const { error: updateError } = await client.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setMessage('Password updated. Redirecting…');
    router.push('/');
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black p-4">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-xl p-8 space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-zinc-100">Set new password</h1>
          <p className="text-sm text-zinc-400">Elite Capital Engine</p>
        </div>

        {!ready && !error && (
          <p className="text-sm text-zinc-500 text-center">Validating reset link…</p>
        )}

        {error && <p className="text-sm text-rose-400">{error}</p>}
        {message && <p className="text-sm text-emerald-400">{message}</p>}

        {ready && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                New password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-zinc-100 focus:outline-none focus:border-indigo-500"
                placeholder="••••••••"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                Confirm password
              </label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-zinc-100 focus:outline-none focus:border-indigo-500"
                placeholder="••••••••"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? 'Saving…' : 'Update password'}
            </button>
          </form>
        )}

        <p className="text-center text-xs text-zinc-500">
          <Link href="/login" className="hover:text-zinc-300 underline-offset-2 hover:underline">
            Back to Sign In
          </Link>
        </p>
      </div>
    </div>
  );
}
