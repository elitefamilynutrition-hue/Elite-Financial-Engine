-- Week 4 Day 1: exclude UGMA / non-operational accounts from net-worth aggregates.
ALTER TABLE public.financial_accounts
  ADD COLUMN IF NOT EXISTS exclude_from_net_worth boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.financial_accounts.exclude_from_net_worth IS
  'When true, omitted from liquid/invest/liability NW aggregates (e.g. UGMA custodial). Still syncs.';
