import { NextResponse } from 'next/server';

/**
 * Typed API failures. Route handlers throw these; `toErrorResponse` turns them
 * into a JSON response without leaking Postgres/Plaid internals to the client.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, message: string, code = 'api_error') {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }

  static unauthorized(message = 'Unauthorized') {
    return new ApiError(401, message, 'unauthorized');
  }

  static forbidden(message = 'Forbidden') {
    return new ApiError(403, message, 'forbidden');
  }

  static badRequest(message: string) {
    return new ApiError(400, message, 'bad_request');
  }

  static notFound(message = 'Not found') {
    return new ApiError(404, message, 'not_found');
  }

  /** Payment required — used for inactive Stripe subscriptions. */
  static paymentRequired(message = 'An active subscription is required.') {
    return new ApiError(402, message, 'payment_required');
  }
}

interface ErrorLike {
  message?: string;
  code?: string;
  status?: number;
  response?: { data?: { error_message?: string; error_code?: string } };
}

const SAFE_FALLBACK = 'Something went wrong. Please try again.';

/**
 * Converts any thrown value into a client-safe NextResponse.
 *
 * Only ApiError messages are forwarded verbatim. Everything else is logged
 * server-side and replaced with an opaque message so we never leak table names,
 * constraint names, or upstream provider payloads.
 */
export function toErrorResponse(error: unknown, context: string): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status }
    );
  }

  const err = error as ErrorLike;

  // Plaid SDK errors: surface the error code (not the raw payload) so the client
  // can react to ITEM_LOGIN_REQUIRED without seeing internal detail.
  const plaidCode = err?.response?.data?.error_code;
  if (plaidCode) {
    console.error(`[${context}] Plaid error ${plaidCode}:`, err?.response?.data);
    return NextResponse.json(
      { error: 'The bank connection needs attention. Please re-link the account.', code: plaidCode },
      { status: 502 }
    );
  }

  console.error(`[${context}]`, err?.message || error);

  return NextResponse.json({ error: SAFE_FALLBACK, code: 'internal_error' }, { status: 500 });
}

/** Reads and validates a JSON body, throwing a 400 instead of crashing on bad input. */
export async function readJsonBody<T = Record<string, unknown>>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw ApiError.badRequest('Request body must be valid JSON.');
  }
}
