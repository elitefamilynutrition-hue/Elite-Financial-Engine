'use client';

import React, { useEffect, useState } from 'react';
import { usePlaidLink } from 'react-plaid-link';

interface Props {
  onSuccessAction: () => void;
  linkType?: 'standard' | 'investment';
  buttonText?: string;
}

export const PlaidLinkButton: React.FC<Props> = ({
  onSuccessAction,
  linkType = 'standard',
  buttonText = 'Connect Bank / Card',
}) => {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  const [exchangeError, setExchangeError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const createToken = async () => {
      setInitError(null);
      setLinkToken(null);
      try {
        const res = await fetch('/api/plaid/create-link-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: linkType }),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || `Link token failed (${res.status})`);
        }
        if (!data.link_token) {
          throw new Error('Link token missing from response.');
        }
        if (!cancelled) setLinkToken(data.link_token);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to initialize Plaid Link';
        console.error('Failed to initialize Plaid Link:', error);
        if (!cancelled) setInitError(message);
      }
    };

    void createToken();
    return () => {
      cancelled = true;
    };
  }, [linkType]);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: async (public_token, metadata) => {
      setExchangeError(null);
      try {
        const res = await fetch('/api/plaid/exchange-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            public_token,
            institution_id: metadata.institution?.institution_id,
            institution_name: metadata.institution?.name,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || `Token exchange failed (${res.status})`);
        }
        onSuccessAction();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to link institution';
        console.error('Plaid exchange failed:', error);
        setExchangeError(message);
      }
    },
  });

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={() => open()}
        disabled={!ready || !linkToken}
        className={`font-semibold py-2.5 px-6 rounded-lg transition disabled:opacity-40 text-white ${
          linkType === 'investment'
            ? 'bg-indigo-600 hover:bg-indigo-500'
            : 'bg-emerald-600 hover:bg-emerald-500'
        }`}
      >
        {linkToken ? buttonText : initError ? 'Link unavailable' : 'Initializing Link...'}
      </button>
      {initError && (
        <p className="text-xs text-rose-400 max-w-sm" role="alert">
          {initError}
        </p>
      )}
      {exchangeError && (
        <p className="text-xs text-rose-400 max-w-sm" role="alert">
          {exchangeError}
        </p>
      )}
    </div>
  );
};
