import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase-admin';
import { encryptToken, isEncryptedToken } from '@/lib/crypto';
import { requireAdmin, requireUser } from '@/lib/auth/require-user';
import { toErrorResponse } from '@/lib/http/api-error';

/**
 * One-off migration helper: re-encrypts any Plaid access token still stored as
 * plaintext.
 *
 * SECURITY: previously callable by anyone, with no session and no role check.
 * It is now restricted to administrators listed in ADMIN_EMAILS and refuses to
 * run once every token is already encrypted.
 */
export async function POST() {
  try {
    const user = await requireUser();
    requireAdmin(user);

    const supabase = getServiceSupabase();
    const { data: items, error } = await supabase.from('plaid_items').select('id, access_token');

    if (error) throw error;
    if (!items || items.length === 0) {
      return NextResponse.json({ message: 'No plaid_items found to encrypt.' });
    }

    let updatedCount = 0;

    for (const item of items) {
      const token = String(item.access_token || '');
      if (!token || isEncryptedToken(token)) continue;

      const { error: updateError } = await supabase
        .from('plaid_items')
        .update({
          access_token: encryptToken(token),
          updated_at: new Date().toISOString(),
        })
        .eq('id', item.id);

      if (updateError) throw updateError;
      updatedCount += 1;
    }

    return NextResponse.json({
      status: 'SUCCESS',
      scanned: items.length,
      tokens_encrypted: updatedCount,
    });
  } catch (error) {
    return toErrorResponse(error, 'admin-encrypt-tokens');
  }
}
