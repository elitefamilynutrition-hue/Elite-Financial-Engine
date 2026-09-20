import { NextResponse } from 'next/server';
import { plaidClient } from '@/lib/plaid';
import { Products, CountryCode } from 'plaid';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export async function POST() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const webhookUrl = process.env.PLAID_WEBHOOK_URL || undefined;

    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: user.id },
      client_name: 'BudgetDog Financial App',
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: 'en',
      ...(webhookUrl ? { webhook: webhookUrl } : {}),
    });

    return NextResponse.json(response.data);
  } catch (error: any) {
    console.error('Error creating link token:', error?.response?.data || error.message || error);
    return NextResponse.json(
      { error: error?.response?.data?.error_message || error.message || 'Failed to create link token' },
      { status: 500 }
    );
  }
}