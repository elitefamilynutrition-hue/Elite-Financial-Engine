'use client';

import { useState } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase-browser';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();
  
  // Initialize the SSR-compatible browser client
  const supabase = createBrowserSupabaseClient();

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

  return (
    <div className="min-h-screen flex items-center justify-center bg-black p-4">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-xl p-8 space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-zinc-100">BudgetDog Engine</h1>
          <p className="text-sm text-zinc-400">Restricted Access</p>
        </div>

        <form className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-zinc-100 focus:outline-none focus:border-indigo-500"
              placeholder="operator@domain.com"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-zinc-100 focus:outline-none focus:border-indigo-500"
              placeholder="••••••••"
            />
          </div>

          {message && (
            <p className={`text-sm ${message.includes('Check') ? 'text-emerald-400' : 'text-rose-400'}`}>
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
      </div>
    </div>
  );
}