import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { canAccessLab, isLabEnabled } from '@/lib/auth/admin';
import { isLabMfaEnforced } from '@/lib/auth/mfa';

/**
 * Operator Lab shell — ENABLE_LAB + ADMIN_EMAILS only.
 * Non-admins see 404 (do not advertise Lab existence).
 */
export default async function LabLayout({ children }: { children: React.ReactNode }) {
  if (!isLabEnabled()) {
    notFound();
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  if (!canAccessLab(user)) {
    notFound();
  }

  const mfaNote = isLabMfaEnforced()
    ? ' MFA enforcement is on for Lab APIs — enroll/verify under MFA if you hit 403.'
    : '';

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-amber-900/40 bg-amber-950/20 px-6 py-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-amber-500/90">Operator Lab</p>
          <p className="text-sm text-amber-100/90">
            Private tooling — not part of the sellable Elite Capital Engine product.
            {mfaNote}
          </p>
        </div>
        <nav className="flex flex-wrap gap-3 text-xs">
          <Link href="/lab" className="text-amber-300 hover:text-amber-200">
            Lab home
          </Link>
          <Link href="/lab/god-mode" className="text-amber-300 hover:text-amber-200">
            GOD MODE
          </Link>
          <Link href="/lab/rag-tax" className="text-amber-300 hover:text-amber-200">
            RAG tax
          </Link>
          <Link href="/lab/household" className="text-amber-300 hover:text-amber-200">
            Household
          </Link>
          <Link href="/lab/security" className="text-amber-300 hover:text-amber-200">
            MFA
          </Link>
          <Link href="/" className="text-zinc-400 hover:text-zinc-200">
            ← Dashboard
          </Link>
        </nav>
      </header>
      <div className="p-6 max-w-5xl mx-auto">{children}</div>
    </div>
  );
}
