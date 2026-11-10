# BudgetDog — Agent Briefs (Pro-efficient)
**How to use**
1. Do **only today’s** section.
2. Run the **Ask** prompt first (Ask mode), then open a **new** Agent chat with the **Agent** prompt.
3. Check **Done when**. Commit. Close both chats.
4. Strike through or delete the day when finished — do not re-run old briefs in long threads.
**Rules**
- One Agent chat = one issue.
- Never “fix the whole app” or “re-audit everything.”
- You own: Supabase SQL/RLS apply, Plaid dashboard, Stripe dashboard, `.env` secrets.
- Prefer small diffs; stop when Done when is met.
**Repo:** `budgetdog-app/`
---
## WEEK 1 — P0 Security & tenancy
### Day 1 — Classifier cross-tenant fix
> Completed in git: tenant-scoped classifier (`b7f454d`).

**Done when**
- [x] Classifier only reads the signed-in user’s transactions
- [x] Updates cannot touch another tenant’s rows
- [x] Committed
---
### Day 2 — Stamp `user_id` on sync writes + fail-closed decrypt
> Completed in git: sync `user_id` + fail-closed decrypt (`b8632a7`).

**Done when**
- [x] New sync rows always have `user_id`
- [x] Deletes are tenant-scoped
- [x] Decrypt failures throw (no raw-token fallback)
- [x] Committed
---
### Day 3 — Plaid webhook verification + light idempotency
> Completed in git: Plaid JWT verify + idempotency (`6e83e92`).

**Done when**
- [x] Request without valid verification does nothing sensitive
- [x] Valid webhook still syncs
- [x] Duplicate delivery is harmless (idempotent)
- [x] Committed
---
### Day 4 — Schema + RLS into the repo
> Completed in git: `supabase/migrations` + `SCHEMA.md` (`9cd7d20`).

**You after**
- Apply migration/policies in Supabase if not already live.
- Spot-check: second user cannot read first user’s rows via anon client.
**Done when**
- [x] Migrations exist in git
- [x] RLS live on tenant tables
- [x] SCHEMA.md lists unique constraints used by upserts
- [x] Committed
---
### Day 5a — Invite-only signup + sign out
> Completed in git: NEXT_PUBLIC_INVITE_CODE gate + dashboard Sign out.

**Done when**
- [x] Public self-serve signup blocked without invite (or removed)
- [x] Sign out works
- [x] Committed
---
### Day 5b — Scrub personal hardcodes
> Completed in git: salary/Corvette/RSU/seed hardcodes scrubbed; legacy table `amazon_rsu_schedule` name retained.

**Done when**
- [x] Grep is clean (or only generic examples remain)
- [x] Fresh user never sees your salary/Corvette/RSU seed
- [x] Committed
---
### Week 1 weekend — Manual isolation test (no Agent) - START HERE
- [ ] Two Supabase users
- [ ] User A data invisible to User B (SQL + UI)
- [ ] Classifier as A does not pull B’s txs
- [ ] Forged webhook without valid JWT fails
- [ ] Signup without invite fails
---
## WEEK 2 — P1 Correctness & cost
### Day 1 — Unify snapshot model
**Ask**
Trace writers/readers of historical_snapshots vs monthly_telemetry_snapshots (app/api/snapshot, app/api/audit, charts). Recommend one source of truth and the minimal migration path. Do not edit.


**Agent**
P1: Unify snapshots so /api/audit and dashboard charts use the same table/source. Minimal change: one writer contract, update readers only. No new UI. Document the chosen table in a one-line comment on the writer.


**Done when**
- [ ] Audit and charts see the same snapshot data after a stamp
- [ ] Committed
---
### Day 2 — Wire classify; remove bank-name transfer heuristic
**Ask**
Show how sync-transactions currently flags internal transfers vs what lib/plaid/classify.ts provides. List the exact swap. Do not edit.


**Agent**
P1: Use lib/plaid/classify.ts (and/or Plaid personal_finance_category) in sync-transactions instead of name.includes('chase'|'citi'|'american express'|...). Ensure real purchases are not falsely excluded from burn. Sync path only; short comment on the rule.


**Done when**
- [ ] Heuristic gone from sync
- [ ] Classify path used
- [ ] Committed
---
### Day 3 — Stop default `reset=true` sync
**Ask**
Find every caller of /api/plaid/sync-transactions and whether reset=true is used. Propose default resume-cursor + optional Full refresh UX. Do not edit.


**Agent**
P1: Do NOT pass reset=true on every sync.

Default: resume next_cursor.
Optional explicit "Full refresh" control that passes reset=true. Improve cursor persistence if a mid-loop timeout would otherwise lose progress. Touch callers + sync route only as needed.

**Done when**
- [ ] Normal load/sync resumes cursor
- [ ] Full refresh is explicit
- [ ] Committed
---
### Day 4 — Server-side dashboard aggregates
**Ask**
In app/page.tsx fetchDashboardData (or equivalent), list what is selected from transactions/accounts and which child components need which fields. Propose a minimal session-scoped aggregate API shape. Do not edit.


**Agent**
P1: Stop loading all transactions into the client on every dashboard load.

Add a session-scoped API returning aggregates the dashboard needs (reuse lib/data/user-financials.ts / baseline patterns if possible).
Update page.tsx to use it.
Paginate or omit raw tx list unless a component truly needs it. No unrelated UI redesign.

**Done when**
- [ ] Dashboard no longer `select('*')` full transaction history on load
- [ ] Numbers still render
- [ ] Committed
---
### Day 5 — Rate limits + chat history cap
**Ask**
List Gemini/Plaid-heavy routes and suggest simple per-user limits (in-memory OK if documented). Also where audit/chat accepts uncapped history. Do not edit.


**Agent**
P1: Add simple per-user rate limits on: /api/audit, /api/audit/chat, /api/telemetry/vision, /api/telemetry/transactions, and plaid sync.

Return 429 with Retry-After when exceeded.
Cap audit/chat history length server-side.
Document single-instance / best-effort if in-memory. No Redis required.

**Done when**
- [ ] Rapid-fire audit/chat eventually 429s
- [ ] Oversized history rejected or truncated
- [ ] Committed
---
## WEEK 3 — P2 Sell layer
### Day 1 — Stripe design (Ask only) + checkout skeleton
**You first**
- Create Stripe Product + Price; note `price_id`, webhook secret.
**Ask**
Design minimal Stripe subscription gate for this Next 16 App Router app:

checkout session route
webhook updating user plan (profiles column or subscriptions table)
require active plan for Gemini-heavy routes only Reuse requireUser. No fancy pricing marketing page yet. Output: file list + acceptance criteria for Agent.

**Agent**
P2: Implement Stripe checkout + customer webhook from this plan: [PASTE ASK PLAN] Env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_ID. Do not build a full marketing site — API + minimal "Upgrade" button is enough.


**Done when**
- [ ] Checkout session creates
- [ ] Webhook marks user active
- [ ] Committed (test mode OK)
---
### Day 2 — Entitlement gate on Gemini routes
**Agent**
P2: Gate Gemini-heavy routes behind active subscription (audit, audit/chat, telemetry/vision, telemetry/transactions). Return 402 or 403 with a clear JSON error if inactive. Reuse the plan field/table from Day 1. No new billing provider.


**Done when**
- [ ] Inactive user blocked from Gemini routes
- [ ] Active user succeeds
- [ ] Committed
---
### Day 3 — Legal stubs + data rights
**Ask**
Draft short plain-English outlines for /privacy and /terms appropriate for a Plaid + Gemini personal finance app (subprocessors, not advice, retention). Also minimal export/delete API shapes using requireUser. Do not edit files yet.


**Agent**
P2: Add /privacy and /terms pages (accurate stubs), footer/nav links, and a "Not financial advice" disclaimer near audit UI. Add session-scoped export and delete endpoints (or delete flow) for the user. No fake SOC2/compliance badges.


**Done when**
- [ ] Pages reachable
- [ ] Disclaimer visible on audit
- [ ] Export/delete exists or documented manual path with API stub
- [ ] Committed
---
### Day 4 — Sentry + CI
**You first**
- Create Sentry project; get DSN.
**Agent**
P2: Add Sentry for Next App Router (client + server) via SENTRY_DSN env. Add .github/workflows/ci.yml: npm ci, lint, build on PR/push. Do not change product features. Keep config minimal.


**Done when**
- [ ] Test error appears in Sentry (dev) OR init is clearly wired
- [ ] CI workflow file exists
- [ ] Committed
---
### Day 5 — Ledger truth + env example + metadata
**Ask**
Diff MASTER_LEDGER.md registry/roadmap vs actual files under components/ and app/api/. List false claims and missing entries. Do not edit yet.


**Agent**
P2: Reconcile MASTER_LEDGER.md with the filesystem.

Remove registry entries for files that don't exist.
Mark Phase 7/8 status accurately.
Add .env.example with required keys (no secret values).
Fix app metadata away from "Create Next App".

**Done when**
- [ ] Ledger matches repo
- [ ] `.env.example` present
- [ ] Title/metadata fixed
- [ ] Committed
---
## WEEK 4 — P3 Differentiation
### Day 1 — Account exclusion (Phase 7.2)
**Ask**
How should UGMA/non-operational accounts be excluded from net worth with minimal schema change? Propose field name + filter point in loadUserFinancials. Do not edit.


**Agent**
P3: Implement account exclusion from net worth.

Persist exclusion flag on financial_accounts (or agreed field).
Simple checkbox UI for linked accounts.
Filter excluded accounts in server aggregations / loadUserFinancials.

**Done when**
- [ ] Excluded account omitted from NW aggregates
- [ ] Committed
---
### Day 2 — Profile setup / recalculate (Phase 7.1 / 7.3)
**Ask**
Compare DayZeroIntake client writes vs app/api/profile/route.ts and SettingsDrawer. What is the smallest server API surface for setup + recalculate? Do not edit.


**Agent**
P3: Add /api/profile/setup and/or /api/profile/recalculate as designed in Ask. Wire DayZeroIntake and/or SettingsDrawer to use them so wealth quota / survival floor recalculate after profile changes. Keep payloads validated; session-scoped only.


**Done when**
- [ ] Profile changes recalculate server-side
- [ ] Committed
---
### Day 3 — Savings ratio + subscription leak (Phase 8.1)
**Ask**
Define server-side rules for monthly/annual savings ratio and recurring subscription/leak detection from transactions. Output API + card props only. Do not edit.


**Agent**
P3: Implement savings ratio + subscription leak engine per this spec: [PASTE ASK SPEC]

Server calculation endpoint or extend dashboard API
Add SavingsRatioCard + SubscriptionAuditCard under components/Dashboard
Wire into dashboard page Keep UI simple; no affiliate yet.

**Done when**
- [ ] Cards render real computed data
- [ ] Committed
---
### Day 4 — WealthMatrix Rule of 25 + inflation (Phase 8.2)
**Ask**
Inspect components/Dashboard/WealthMatrixChart.tsx for hardcoded years/rates/targets. Map inputs from user_financial_profiles (SWR, inflation, burn). Do not edit.


**Agent**
P3: Drive WealthMatrixChart from profile burn / SWR / inflation.

Real Rule of 25 (or SWR-based) target line
Inflation / real-return toggle
Remove hardcoded demo constants (e.g. fixed 8%, $42k, 16y theater)

**Done when**
- [ ] Chart uses profile inputs
- [ ] Toggle works
- [ ] Committed
---
### Day 5 — Optional affiliate CTA (Phase 8.3) — skip if tired
**Ask**
Draft a compliant high-level UX for suggesting balance-transfer / credit options for high-APR liabilities (disclosure-heavy). No scraping. Do not implement RAG tax (8.4).


**Agent**
P3 optional: Add a simple affiliate/disclosure CTA card for high-interest liabilities per this copy/UX: [PASTE ASK DRAFT] Must include clear disclosure. No Credit Karma scraping; link-out only. Skip if disclosures are unclear — prefer no ship.


**Done when**
- [ ] CTA + disclosure OR consciously skipped
- [ ] Committed if shipped
---
## Stretch (Weeks 5–6) — only if needed
Use **Ask** for design; Agent only for a single agreed slice.
| Topic | Ask focus | Agent only if… |
|-------|-----------|----------------|
| Webhook job queue | timeout evidence exists | syncs actually timing out |
| Household/B2B orgs | selling advisors | committed GTM |
| MFA | Supabase settings | compliance asks |
| RAG tax (8.4) | ROI doubtful | post-revenue |
---
## Emergency token-save prompts
**Scope check (Ask)**
I only want to work on: [ONE ISSUE]. List the maximum 3 files to touch. Refuse any wider refactor.


**Stop-run (Agent — paste if it wanders)**
Stop. Do not continue into other issues. Finish only the acceptance criteria already stated, then summarize files changed.


---
## Progress tracker
| Week | Day | Status |
|------|-----|--------|
| 1 | 1 Classifier | ☑ |
| 1 | 2 Sync user_id | ☑ |
| 1 | 3 Webhook verify | ☑ |
| 1 | 4 Schema/RLS | ☑ |
| 1 | 5a Signup gate | ☑ |
| 1 | 5b Hardcode scrub | ☑ |
| 2 | 1 Snapshots | ☐ |
| 2 | 2 Classify | ☐ |
| 2 | 3 Cursor sync | ☐ |
| 2 | 4 Aggregates | ☐ |
| 2 | 5 Rate limits | ☐ |
| 3 | 1 Stripe checkout | ☐ |
| 3 | 2 Entitlements | ☐ |
| 3 | 3 Legal/export | ☐ |
| 3 | 4 Sentry/CI | ☐ |
| 3 | 5 Ledger/env | ☐ |
| 4 | 1 Exclusions | ☐ |
| 4 | 2 Profile APIs | ☐ |
| 4 | 3 Savings/subs | ☐ |
| 4 | 4 WealthMatrix | ☐ |
| 4 | 5 Affiliate opt | ☐ |