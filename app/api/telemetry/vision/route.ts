import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { getServiceSupabase } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
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

    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from('paystub_records')
      .insert([
        {
          pay_period_start: payPeriodStart,
          pay_period_end: payPeriodEnd,
          pay_date: payDate,
          gross_pay: gross,
          federal_tax_withheld: Number(parsedData.federal_tax_withheld || 0),
          state_tax_withheld: Number(parsedData.state_tax_withheld || 0),
          fica_medicare_tax: Number(parsedData.fica_medicare_tax || 0),
          pre_tax_401k: Number(parsedData.pre_tax_401k || 0),
          employer_401k_match: Number(parsedData.employer_401k_match || 0),
          hsa_contribution: Number(parsedData.hsa_contribution || 0),
          net_pay: net,
        },
      ])
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      status: 'SUCCESS',
      record: data,
    });
  } catch (error: any) {
    console.error('Paystub Vision API Error:', error?.message || error);
    return NextResponse.json(
      { error: error?.message || 'Failed to process paystub vision upload.' },
      { status: 500 }
    );
  }
}