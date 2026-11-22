'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createBrowserSupabaseClient } from '@/lib/supabase-browser';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [mode, setMode] = useState<'auth' | 'forgot'>('auth');
  const router = useRouter();

  const supabase = createBrowserSupabaseClient();

  const expectedInvite = (process.env.NEXT_PUBLIC_INVITE_CODE || '').trim();

  function resetRedirectTo() {
    const base = (process.env.NEXT_PUBLIC_APP_URL || window.location.origin).replace(/\/$/, '');
    return `${base}/auth/reset-password`;
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setMessage(error.message);
      setLoading(false);
    } else {
      router.push('/');
      router.refresh();
    }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    if (!expectedInvite) {
      setMessage('Sign-up is disabled: NEXT_PUBLIC_INVITE_CODE is not configured.');
      setLoading(false);
      return;
    }

    if (inviteCode.trim() !== expectedInvite) {
      setMessage('Invalid or missing invite code.');
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      setMessage(error.message);
    } else {
      setMessage('Check your email for the confirmation link.');
    }
    setLoading(false);
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    if (!email.trim()) {
      setMessage('Enter your email to receive a reset link.');
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: resetRedirectTo(),
    });

    if (error) {
      setMessage(error.message);
    } else {
      setMessage('Check your email for the password reset link.');
    }
    setLoading(false);
  }

  const successMessage =
    message &&
    (message.includes('Check') || message.includes('reset link') || message.includes('confirmation'));

  return (
    <div className="min-h-screen flex items-center justify-center bg-black p-4">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-xl p-8 space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-zinc-100">Elite Capital Engine</h1>
          <p className="text-sm text-zinc-400">
            {mode === 'forgot' ? 'Reset password' : 'Restricted Access'}
          </p>
        </div>

        {mode === 'auth' ? (
          <form className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-zinc-100 focus:outline-none focus:border-indigo-500"
                placeholder="operator@domain.com"
                autoComplete="email"
              />
            </div>
            <div>
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setMode('forgot');
                    setMessage(null);
                  }}
                  className="text-[11px] text-indigo-400 hover:text-indigo-300"
                >
                  Forgot password?
                </button>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-zinc-100 focus:outline-none focus:border-indigo-500"
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                Invite code <span className="text-zinc-600 normal-case">(required for Sign Up)</span>
              </label>
              <input
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-zinc-100 focus:outline-none focus:border-indigo-500"
                placeholder="Invite code"
                autoComplete="off"
              />
            </div>

            {message && (
              <p className={`text-sm ${successMessage ? 'text-emerald-400' : 'text-rose-400'}`}>
                {message}
              </p>
            )}

            <div className="flex gap-4 pt-4">
              <button
                onClick={handleLogin}
                disabled={loading}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 rounded-lg transition-colors disabled:opacity-50"
              >
                {loading ? 'Authenticating...' : 'Sign In'}
              </button>
              <button
                onClick={handleSignUp}
                disabled={loading}
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-medium py-3 rounded-lg transition-colors disabled:opacity-50"
              >
                Sign Up
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleForgotPassword} className="space-y-4">
            <p className="text-sm text-zinc-400 leading-relaxed">
              Enter the email for your account. We&apos;ll send a link to set a new password.
            </p>
            <div>
              <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-zinc-100 focus:outline-none focus:border-indigo-500"
                placeholder="operator@domain.com"
                autoComplete="email"
                required
              />
            </div>

            {message && (
              <p className={`text-sm ${successMessage ? 'text-emerald-400' : 'text-rose-400'}`}>
                {message}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('auth');
                setMessage(null);
              }}
              className="w-full text-sm text-zinc-400 hover:text-zinc-200 py-2"
            >
              Back to Sign In
            </button>
          </form>
        )}

        <p className="text-center text-xs text-zinc-500">
          <Link href="/about" className="hover:text-zinc-300 underline-offset-2 hover:underline">
            About
          </Link>
          {' · '}
          <Link href="/privacy" className="hover:text-zinc-300 underline-offset-2 hover:underline">
            Privacy
          </Link>
          {' · '}
          <Link href="/terms" className="hover:text-zinc-300 underline-offset-2 hover:underline">
            Terms
          </Link>
        </p>
      </div>
    </div>
  );
}
