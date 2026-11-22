import { createClient } from '@supabase/supabase-js';

/**
 * Browser/anon Supabase client.
 *
 * Every query made through this client is subject to Row Level Security, so it
 * is safe to import from `'use client'` components. The service-role client
 * lives in `lib/supabase-admin.ts` and must never be imported here.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be configured.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Server-only compatibility export for existing routes/helpers. Guarded so the
// service-role key is never bundled into client code.
export function getServiceSupabase() {
  if (typeof window !== 'undefined') {
    throw new Error('getServiceSupabase() is server-only. Import from lib/supabase-admin.ts on the server.');
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('./supabase-admin') as typeof import('./supabase-admin');
  return mod.getServiceSupabase();
}
