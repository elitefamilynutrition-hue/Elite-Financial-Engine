export const metadata = {
  title: 'GOD MODE (Lab) — Elite Capital Engine',
};

/** Educational market sandbox — mock data only; never trade execution. */
const MOCK_WATCHLIST = [
  { symbol: 'SPY', label: 'S&P 500 ETF', note: 'Broad US equity beta (illustrative)' },
  { symbol: 'QQQ', label: 'Nasdaq-100 ETF', note: 'Growth / tech tilt (illustrative)' },
  { symbol: 'TLT', label: '20+ Year Treasury', note: 'Duration / rates sensitivity (illustrative)' },
  { symbol: 'GLD', label: 'Gold trust', note: 'Commodity proxy (illustrative)' },
];

const MOCK_REGIMES = [
  {
    title: 'Risk-on',
    body: 'Equities and credit typically bid; volatility compresses. Not a signal to buy.',
  },
  {
    title: 'Risk-off',
    body: 'Flight to quality / cash; correlations can spike. Not a signal to sell.',
  },
  {
    title: 'Transition',
    body: 'Mixed leadership and noisy data. Prefer waiting over narrative trading.',
  },
];

export default function GodModeLabPage() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <p className="text-[10px] uppercase tracking-wider text-amber-500">Lab · GOD MODE</p>
        <h1 className="text-2xl font-bold text-white">Market education sandbox</h1>
        <p className="text-sm text-amber-200/90 leading-relaxed max-w-2xl border border-amber-900/50 bg-amber-950/30 rounded-lg p-3">
          Educational / operator-lab only. <strong>Not</strong> financial, investment, or trading
          advice. No order entry, brokerage link, or personalized securities recommendations. Mock
          labels below are static teaching props — not live quotes or signals.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">Illustrative watchlist (static)</h2>
        <div className="overflow-x-auto rounded-lg border border-zinc-800">
          <table className="w-full text-sm text-left">
            <thead className="bg-zinc-900 text-zinc-400 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-4 py-2">Symbol</th>
                <th className="px-4 py-2">Label</th>
                <th className="px-4 py-2">Note</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_WATCHLIST.map((row) => (
                <tr key={row.symbol} className="border-t border-zinc-800 text-zinc-300">
                  <td className="px-4 py-2 font-mono text-indigo-300">{row.symbol}</td>
                  <td className="px-4 py-2">{row.label}</td>
                  <td className="px-4 py-2 text-zinc-500">{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">Regime vocabulary (education)</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {MOCK_REGIMES.map((r) => (
            <div key={r.title} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 space-y-2">
              <h3 className="font-semibold text-zinc-100">{r.title}</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">{r.body}</p>
            </div>
          ))}
        </div>
      </section>

      <p className="text-xs text-zinc-600">
        Source: static lab fixtures in-repo. Replace with a labeled market-data feed only behind this
        Lab gate — never on the default Command Center for non-admins.
      </p>
    </div>
  );
}
