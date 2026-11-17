# Elite Capital Engine schema registry

Source of truth for tables, RLS, and upsert conflict targets. Reconstructed from live Supabase CSV dumps (Week 1 Day 4). Migrations live under `supabase/migrations/`.

## Migrations

| File | Purpose |
|------|---------|
| `20261110000000_initial_schema_from_dump.sql` | CREATE TABLE for dumped tables only |
| `20261110000001_rls_policies.sql` | ENABLE RLS + `auth.uid() = user_id` ALL policies (16 tables) |
| `20261110000002_drop_manual_accounts_nil_uuid_default.sql` | Optional: drop nil-UUID default on `manual_accounts.user_id` |

Apply against an empty project with the Supabase CLI, or use as documentation / diff against production. Production already has these objects — prefer `db dump` / policy sync over blind re-CREATE.

## RLS (all 16)

Every tenant table: `PERMISSIVE` / `ALL` / `TO public` / `USING (auth.uid() = user_id)` (and `WITH CHECK` in migration).

| Table | Policy name |
|-------|-------------|
| `financial_accounts` | Users can manage their own financial accounts |
| `program_baselines` | Users can manage their own baselines |
| `monthly_telemetry_snapshots` | Users can manage their own snapshots |
| `paystub_records` | Users can manage their own paystub records |
| `plaid_items` | Users can manage their own plaid items |
| `manual_account_transactions` | Users manage own manual account transactions |
| `user_financial_profiles` | Users can manage their own profile |
| `manual_accounts` | Users manage own manual accounts |
| `sinking_funds` | Users manage own sinking funds |
| `future_liquidity_events` | Users manage own future liquidity events |
| `amazon_rsu_schedule` | Users can manage own RSU schedule |
| `investment_transactions` | Users manage own investment transactions |
| `capital_windfalls` | Users can manage own windfalls |
| `user_custom_categorization_rules` | Users manage their own categorization rules |
| `transactions` | Users can manage their own transactions |
| `historical_snapshots` | Users manage own historical snapshots |

**Note:** Service-role clients bypass RLS. Tenant isolation for those routes is application-enforced (`.eq('user_id', …)`).

## App `onConflict` unique keys

| Table | `onConflict` in code | Required DB constraint |
|-------|----------------------|-------------------------|
| `plaid_items` | `item_id` | `UNIQUE (item_id)` |
| `financial_accounts` | `plaid_account_id` | `UNIQUE (plaid_account_id)` |
| `transactions` | `plaid_transaction_id` | `UNIQUE (plaid_transaction_id)` |
| `investment_transactions` | `plaid_investment_transaction_id` | `UNIQUE (plaid_investment_transaction_id)` |
| `user_financial_profiles` | `user_id` | `UNIQUE (user_id)` |
| `historical_snapshots` | `user_id,snapshot_date` | **`UNIQUE (user_id, snapshot_date)`** (composite) |
| `monthly_telemetry_snapshots` | (audit / future writers) | **`UNIQUE (user_id, snapshot_date)`** (composite) |

### Snapshot unique repair (if live DB has separate single-column UNIQUEs)

CSV dumps listed `UNIQUE` on `user_id` and `snapshot_date` separately, which breaks multi-day snapshots. Migration creates the composite on fresh installs. On an existing project, run after inspecting index names:

```sql
-- Inspect first:
-- SELECT indexname, indexdef FROM pg_indexes WHERE tablename IN ('historical_snapshots','monthly_telemetry_snapshots');

-- Then drop the bad single-column uniques (names vary) and add:
ALTER TABLE public.historical_snapshots
  DROP CONSTRAINT IF EXISTS historical_snapshots_user_id_key,
  DROP CONSTRAINT IF EXISTS historical_snapshots_snapshot_date_key;
ALTER TABLE public.historical_snapshots
  ADD CONSTRAINT historical_snapshots_user_id_snapshot_date_key UNIQUE (user_id, snapshot_date);

ALTER TABLE public.monthly_telemetry_snapshots
  DROP CONSTRAINT IF EXISTS monthly_telemetry_snapshots_user_id_key,
  DROP CONSTRAINT IF EXISTS monthly_telemetry_snapshots_snapshot_date_key;
ALTER TABLE public.monthly_telemetry_snapshots
  ADD CONSTRAINT monthly_telemetry_snapshots_user_id_snapshot_date_key UNIQUE (user_id, snapshot_date);
```

## Tech debt

### `manual_accounts.user_id` nil-UUID default

Live dump defaulted `user_id` to `00000000-0000-0000-0000-000000000000`. That value never equals `auth.uid()`, so RLS hides those rows from the owner. App inserts set `user_id` explicitly; migration `20261110000002_…` drops the default. Prefer `NOT NULL` + backfill after cleanup.

### Nullable `user_id` on several tables

`transactions.user_id` is `NOT NULL` (good). Prefer tightening `plaid_items`, `investment_transactions`, windfalls, etc. to `NOT NULL` after backfill.

### Incomplete column dumps (no CREATE in repo)

These have RLS policies in migration `000001` but **no CREATE TABLE** (columns were not in the CSV dumps):

- `program_baselines`
- `sinking_funds`
- `user_custom_categorization_rules`

Re-dump from Supabase and add a follow-up migration before treating schema-as-code as complete.

### `paystub_records` truncated dump

Migration includes columns through `post_tax_roth_401k` only. App vision route also writes `employer_401k_match` and `hsa_contribution` — confirm those exist in live DB and add a migration when re-dumped.

### Profile salary / age defaults

`user_financial_profiles` defaults (`annual_gross_salary` 140000, `current_age` 35, etc.) are author-specific product defaults; scrub in Day 5b, not schema Day 4.

## Tables created from dump

`amazon_rsu_schedule`, `capital_windfalls`, `financial_accounts`, `future_liquidity_events`, `historical_snapshots`, `investment_transactions`, `manual_accounts`, `manual_account_transactions`, `monthly_telemetry_snapshots`, `paystub_records` (partial), `plaid_items`, `transactions`, `user_financial_profiles`.
