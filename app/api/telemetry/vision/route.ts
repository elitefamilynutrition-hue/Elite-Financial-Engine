import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { getServiceSupabase } from '@/lib/supabase-admin';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { checkRateLimit, rateLimitResponse } from '@/lib/http/rate-limit';
import { requireActiveSubscription } from '@/lib/auth/require-entitlement';
import { toErrorResponse } from '@/lib/http/api-error';
import { calculateMarginalBracket } from '@/lib/tax/brackets';

export async function POST(request: Request) {
  try {
    // 1. Authenticate user session
    const authSupabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await authSupabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized session.' }, { status: 401 });
    }

    await requireActiveSubscription(user);

    const limited = checkRateLimit(`vision:${user.id}`, 10, 60_000);
    if (!limited.ok) return rateLimitResponse(limited.retryAfterSec);

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY is not configured.' }, { status: 500 });
    }

    const formData = await request.formData();
    const file = formData.get('paystub') as File;

    if (!file) {
      return NextResponse.json({ error: 'No paystub file provided in form data.' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const fileBase64 = buffer.toString('base64');
    const mimeType = file.type;

    const ai = new GoogleGenAI({ apiKey });

    const prompt = `
You are a forensic payroll extraction engine. Analyze this paystub document and extract the exact fields into a strict JSON object:
- pay_period_start (YYYY-MM-DD string)
- pay_period_end (YYYY-MM-DD string)
- pay_date (YYYY-MM-DD string)
- gross_pay (number)
- federal_tax_withheld (number)
- state_tax_withheld (number)
- fica_medicare_tax (number)
- pre_tax_401k (number)
- employer_401k_match (number)
- hsa_contribution (number)
- net_pay (number)

Return ONLY valid JSON with these exact keys. If a date field is missing, default to the pay_date or today's date. If a monetary field is missing, default to 0.00.
    `;

    let response: any = null;
    const maxRetries = 3;
    const delays = [1500, 3000];

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        response = await ai.models.generateContent({
          model: 'gemini-3.6-flash',
          contents: [
            {
              inlineData: {
                data: fileBase64,
                mimeType: mimeType,
              },
            },
            prompt,
          ],
        });
        if (response?.text) break;
      } catch (err: any) {
        const isUnavailable = err?.status === 503 || err?.message?.includes('503');
        if (isUnavailable && attempt < maxRetries - 1) {
          console.warn(`Gemini 503 spike detected on vision upload. Retrying attempt ${attempt + 2}/${maxRetries}...`);
          await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
        } else {
          throw err;
        }
      }
    }

    const textResponse = response?.text || '';
    const cleanedJson = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();

    let parsedData;
    try {
      parsedData = JSON.parse(cleanedJson);
    } catch (e) {
      console.error('Failed to parse Gemini OCR JSON:', textResponse);
      return NextResponse.json({ error: 'Failed to extract structured data from paystub.' }, { status: 422 });
    }

    const currentDate = new Date().toISOString().split('T')[0];
    const payDate = parsedData.pay_date || currentDate;
    const payPeriodStart = parsedData.pay_period_start || payDate;
    const payPeriodEnd = parsedData.pay_period_end || payDate;

    const gross = Number(parsedData.gross_pay || 0);
    const net = Number(parsedData.net_pay || 0);
    const preTax401k = Number(parsedData.pre_tax_401k || 0);
    const hsaContribution = Number(parsedData.hsa_contribution || 0);

    const supabase = getServiceSupabase();

    // 2. Duplicate Check: Prevent double-counting if user uploads the same paystub twice
    const { data: existingStub } = await supabase
      .from('paystub_records')
      .select('id')
      .eq('user_id', user.id)
      .eq('pay_date', payDate)
      .eq('pay_period_end', payPeriodEnd)
      .maybeSingle();

    const payload = {
      user_id: user.id,
      pay_period_start: payPeriodStart,
      pay_period_end: payPeriodEnd,
      pay_date: payDate,
      gross_pay: gross,
      federal_tax_withheld: Number(parsedData.federal_tax_withheld || 0),
      state_tax_withheld: Number(parsedData.state_tax_withheld || 0),
      fica_medicare_tax: Number(parsedData.fica_medicare_tax || 0),
      pre_tax_401k: preTax401k,
      employer_401k_match: Number(parsedData.employer_401k_match || 0),
      hsa_contribution: hsaContribution,
      net_pay: net,
    };

    let savedRecord;
    if (existingStub?.id) {
      const { data, error } = await supabase
        .from('paystub_records')
        .update(payload)
        .eq('id', existingStub.id)
        .select()
        .single();
      if (error) throw error;
      savedRecord = data;
    } else {
      const { data, error } = await supabase
        .from('paystub_records')
        .insert([payload])
        .select()
        .single();
      if (error) throw error;
      savedRecord = data;
    }

    // 3. Auto-Refine Marginal Tax Bracket in user_financial_profiles based on real pre-tax deductions
    const { data: userProfile } = await supabase
      .from('user_financial_profiles')
      .select('annual_gross_salary, annual_bonus_target, relationship_status')
      .eq('user_id', user.id)
      .maybeSingle();

    if (userProfile) {
      // Infer pay frequency from pay period length (default 24 semi-monthly if dates match)
      const startMs = new Date(payPeriodStart).getTime();
      const endMs = new Date(payPeriodEnd).getTime();
      const periodDays = Math.max(1, Math.round((endMs - startMs) / (1000 * 60 * 60 * 24)));
      
      let periodsPerYear = 24;
      if (periodDays <= 8) periodsPerYear = 52;
      else if (periodDays <= 14) periodsPerYear = 26;
      else if (periodDays >= 27) periodsPerYear = 12;

      const annualPreTaxDeductions = (preTax401k + hsaContribution) * periodsPerYear;
      const annualGross = Number(userProfile.annual_gross_salary || 0) || (gross * periodsPerYear);
      const annualBonus = Number(userProfile.annual_bonus_target || 0);

      const dynamicBracket = calculateMarginalBracket({
        annualGross,
        annualBonus,
        annualPreTaxDeductions,
        filingStatus: userProfile.relationship_status || 'Single',
      });

      await supabase
        .from('user_financial_profiles')
        .update({ marginal_tax_bracket: dynamicBracket })
        .eq('user_id', user.id);
    }

    return NextResponse.json({
      status: 'SUCCESS',
      record: savedRecord,
      deduplicated: Boolean(existingStub?.id),
    });
  } catch (error: unknown) {
    return toErrorResponse(error, 'telemetry-vision');
  }
}