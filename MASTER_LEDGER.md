# BUDGETDOG FINANCIAL ENGINE — MASTER LEDGER & ARCHITECTURE REGISTRY

**Operating Philosophy:** Brennan Schlagbaum (BudgetDog) Math-First Wealth Architecture  
**Core Stack:** Next.js 15 (App Router), Supabase (PostgreSQL, RLS), Plaid API, Google Gemini (`gemini-3.6-flash`), Tailwind CSS  
**Ledger Policy:** Maintain a single source of truth. Schema, routes, components, and roadmaps are consolidated in the primary registry, with individual milestone completions logged chronologically.

---

## 1. PROJECT OVERVIEW & ARCHITECTURAL FOUNDATION

The BudgetDog Financial Engine is an automated financial telemetry and forensic auditing platform. It transforms passive financial tracking into an active capital allocation system adhering to Brennan Schlagbaum's Order of Operations.

### Core Objectives
1. **Automated Delta Telemetry:** Ingest and normalize multi-institution accounts and transactions via Plaid cursor-based syncing without credential re-authentication.
2. **Deterministic Pre-Aggregation:** Compute liquid capital, revolving debt, net liquidity, cash burn, and categorical outflows on the server to prevent LLM mathematical hallucination.
3. **Forensic AI Auditing:** Execute deterministic financial audits via `gemini-3.6-flash` assessing debt drag, cash drag, tax drag, and lifestyle creep.
4. **Longitudinal Memory & Upstream Telemetry:** Benchmark real-time telemetry against pre-program baselines, track month-over-month velocity, and audit gross-to-net paystub deductions.
5. **Zero-Plaintext Security:** Enforce authenticated AES-256-GCM encryption at rest for all third-party banking tokens.

---

## 2. FILE & COMPONENT REGISTRY

### Core Utilities & Security
* **`lib/supabase.ts`**
  * **Status:** Active
  * **Exports:** `supabase` (client-side anon instance), `getServiceSupabase()` (privileged service-role instance for backend routes).
* **`lib/plaid.ts`**
  * **Status:** Active
  * **Purpose:** Initializes official Plaid SDK client configured for Sandbox/Development environments.
* **`lib/crypto.ts`**
  * **Status:** Active
  * **Purpose:** AES-256-GCM encryption module for Plaid credentials using 96-bit IVs and 128-bit authentication tags. Encrypts tokens at rest as `iv:tag:ciphertext` with legacy plaintext fallback support.

### UI Components
* **`components/TelemetryGrid.tsx`**
  * **Status:** Active (Consolidated in root `components` directory)
  * **Metrics Rendered:** Liquid Capital, Revolving Debt, Net Liquidity, 30-Day Outflow Burn, Category Spend Distribution (with operational burn normalization).
* **`components/CapitalSimulator.tsx`**
  * **Status:** Active
  * **Purpose:** Interactive execution component modeling the Order of Operations cascade (wiping Step 2 debt, locking Step 3 6-month HYSA reserve, allocating Step 4 surplus). Models 20-year compound wealth delta against index funds (8.0%) vs. idle cash (1.5%).
* **`components/SettingsDrawer.tsx`**
  * **Status:** Active
  * **Purpose:** Slide-over modal interface managing user profile benchmarks (salary, retirement horizon, EF months) and direct upstream paystub ingestion without terminal commands.
* **`components/PlaidLinkButton.tsx`**
  * **Status:** Active
  * **Purpose:** Triggers `/api/plaid/create-link-token`, opens Plaid Link modal, and routes `public_token` to `/api/plaid/exchange-token`.
* **`components/PaystubDropzone.tsx`**
  * **Status:** Active
  * **Purpose:** Drag-and-drop multimodal interface for uploading PDF/image paystubs for automated Gemini Vision OCR extraction.

### Application Pages & Routes
* **`app/page.tsx`**
  * **Status:** Active
  * **Role:** Dashboard orchestrator. Binds accounts, transactions, `TelemetryGrid`, `CapitalSimulator`, `SettingsDrawer`, manual/auto sync triggers, and Gemini Pro Forensic Audit modal.
* **`app/api/profile/route.ts`**
  * **Status:** Active
  * **Methods:** `GET` (reads `user_financial_profiles`), `POST` (upserts profile benchmarks).
* **`app/api/audit/route.ts`**
  * **Status:** Active
  * **Purpose:** Aggregates live balances, baselines, snapshots, and paystubs with operational burn filters. Submits forensic payload to `gemini-3.6-flash` with exponential backoff handling for `503` spikes.
* **`app/api/plaid/create-link-token/route.ts`**
  * **Status:** Active
  * **Purpose:** Issues Plaid link tokens configured with transaction sync products and webhook callback URLs.
* **`app/api/plaid/exchange-token/route.ts`**
  * **Status:** Active
  * **Purpose:** Exchanges `public_token` for `access_token`, encrypts token via `lib/crypto.ts`, upserts `plaid_items`, and caches initial accounts.
* **`app/api/plaid/sync-transactions/route.ts`**
  * **Status:** Active
  * **Purpose:** Executes delta pagination (`/transactions/sync`), decrypts item access tokens at runtime, updates account balances, and upserts transaction records.
* **`app/api/plaid/webhook/route.ts`**
  * **Status:** Active
  * **Purpose:** Asynchronous webhook listener processing `SYNC_UPDATES_AVAILABLE` events to sync transactions and balances automatically in the background.
* **`app/api/telemetry/baseline/route.ts`**
  * **Status:** Active
  * **Purpose:** Computes Day-Zero pre-program financial baseline across 180 days of historical data and writes to `program_baselines`.
* **`app/api/telemetry/snapshot/route.ts`**
  * **Status:** Active
  * **Purpose:** Snapshots end-of-month financial telemetry to `monthly_telemetry_snapshots` normalized to `YYYY-MM-01`.
* **`app/api/telemetry/paystub/route.ts`**
  * **Status:** Active
  * **Purpose:** Ingests upstream payroll deductions into `paystub_records`, calculating effective tax drag %, pre-tax savings %, and take-home ratio.
* **`app/api/telemetry/vision/route.ts`**
  * **Status:** Active
  * **Purpose:** Multimodal Gemini Vision OCR endpoint parsing PDF/image paystubs with retry logic and writing structured deductions to `paystub_records`.
* **`app/api/admin/encrypt-existing-tokens/route.ts`**
  * **Status:** Active (Administrative)
  * **Purpose:** One-time migration endpoint sweeping legacy unencrypted Plaid access tokens and converting them to AES-256-GCM ciphertexts.

---

## 3. DATABASE SCHEMA REGISTRY (SUPABASE)

```sql
-- 1. Financial Accounts (Balance Sheet Telemetry)
CREATE TABLE financial_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID DEFAULT '00000000-0000-0000-0000-000000000000',
    plaid_account_id TEXT UNIQUE NOT NULL,
    account_name TEXT NOT NULL,
    account_type TEXT NOT NULL,
    account_subtype TEXT,
    current_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    available_balance NUMERIC(12, 2),
    currency_code TEXT DEFAULT 'USD',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Transactions (Granular Inflow/Outflow Telemetry)
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plaid_transaction_id TEXT UNIQUE NOT NULL,
    account_id TEXT NOT NULL,
    name TEXT NOT NULL,
    merchant_name TEXT,
    amount NUMERIC(10, 2) NOT NULL,
    date DATE NOT NULL,
    category TEXT,
    pending BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Plaid Items (Encrypted Institution Access & Sync State)
CREATE TABLE plaid_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id TEXT UNIQUE NOT NULL,
    access_token TEXT NOT NULL, -- Encrypted AES-256-GCM format (iv:tag:ciphertext)
    institution_id TEXT,
    institution_name TEXT,
    next_cursor TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. User Financial Profiles (Retirement & Benchmarks)
CREATE TABLE user_financial_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE DEFAULT '00000000-0000-0000-0000-000000000000',
    current_age INTEGER DEFAULT 35,
    target_retirement_age INTEGER DEFAULT 55,
    annual_gross_salary NUMERIC(12, 2) NOT NULL DEFAULT 140000.00,
    annual_bonus_target NUMERIC(12, 2) DEFAULT 0.00,
    target_emergency_months INTEGER DEFAULT 6,
    marginal_tax_bracket NUMERIC(4, 2) DEFAULT 24.00,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Program Baselines (Pre-Audit Day-Zero Marker)
CREATE TABLE program_baselines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE DEFAULT '00000000-0000-0000-0000-000000000000',
    onboarding_date DATE NOT NULL DEFAULT CURRENT_DATE,
    baseline_avg_monthly_burn NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    baseline_discretionary_burn NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    baseline_fixed_burn NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    baseline_revolving_debt NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Monthly Telemetry Snapshots (Historical Rollups)
CREATE TABLE monthly_telemetry_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID DEFAULT '00000000-0000-0000-0000-000000000000',
    snapshot_date DATE NOT NULL,
    liquid_capital NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    revolving_debt NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    net_liquidity NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_burn NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    top_categories JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_user_snapshot UNIQUE (user_id, snapshot_date)
);

-- 7. Paystub Records (Upstream Tax & Deductions)
CREATE TABLE paystub_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID DEFAULT '00000000-0000-0000-0000-000000000000',
    pay_period_start DATE NOT NULL,
    pay_period_end DATE NOT NULL,
    pay_date DATE NOT NULL,
    gross_pay NUMERIC(12, 2) NOT NULL,
    net_pay NUMERIC(12, 2) NOT NULL,
    federal_tax_withheld NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    state_tax_withheld NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    fica_medicare_tax NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    pre_tax_401k NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    post_tax_roth_401k NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    employer_401k_match NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    hsa_contribution NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    healthcare_premiums NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    other_deductions NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
4. PROJECT ROADMAP & EXECUTION STATUS
PHASE 1: Real-Time Telemetry & Core Audit Engine
[x] Task 1.1: Setup Plaid Link flow and exchange token route.

[x] Task 1.2: Implement Supabase financial_accounts and transactions tables.

[x] Task 1.3: Build TelemetryGrid component for liquidity, debt, burn, and category metrics.

[x] Task 1.4: Create plaid_items table and build cursor-based /api/plaid/sync-transactions route.

[x] Task 1.5: Build BudgetDog forensic audit engine on gemini-3.6-flash with exponential backoff.

[x] Task 1.6: Wire automatic background sync and on-demand sync button in the UI.

PHASE 2: Longitudinal Memory & Pre-Program Baseline Analysis
[x] Task 2.1: Pre-Program Baseline Ingestion (program_baselines and /api/telemetry/baseline).

[x] Task 2.2: Monthly Telemetry Snapshot Table (monthly_telemetry_snapshots and /api/telemetry/snapshot).

[x] Task 2.3: Temporal Trend Prompt Injection into app/api/audit/route.ts with compliance grading.

PHASE 3: Upstream Paystub Telemetry & True Tax Drag Tracking
[x] Task 3.1: Paystub & Deduction Schema (paystub_records).

[x] Task 3.2: Paystub Ingestion Route (/api/telemetry/paystub).

[x] Task 3.3: Upstream Tax Drag & Match Capture Auditing integrated into Gemini audit engine.

[x] Task 3.4: Multimodal Paystub Ingestion (accepting PDF/images via Gemini Vision OCR).

PHASE 4: User Financial Profile & Capital Allocation Simulator
[x] Task 4.1: User Profile Schema (user_financial_profiles and /api/profile).

[x] Task 4.2: Dynamic Target Calculation Engine (20% Wealth Rule Quotas & dynamic EF ceilings).

[x] Task 4.3: Opportunity Cost & Cash Drag Simulator UI (CapitalSimulator.tsx).

[x] Task 4.4: UI Settings Drawer (SettingsDrawer.tsx) for direct profile and paystub mutations.

PHASE 5: Production Hardening & Advanced Automation
[x] Task 5.1: Security & Token Encryption (AES-256-GCM via lib/crypto.ts and automated token migration).

[x] Task 5.2: Real-Time Plaid Webhook Receiver (/api/plaid/webhook).

[x] Task 5.3: Operational Burn Normalization (filter internal transfers/payments from emergency fund ceiling).

[x] Task 5.4: Component Path Cleanup (consolidate component directory paths).

PHASE 6: Production Endgame & Multi-Tenancy (Active)
[x] Task 6.1: Supabase Auth & RLS Binding (replace zero-UUID placeholder with active user session contexts).

[ ] Task 6.2: Plaid Production Environment Migration & Webhook Signature Verification.

[ ] Task 6.3: Vercel Cron Automated Nightly Background Sync.

5. RUNBOOK / RECOVERY GUIDE
Resuming Development
Verify Environment Variables (.env.local):

NEXT_PUBLIC_SUPABASE_URL

NEXT_PUBLIC_SUPABASE_ANON_KEY

SUPABASE_SERVICE_ROLE_KEY

PLAID_CLIENT_ID

PLAID_SECRET

PLAID_ENV=sandbox

GEMINI_API_KEY

ENCRYPTION_KEY (64-hex / 32-byte secret)

PLAID_WEBHOOK_URL

Start Development Server:

PowerShell
npm run dev
Operational Verification:

Load http://localhost:3000.

Click Configure Targets → Verify profile benchmarks fetch and save cleanly.

Click Sync Telemetry → Confirm background delta sync and balance refresh complete with HTTP 200.

Click Run Gemini Audit → Verify all 5 forensic sections render against the pre-program baseline and gross income target.

6. HISTORICAL LOG OF COMPLETED MILESTONES
September 6, 2026 — Phase 2 to Phase 5 Full-Stack Deployment

Baseline Ingestion: Created program_baselines and /api/telemetry/baseline to establish Day-Zero burn rates.

Longitudinal Memory: Created monthly_telemetry_snapshots and /api/telemetry/snapshot to record monthly balances.

Upstream Payroll Tracking: Deployed paystub_records and Gemini Vision OCR (/api/telemetry/vision) for tax drag and deduction extraction.

Profile Configuration & Simulator: Implemented user_financial_profiles and CapitalSimulator.tsx to simulate Order of Operations debt elimination.

Security Hardening: Deployed AES-256-GCM token encryption via lib/crypto.ts and automated migration scripts.

Automated Webhooks: Implemented /api/plaid/webhook to handle background sync events.