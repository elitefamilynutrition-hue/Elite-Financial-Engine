import Link from 'next/link';

export const metadata = {
  title: 'Terms — Elite Capital Engine',
  description: 'Terms of use for Elite Capital Engine',
};

/**
 * Plain-English terms stub (incl. subscription / EULA-style license). Not counsel-reviewed.
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
          <h2 className="text-lg font-semibold text-white">Service &amp; license</h2>
          <p>
            Elite Capital Engine (ECE) provides personal finance telemetry and optional AI tools.
            Subject to these terms, we grant you a limited, non-exclusive, non-transferable license
            to use the web app for your own personal finances. We may revoke access for abuse,
            non-payment, or security risk. Access may remain invite-gated during beta.
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
          <h2 className="text-lg font-semibold text-white">Subscription &amp; billing</h2>
          <p>
            Product use requires a paid Stripe subscription. New subscribers receive a{' '}
            <strong className="text-white">7-day free trial</strong> with a card on file, then{' '}
            <strong className="text-white">$20 USD per month</strong> unless canceled. Pricing shown
            at Checkout controls. Taxes may apply. You authorize Stripe to charge your payment method
            after the trial. Cancel or manage billing through Stripe (customer portal / receipt
            emails). Promo codes may be offered at Checkout when available. Failure to pay may
            suspend access.
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
            version once posted.
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
