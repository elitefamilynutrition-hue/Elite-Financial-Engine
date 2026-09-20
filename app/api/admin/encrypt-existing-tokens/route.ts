import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { encryptToken } from '@/lib/crypto';

export async function POST() {
  try {
    const supabase = getServiceSupabase();
    const { data: items, error } = await supabase.from('plaid_items').select('*');

    if (error) throw error;
    if (!items || items.length === 0) {
      return NextResponse.json({ message: 'No plaid_items found to encrypt.' });
    }

    let updatedCount = 0;

    for (const item of items) {
      // Only encrypt if it is still raw (starts with access- or lacks colon formatting)
      if (item.access_token.startsWith('access-') || !item.access_token.includes(':')) {
        const encrypted = encryptToken(item.access_token);
        const { error: updateError } = await supabase
          .from('plaid_items')
          .update({
            access_token: encrypted,
            updated_at: new Date().toISOString(),
          })
          .eq('id', item.id);

        if (updateError) throw updateError;
        updatedCount++;
      }
    }

    return NextResponse.json({
      status: 'SUCCESS',
      tokens_encrypted: updatedCount,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}