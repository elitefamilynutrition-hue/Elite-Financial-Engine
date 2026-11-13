import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Service-role Supabase client. Bypasses Row Level Security.
 *
 * SECURITY: This module must only ever be imported from server-side code
 * (route handlers, server components, scripts). Importing it from a
 * `'use client'` component would expose the service role key in the browser
 * bundle, granting full database access to anyone.
 */

let cachedClient: SupabaseClient | null = null;

export function getServiceSupabase(): SupabaseClient {
  if (typeof window !== 'undefined') {
    throw new Error(
      'getServiceSupabase() was called in the browser. The service role client is server-only.'
    );
  }

  if (cachedClient) {
    return cachedClient;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not configured.');
  }
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured.');
  }

  cachedClient = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return cachedClient;
}
