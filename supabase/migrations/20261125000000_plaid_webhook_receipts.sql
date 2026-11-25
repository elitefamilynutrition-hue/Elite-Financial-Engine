-- Durable Plaid webhook idempotency (replaces in-memory Map across cold starts).
CREATE TABLE IF NOT EXISTS public.plaid_webhook_receipts (
  idempotency_key text PRIMARY KEY,
  item_id text,
  webhook_type text,
  webhook_code text,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS plaid_webhook_receipts_received_at_idx
  ON public.plaid_webhook_receipts (received_at);

COMMENT ON TABLE public.plaid_webhook_receipts IS
  'Plaid webhook delivery receipts for 24h idempotency. No user_id — keyed by body hash.';

ALTER TABLE public.plaid_webhook_receipts ENABLE ROW LEVEL SECURITY;

-- Service role only; no policies for authenticated clients.
