import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { GoogleGenAI } from '@google/genai';
import { checkRateLimit, rateLimitResponse } from '@/lib/http/rate-limit';
import { requireActiveSubscription } from '@/lib/auth/require-entitlement';
import { toErrorResponse } from '@/lib/http/api-error';

const MAX_CHAT_HISTORY = 40;

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await requireActiveSubscription(user);

    const limited = checkRateLimit(`audit-chat:${user.id}`, 20, 60_000);
    if (!limited.ok) return rateLimitResponse(limited.retryAfterSec);

    // 1. Initialize inside the execution block to guarantee env variables are loaded
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is missing from environment variables.");
    const ai = new GoogleGenAI({ apiKey });

    const { message, history } = await request.json();
    const cappedHistory = Array.isArray(history) ? history.slice(-MAX_CHAT_HISTORY) : [];

    // 2. Fetch live telemetry context to ground the AI response
    const [profileRes, accountsRes, paystubsRes, manualRes, sinkingRes] = await Promise.all([
      supabase.from('user_financial_profiles').select('*').eq('user_id', user.id).single(),
      supabase.from('financial_accounts').select('*').eq('user_id', user.id),
      supabase.from('paystub_records').select('*').eq('user_id', user.id).order('pay_date', { ascending: false }).limit(1),
      supabase.from('manual_accounts').select('*').eq('user_id', user.id),
      supabase.from('sinking_funds').select('fund_name, target_amount, recurring_schedule, due_date').eq('user_id', user.id),
    ]);

    const profile = profileRes.data || {
      current_age: null,
      target_retirement_age: null,
      annual_gross_salary: null,
    };
    const accounts = accountsRes.data || [];
    const paystub = paystubsRes.data?.[0] || null;
    const manualAccounts = manualRes.data || [];
    const sinkingFunds = sinkingRes.data || [];

    // 3. Compute baseline metrics securely on the server
    const totalLiquid = accounts
      .filter((a: any) => a.account_type === 'depository')
      .reduce((sum: number, a: any) => sum + Number(a.current_balance), 0);

    const revolvingDebt = accounts
      .filter((a: any) => a.account_type === 'credit')
      .reduce((sum: number, a: any) => sum + Number(a.current_balance), 0);

    const totalManualDebt = manualAccounts.reduce((sum: number, a: any) => sum + Number(a.current_balance), 0);

    const systemPrompt = `
You are the Elite Capital Engine Audit Sparring Partner—built on math-first wealth architecture. 
Your tone is hard-ass, direct, uncompromising on financial discipline, but fundamentally educational and rooted in forensic truth-seeking rather than blind lecturing.

RULES OF ENGAGEMENT:
1. NEVER ASSUME MALICE ON OUTLIERS: If a spending category spikes (e.g., Travel), ask the user if it's an advance booking/lump-sum outlay for a major life event before labeling it lifestyle creep.
2. DISTINGUISH TRANSACTORS VS. DEBTORS: Check if credit card balances are routine statement floats paid in full for rewards (0% APR transactor) versus toxic revolving debt charging interest.
3. NET TAKE-HOME ANCHORING: Calculate wealth quotas and savings rates against net take-home cash flow or accounting for upstream pre-tax deductions (401k/HSA), not raw W-2 gross numbers the user never touches.
4. EDUCATE ON THE "WHY": Never give a directive without breaking down the underlying cash-flow, tax, or interest mechanics.
5. SINKING FUNDS: Match large one-time charges against the operator's sinking_funds list (insurance premiums, annual fees) before calling them creep.

OPERATOR TELEMETRY CONTEXT:
- Age: ${profile.current_age ?? 'not set'} | Target Retirement: ${profile.target_retirement_age ?? 'not set'}
- Gross Salary: ${profile.annual_gross_salary != null ? `$${profile.annual_gross_salary}` : 'not set'}
- Liquid Capital: $${totalLiquid.toFixed(2)}
- Revolving Credit Lines: $${revolvingDebt.toFixed(2)}
- Manual/Fixed Liabilities: $${totalManualDebt.toFixed(2)}
- Latest Paystub Net Pay: ${paystub ? `$${paystub.net_pay}` : 'Not synced'}
- Sinking Funds: ${JSON.stringify(sinkingFunds)}
`;

    // 4. STRIP the frontend's static welcome message to prevent Gemini's "Alternating Roles" API Crash
    const cleanHistory = cappedHistory.filter((h: any) => !h.content?.includes('Audit telemetry loaded.'));

    const chatHistory = [
      { role: 'user', parts: [{ text: systemPrompt }] },
      { role: 'model', parts: [{ text: 'System context acknowledged. I am ready for the operator query.' }] },
      ...cleanHistory.map((h: any) => ({
        role: h.role,
        parts: [{ text: h.content }]
      })),
      { role: 'user', parts: [{ text: message }] }
    ];

    let responseText = '';
    let lastError = null;
    const targetModel = 'gemini-3.6-flash';

    // Retry loop to handle temporary 503 capacity spikes cleanly without 404 fallback failures
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model: targetModel,
          contents: chatHistory,
        });
        responseText = response.text || '';
        break;
      } catch (err: any) {
        lastError = err;
        console.warn(`[Audit Engine] ${targetModel} attempt ${attempt} failed:`, err?.message || 'Unknown error');
        if (attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
      }
    }

    if (!responseText) {
      throw lastError || new Error('Upstream provider is experiencing temporary capacity limits. Please try again.');
    }

    return NextResponse.json({ status: 'SUCCESS', reply: responseText });
  } catch (error: unknown) {
    return toErrorResponse(error, 'audit-chat');
  }
}