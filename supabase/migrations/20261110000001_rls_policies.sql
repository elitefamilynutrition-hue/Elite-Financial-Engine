-- RLS policies from live dump (Day 4).
-- Pattern: PERMISSIVE ALL for role public using (auth.uid() = user_id).
-- Tables without CREATE in 20261110000000 still get ENABLE + POLICY if they exist.

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'financial_accounts',
    'program_baselines',
    'monthly_telemetry_snapshots',
    'paystub_records',
    'plaid_items',
    'manual_account_transactions',
    'user_financial_profiles',
    'manual_accounts',
    'sinking_funds',
    'future_liquidity_events',
    'amazon_rsu_schedule',
    'investment_transactions',
    'capital_windfalls',
    'user_custom_categorization_rules',
    'transactions',
    'historical_snapshots'
  ];
  policy_names text[] := ARRAY[
    'Users can manage their own financial accounts',
    'Users can manage their own baselines',
    'Users can manage their own snapshots',
    'Users can manage their own paystub records',
    'Users can manage their own plaid items',
    'Users manage own manual account transactions',
    'Users can manage their own profile',
    'Users manage own manual accounts',
    'Users manage own sinking funds',
    'Users manage own future liquidity events',
    'Users can manage own RSU schedule',
    'Users manage own investment transactions',
    'Users can manage own windfalls',
    'Users manage their own categorization rules',
    'Users can manage their own transactions',
    'Users manage own historical snapshots'
  ];
  i int;
BEGIN
  FOR i IN 1 .. array_length(tables, 1) LOOP
    t := tables[i];
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'Skipping RLS for missing table: %', t;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    -- Drop policy if re-running migration
    IF EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t AND policyname = policy_names[i]
    ) THEN
      EXECUTE format('DROP POLICY %I ON public.%I', policy_names[i], t);
    END IF;

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO public USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)',
      policy_names[i],
      t
    );
  END LOOP;
END $$;
