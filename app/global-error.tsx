'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

/**
 * App Router root error boundary — reports to Sentry when DSN is configured.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-zinc-950 text-zinc-100 min-h-screen flex items-center justify-center p-8">
        <div className="max-w-md space-y-4 text-center">
          <h1 className="text-xl font-bold">Elite Capital Engine</h1>
          <p className="text-sm text-zinc-400">Something went wrong loading this view.</p>
          <button
            type="button"
            onClick={() => reset()}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-4 py-2 rounded-lg"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
