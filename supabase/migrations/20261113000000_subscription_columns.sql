-- Stripe entitlement columns on user_financial_profiles (Week 3 Day 1).

ALTER TABLE public.user_financial_profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT 'inactive';

CREATE INDEX IF NOT EXISTS user_financial_profiles_stripe_customer_id_idx
  ON public.user_financial_profiles (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;
