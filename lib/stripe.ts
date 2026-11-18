import Stripe from 'stripe';
import { ApiError } from '@/lib/http/api-error';

let stripeClient: Stripe | null = null;

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw ApiError.badRequest(
      'Billing is not configured yet (missing STRIPE_SECRET_KEY). Checkout is deferred until go-live.'
    );
  }
  if (!stripeClient) {
    stripeClient = new Stripe(key, {
      apiVersion: '2026-10-28.endive',
      typescript: true,
    });
  }
  return stripeClient;
}

export function getStripePriceId(): string {
  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) {
    throw ApiError.badRequest(
      'Billing is not configured yet (missing STRIPE_PRICE_ID). Checkout is deferred until go-live.'
    );
  }
  return priceId;
}

export function getAppUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
}
