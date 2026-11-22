import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/require-user';
import { requireActiveSubscription } from '@/lib/auth/require-entitlement';
import { ApiError, readJsonBody, toErrorResponse } from '@/lib/http/api-error';
import { getServiceSupabase } from '@/lib/supabase-admin';
import type { OverrideReason, TransactionIntent } from '@/lib/analytics/intent';

const INTENTS = new Set<TransactionIntent>(['survival', 'creep', 'offense', 'transfer']);
const REASONS = new Set<OverrideReason>(['one_off', 'reimbursed', 'business', 'miscategorized']);

interface OverrideBody {
  user_intent_override?: TransactionIntent | null;
  exclude_from_burn?: boolean;
  override_reason?: OverrideReason | null;
  override_note?: string | null;
  reimbursement_tx_id?: string | null;
  clear?: boolean;
}

/**
 * Session-scoped dispute / reclassify for a single transaction.
 * Tenant is always the signed-in user — never trust body.userId.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    await requireActiveSubscription(user);
    const { id } = await context.params;
    if (!id) throw ApiError.badRequest('Transaction id is required.');

    const body = await readJsonBody<OverrideBody>(request);
    const supabase = getServiceSupabase();

    const { data: existing, error: lookupError } = await supabase
      .from('transactions')
      .select('id, user_id, amount, date')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (lookupError) throw lookupError;
    if (!existing) throw ApiError.notFound('Transaction not found.');

    if (body.clear) {
      const { error } = await supabase
        .from('transactions')
        .update({
          user_intent_override: null,
          exclude_from_burn: false,
          override_reason: null,
          override_note: null,
          reimbursement_tx_id: null,
        })
        .eq('id', id)
        .eq('user_id', user.id);
      if (error) throw error;
      return NextResponse.json({ status: 'SUCCESS', cleared: true });
    }

    const patch: Record<string, unknown> = {};

    if (body.user_intent_override !== undefined) {
      if (body.user_intent_override !== null && !INTENTS.has(body.user_intent_override)) {
        throw ApiError.badRequest('Invalid user_intent_override.');
      }
      patch.user_intent_override = body.user_intent_override;
    }

    if (body.override_reason !== undefined) {
      if (body.override_reason !== null && !REASONS.has(body.override_reason)) {
        throw ApiError.badRequest('Invalid override_reason.');
      }
      patch.override_reason = body.override_reason;
    }

    if (body.override_note !== undefined) {
      patch.override_note = body.override_note;
    }

    if (body.reimbursement_tx_id !== undefined) {
      patch.reimbursement_tx_id = body.reimbursement_tx_id;
    }

    // Defaults: one-off / reimbursed / business exclude from burn; reimbursed → transfer intent.
    const reason = (body.override_reason ?? undefined) as OverrideReason | null | undefined;
    if (body.exclude_from_burn !== undefined) {
      patch.exclude_from_burn = Boolean(body.exclude_from_burn);
    } else if (reason === 'one_off' || reason === 'reimbursed' || reason === 'business') {
      patch.exclude_from_burn = true;
    }

    if (
      body.user_intent_override === undefined &&
      (reason === 'reimbursed' || reason === 'business')
    ) {
      patch.user_intent_override = 'transfer';
    }

    if (Object.keys(patch).length === 0) {
      throw ApiError.badRequest('No override fields provided.');
    }

    // Optional: validate reimbursement link belongs to same tenant and is an inflow.
    if (typeof patch.reimbursement_tx_id === 'string' && patch.reimbursement_tx_id) {
      const { data: inflow, error: inflowError } = await supabase
        .from('transactions')
        .select('id, amount, user_id')
        .eq('id', patch.reimbursement_tx_id)
        .eq('user_id', user.id)
        .maybeSingle();
      if (inflowError) throw inflowError;
      if (!inflow) throw ApiError.badRequest('Reimbursement transaction not found.');
      if (Number(inflow.amount) >= 0) {
        throw ApiError.badRequest('Reimbursement link must point to an inflow (negative amount).');
      }
    }

    const { data: updated, error: updateError } = await supabase
      .from('transactions')
      .update(patch)
      .eq('id', id)
      .eq('user_id', user.id)
      .select(
        'id, user_intent_override, exclude_from_burn, override_reason, override_note, reimbursement_tx_id, transaction_intent'
      )
      .single();

    if (updateError) throw updateError;

    return NextResponse.json({ status: 'SUCCESS', transaction: updated });
  } catch (error) {
    return toErrorResponse(error, 'transaction-override');
  }
}
