import Link from 'next/link';

export const metadata = {
  title: 'Contact — Elite Capital Engine',
  description: 'Contact Elite Capital Engine beta support',
};

const CONTACT_EMAIL =
  process.env.NEXT_PUBLIC_CONTACT_EMAIL || 'solito.emanuele@gmail.com';

/**
 * Public contact page. Mailto only — no form storage of PII.
 */
export default function ContactPage() {
  const mailto = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Elite Capital Engine — beta support')}`;

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-200 p-8">
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wider text-zinc-500">Elite Capital Engine</p>
          <h1 className="text-3xl font-bold text-white">Contact</h1>
          <p className="text-sm text-amber-400/90">
            Beta support channel — not a formal legal notice address until counsel review.
          </p>
        </div>

        <section className="space-y-3 text-sm leading-relaxed text-zinc-300">
          <p>
            For account access, privacy requests, billing questions during beta, or bug reports,
            email the operator directly. Do not send passwords, full account numbers, or one-time
            codes.
          </p>
          <p>
            <a href={mailto} className="text-indigo-400 hover:text-indigo-300 font-semibold">
              {CONTACT_EMAIL}
            </a>
          </p>
          <a
            href={mailto}
            className="inline-flex bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5 px-5 rounded-lg transition text-sm"
          >
            Open email draft
          </a>
        </section>

        <p className="text-sm flex flex-wrap gap-4">
          <Link href="/legal" className="text-indigo-400 hover:text-indigo-300">
            ← Legal hub
          </Link>
          <Link href="/" className="text-indigo-400 hover:text-indigo-300">
            Back to app
          </Link>
        </p>
      </div>
    </main>
  );
}
