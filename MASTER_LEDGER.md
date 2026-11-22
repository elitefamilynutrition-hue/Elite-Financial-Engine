# ELITE CAPITAL ENGINE — MASTER LEDGER & ARCHITECTURE REGISTRY

**Operating Philosophy:** Math-first wealth architecture  
**Core Stack:** Next.js 16 (App Router, Turbopack, `proxy.ts`), Supabase (PostgreSQL, RLS), Plaid API, Google Gemini, Tailwind CSS, Recharts, Stripe (checkout skeleton)  
**Ledger Policy:** Maintain a single source of truth. Schema detail lives in `SCHEMA.md` + `supabase/migrations/`. This file tracks registry, roadmap status, and runbook.

**Reconciled:** Week 3 Day 5 — registry matched to filesystem (Elite Capital Engine branding only).

---

## 1. PROJECT OVERVIEW & ARCHITECTURAL FOUNDATION

The Elite Capital Engine is an automated financial telemetry and forensic auditing platform. It transforms passive financial tracking into an active capital allocation system using a Work-Backwards Order of Operations.

### Core Objectives
1. **Automated Delta Telemetry:** Ingest and normalize multi-institution accounts via Plaid cursor-based syncing (including investments where linked).
2. **Deterministic Pre-Aggregation:** Compute liquid capital, revolving debt, net liquidity, and cash burn on the server to prevent LLM mathematical hallucination.
3. **Forensic AI Auditing:** Execute audits and sparring chat via Gemini with deterministic waterfall math in TypeScript.
4. **Longitudinal Memory & Upstream Telemetry:** Benchmark against historical snapshots / baselines and paystub OCR deductions.
5. **Zero-Plaintext Security:** AES-256-GCM encryption at rest for Plaid access tokens (fail-closed decrypt).

---

## 2. FILE & COMPONENT REGISTRY

### Edge / auth boundary
* **`proxy.ts`** — Supabase session gate; exempts `/login`, `/privacy`, `/terms`, `/about`, Plaid + Stripe webhooks + cron.

### Core utilities & security
* **`lib/supabase.ts`** — Browser/anon client export; `getServiceSupabase()` is a server-only re-export guard (prefer `lib/supabase-admin.ts`).
* **`lib/supabase-admin.ts`** — Service-role client (bypasses RLS; server-only).
* **`lib/supabase-server.ts`** / **`lib/supabase-browser.ts`** — SSR and browser Auth helpers.
* **`lib/plaid.ts`** — Plaid SDK client (`PLAID_ENV`).
* **`lib/crypto.ts`** — AES-256-GCM token encrypt/decrypt; **fail-closed** (no silent plaintext fallback).
* **`lib/stripe.ts`** — Stripe SDK helper (secret key + price id + app URL).
* **`lib/auth/require-user.ts`** — Session tenant derivation + admin allowlist.
* **`lib/auth/require-entitlement.ts`** / **`lib/billing/subscription.ts`** — Active/trialing gate → 402 for product APIs + dashboard paywall.
* **`lib/http/api-error.ts`** / **`lib/http/rate-limit.ts`** — Typed API errors + in-memory rate limits.
* **`lib/plaid/classify.ts`** / **`lib/plaid/verify-webhook.ts`** — Deterministic PFC classify; JWT webhook verify.
* **`lib/data/user-financials.ts`** — Shared tenant financial load for dashboard aggregates.
* **`lib/analytics/*`** — Survival floor, wealth quota, intent helpers.

### UI components
* **`components/TelemetryGrid.tsx`** — Liquidity, debt, burn, category distribution.
* **`components/CapitalSimulator.tsx`** — Work-Backwards cascade / opportunity-cost simulator.
* **`components/SettingsDrawer.tsx`** — Profile benchmarks + paystub ingestion UI.
* **`components/PlaidLinkButton.tsx`** — Link token → exchange flow.
* **`components/PayStubDropzone.tsx`** — Paystub upload → `/api/telemetry/vision`.
* **`components/AuditChatDrawer.tsx`** — Forensic sparring chat UI.
* **`components/DayZeroIntake.tsx`** — Onboarding intake when profile missing.
* **`components/ManualLiabilityCard.tsx`** — Offline liability tracking.
* **`components/Dashboard/CashFlowCreepChart.tsx`** — Fixed vs discretionary vs offense.
* **`components/Dashboard/NetWorthTrendChart.tsx`** — Net worth trend (on disk; may be WIP wiring).
* **`components/Dashboard/WealthMatrixChart.tsx`** — Macro projection UI (on disk; Week 4 polish still open).

**Not built (do not claim Active):** `SavingsRatioCard`, `SubscriptionAuditCard`.

### Application pages
* **`app/page.tsx`** — Dashboard / Command Center orchestrator.
* **`app/login/page.tsx`** — Auth + invite-gated signup.
* **`app/privacy/page.tsx`** / **`app/terms/page.tsx`** / **`app/about/page.tsx`** — Legal stubs + About hub (not counsel-reviewed).

### API routes — Active
* **`app/api/profile/route.ts`** — Profile GET/POST.
* **`app/api/audit/route.ts`** / **`app/api/audit/chat/route.ts`** — Gemini audit + sparring (entitlement-gated).
* **`app/api/plaid/create-link-token/route.ts`** — Link tokens.
* **`app/api/plaid/exchange-token/route.ts`** — Public→access token; encrypt; upsert item/accounts.
* **`app/api/plaid/sync-transactions/route.ts`** — Cursor delta sync + classify; default resume cursor.
* **`app/api/plaid/webhook/route.ts`** — Signed webhook; sync only (no Gemini).
* **`app/api/baseline/route.ts`** — Day-zero / baseline telemetry (**not** `telemetry/baseline`).
* **`app/api/snapshot/route.ts`** — Snapshot writer (**not** `telemetry/snapshot`).
* **`app/api/cron/nightly/route.ts`** — `CRON_SECRET`-gated nightly sync + snapshot (Vercel Cron).
* **`app/api/telemetry/dashboard/route.ts`** — Server dashboard aggregates.
* **`app/api/telemetry/vision/route.ts`** — Paystub OCR (entitlement-gated).
* **`app/api/telemetry/transactions/route.ts`** — Gemini classify batch (entitlement-gated).
* **`app/api/telemetry/rse/route.ts`** — RSE-related telemetry.
* **`app/api/telemetry/windfalls/route.ts`** — Capital windfalls API (on disk).
* **`app/api/manual-accounts/route.ts`** — Manual liabilities API (on disk).
* **`app/api/billing/checkout/route.ts`** / **`app/api/billing/webhook/route.ts`** — Stripe Checkout + signed webhook.
* **`app/api/account/export/route.ts`** / **`app/api/account/delete/route.ts`** — Session-scoped export/delete.
* **`app/api/admin/encrypt-existing-tokens/route.ts`** — Admin token encryption sweep.

### Removed / false paths (do not list as Active)
* ~~`app/api/telemetry/baseline`~~ → use `app/api/baseline`
* ~~`app/api/telemetry/snapshot`~~ → use `app/api/snapshot`
* ~~`app/api/telemetry/paystub`~~ → use vision + settings flows

---

## 3. DATABASE SCHEMA REGISTRY (SUPABASE)

**Source of truth:** `SCHEMA.md` and `supabase/migrations/` (including RLS, composite snapshot uniques, subscription columns on `user_financial_profiles`).

Do not treat the old inline SQL dump in prior ledger revisions as authoritative. Notable live concerns documented in `SCHEMA.md`: tenant `user_id` scoping, snapshot composite uniques, Stripe entitlement columns (`stripe_customer_id`, `stripe_subscription_id`, `subscription_status`).

---

## 4. PROJECT ROADMAP & EXECUTION STATUS

### Phases 1–5 — Core product (COMPLETE)
Core Plaid link/sync, telemetry UI, forensic audit, baselines/snapshots (now at `/api/baseline` + `/api/snapshot`), paystub vision OCR, profile + CapitalSimulator + SettingsDrawer, AES-256-GCM tokens, Plaid webhook receiver, operational burn normalization.

### Phase 6 — Multi-tenancy & production ops
* **[x] 6.1** Auth + RLS binding; invite-gated signup; session-scoped APIs via `requireUser` / `.eq('user_id')`.
* **[x] 6.2a** Plaid webhook JWT signature verification (`lib/plaid/verify-webhook.ts`).
* **[ ] 6.2b** Formal Plaid Production dashboard cutover / webhook URL ops (env-dependent; code supports `PLAID_ENV=production`).
* **[x] 6.3** Vercel Cron nightly sync + `historical_snapshots` (`/api/cron/nightly`, `CRON_SECRET`, `vercel.json` `0 12 * * *` UTC). Local stays manual Sync + Stamp Snapshot.

### Week 1–3 SaaS hardening (AGENT_BRIEFS) — largely COMPLETE in code
Invite gate, hardcode scrub, snapshot unify, classify-in-sync, cursor default, dashboard aggregates, rate limits, Stripe checkout + webhook, privacy/terms/about + export/delete, ECE branding.

### Stripe billing (test) — SHIPPED
* Checkout: 7-day trial → $20/mo; promo codes enabled at Checkout.
* Entitlement: `trialing|active` gates dashboard + product APIs (paywall CTA when inactive).
* Webhook updates `subscription_status` / Stripe IDs on profile.
* **Ops:** Vercel Authentication must stay **off** on Production so Stripe webhooks and cron are not `401 Protected`. Live `sk_live` still deferred.

### Week 4 differentiation — SHIPPED (affiliate skipped)
* Account exclusion (`exclude_from_net_worth`) + Balance Sheet checkbox.
* `POST /api/profile/setup` + `/api/profile/recalculate`.
* `SavingsRatioCard` + `SubscriptionAuditCard` via dashboard heuristics.
* WealthMatrix Rule-of-SWR + real-return toggle (`lib/analytics/fire-projection.ts`).
* Affiliate CTA consciously skipped (disclosure).

---

## 5. RUNBOOK / RECOVERY GUIDE

### Environment
Copy `.env.example` → `.env.local` and fill values (never commit secrets).

Required / common keys:
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV`, `PLAID_WEBHOOK_URL`, `GEMINI_API_KEY`, `ENCRYPTION_KEY`, `NEXT_PUBLIC_INVITE_CODE`, `ADMIN_EMAILS`, `NEXT_PUBLIC_APP_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID` (test go-live; live keys deferred), `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` (omit to disable), `CRON_SECRET` (Phase 6.3; Vercel Cron Bearer).

### Dev server
```powershell
npm run dev
```
Load `http://localhost:3000`.

### Smoke checks
1. Sign in (invite code required for signup).
2. Inactive subscription → paywall **Start 7-day trial** (Checkout); after webhook, `subscription_status` is `trialing`/`active`.
3. Configure Targets → profile save.
4. Sync Telemetry → HTTP 200 / balances refresh.
5. Run Gemini Audit / Sparring Chat → disclaimer visible; output renders.
6. `/about`, `/privacy`, `/terms` reachable without session.

---

## 6. HISTORICAL LOG (abbreviated)

* **Sep 2026:** Phases 2–5 — baselines, snapshots, paystubs/vision, profile + simulator, crypto, Plaid webhook.
* **Nov 2026 Weeks 1–2:** Multi-tenant hardening — classifier tenant fix, sync `user_id`, webhook JWT, schema/RLS migrations, invite gate, snapshot unify, classify-in-sync, cursor resume, dashboard API, rate limits.
* **Nov 2026 Week 3:** Stripe skeleton + entitlement, legal stubs + export/delete, ECE branding scrub, ledger reconciliation + `.env.example`, Sentry + CI.
* **Nov 2026 Week 4:** Account exclusion, profile setup/recalculate, savings/leak cards, FI Wealth Matrix; affiliate skipped.
* **Nov 2026 Phase 6.3:** Nightly Vercel Cron sync + historical snapshots (`CRON_SECRET`).
* **Nov 2026 Stripe test wrap:** Trial paywall, product-wide entitlement, About/legal refresh; Vercel Auth must stay off for webhooks/cron.
