import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getServiceSupabase } from '@/lib/supabase-admin';
import { checkRateLimit, rateLimitResponse } from '@/lib/http/rate-limit';
import { requireActiveSubscription } from '@/lib/auth/require-entitlement';
import { toErrorResponse } from '@/lib/http/api-error';

export async function POST(request: Request) {
  try {
    const authSupabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await authSupabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await requireActiveSubscription(user);

    const limited = checkRateLimit(`tx-classify:${user.id}`, 10, 60_000);
    if (!limited.ok) return rateLimitResponse(limited.retryAfterSec);

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
    }

    const supabase = getServiceSupabase();

    // 1. Fetch user profile for custom context (e.g., Financial Kryptonite)
    const { data: profile } = await supabase
      .from('user_financial_profiles')
      .select('financial_kryptonite')
      .eq('user_id', user.id)
      .maybeSingle();

    // 2. Fetch custom user rules
    const { data: customRules } = await supabase
      .from('user_custom_categorization_rules')
      .select('keyword_or_merchant, assigned_intent')
      .eq('user_id', user.id);

    // 3. Resolve this tenant's Plaid account ids (belt-and-braces with user_id below)
    const { data: accounts, error: accountsError } = await supabase
      .from('financial_accounts')
      .select('plaid_account_id')
      .eq('user_id', user.id);

    if (accountsError) throw accountsError;

    const accountIds = (accounts || [])
      .map((account: { plaid_account_id: string | null }) => account.plaid_account_id)
      .filter((id): id is string => Boolean(id));

    if (accountIds.length === 0) {
      return NextResponse.json({ status: 'SUCCESS', message: 'No transactions require classification.' });
    }

    // 4. Fetch unclassified transactions — scoped to this tenant only
    const { data: rawTransactions, error: txError } = await supabase
      .from('transactions')
      .select('*')
      .eq('transaction_intent', 'survival') // default state or unclassified batch
      .in('account_id', accountIds)
      .limit(50);

    if (txError) throw txError;

    // Drop any row that somehow carries another tenant's user_id (legacy null user_id OK).
    const transactions = (rawTransactions || []).filter(
      (row: { user_id?: string | null }) => !row.user_id || row.user_id === user.id
    );

    if (transactions.length === 0) {
      return NextResponse.json({ status: 'SUCCESS', message: 'No transactions require classification.' });
    }

    const ai = new GoogleGenAI({ apiKey });

    // Format transaction payload for batch AI classification
    const txPayload = transactions.map((t: { plaid_transaction_id: string; name: string; merchant_name: string | null; amount: number; category: string | null }) => ({
      id: t.plaid_transaction_id,
      name: t.name,
      merchant: t.merchant_name || t.name,
      amount: t.amount,
      category: t.category
    }));

    const prompt = `
You are an elite financial intelligence and forensic categorization engine. 
Analyze the following batch of bank and credit card transactions.

User Context:
- Known Discretionary/Kryptonite Interests: ${profile?.financial_kryptonite || 'None specified'}
- Custom User Overrides: ${JSON.stringify(customRules || [])}

Classification Rules:
For each transaction, determine:
1. is_internal_transfer (boolean): true if it's a credit card payment, bank transfer, or account sweep.
2. transaction_intent (string): exactly one of:
   - 'survival' (non-negotiable baseline: mortgage, utilities, baseline groceries, healthcare, insurance)
   - 'creep' (lifestyle bleed: dining out, entertainment, shopping, hobbies, travel)
   - 'offense' (capital deployed to assets/debt: debt paydown, investments, 401k, savings)
   - 'transfer' (internal money movement between own accounts)

Return a JSON array of objects with keys:
- id (string)
- is_internal_transfer (boolean)
- transaction_intent (string)
- confidence_score (number between 0.0 and 1.0)

Transactions to classify:
${JSON.stringify(txPayload, null, 2)}
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: [prompt],
    });

    const textResponse = response?.text || '';
    const cleanedJson = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();
    
    let classifications: any[];
    try {
      classifications = JSON.parse(cleanedJson);
    } catch (e) {
      console.error('Failed to parse Gemini classification JSON:', textResponse);
      return NextResponse.json({ error: 'AI classification parsing failed.' }, { status: 422 });
    }

    // 5. Batch update — never by plaid_transaction_id alone (cross-tenant write risk)
    for (const c of classifications) {
      await supabase
        .from('transactions')
        .update({
          is_internal_transfer: c.is_internal_transfer,
          transaction_intent: c.is_internal_transfer ? 'transfer' : c.transaction_intent,
          confidence_score: c.confidence_score || 1.0,
        })
        .eq('plaid_transaction_id', c.id)
        .in('account_id', accountIds);
    }

    return NextResponse.json({
      status: 'SUCCESS',
      classified_count: classifications.length
    });

  } catch (error: unknown) {
    return toErrorResponse(error, 'telemetry-transactions');
  }
}