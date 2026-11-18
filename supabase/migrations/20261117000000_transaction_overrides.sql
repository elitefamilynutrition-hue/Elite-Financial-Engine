-- User dispute / reclassify overrides on transactions (Week 4 category burn UX).

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS user_intent_override text,
  ADD COLUMN IF NOT EXISTS exclude_from_burn boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS override_reason text,
  ADD COLUMN IF NOT EXISTS override_note text,
  ADD COLUMN IF NOT EXISTS reimbursement_tx_id text,
  ADD COLUMN IF NOT EXISTS pending_transaction_id text;

COMMENT ON COLUMN public.transactions.user_intent_override IS
  'User override of transaction_intent: survival|creep|offense|transfer. Wins over Plaid classify.';
COMMENT ON COLUMN public.transactions.exclude_from_burn IS
  'When true, excluded from Category Burn and Survival Floor (one-off / reimbursed / business).';
COMMENT ON COLUMN public.transactions.override_reason IS
  'one_off|reimbursed|business|miscategorized';
COMMENT ON COLUMN public.transactions.pending_transaction_id IS
  'Plaid pending_transaction_id when a posted tx replaces a pending one; used for dedupe.';

CREATE INDEX IF NOT EXISTS transactions_pending_transaction_id_idx
  ON public.transactions (pending_transaction_id)
  WHERE pending_transaction_id IS NOT NULL;
