import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { requireUser, requireLabAccess } from '@/lib/auth/require-user';
import { isRagTaxEnabled } from '@/lib/auth/admin';
import { assertLabMfaIfRequired } from '@/lib/auth/mfa';
import { ApiError, readJsonBody, toErrorResponse } from '@/lib/http/api-error';
import { checkRateLimit, rateLimitResponse } from '@/lib/http/rate-limit';
import { retrieveRagTaxChunks } from '@/lib/lab/rag-tax';

export async function POST(request: Request) {
  try {
    if (!isRagTaxEnabled()) {
      throw ApiError.notFound('RAG tax is disabled.');
    }

    const user = await requireUser();
    requireLabAccess(user);

    const supabase = await createServerSupabaseClient();
    await assertLabMfaIfRequired(supabase, user);

    const limited = checkRateLimit(`lab-rag-tax:${user.id}`, 20, 60_000);
    if (!limited.ok) return rateLimitResponse(limited.retryAfterSec);

    const body = await readJsonBody<{ query?: string }>(request);
    const query = (body.query || '').trim();
    if (query.length < 3) throw ApiError.badRequest('Query must be at least 3 characters.');

    const citations = retrieveRagTaxChunks(query, 3);
    const answer =
      citations.length === 0
        ? 'No matching notes in the Lab tax corpus. Try terms like “standard deduction”, “marginal”, or “401k”.'
        : citations
            .map(
              (c, i) =>
                `(${i + 1}) ${c.title}\n${c.body.split('\n').slice(2, 8).join(' ').slice(0, 400)}…`
            )
            .join('\n\n');

    return NextResponse.json({
      status: 'SUCCESS',
      disclaimer:
        'Educational Lab retrieval only — not tax, legal, or financial advice. Verify with a qualified professional.',
      query,
      answer,
      citations: citations.map((c) => ({ id: c.id, title: c.title, source: c.source })),
    });
  } catch (error) {
    return toErrorResponse(error, 'lab-rag-tax');
  }
}
