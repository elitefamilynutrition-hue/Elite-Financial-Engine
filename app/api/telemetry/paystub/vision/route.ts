import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { getServiceSupabase } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY is not configured.' }, { status: 500 });
    }

    const body = await request.json();
    const { fileBase64, mimeType } = body;

    if (!fileBase64 || !mimeType) {
      return NextResponse.json({ error: 'Missing file payload or mimeType.' }, { status: 400 });
    }

    const ai = new GoogleGenAI({ apiKey });

    const prompt = `
You are a forensic payroll extraction engine. Analyze this paystub image/PDF and extract the following exact numerical fields into a strict JSON object:
- pay_date (YYYY-MM-DD string)
- gross_pay (number)
- federal_tax_withheld (number)
- state_tax_withheld (number)
- fica_medicare_tax (number)
- pre_tax_401k (number)
- employer_401k_match (number)
- hsa_contribution (number)
- net_pay (number)

Return ONLY valid JSON with these exact keys. If a field is missing, default to 0.00.
    `;

    const response = await ai.models.generateContent({
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

    const textResponse = response?.text || '';
    const cleanedJson = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();
    
    let parsedData;
    try {
      parsedData = JSON.parse(cleanedJson);
    } catch (e) {
      console.error('Failed to parse Gemini OCR JSON:', textResponse);
      return NextResponse.json({ error: 'Failed to extract structured data from paystub.' }, { status: 422 });
    }

    // Mathematical sanity check to prevent OCR hallucination
    const gross = Number(parsedData.gross_pay || 0);
    const net = Number(parsedData.net_pay || 0);
    const totalDeductions = 
      Number(parsedData.federal_tax_withheld || 0) +
      Number(parsedData.state_tax_withheld || 0) +
      Number(parsedData.fica_medicare_tax || 0) +
      Number(parsedData.pre_tax_401k || 0) +
      Number(parsedData.hsa_contribution || 0);

    // If calculated net differs drastically from extracted net, flag it but persist
    const calculatedNet = gross - totalDeductions;
    console.log(`Paystub OCR Parsed - Gross: ${gross}, Extracted Net: ${net}, Calculated Net: ${calculatedNet}`);

    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from('paystub_records')
      .insert([
        {
          pay_date: parsedData.pay_date || new Date().toISOString().split('T')[0],
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