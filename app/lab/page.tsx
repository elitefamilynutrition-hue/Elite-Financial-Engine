import Link from 'next/link';

export const metadata = {
  title: 'Operator Lab — Elite Capital Engine',
};

export default function LabHomePage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-white">Operator Lab</h1>
        <p className="text-sm text-zinc-400 leading-relaxed max-w-2xl">
          Admin-only surface for experiments while dogfooding. Keep{' '}
          <code className="text-zinc-300">ENABLE_LAB=false</code> (or unset) on public production
          invites so Lab 404s even for admins if you want fail-closed.
        </p>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2 text-sm">
        <li className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 space-y-1">
          <Link href="/lab/god-mode" className="font-semibold text-indigo-400 hover:text-indigo-300">
            GOD MODE
          </Link>
          <p className="text-zinc-500">Educational market/analysis sandbox — not advice, no trading.</p>
        </li>
        <li className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 space-y-1">
          <Link href="/lab/rag-tax" className="font-semibold text-indigo-400 hover:text-indigo-300">
            RAG tax
          </Link>
          <p className="text-zinc-500">Retrieve from a small controlled doc set with citations.</p>
        </li>
        <li className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 space-y-1">
          <Link href="/lab/household" className="font-semibold text-indigo-400 hover:text-indigo-300">
            Household
          </Link>
          <p className="text-zinc-500">Create/join household and list members (schema-backed).</p>
        </li>
        <li className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 space-y-1">
          <Link href="/lab/security" className="font-semibold text-indigo-400 hover:text-indigo-300">
            MFA
          </Link>
          <p className="text-zinc-500">Enroll or verify TOTP for this account.</p>
        </li>
      </ul>
    </div>
  );
}
