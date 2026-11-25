import Link from 'next/link';

export const metadata = {
  title: 'About — Elite Capital Engine',
  description: 'About Elite Capital Engine',
};

/**
 * About / legal hub. Stub-level copy — not counsel-reviewed.
 */
export default function AboutPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-200 p-8">
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wider text-zinc-500">Elite Capital Engine</p>
          <h1 className="text-3xl font-bold text-white">About</h1>
          <p className="text-sm text-amber-400/90">
            Working draft — not a finished legal disclosure and has not been reviewed by counsel.
          </p>
        </div>

        <section className="space-y-3 text-sm leading-relaxed text-zinc-300">
          <h2 className="text-lg font-semibold text-white">What this is</h2>
          <p>
            Elite Capital Engine (ECE) is a personal finance telemetry app: bank linking, net-worth
            and burn analytics, FI-style projections, and optional AI coaching tools. Access is
            invite-gated during beta.
          </p>
        </section>

        <section className="space-y-3 text-sm leading-relaxed text-zinc-300">
          <h2 className="text-lg font-semibold text-white">What this is not</h2>
          <p>
            ECE is <strong className="text-white">not</strong> a bank, broker, fiduciary, CPA, or
            law firm. Nothing in the product is financial, tax, legal, or investment advice. You are
            solely responsible for decisions you make.
          </p>
        </section>

        <section className="space-y-3 text-sm leading-relaxed text-zinc-300">
          <h2 className="text-lg font-semibold text-white">Subscription</h2>
          <p>
            Product use requires a Stripe subscription: <strong className="text-white">7-day trial</strong>{' '}
            (card on file), then <strong className="text-white">$20 per month</strong>. Cancel via
            Stripe (receipts / customer portal). Promo codes may appear at Checkout when enabled.
          </p>
        </section>

        <section className="space-y-3 text-sm leading-relaxed text-zinc-300">
          <h2 className="text-lg font-semibold text-white">Legal</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <Link href="/legal" className="text-indigo-400 hover:text-indigo-300">
                Legal hub
              </Link>
            </li>
            <li>
              <Link href="/privacy" className="text-indigo-400 hover:text-indigo-300">
                Privacy
              </Link>
            </li>
            <li>
              <Link href="/terms" className="text-indigo-400 hover:text-indigo-300">
                Terms of use
              </Link>{' '}
              (web SaaS terms; EULA-style license + billing are included there)
            </li>
            <li>
              <Link href="/contact" className="text-indigo-400 hover:text-indigo-300">
                Contact
              </Link>
            </li>
          </ul>
        </section>

        <p className="text-sm">
          <Link href="/" className="text-indigo-400 hover:text-indigo-300">
            ← Back to app
          </Link>
        </p>
      </div>
    </main>
  );
}
