-- BudgetDog schema reconstructed from live Supabase CSV dumps (Day 4).
-- Do not invent columns: only tables/columns present in the dumps are created here.
-- Incomplete dumps: program_baselines, sinking_funds, user_custom_categorization_rules
-- (RLS only in 20261110000001). paystub_records dump was truncated mid-table.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------------------------------------------------------------------------
-- amazon_rsu_schedule
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.amazon_rsu_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users (id),
  vest_date date NOT NULL,
  shares_vesting numeric NOT NULL,
  estimated_share_price numeric NOT NULL,
  tax_drag_pct numeric DEFAULT 0.3215,
  status text DEFAULT 'PENDING',
  created_at timestamptz DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- capital_windfalls
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.capital_windfalls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users (id),
  source_name text NOT NULL,
  source_type text DEFAULT 'RSU',
  expected_date date NOT NULL,
  gross_amount numeric NOT NULL,
  tax_drag_pct numeric DEFAULT 0.3215,
  target_liability_id uuid,
  status text DEFAULT 'PENDING',
  created_at timestamptz DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- financial_accounts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.financial_accounts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  plaid_account_id text NOT NULL UNIQUE,
  account_name text NOT NULL,
  account_type text NOT NULL,
  account_subtype text,
  current_balance numeric NOT NULL,
  available_balance numeric,
  currency_code text DEFAULT 'USD',
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  custom_name text
);

-- ---------------------------------------------------------------------------
-- future_liquidity_events
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.future_liquidity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users (id),
  event_name text NOT NULL,
  target_date date NOT NULL,
  target_amount numeric NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- historical_snapshots
-- Dump CSV listed separate UNIQUE on user_id and snapshot_date; app requires
-- composite UNIQUE (user_id, snapshot_date) for onConflict: 'user_id,snapshot_date'.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.historical_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users (id),
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  liquid_capital numeric DEFAULT 0,
  total_liabilities numeric DEFAULT 0,
  survival_floor numeric DEFAULT 0,
  monthly_burn_rate numeric DEFAULT 0,
  wealth_quota_target numeric DEFAULT 0,
  wealth_quota_actual numeric DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  investment_capital numeric DEFAULT 0,
  UNIQUE (user_id, snapshot_date)
);

-- ---------------------------------------------------------------------------
-- investment_transactions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.investment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plaid_investment_transaction_id text NOT NULL UNIQUE,
  account_id text NOT NULL,
  security_id text,
  name text,
  amount numeric NOT NULL,
  price numeric,
  quantity numeric,
  date date NOT NULL,
  type text,
  subtype text,
  created_at timestamptz DEFAULT now(),
  user_id uuid REFERENCES auth.users (id)
);

-- ---------------------------------------------------------------------------
-- manual_accounts
-- TECH DEBT: user_id default nil UUID — see SCHEMA.md / optional migration.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.manual_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid DEFAULT '00000000-0000-0000-0000-000000000000'::uuid,
  account_name text NOT NULL,
  institution_name text,
  current_balance numeric NOT NULL DEFAULT 0.00,
  interest_rate numeric NOT NULL DEFAULT 0.00,
  minimum_payment numeric NOT NULL DEFAULT 0.00,
  due_date_day integer,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- manual_account_transactions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.manual_account_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manual_account_id uuid REFERENCES public.manual_accounts (id),
  transaction_date date NOT NULL,
  amount numeric NOT NULL,
  transaction_type text NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now(),
  user_id uuid REFERENCES auth.users (id)
);

-- ---------------------------------------------------------------------------
-- monthly_telemetry_snapshots
-- Same composite unique fix as historical_snapshots.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.monthly_telemetry_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid DEFAULT auth.uid(),
  snapshot_date date NOT NULL,
  liquid_capital numeric NOT NULL DEFAULT 0.00,
  revolving_debt numeric NOT NULL DEFAULT 0.00,
  net_liquidity numeric NOT NULL DEFAULT 0.00,
  total_burn numeric NOT NULL DEFAULT 0.00,
  savings_rate_pct numeric DEFAULT 0.00,
  top_categories jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, snapshot_date)
);

-- ---------------------------------------------------------------------------
-- paystub_records (dump truncated after post_tax_roth_401k)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.paystub_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid DEFAULT auth.uid(),
  pay_period_start date NOT NULL,
  pay_period_end date NOT NULL,
  pay_date date NOT NULL,
  gross_pay numeric NOT NULL,
  net_pay numeric NOT NULL,
  federal_tax_withheld numeric NOT NULL DEFAULT 0.00,
  state_tax_withheld numeric NOT NULL DEFAULT 0.00,
  fica_medicare_tax numeric NOT NULL DEFAULT 0.00,
  pre_tax_401k numeric NOT NULL DEFAULT 0.00,
  post_tax_roth_401k numeric NOT NULL DEFAULT 0.00
);

-- ---------------------------------------------------------------------------
-- plaid_items
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.plaid_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id text NOT NULL UNIQUE,
  access_token text NOT NULL,
  institution_id text,
  institution_name text,
  next_cursor text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  user_id uuid DEFAULT auth.uid()
);

-- ---------------------------------------------------------------------------
-- transactions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.transactions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  plaid_transaction_id text NOT NULL UNIQUE,
  account_id text NOT NULL,
  amount numeric NOT NULL,
  date date NOT NULL,
  name text NOT NULL,
  merchant_name text,
  category text,
  pending boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  transaction_intent text DEFAULT 'survival',
  is_internal_transfer boolean DEFAULT false,
  confidence_score numeric DEFAULT 1.0,
  lineage_group_id uuid,
  linked_transaction_id uuid
);

-- ---------------------------------------------------------------------------
-- user_financial_profiles
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_financial_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid DEFAULT auth.uid() UNIQUE,
  current_age integer NOT NULL DEFAULT 35,
  target_retirement_age integer NOT NULL DEFAULT 55,
  annual_gross_salary numeric NOT NULL DEFAULT 140000.00,
  annual_bonus_target numeric DEFAULT 0.00,
  target_emergency_months integer NOT NULL DEFAULT 6,
  marginal_tax_bracket numeric DEFAULT 24.00,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  relationship_status text DEFAULT 'Single',
  dependents_count integer DEFAULT 0,
  variable_compensation_flag boolean DEFAULT false,
  financial_kryptonite text,
  joint_finances_flag boolean DEFAULT false,
  employment_type text DEFAULT 'W-2',
  housing_status text DEFAULT 'Rent',
  state_of_residence character varying,
  health_plan_type text DEFAULT 'Unknown',
  term_life_coverage numeric DEFAULT 0.00,
  business_entity_type text DEFAULT 'None',
  living_trust_established boolean DEFAULT false,
  traditional_ira_balance numeric DEFAULT 0.00,
  mega_backdoor_eligible boolean DEFAULT false,
  rsu_vesting_flag boolean DEFAULT false,
  espp_participation_flag boolean DEFAULT false,
  dependent_care_fsa_flag boolean DEFAULT false,
  child_investment_accounts boolean DEFAULT false,
  illiquid_alternatives_flag boolean DEFAULT false,
  international_assets_flag boolean DEFAULT false,
  tax_loss_carryforward numeric DEFAULT 0.00,
  portfolio_margin_flag boolean DEFAULT false,
  nqdc_participation_flag boolean DEFAULT false,
  donor_advised_fund_flag boolean DEFAULT false,
  cash_value_life_insurance_flag boolean DEFAULT false,
  real_estate_tax_loophole_flag boolean DEFAULT false,
  expected_inflation_rate numeric DEFAULT 3.0,
  safe_withdrawal_rate numeric DEFAULT 4.0
);

-- Live DB may already have separate unique indexes on snapshot columns.
-- Prefer composite; drop conflicting single-column uniques if present.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.historical_snapshots'::regclass
      AND contype = 'u'
      AND array_length(conkey, 1) = 1
  ) THEN
    -- Best-effort: leave named constraints alone if unknown; composite UNIQUE above
    -- applies on fresh create. For existing DBs, run SCHEMA.md repair SQL.
    NULL;
  END IF;
END $$;
