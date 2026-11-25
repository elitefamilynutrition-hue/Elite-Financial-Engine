import { NextResponse } from 'next/server';
import { plaidClient } from '@/lib/plaid';
import { Products, CountryCode } from 'plaid';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { requireActiveSubscription } from '@/lib/auth/require-entitlement';
import { readJsonBody, toErrorResponse } from '@/lib/http/api-error';

type LinkType = 'standard' | 'investment';

/**
 * Link modes:
 * - standard: Transactions (bank/card)
 * - investment: Investments (+ Transactions so brokerage cash/activity syncs)
 */
export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await requireActiveSubscription(user);

    const body = await readJsonBody<{ type?: string }>(request).catch(() => ({} as { type?: string }));
    const linkType: LinkType = body.type === 'investment' ? 'investment' : 'standard';

    const products =
      linkType === 'investment'
        ? [Products.Investments, Products.Transactions]
        : [Products.Transactions];

    const webhookUrl = process.env.PLAID_WEBHOOK_URL || undefined;

    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: user.id },
      client_name: 'Elite Capital Engine',
      products,
      country_codes: [CountryCode.Us],
      language: 'en',
      ...(webhookUrl ? { webhook: webhookUrl } : {}),
    });

    return NextResponse.json({ ...response.data, link_type: linkType });
  } catch (error: unknown) {
    const apiRes = toErrorResponse(error, 'plaid-link-token');
    if (apiRes.status !== 500) return apiRes;
    const err = error as { response?: { data?: { error_message?: string } }; message?: string };
    console.error('Error creating link token:', err?.response?.data || err.message || error);
    return NextResponse.json(
      { error: err?.response?.data?.error_message || err.message || 'Failed to create link token' },
      { status: 500 }
    );
  }
}
