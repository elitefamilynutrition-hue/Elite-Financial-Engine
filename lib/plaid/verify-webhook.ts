import { createHash, timingSafeEqual } from 'crypto';
import { decodeProtectedHeader, importJWK, jwtVerify, type JWK } from 'jose';
import { plaidClient } from '@/lib/plaid';

/**
 * Plaid webhook JWT verification (ES256 + body SHA-256).
 * @see https://plaid.com/docs/api/webhooks/webhook-verification/
 */

const jwkCache = new Map<string, JWK>();

/**
 * Best-effort 24h idempotency. In-memory only — resets on cold start and is
 * not shared across multiple serverless instances. Prefer a
 * `plaid_webhook_receipts` table when schema migrations land (Day 4).
 */
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const recentDeliveries = new Map<string, number>();

function pruneExpiredDeliveries(now = Date.now()) {
  for (const [key, seenAt] of recentDeliveries) {
    if (now - seenAt > IDEMPOTENCY_TTL_MS) {
      recentDeliveries.delete(key);
    }
  }
}

export function getWebhookIdempotencyKey(rawBody: string, bodySha256FromJwt?: string): string {
  return bodySha256FromJwt || createHash('sha256').update(rawBody, 'utf8').digest('hex');
}

/** Returns true if this delivery was already processed within the TTL window. */
export function claimWebhookDelivery(idempotencyKey: string): boolean {
  pruneExpiredDeliveries();
  if (recentDeliveries.has(idempotencyKey)) {
    return false;
  }
  recentDeliveries.set(idempotencyKey, Date.now());
  return true;
}

function getPlaidVerificationHeader(headers: Headers): string | null {
  return headers.get('plaid-verification') || headers.get('Plaid-Verification');
}

function constantTimeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

async function getVerificationJwk(kid: string): Promise<JWK> {
  const cached = jwkCache.get(kid);
  if (cached) return cached;

  const response = await plaidClient.webhookVerificationKeyGet({ key_id: kid });
  const key = response.data.key as JWK;
  jwkCache.set(kid, key);
  return key;
}

export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookVerificationError';
  }
}

/**
 * Verifies the Plaid-Verification JWT against the raw request body.
 * Returns the JWT body SHA-256 claim for idempotency keys.
 */
export async function verifyPlaidWebhook(
  rawBody: string,
  headers: Headers
): Promise<{ requestBodySha256: string }> {
  const signedJwt = getPlaidVerificationHeader(headers);
  if (!signedJwt) {
    throw new WebhookVerificationError('Missing Plaid-Verification header.');
  }

  let protectedHeader: ReturnType<typeof decodeProtectedHeader>;
  try {
    protectedHeader = decodeProtectedHeader(signedJwt);
  } catch {
    throw new WebhookVerificationError('Malformed Plaid-Verification JWT.');
  }

  if (protectedHeader.alg !== 'ES256') {
    throw new WebhookVerificationError('Unexpected JWT alg; expected ES256.');
  }

  const kid = protectedHeader.kid;
  if (!kid || typeof kid !== 'string') {
    throw new WebhookVerificationError('Missing kid in Plaid-Verification JWT header.');
  }

  let jwk: JWK;
  try {
    jwk = await getVerificationJwk(kid);
  } catch {
    throw new WebhookVerificationError('Failed to fetch Plaid webhook verification key.');
  }

  let payload: Record<string, unknown>;
  try {
    const keyLike = await importJWK(jwk);
    const verified = await jwtVerify(signedJwt, keyLike, {
      algorithms: ['ES256'],
      maxTokenAge: '5 min',
    });
    payload = verified.payload as Record<string, unknown>;
  } catch {
    throw new WebhookVerificationError('Plaid-Verification JWT signature or age check failed.');
  }

  const claimedHash = payload.request_body_sha256;
  if (typeof claimedHash !== 'string' || !claimedHash) {
    throw new WebhookVerificationError('JWT missing request_body_sha256 claim.');
  }

  const bodyHash = createHash('sha256').update(rawBody, 'utf8').digest('hex');
  if (!constantTimeEqualHex(bodyHash, claimedHash)) {
    throw new WebhookVerificationError('Webhook body hash does not match JWT claim.');
  }

  return { requestBodySha256: claimedHash };
}
