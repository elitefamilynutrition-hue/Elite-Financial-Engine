import Link from 'next/link';

export const metadata = {
  title: 'Privacy — Elite Capital Engine',
  description: 'Privacy stub for Elite Capital Engine',
};

/**
 * Plain-English privacy stub. Not counsel-reviewed.
 */
export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-200 p-8">
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wider text-zinc-500">Elite Capital Engine</p>
          <h1 className="text-3xl font-bold text-white">Privacy</h1>
          <p className="text-sm text-amber-400/90">
            Stub notice — this page is a working draft, not a finished legal policy and has not been
            reviewed by counsel.
          </p>
        </div>

        <section className="space-y-3 text-sm leading-relaxed text-zinc-300">
          <h2 className="text-lg font-semibold text-white">Who we are</h2>
          <p>
            Elite Capital Engine (ECE) is a personal finance telemetry and AI-assisted analysis app.
            Privacy questions during beta:{' '}
            <a
              href="mailto:solito.emanuele@gmail.com"
              className="text-indigo-400 hover:text-indigo-300"
            >
              solito.emanuele@gmail.com
            </a>
            .
          </p>
        </section>

        <section className="space-y-3 text-sm leading-relaxed text-zinc-300">
          <h2 className="text-lg font-semibold text-white">What we collect</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Account email and authentication data (via Supabase Auth)</li>
            <li>Profile fields you enter (income targets, ages, preferences)</li>
            <li>Bank and investment account balances and transactions linked through Plaid</li>
            <li>Encrypted Plaid access tokens (we do not store your bank password)</li>
            <li>Manual liabilities and other data you enter</li>
            <li>Paystub images/text you upload for OCR extraction</li>
            <li>AI audit and chat context derived from the above when you use those features</li>
            <li>Subscription and payment identifiers via Stripe (customer / subscription IDs, status)</li>
          </ul>
        </section>

        <section className="space-y-3 text-sm leading-relaxed text-zinc-300">
          <h2 className="text-lg font-semibold text-white">Subprocessors</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Supabase — authentication and database</li>
            <li>Plaid — bank and brokerage linking</li>
            <li>Google Gemini — AI audit, chat, classification, and paystub vision</li>
            <li>Stripe — subscriptions, trials, and payment processing</li>
            <li>Vercel — application hosting and edge delivery</li>
            <li>Sentry — error monitoring (when DSN is configured)</li>
          </ul>
        </section>

        <section className="space-y-3 text-sm leading-relaxed text-zinc-300">
          <h2 className="text-lg font-semibold text-white">How we use data</h2>
          <p>
            We use your data to sync accounts, compute telemetry, run AI features you request, operate
            the product, and process subscriptions. We do not sell your personal data for advertising.
          </p>
        </section>

        <section className="space-y-3 text-sm leading-relaxed text-zinc-300">
          <h2 className="text-lg font-semibold text-white">Retention &amp; security</h2>
          <p>
            Data is kept while your account exists. You can request an export or deletion via the
            account APIs (or email the contact above). Backups may lag behind deletions. Access
            requires sign-in; Plaid tokens are encrypted at rest; database access is scoped per user.
          </p>
        </section>

        <section className="space-y-3 text-sm leading-relaxed text-zinc-300">
          <h2 className="text-lg font-semibold text-white">Not financial advice</h2>
          <p>
            ECE provides analytical tools and AI-generated commentary. It is not financial, tax, or
            investment advice. Verify outputs before acting.
          </p>
        </section>

        <p className="text-sm">
          <Link href="/" className="text-indigo-400 hover:text-indigo-300">
            ← Back to app
          </Link>
          {' · '}
          <Link href="/legal" className="text-indigo-400 hover:text-indigo-300">
            Legal hub
          </Link>
          {' · '}
          <Link href="/contact" className="text-indigo-400 hover:text-indigo-300">
            Contact
          </Link>
        </p>
      </div>
    </main>
  );
}
