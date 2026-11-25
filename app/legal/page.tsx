import Link from 'next/link';

export const metadata = {
  title: 'Legal — Elite Capital Engine',
  description: 'Legal hub for Elite Capital Engine',
};

/**
 * Public legal hub. Stub-level — not counsel-reviewed.
 */
export default function LegalHubPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-200 p-8">
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wider text-zinc-500">Elite Capital Engine</p>
          <h1 className="text-3xl font-bold text-white">Legal</h1>
          <p className="text-sm text-amber-400/90">
            Working stubs — not counsel-reviewed. Not financial, tax, legal, or investment advice.
          </p>
        </div>

        <ul className="space-y-3 text-sm">
          <li className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
            <Link href="/about" className="text-lg font-semibold text-indigo-400 hover:text-indigo-300">
              About
            </Link>
            <p className="text-zinc-400 mt-1">What ECE is, what it is not, and subscription overview.</p>
          </li>
          <li className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
            <Link href="/privacy" className="text-lg font-semibold text-indigo-400 hover:text-indigo-300">
              Privacy
            </Link>
            <p className="text-zinc-400 mt-1">Data we process, subprocessors, export and delete.</p>
          </li>
          <li className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
            <Link href="/terms" className="text-lg font-semibold text-indigo-400 hover:text-indigo-300">
              Terms of use
            </Link>
            <p className="text-zinc-400 mt-1">SaaS terms, billing, and EULA-style license language.</p>
          </li>
          <li className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
            <Link href="/contact" className="text-lg font-semibold text-indigo-400 hover:text-indigo-300">
              Contact
            </Link>
            <p className="text-zinc-400 mt-1">Beta support and privacy questions.</p>
          </li>
        </ul>

        <p className="text-sm">
          <Link href="/" className="text-indigo-400 hover:text-indigo-300">
            ← Back to app
          </Link>
        </p>
      </div>
    </main>
  );
}
