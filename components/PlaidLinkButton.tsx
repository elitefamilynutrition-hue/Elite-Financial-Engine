'use client';

import React, { useEffect, useState } from 'react';
import { usePlaidLink } from 'react-plaid-link';

interface Props {
  onSuccessAction: () => void;
}

export const PlaidLinkButton: React.FC<Props> = ({ onSuccessAction }) => {
  const [linkToken, setLinkToken] = useState<string | null>(null);

 useEffect(() => {
    const createToken = async () => {
      try {
        const res = await fetch('/api/plaid/create-link-token', { 
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        
        if (!res.ok) {
           throw new Error(`HTTP error! status: ${res.status}`);
        }
        
        const data = await res.json();
        if (data.link_token) {
          setLinkToken(data.link_token);
        }
      } catch (error) {
         console.error('Failed to initialize Plaid Link:', error);
      }
    };
    createToken();
  }, []);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: async (public_token, metadata) => {
      await fetch('/api/plaid/exchange-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          public_token,
          institution_id: metadata.institution?.institution_id,
          institution_name: metadata.institution?.name
        }),
      });
      onSuccessAction();
    },
  });

  return (
    <button
      onClick={() => open()}
      disabled={!ready || !linkToken}
      className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2.5 px-6 rounded-lg transition disabled:opacity-40"
    >
      {linkToken ? 'Connect Bank Account' : 'Initializing Link...'}
    </button>
  );
};
