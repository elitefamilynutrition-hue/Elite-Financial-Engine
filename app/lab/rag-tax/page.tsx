'use client';

import { useState } from 'react';

type Citation = { id: string; title: string; source: string };

export default function LabRagTaxPage() {
  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [disclaimer, setDisclaimer] = useState<string | null>(null);
  const [citations, setCitations] = useState<Citation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const ask = async () => {
    setBusy(true);
    setError(null);
    setAnswer(null);
    try {
      const res = await fetch('/api/lab/rag-tax', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      setAnswer(data.answer || '');
      setDisclaimer(data.disclaimer || null);
      setCitations(data.citations || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="space-y-2">
        <p className="text-[10px] uppercase tracking-wider text-amber-500">Lab · RAG tax</p>
        <h1 className="text-2xl font-bold text-white">Tax notes retrieval</h1>
        <p className="text-sm text-amber-200/90 border border-amber-900/50 bg-amber-950/30 rounded-lg p-3">
          Not tax advice. Answers come from a tiny in-repo markdown corpus under{' '}
          <code className="text-amber-100">content/rag-tax/</code>. Requires{' '}
          <code className="text-amber-100">ENABLE_RAG_TAX=true</code> and Lab access.
        </p>
      </div>

      <label className="block text-xs text-zinc-400">
        Question
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          rows={3}
          className="mt-1 w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-100"
          placeholder="How does ECE estimate marginal brackets?"
        />
      </label>
      <button
        type="button"
        disabled={busy || query.trim().length < 3}
        onClick={ask}
        className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold py-2 px-4 rounded-lg text-sm"
      >
        {busy ? 'Searching…' : 'Retrieve'}
      </button>

      {error && (
        <p className="text-sm text-rose-400" role="alert">
          {error}
        </p>
      )}
      {disclaimer && <p className="text-xs text-zinc-500">{disclaimer}</p>}
      {answer && (
        <pre className="whitespace-pre-wrap text-sm text-zinc-300 bg-zinc-900/60 border border-zinc-800 rounded-lg p-4">
          {answer}
        </pre>
      )}
      {citations.length > 0 && (
        <ul className="text-xs text-zinc-500 space-y-1">
          {citations.map((c) => (
            <li key={c.id}>
              <span className="text-zinc-300">{c.title}</span> — {c.source}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
