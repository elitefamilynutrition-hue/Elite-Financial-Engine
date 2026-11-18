'use client';

import { useEffect, useState } from 'react';

interface Message {
  role: 'user' | 'model';
  content: string;
}

interface AuditChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  /** Optional question to auto-send when the drawer opens (e.g. anomaly coach). */
  seedPrompt?: string | null;
}

export function AuditChatDrawer({ isOpen, onClose, seedPrompt }: AuditChatDrawerProps) {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'model', content: 'Audit telemetry loaded. Challenge my findings, explain an anomaly (like your advance travel bookings), or model a scenario. What are we auditing?' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [seedConsumed, setSeedConsumed] = useState<string | null>(null);

  const sendMessage = async (userMsg: string, historySnapshot: Message[]) => {
    if (!userMsg.trim() || loading) return;
    setMessages((prev) => [...prev, { role: 'user', content: userMsg }]);
    setLoading(true);

    try {
      const res = await fetch('/api/audit/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg, history: historySnapshot })
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      
      if (data.reply) {
        setMessages((prev) => [...prev, { role: 'model', content: data.reply }]);
      } else {
        setMessages((prev) => [...prev, { role: 'model', content: 'Error: Engine returned an empty response.' }]);
      }
    } catch (err: unknown) {
      console.error('Audit Engine Error:', err);
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setMessages((prev) => [...prev, { role: 'model', content: `API Error: ${msg}` }]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen || !seedPrompt || seedPrompt === seedConsumed || loading) return;
    setSeedConsumed(seedPrompt);
    void sendMessage(seedPrompt, messages);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed once per prompt string
  }, [isOpen, seedPrompt, seedConsumed, loading]);

  if (!isOpen) return null;

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput('');
    await sendMessage(userMsg, messages);
  };

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-lg bg-zinc-900 border-l border-zinc-800 shadow-2xl z-50 flex flex-col">
      <div className="flex justify-between items-center p-4 border-b border-zinc-800 bg-zinc-950">
        <div>
          <h3 className="font-bold text-white text-sm">Audit Sparring & Scenario Engine</h3>
          <p className="text-xs text-zinc-400">Context-aware forensic dialogue</p>
          <p className="text-[10px] text-zinc-500 mt-1">
            Not financial, tax, or investment advice. AI output can be wrong — verify before you act.
          </p>
        </div>
        <button onClick={onClose} className="text-zinc-400 hover:text-white text-xs font-mono">
          [Close]
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
        {messages.map((m, i) => (
          <div key={i} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
            <div className={`max-w-[85%] p-3 rounded-xl leading-relaxed ${m.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-zinc-950 border border-zinc-800 text-zinc-300'}`}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex items-start">
            <div className="bg-zinc-950 border border-zinc-800 p-3 rounded-xl text-zinc-500 animate-pulse">
              Analyzing telemetry & formulating response...
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSend} className="p-4 border-t border-zinc-800 bg-zinc-950 flex gap-2">
        <input
          type="text"
          placeholder="e.g., Why did you call Travel a spike when I booked the Philippines trip?"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-lg transition text-xs"
        >
          Send
        </button>
      </form>
    </div>
  );
}
