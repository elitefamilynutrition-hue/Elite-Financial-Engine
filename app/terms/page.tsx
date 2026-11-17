import Link from 'next/link';

export const metadata = {
  title: 'Terms — Elite Capital Engine',
  description: 'Terms stub for Elite Capital Engine',
};

/**
 * Plain-English terms stub. Not counsel-reviewed.
 */
export default function TermsPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-200 p-8">
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wider text-zinc-500">Elite Capital Engine</p>
          <h1 className="text-3xl font-bold text-white">Terms of use</h1>
          <p className="text-sm text-amber-400/90">
            Stub notice — this page is a working draft, not a finished legal agreement and has not
            been reviewed by counsel.
          </p>
        </div>

        <section className="space-y-3 text-sm leading-relaxed text-zinc-300">
          <h2 className="text-lg font-semibold text-white">Service</h2>
          <p>
            Elite Capital Engine (ECE) provides personal finance telemetry and optional AI tools.
            Access may be invite-gated. Features can change as the product evolves.
          </p>
        </section>

        <section className="space-y-3 text-sm leading-relaxed text-zinc-300">
          <h2 className="text-lg font-semibold text-white">Not financial advice</h2>
          <p>
            ECE is educational and analytical only. Nothing in the app is financial, tax, legal, or
            investment advice, and we are not your fiduciary. You alone decide what to do with any
            output.
          </p>
        </section>

        <section className="space-y-3 text-sm leading-relaxed text-zinc-300">
          <h2 className="text-lg font-semibold text-white">Accounts</h2>
          <p>
            Keep your credentials secure. Do not share accounts. We may suspend access for abuse,
            security risk, or violation of these terms.
          </p>
        </section>

        <section className="space-y-3 text-sm leading-relaxed text-zinc-300">
          <h2 className="text-lg font-semibold text-white">Bank linking</h2>
          <p>
            Bank and brokerage connections are provided through Plaid. By linking, you authorize
            that connection under Plaid&apos;s terms and disclosures as well as these terms.
          </p>
        </section>

        <section className="space-y-3 text-sm leading-relaxed text-zinc-300">
          <h2 className="text-lg font-semibold text-white">AI features</h2>
          <p>
            AI features (including Google Gemini) can be wrong, incomplete, or outdated. Always
            verify before acting on audit, chat, classification, or OCR results.
          </p>
        </section>

        <section className="space-y-3 text-sm leading-relaxed text-zinc-300">
          <h2 className="text-lg font-semibold text-white">Billing</h2>
          <p>
            Paid subscriptions may be offered later via Stripe. Pricing and plan terms will be shown
            at checkout when billing is enabled. Until then, access may be complimentary or invite-
            only at the operator&apos;s discretion.
          </p>
        </section>

        <section className="space-y-3 text-sm leading-relaxed text-zinc-300">
          <h2 className="text-lg font-semibold text-white">Acceptable use</h2>
          <p>
            Use ECE only for your own finances (or accounts you are authorized to manage). Do not
            attempt to access other users&apos; data, abuse APIs, or disrupt the service.
          </p>
        </section>

        <section className="space-y-3 text-sm leading-relaxed text-zinc-300">
          <h2 className="text-lg font-semibold text-white">Availability &amp; liability</h2>
          <p>
            The service is provided as-available. We do not guarantee uptime, accuracy, or financial
            outcomes. To the extent permitted by law, ECE and its operators are not liable for
            decisions you make based on the app.
          </p>
        </section>

        <section className="space-y-3 text-sm leading-relaxed text-zinc-300">
          <h2 className="text-lg font-semibold text-white">Changes</h2>
          <p>
            These stub terms may be updated. Continued use after changes means you accept the updated
            version once a final policy is published.
          </p>
        </section>

        <p className="text-sm">
          <Link href="/" className="text-indigo-400 hover:text-indigo-300">
            ← Back to app
          </Link>
          {' · '}
          <Link href="/privacy" className="text-indigo-400 hover:text-indigo-300">
            Privacy
          </Link>
        </p>
      </div>
    </main>
  );
}
