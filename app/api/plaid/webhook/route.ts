import { NextResponse } from 'next/server';
import { plaidClient } from '@/lib/plaid';
import { getServiceSupabase } from '@/lib/supabase-admin';
import { decryptToken } from '@/lib/crypto';
import { syncAccountsForItem } from '@/lib/plaid/sync-accounts';
import {
  claimWebhookDelivery,
  getWebhookIdempotencyKey,
  verifyPlaidWebhook,
  WebhookVerificationError,
} from '@/lib/plaid/verify-webhook';

export async function POST(req: Request) {
  // 1. Raw body first — SHA-256 must match Plaid's exact bytes (whitespace-sensitive).
  const rawBody = await req.text();

  let requestBodySha256: string;
  try {
    ({ requestBodySha256 } = await verifyPlaidWebhook(rawBody, req.headers));
  } catch (err: unknown) {
    const message = err instanceof WebhookVerificationError ? err.message : 'Invalid webhook signature';
    console.warn(`[Plaid Webhook] Verification failed: ${message}`);
    // Do not ACK forged / invalid requests — Plaid retries only help real deliveries.
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
  }

  const idempotencyKey = getWebhookIdempotencyKey(rawBody, requestBodySha256);
  if (!claimWebhookDelivery(idempotencyKey)) {
    console.log('[Plaid Webhook] Duplicate delivery within 24h window — ACK without re-sync');
    return NextResponse.json({ status: 'ACKNOWLEDGED', duplicate: true });
  }

  try {
    const payload = JSON.parse(rawBody) as {
      webhook_type?: string;
      webhook_code?: string;
      item_id?: string;
    };
    const { webhook_type, webhook_code, item_id } = payload;

    if (!item_id) {
      return NextResponse.json({ status: 'ACKNOWLEDGED' });
    }

    console.log(`[Plaid Webhook] Ingested: type=${webhook_type}, code=${webhook_code}, item_id=${item_id}`);

    // Sync only — no Gemini / AI triage here (batch cron later).
    if (
      webhook_type === 'TRANSACTIONS' &&
      (webhook_code === 'SYNC_UPDATES_AVAILABLE' || webhook_code === 'DEFAULT_UPDATE')
    ) {
      const supabase = getServiceSupabase();

      const { data: item, error: itemError } = await supabase
        .from('plaid_items')
        .select('item_id, user_id, access_token, next_cursor')
        .eq('item_id', item_id)
        .single();

      if (itemError || !item?.user_id) {
        console.warn(`[Plaid Webhook] Item not found: ${item_id}`);
        return NextResponse.json({ message: 'Item not registered' }, { status: 404 });
      }

      const accessToken = decryptToken(item.access_token);
      let cursor = item.next_cursor || undefined;
      let hasMore = true;

      try {
        await syncAccountsForItem({ accessToken, userId: item.user_id });
      } catch (balErr: unknown) {
        console.warn(
          `[Plaid Webhook] Balance update failed:`,
          balErr instanceof Error ? balErr.message : balErr
        );
      }

      while (hasMore) {
        const syncRes = await plaidClient.transactionsSync({
          access_token: accessToken,
          cursor: cursor,
          count: 100,
        });

        const data = syncRes.data;
        hasMore = data.has_more;
        cursor = data.next_cursor;

        const toUpsert = [...data.added, ...data.modified].map((tx) => ({
          user_id: item.user_id,
          plaid_transaction_id: tx.transaction_id,
          account_id: tx.account_id,
          name: tx.name,
          merchant_name: tx.merchant_name || null,
          amount: tx.amount,
          date: tx.date,
          category: tx.category ? tx.category.join(', ') : null,
          pending: tx.pending,
        }));

        if (toUpsert.length > 0) {
          await supabase.from('transactions').upsert(toUpsert, { onConflict: 'plaid_transaction_id' });
        }

        if (data.removed.length > 0) {
          const removedIds = data.removed.map((r) => r.transaction_id);
          await supabase
            .from('transactions')
            .delete()
            .in('plaid_transaction_id', removedIds)
            .eq('user_id', item.user_id);
        }
      }

      await supabase
        .from('plaid_items')
        .update({
          next_cursor: cursor,
          updated_at: new Date().toISOString(),
        })
        .eq('item_id', item_id)
        .eq('user_id', item.user_id);

      console.log(`[Plaid Webhook] Sync complete for item: ${item_id}`);
    }

    return NextResponse.json({ status: 'ACKNOWLEDGED' });
  } catch (err: unknown) {
    // Post-verify transient failures: ACK so Plaid can retry a valid delivery.
    console.error('[Plaid Webhook Error]:', err instanceof Error ? err.message : err);
    return NextResponse.json({ status: 'ACKNOWLEDGED' });
  }
}
